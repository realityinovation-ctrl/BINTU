import type { MultipartFile } from "@fastify/multipart";
import type { FastifyInstance } from "fastify";

import { InvestigationEngine } from "../core/engine";
import { InvalidStateTransitionError } from "../core/errors";
import { MEASUREMENT_CATALOG } from "../core/measurementCatalog";
import type {
  AnalyzeImageArguments,
  RequestMeasurementArguments,
} from "../core/models";
import { requirePermission } from "./auth";
import {
  ACCEPTED_AUDIO_TYPES,
  MAX_AUDIO_BYTES,
  validateWav,
} from "./audio";
import type { HttpDependencies } from "./deps";
import { sendJson } from "./reply";
import { HttpError } from "./errors";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  validateImage,
} from "./images";
import { parseBody } from "./jsonBody";
import { withAdvanceLock } from "./lock";
import { presentInvestigation } from "./present";
import {
  createRequestSchema,
  measurementRequestSchema,
  messageRequestSchema,
} from "./schemas";

export function registerOperateRoutes(
  app: FastifyInstance,
  deps: HttpDependencies,
): void {
  app.post("/api/investigations", async (request, reply) => {
    const context = requirePermission(deps.auth, "diagnostic:create");
    const body = parseBody(createRequestSchema, request.body);
    const presented = await withAdvanceLock(() => {
      const state = deps.repository.create(
        context.organizationId,
        context.userId,
      );
      state.problem = { description: body.problem };
      try {
        new InvestigationEngine(state, deps.provider).advance();
        deps.repository.save(state, context.organizationId);
      } catch (error) {
        deps.repository.delete(state.investigation_id, context.organizationId);
        throw error;
      }
      return presentInvestigation(state);
    });
    return sendJson(reply, 201, presented);
  });

  app.post<{ Params: { investigation_id: string } }>(
    "/api/investigations/:investigation_id/message",
    async (request, reply) => {
      const context = requirePermission(deps.auth, "diagnostic:operate");
      const body = parseBody(messageRequestSchema, request.body);
      const presented = await withAdvanceLock(() =>
        answer(deps, request.params.investigation_id, context.organizationId, body.message),
      );
      return sendJson(reply, 200, presented);
    },
  );

  app.post<{ Params: { investigation_id: string } }>(
    "/api/investigations/:investigation_id/measurement",
    async (request, reply) => {
      const context = requirePermission(deps.auth, "diagnostic:operate");
      const body = parseBody(measurementRequestSchema, request.body);
      const presented = await withAdvanceLock(() =>
        measure(
          deps,
          request.params.investigation_id,
          context.organizationId,
          body,
        ),
      );
      return sendJson(reply, 200, presented);
    },
  );

  app.post<{ Params: { investigation_id: string } }>(
    "/api/investigations/:investigation_id/transcribe",
    async (request, reply) => {
      const context = requirePermission(deps.auth, "diagnostic:operate");
      deps.repository.get(
        request.params.investigation_id,
        context.organizationId,
      );
      const part = await request.file();
      if (part === undefined) {
        throw new HttpError(422, "Invalid request");
      }
      const contentType = mediaType(part.mimetype);
      if (!ACCEPTED_AUDIO_TYPES.has(contentType)) {
        await discard(part);
        throw new HttpError(415, "Only mono PCM WAV audio is accepted");
      }
      const content = await readPart(part);
      if (content.length > MAX_AUDIO_BYTES) {
        throw new HttpError(413, "Audio file exceeds the 32 MB limit");
      }
      validateWav(content);
      const transcription = deps.transcriber.transcribe(
        content,
        part.filename || "recording.wav",
      );
      return sendJson(reply, 200, { transcription });
    },
  );

  app.post<{ Params: { investigation_id: string } }>(
    "/api/investigations/:investigation_id/image",
    async (request, reply) => {
      const context = requirePermission(deps.auth, "diagnostic:operate");
      const presented = await withAdvanceLock(async () => {
        const state = deps.repository.get(
          request.params.investigation_id,
          context.organizationId,
        );
        const part = await request.file();
        if (part === undefined) {
          throw new HttpError(422, "Invalid request");
        }
        const pending = state.pending_action;
        if (
          pending === null ||
          pending.decision.tool_name !== "analyze_image"
        ) {
          await discard(part);
          throw new InvalidStateTransitionError(
            "investigation is not waiting for an image",
          );
        }
        const contentType = mediaType(part.mimetype);
        if (!ACCEPTED_IMAGE_TYPES.has(contentType)) {
          await discard(part);
          throw new HttpError(415, "Only JPEG, PNG and WebP images are accepted");
        }
        const content = await readPart(part);
        if (content.length > MAX_IMAGE_BYTES) {
          throw new HttpError(413, "Image file exceeds the 10 MB limit");
        }
        validateImage(content, contentType);
        const focus = (pending.decision.arguments as AnalyzeImageArguments).focus;
        const analysis = deps.imageAnalyzer.analyze(content, contentType, focus);
        const engine = new InvestigationEngine(state, deps.provider);
        engine.submitImageAnalysis(
          `image-analysis-${deps.newId()}`,
          analysis.description,
          analysis.certainty,
        );
        engine.advance();
        deps.repository.save(state, context.organizationId);
        return presentInvestigation(state);
      });
      return sendJson(reply, 200, presented);
    },
  );
}

function answer(
  deps: HttpDependencies,
  investigationId: string,
  organizationId: string,
  message: string,
): ReturnType<typeof presentInvestigation> {
  const state = deps.repository.get(investigationId, organizationId);
  const pending = state.pending_action;
  if (pending === null) {
    throw new InvalidStateTransitionError(
      "investigation is not waiting for technician input",
    );
  }
  const engine = new InvestigationEngine(state, deps.provider);
  if (pending.decision.tool_name === "ask_technician") {
    engine.submitTechnicianAnswer(
      `technician-answer-${deps.newId()}`,
      message,
    );
  } else if (pending.decision.tool_name === "request_measurement") {
    const value = parseMeasurementText(message);
    engine.submitMeasurement(`measurement-${deps.newId()}`, value);
  } else {
    throw new InvalidStateTransitionError(
      "this action cannot be completed with a text message",
    );
  }
  engine.advance();
  deps.repository.save(state, organizationId);
  return presentInvestigation(state);
}

function measure(
  deps: HttpDependencies,
  investigationId: string,
  organizationId: string,
  body: {
    measurement_type: string;
    value: number;
    unit: string;
    location: string;
  },
): ReturnType<typeof presentInvestigation> {
  const state = deps.repository.get(investigationId, organizationId);
  const pending = state.pending_action;
  if (
    pending === null ||
    pending.decision.tool_name !== "request_measurement"
  ) {
    throw new InvalidStateTransitionError(
      "investigation is not waiting for a measurement",
    );
  }
  const spec = MEASUREMENT_CATALOG[body.measurement_type];
  if (spec === undefined) {
    throw new HttpError(422, "Unknown measurement type");
  }
  if (body.unit !== spec.unit) {
    throw new HttpError(422, "Unit does not match measurement type");
  }
  const expected = pending.decision.arguments as RequestMeasurementArguments;
  if (
    body.measurement_type !== expected.measurement_type ||
    body.unit !== expected.unit ||
    body.location.toLowerCase() !== expected.location.trim().toLowerCase()
  ) {
    throw new HttpError(422, "Measurement does not match the requested action");
  }
  const engine = new InvestigationEngine(state, deps.provider);
  engine.submitMeasurement(`measurement-${deps.newId()}`, body.value);
  engine.advance();
  deps.repository.save(state, organizationId);
  return presentInvestigation(state);
}

function parseMeasurementText(message: string): number {
  const normalized = message.replaceAll(",", ".");
  if (/^(?:nan|[-+]?inf(?:inity)?)$/i.test(normalized)) {
    throw new HttpError(422, "A finite numeric measurement is required");
  }
  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(normalized)) {
    throw new HttpError(422, "A numeric measurement is required");
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new HttpError(422, "A finite numeric measurement is required");
  }
  return value;
}

function mediaType(value: string | undefined): string {
  return (value ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

async function readPart(part: MultipartFile): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of part.file) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function discard(part: MultipartFile): Promise<void> {
  for await (const chunk of part.file) {
    void chunk;
  }
}
