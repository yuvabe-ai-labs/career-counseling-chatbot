import { randomUUID } from "node:crypto";
import {
  ApiErrorSchema, CreateHandoffRequestSchema, CreateHandoffResponseSchema,
  type OpenAPIRegistry, PrivacyJobPathParamsSchema, PrivacyJobRequestSchema,
  PrivacyJobResponseSchema, type ResolvedPrivacyJobRequest, SafetyCheckRequestSchema,
  SafetyCheckResponseSchema, StaffPacketPathParamsSchema, StaffPacketResponseSchema,
  StaffQueueActionPathParamsSchema, StaffQueueActionRequestSchema,
  StaffQueueActionResponseSchema, StaffQueueResponseSchema, StaffSessionQuerySchema,
  StaffSessionsResponseSchema,
} from "@yuvanext/contracts";
import type { Express, Request, Response } from "express";
import { createSyntheticPrivacyJob, getSyntheticPrivacyJob } from "../domain/privacy-jobs.js";
import { createSyntheticHandoffPacket } from "../domain/handoff-packets.js";
import { createSyntheticQueueAction } from "../domain/queue-actions.js";
import { evaluateSafetyCheck } from "../domain/safety-rules.js";
import { createSyntheticStaffPacketView } from "../domain/staff-packets.js";
import { listSyntheticStaffQueue } from "../domain/staff-queue.js";
import type { PrivacyJobRepository } from "../infrastructure/privacy-job-repository.js";
import type { SafetyOperationsRepository } from "../infrastructure/safety-operations-repository.js";

export type ResolveSafetyUserId = (request: Request) => Promise<string | null>;
export type SafetyRouteDependencies = {
  privacyJobRepository?: PrivacyJobRepository;
  resolveUserId?: ResolveSafetyUserId;
  safetyOperationsRepository?: SafetyOperationsRepository;
};

const sendError = (response: Response, status: number, code: string, message: string): void => {
  response.status(status).json({ code, message });
};
const resolveAuthenticatedUserId = async (
  request: Request,
  response: Response,
  dependencies: SafetyRouteDependencies,
) => {
  const userId = dependencies.resolveUserId
    ? await dependencies.resolveUserId(request)
    : process.env.NODE_ENV === "test"
      ? "21111111-1111-4111-8111-111111111111"
      : null;
  if (!userId) sendError(response, 401, "authentication_required", "A valid bearer token is required.");
  return userId;
};
const resolveStaffUserId = async (
  request: Request,
  response: Response,
  dependencies: SafetyRouteDependencies,
) => {
  const userId = await resolveAuthenticatedUserId(request, response, dependencies);
  if (!userId) return null;
  const roles = dependencies.safetyOperationsRepository
    ? await dependencies.safetyOperationsRepository.getStaffRoles(userId)
    : process.env.NODE_ENV === "test"
      ? ["counselor"]
      : [];
  if (roles.length === 0) {
    sendError(response, 403, "staff_access_required", "An active staff role is required.");
    return null;
  }
  return userId;
};
const authResponses = {
  401: { description: "Authentication required", content: { "application/json": { schema: ApiErrorSchema } } },
  403: { description: "Staff access required", content: { "application/json": { schema: ApiErrorSchema } } },
};

export const registerSafetyRoutes = (
  app: Express,
  registry: OpenAPIRegistry,
  dependencies: SafetyRouteDependencies = {},
): void => {
  registry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http", scheme: "bearer", bearerFormat: "JWT",
  });

  registry.registerPath({
    method: "post", path: "/api/v1/internal/safety/check", tags: ["Safety"],
    summary: "Check a persisted counselor message using its source event ID",
    request: { body: { content: { "application/json": { schema: SafetyCheckRequestSchema } } } },
    responses: {
      200: { description: "Safety decision", content: { "application/json": { schema: SafetyCheckResponseSchema } } },
      400: { description: "Invalid request", content: { "application/json": { schema: ApiErrorSchema } } },
    },
  });
  app.post("/api/v1/internal/safety/check", async (request, response) => {
    const parsed = SafetyCheckRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendError(response, 400, "invalid_safety_check_request", "Safety check request body is invalid.");
    const body = dependencies.safetyOperationsRepository
      ? await dependencies.safetyOperationsRepository.runSafetyCheck(parsed.data)
      : { decision: evaluateSafetyCheck({
          ...parsed.data, triggerType: "message", occurredAt: "2026-07-28T10:00:00.000Z",
          context: {
            userId: "21111111-1111-4111-8111-111111111111",
            sessionId: "31111111-1111-4111-8111-111111111111",
            language: "en",
          },
        }) };
    response.status(200).json(SafetyCheckResponseSchema.parse(body));
  });

  registry.registerPath({
    method: "post", path: "/api/v1/internal/handoffs", tags: ["Safety"],
    summary: "Create a handoff from a persisted triggered safety event",
    request: { body: { content: { "application/json": { schema: CreateHandoffRequestSchema } } } },
    responses: {
      201: { description: "Handoff created", content: { "application/json": { schema: CreateHandoffResponseSchema } } },
      400: { description: "Invalid request", content: { "application/json": { schema: ApiErrorSchema } } },
    },
  });
  app.post("/api/v1/internal/handoffs", async (request, response) => {
    const parsed = CreateHandoffRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendError(response, 400, "invalid_handoff_request", "Handoff request body is invalid.");
    const body = dependencies.safetyOperationsRepository
      ? await dependencies.safetyOperationsRepository.createHandoff(parsed.data)
      : { packet: createSyntheticHandoffPacket({
          ...parsed.data,
          userId: "21111111-1111-4111-8111-111111111111", reason: "tier_1",
          user: { firstName: "Synthetic", ageBand: "15-18", segment: "pathfinder" },
          profile: {}, trigger: { occurredAt: "2026-07-29T10:00:00.000Z" },
          consentedContactAvailable: false, requestCorrelationId: parsed.data.idempotencyKey,
        }) };
    response.status(201).json(CreateHandoffResponseSchema.parse(body));
  });

  registry.registerPath({
    method: "get", path: "/api/v1/staff/sessions", tags: ["Staff"],
    summary: "List assessment sessions for the staff dashboard", security: [{ bearerAuth: [] }],
    request: { query: StaffSessionQuerySchema },
    responses: {
      200: { description: "Filtered sessions", content: { "application/json": { schema: StaffSessionsResponseSchema } } },
      400: { description: "Invalid filters", content: { "application/json": { schema: ApiErrorSchema } } }, ...authResponses,
    },
  });
  app.get("/api/v1/staff/sessions", async (request, response) => {
    if (!(await resolveStaffUserId(request, response, dependencies))) return;
    const parsed = StaffSessionQuerySchema.safeParse(request.query);
    if (!parsed.success) return sendError(response, 400, "invalid_staff_session_request", "Staff session filters are invalid.");
    const body = dependencies.safetyOperationsRepository
      ? await dependencies.safetyOperationsRepository.listStaffSessions(parsed.data)
      : { sessions: [] };
    response.status(200).json(StaffSessionsResponseSchema.parse(body));
  });

  registry.registerPath({
    method: "get", path: "/api/v1/staff/packets/{userId}", tags: ["Staff"],
    summary: "View a privacy-restricted staff packet", security: [{ bearerAuth: [] }],
    request: { params: StaffPacketPathParamsSchema },
    responses: {
      200: { description: "Staff packet", content: { "application/json": { schema: StaffPacketResponseSchema } } },
      400: { description: "Invalid request", content: { "application/json": { schema: ApiErrorSchema } } },
      404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } }, ...authResponses,
    },
  });
  app.get("/api/v1/staff/packets/:userId", async (request, response) => {
    const actorStaffId = await resolveStaffUserId(request, response, dependencies);
    if (!actorStaffId) return;
    const parsed = StaffPacketPathParamsSchema.safeParse(request.params);
    if (!parsed.success) return sendError(response, 400, "invalid_staff_packet_request", "Staff packet request is invalid.");
    const body = dependencies.safetyOperationsRepository
      ? await dependencies.safetyOperationsRepository.getStaffPacket(
          parsed.data.userId,
          true,
          actorStaffId,
          randomUUID(),
        )
      : createSyntheticStaffPacketView(parsed.data.userId, true, actorStaffId);
    if (!body) return sendError(response, 404, "staff_packet_not_found", "Staff packet was not found.");
    response.status(200).json(StaffPacketResponseSchema.parse(body));
  });

  registry.registerPath({
    method: "get", path: "/api/v1/staff/queue", tags: ["Staff"],
    summary: "List the staff handoff queue", security: [{ bearerAuth: [] }],
    responses: {
      200: { description: "Priority-ordered queue", content: { "application/json": { schema: StaffQueueResponseSchema } } }, ...authResponses,
    },
  });
  app.get("/api/v1/staff/queue", async (request, response) => {
    if (!(await resolveStaffUserId(request, response, dependencies))) return;
    const body = dependencies.safetyOperationsRepository
      ? await dependencies.safetyOperationsRepository.listStaffQueue()
      : { items: listSyntheticStaffQueue() };
    response.status(200).json(StaffQueueResponseSchema.parse(body));
  });

  registry.registerPath({
    method: "post", path: "/api/v1/staff/queue/{id}/action", tags: ["Staff"],
    summary: "Mark a handoff as actioned", security: [{ bearerAuth: [] }],
    request: { params: StaffQueueActionPathParamsSchema, body: { content: { "application/json": { schema: StaffQueueActionRequestSchema } } } },
    responses: {
      200: { description: "Action recorded", content: { "application/json": { schema: StaffQueueActionResponseSchema } } },
      400: { description: "Invalid request", content: { "application/json": { schema: ApiErrorSchema } } },
      404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } }, ...authResponses,
    },
  });
  app.post("/api/v1/staff/queue/:id/action", async (request, response) => {
    const actorStaffId = await resolveStaffUserId(request, response, dependencies);
    if (!actorStaffId) return;
    const params = StaffQueueActionPathParamsSchema.safeParse(request.params);
    const body = StaffQueueActionRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) return sendError(response, 400, "invalid_staff_queue_action_request", "Staff queue action request is invalid.");
    const resolved = {
      ...body.data, actorStaffId, actionType: "actioned", occurredAt: new Date().toISOString(),
      requestCorrelationId: body.data.idempotencyKey,
    } as const;
    const result = dependencies.safetyOperationsRepository
      ? await dependencies.safetyOperationsRepository.recordQueueAction(params.data.id, resolved)
      : createSyntheticQueueAction(params.data.id, resolved);
    if (!result) return sendError(response, 404, "staff_queue_item_not_found", "Staff queue item was not found.");
    response.status(200).json(StaffQueueActionResponseSchema.parse(result));
  });

  const privacyWrite = (jobType: "export" | "delete"): void => {
    const path = `/api/v1/privacy/${jobType}`;
    registry.registerPath({
      method: "post", path, tags: ["Privacy"], summary: `Create a privacy ${jobType} job`,
      security: [{ bearerAuth: [] }],
      request: { body: { content: { "application/json": { schema: PrivacyJobRequestSchema } } } },
      responses: {
        202: { description: "Job queued", content: { "application/json": { schema: PrivacyJobResponseSchema } } },
        400: { description: "Invalid request", content: { "application/json": { schema: ApiErrorSchema } } },
        401: authResponses[401],
      },
    });
    app.post(path, async (request, response) => {
      const userId = await resolveAuthenticatedUserId(request, response, dependencies);
      if (!userId) return;
      const parsed = PrivacyJobRequestSchema.safeParse(request.body);
      if (!parsed.success) return sendError(response, 400, `invalid_privacy_${jobType}_request`, `Privacy ${jobType} request body is invalid.`);
      const resolved: ResolvedPrivacyJobRequest = {
        ...parsed.data, userId, requestedBy: userId, authorizationMethod: "student_session",
        requestedAt: new Date().toISOString(), requestCorrelationId: parsed.data.idempotencyKey,
      };
      const result = dependencies.privacyJobRepository
        ? await dependencies.privacyJobRepository.createJob(jobType, resolved)
        : createSyntheticPrivacyJob(jobType, resolved);
      response.status(202).json(PrivacyJobResponseSchema.parse(result));
    });
  };
  privacyWrite("export");
  privacyWrite("delete");

  registry.registerPath({
    method: "get", path: "/api/v1/privacy/jobs/{id}", tags: ["Privacy"],
    summary: "Get the authenticated user's privacy job", security: [{ bearerAuth: [] }],
    request: { params: PrivacyJobPathParamsSchema },
    responses: {
      200: { description: "Job status", content: { "application/json": { schema: PrivacyJobResponseSchema } } },
      400: { description: "Invalid request", content: { "application/json": { schema: ApiErrorSchema } } },
      404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
      401: authResponses[401],
    },
  });
  app.get("/api/v1/privacy/jobs/:id", async (request, response) => {
    const userId = await resolveAuthenticatedUserId(request, response, dependencies);
    if (!userId) return;
    const parsed = PrivacyJobPathParamsSchema.safeParse(request.params);
    if (!parsed.success) return sendError(response, 400, "invalid_privacy_job_request", "Privacy job request is invalid.");
    const body = dependencies.privacyJobRepository
      ? await dependencies.privacyJobRepository.getJob(parsed.data.id, userId)
      : getSyntheticPrivacyJob(parsed.data.id);
    if (!body || body.job.userId !== userId) return sendError(response, 404, "privacy_job_not_found", "Privacy job was not found.");
    response.status(200).json(PrivacyJobResponseSchema.parse(body));
  });
};
