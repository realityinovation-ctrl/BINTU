import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import type {
  AuthStore,
  InvitationRecord,
  MembershipRecord,
  OrganizationRecord,
  SessionRecord,
  UserRecord,
} from "../auth/store";
import { isMembershipRole, type MembershipRole } from "../auth/permissions";
import { migrateAuth } from "./authMigrations";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  disabled_at: string | null;
}

interface MembershipRow {
  user_id: string;
  organization_id: string;
  role: string;
  created_at: string;
}

interface SessionRow {
  id_hash: string;
  user_id: string;
  organization_id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
}

interface InvitationRow {
  id: string;
  organization_id: string;
  role: string;
  code_hash: string;
  created_by: string;
  expires_at: string;
  used_at: string | null;
}

export class SqliteAuthStore implements AuthStore {
  private readonly database: Database.Database;

  constructor(filename: string, appliedAt = "1970-01-01T00:00:00.000Z") {
    if (filename !== ":memory:") {
      mkdirSync(dirname(filename), { recursive: true });
    }
    this.database = new Database(filename);
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("busy_timeout = 5000");
    migrateAuth(this.database, appliedAt);
  }

  close(): void {
    this.database.close();
  }

  migrate(): void {
    migrateAuth(this.database, new Date().toISOString());
  }

  transaction<T>(work: () => T): T {
    return this.database.transaction(work)();
  }

  findUserByEmail(email: string): UserRecord | null {
    const row = this.database
      .prepare(
        "SELECT id, email, password_hash, created_at, disabled_at FROM users WHERE email = ?",
      )
      .get(email) as UserRow | undefined;
    return row ? userFrom(row) : null;
  }

  findUserById(id: string): UserRecord | null {
    const row = this.database
      .prepare(
        "SELECT id, email, password_hash, created_at, disabled_at FROM users WHERE id = ?",
      )
      .get(id) as UserRow | undefined;
    return row ? userFrom(row) : null;
  }

  insertUser(user: UserRecord): void {
    this.database
      .prepare(
        `
        INSERT INTO users (id, email, password_hash, created_at, disabled_at)
        VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(user.id, user.email, user.passwordHash, user.createdAt, user.disabledAt);
  }

  disableUser(id: string, disabledAt: string): void {
    this.database
      .prepare("UPDATE users SET disabled_at = ? WHERE id = ?")
      .run(disabledAt, id);
  }

  insertOrganization(organization: OrganizationRecord): void {
    this.database
      .prepare(
        "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
      )
      .run(organization.id, organization.name, organization.createdAt);
  }

  insertMembership(membership: MembershipRecord): void {
    this.database
      .prepare(
        `
        INSERT INTO memberships (user_id, organization_id, role, created_at)
        VALUES (?, ?, ?, ?)
        `,
      )
      .run(
        membership.userId,
        membership.organizationId,
        membership.role,
        membership.createdAt,
      );
  }

  listMemberships(userId: string): MembershipRecord[] {
    const rows = this.database
      .prepare(
        `
        SELECT user_id, organization_id, role, created_at
        FROM memberships
        WHERE user_id = ?
        ORDER BY created_at ASC, organization_id ASC
        `,
      )
      .all(userId) as MembershipRow[];
    return rows.map(membershipFrom);
  }

  insertSession(session: SessionRecord): void {
    this.database
      .prepare(
        `
        INSERT INTO sessions (
          id_hash, user_id, organization_id,
          created_at, last_seen_at, expires_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        session.idHash,
        session.userId,
        session.organizationId,
        session.createdAt,
        session.lastSeenAt,
        session.expiresAt,
        session.revokedAt,
      );
  }

  findSession(idHash: string): SessionRecord | null {
    const row = this.database
      .prepare(
        `
        SELECT id_hash, user_id, organization_id,
               created_at, last_seen_at, expires_at, revoked_at
        FROM sessions
        WHERE id_hash = ?
        `,
      )
      .get(idHash) as SessionRow | undefined;
    return row ? sessionFrom(row) : null;
  }

  touchSession(idHash: string, lastSeenAt: string): void {
    this.database
      .prepare("UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?")
      .run(lastSeenAt, idHash);
  }

  revokeSession(idHash: string, revokedAt: string): void {
    this.database
      .prepare(
        "UPDATE sessions SET revoked_at = ? WHERE id_hash = ? AND revoked_at IS NULL",
      )
      .run(revokedAt, idHash);
  }

  insertInvitation(invitation: InvitationRecord): void {
    this.database
      .prepare(
        `
        INSERT INTO invitations (
          id, organization_id, role, code_hash, created_by, expires_at, used_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        invitation.id,
        invitation.organizationId,
        invitation.role,
        invitation.codeHash,
        invitation.createdBy,
        invitation.expiresAt,
        invitation.usedAt,
      );
  }

  findInvitationByCodeHash(codeHash: string): InvitationRecord | null {
    const row = this.database
      .prepare(
        `
        SELECT id, organization_id, role, code_hash, created_by, expires_at, used_at
        FROM invitations
        WHERE code_hash = ?
        `,
      )
      .get(codeHash) as InvitationRow | undefined;
    return row ? invitationFrom(row) : null;
  }

  markInvitationUsed(id: string, usedAt: string): boolean {
    const result = this.database
      .prepare(
        "UPDATE invitations SET used_at = ? WHERE id = ? AND used_at IS NULL",
      )
      .run(usedAt, id);
    return result.changes === 1;
  }
}

function userFrom(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    disabledAt: row.disabled_at,
  };
}

function membershipFrom(row: MembershipRow): MembershipRecord {
  if (!isMembershipRole(row.role)) {
    throw new Error("membership role is not recognized");
  }
  return {
    userId: row.user_id,
    organizationId: row.organization_id,
    role: row.role,
    createdAt: row.created_at,
  };
}

function sessionFrom(row: SessionRow): SessionRecord {
  return {
    idHash: row.id_hash,
    userId: row.user_id,
    organizationId: row.organization_id,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

function invitationFrom(row: InvitationRow): InvitationRecord {
  if (!isMembershipRole(row.role)) {
    throw new Error("invitation role is not recognized");
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    role: row.role as MembershipRole,
    codeHash: row.code_hash,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  };
}
