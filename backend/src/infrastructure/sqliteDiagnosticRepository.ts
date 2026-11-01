/** SQLite snapshots. The core never imports this module. */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import {
  InvestigationNotFoundError,
  PersistenceError,
} from "../core/errors";
import { parseState, type InvestigationState } from "../core/models";
import type {
  DiagnosticRepository,
  InvestigationSummary,
} from "../core/ports/diagnosticRepository";
import {
  INVESTIGATIONS_TABLE,
  ensureInvestigationColumns,
} from "./schema";
import { deserializeState, serializeState } from "./stateJson";

export const LIST_LIMIT = 20;

const HYPOTHESIS_IDS = ["H0", "H1", "H2", "H3"] as const;

export interface StoredInvestigation {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  organizationId: string | null;
  createdByUserId: string | null;
  stateSchemaVersion: number;
  stateRevision: number;
  stateJson: string;
  state: InvestigationState;
}

export interface RawInvestigationRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  stateJson: string;
  organizationId: string | null;
  createdByUserId: string | null;
  stateSchemaVersion: number;
  stateRevision: number;
}

export function createInvestigation(investigationId: string): InvestigationState {
  return parseState({
    investigation_id: investigationId,
    hypotheses: Object.fromEntries(
      HYPOTHESIS_IDS.map((id) => [
        id,
        {
          hypothesis_id: id,
          status: "unexplored",
          supporting_evidence_ids: [],
          contradictory_evidence_ids: [],
        },
      ]),
    ),
  });
}

export function utcNow(): string {
  return new Date().toISOString().replace("Z", "000+00:00");
}

export interface RepositorySequence {
  newId?: () => string;
  now?: () => string;
}

export class SqliteDiagnosticRepository implements DiagnosticRepository {
  private readonly database: Database.Database;
  private readonly newId: () => string;
  private readonly now: () => string;

  constructor(filename: string, sequence: RepositorySequence = {}) {
    this.newId = sequence.newId ?? randomUUID;
    this.now = sequence.now ?? utcNow;
    try {
      if (filename !== ":memory:") {
        mkdirSync(dirname(filename), { recursive: true });
      }
      this.database = new Database(filename);
      this.database.exec(INVESTIGATIONS_TABLE);
      ensureInvestigationColumns(this.database);
    } catch {
      throw new PersistenceError("failed to initialize SQLite store");
    }
  }

  close(): void {
    this.database.close();
  }

  create(organizationId: string, createdByUserId: string): InvestigationState {
    if (!organizationId || !createdByUserId) {
      throw new PersistenceError("investigation owner is required");
    }
    const state = createInvestigation(this.newId());
    const timestamp = this.now();
    try {
      this.database
        .prepare(
          `
          INSERT INTO investigations (
              id, created_at, updated_at, status, state_json,
              organization_id, created_by_user_id,
              state_schema_version, state_revision
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          state.investigation_id,
          timestamp,
          timestamp,
          state.status,
          serializeState(state),
          organizationId,
          createdByUserId,
          1,
          1,
        );
    } catch (error) {
      if (error instanceof PersistenceError) {
        throw error;
      }
      throw new PersistenceError("failed to create investigation");
    }
    return state;
  }

  get(investigationId: string, organizationId: string): InvestigationState {
    let row: { id: string; status: string; state_json: string } | undefined;
    try {
      row = this.database
        .prepare(
          `
          SELECT id, status, state_json
          FROM investigations
          WHERE id = ? AND organization_id = ?
          `,
        )
        .get(investigationId, organizationId) as
        | { id: string; status: string; state_json: string }
        | undefined;
    } catch {
      throw new PersistenceError("failed to read investigation");
    }
    if (row === undefined) {
      throw new InvestigationNotFoundError(
        `investigation not found: ${investigationId}`,
      );
    }
    return deserializeState(row.state_json, row.id, row.status);
  }

  /**
   * Read every stored row, including investigations that have no organization.
   * The product read stays get(id, organization).
   */
  readAll(): StoredInvestigation[] {
    let rows: RawRow[];
    try {
      rows = this.database
        .prepare(
          `
          SELECT id, created_at, updated_at, status, state_json,
                 organization_id, created_by_user_id,
                 state_schema_version, state_revision
          FROM investigations
          ORDER BY id ASC
          `,
        )
        .all() as RawRow[];
    } catch {
      throw new PersistenceError("failed to read investigation");
    }
    return rows.map((row) => ({
      ...toStored(row),
      state: deserializeState(row.state_json, row.id, row.status),
    }));
  }

  list(organizationId: string, limit = LIST_LIMIT): InvestigationSummary[] {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("limit must be a positive integer");
    }
    let rows: {
      id: string;
      created_at: string;
      updated_at: string;
      status: string;
    }[];
    try {
      rows = this.database
        .prepare(
          `
          SELECT id, created_at, updated_at, status
          FROM investigations
          WHERE organization_id = ?
          ORDER BY updated_at DESC, id ASC
          LIMIT ?
          `,
        )
        .all(organizationId, limit) as {
        id: string;
        created_at: string;
        updated_at: string;
        status: string;
      }[];
    } catch {
      throw new PersistenceError("failed to list investigations");
    }
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: row.status,
    }));
  }

  save(state: InvestigationState, organizationId: string): void {
    const result = this.update(
      `
      UPDATE investigations
      SET updated_at = ?, status = ?, state_json = ?,
          state_schema_version = ?,
          state_revision = state_revision + 1
      WHERE id = ? AND organization_id = ?
      `,
      [
        this.now(),
        state.status,
        serializeState(state),
        1,
        state.investigation_id,
        organizationId,
      ],
      "failed to save investigation",
    );
    if (result.changes === 0) {
      throw new InvestigationNotFoundError(
        `investigation not found: ${state.investigation_id}`,
      );
    }
  }

  delete(investigationId: string, organizationId: string): void {
    const result = this.update(
      `
      DELETE FROM investigations
      WHERE id = ? AND organization_id = ?
      `,
      [investigationId, organizationId],
      "failed to delete investigation",
    );
    if (result.changes === 0) {
      throw new InvestigationNotFoundError(
        `investigation not found: ${investigationId}`,
      );
    }
  }

  insertRaw(row: RawInvestigationRow): void {
    try {
      this.database
        .prepare(
          `
          INSERT INTO investigations (
              id, created_at, updated_at, status, state_json,
              organization_id, created_by_user_id,
              state_schema_version, state_revision
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          row.id,
          row.createdAt,
          row.updatedAt,
          row.status,
          row.stateJson,
          row.organizationId,
          row.createdByUserId,
          row.stateSchemaVersion,
          row.stateRevision,
        );
    } catch {
      throw new PersistenceError("failed to create investigation");
    }
  }

  private update(
    sql: string,
    parameters: readonly unknown[],
    message: string,
  ): Database.RunResult {
    try {
      return this.database.prepare(sql).run(...parameters);
    } catch {
      throw new PersistenceError(message);
    }
  }
}

interface RawRow {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  state_json: string;
  organization_id: string | null;
  created_by_user_id: string | null;
  state_schema_version: number;
  state_revision: number;
}

function toStored(row: RawRow): Omit<StoredInvestigation, "state"> {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    organizationId: row.organization_id,
    createdByUserId: row.created_by_user_id,
    stateSchemaVersion: row.state_schema_version,
    stateRevision: row.state_revision,
    stateJson: row.state_json,
  };
}
