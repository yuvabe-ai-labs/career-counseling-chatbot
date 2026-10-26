import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  ApiErrorSchema,
  ClusterfitPartItemsResponseSchema,
  ClusterfitPartSchema,
  ClusterfitSessionResponseSchema,
  ClusterfitCompleteSituationResponseSchema,
  ClusterfitSituationResponseSchema,
  ClusterfitStudentResultResponseSchema,
  ReattemptClusterfitRequestSchema,
  SaveClusterfitResponseRequestSchema,
  SaveClusterfitResponseResponseSchema,
  SaveClusterfitSituationRequestSchema,
  ScoreClusterfitRequestSchema,
  StartClusterfitSessionRequestSchema,
  UuidSchema,
} from "@yuvapath/contracts";
import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import type { ClusterfitService } from "../application/clusterfit-service.js";
import { ClusterfitApplicationError } from "../application/errors.js";

export const BASE = "/api/v1/clusterfit";
export const TAGS = ["Clusterfit"];
export const ActorHeaderSchema = z.object({ "x-yuvapath-user-id": UuidSchema });
export const SessionParamsSchema = z.object({ sessionId: UuidSchema });
const PartParamsSchema = z.object({ sessionId: UuidSchema, part: ClusterfitPartSchema });
const json = (schema: z.ZodType) => ({ content: { "application/json": { schema } } });
export const errorResponses = {
  400: { description: "Invalid request", ...json(ApiErrorSchema) },
  404: { description: "Not found", ...json(ApiErrorSchema) },
  409: { description: "Conflict", ...json(ApiErrorSchema) },
};

export const actorUserId = (request: Request): string =>
  ActorHeaderSchema.parse(request.headers)["x-yuvapath-user-id"];

/** Wraps a handler with the module's error mapping (zod → 400, application errors → their status). */
export const handle =
  (handler: (request: Request) => Promise<{ status: number; body: unknown }>) =>
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, body } = await handler(request);
      response.status(status).json(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        response
          .status(400)
          .json({ code: "invalid_request", message: "Request validation failed." });
      } else if (error instanceof ClusterfitApplicationError) {
        response.status(error.statusCode).json({ code: error.code, message: error.message });
      } else {
        next(error);
      }
    }
  };

/** Student routes for the session, Parts B–D, the confirm card, scoring and the result (plan §18.3). */
export const registerClusterfitRoutes = (
  app: Express,
  registry: OpenAPIRegistry,
  service: ClusterfitService,
): void => {
  registry.registerPath({
    method: "get",
    path: `${BASE}/health`,
    tags: TAGS,
    summary: "Clusterfit module health",
    responses: {
      200: {
        description: "Enabled",
        ...json(z.object({ status: z.literal("ok"), module: z.literal("clusterfit") })),
      },
    },
  });
  app.get(`${BASE}/health`, (_request, response) => {
    response.json({ status: "ok", module: "clusterfit" });
  });

  registry.registerPath({
    method: "post",
    path: `${BASE}/sessions`,
    tags: TAGS,
    summary:
      "Start a clusterfit session, or resume the student's latest one (idempotent on the key)",
    request: { headers: ActorHeaderSchema, body: json(StartClusterfitSessionRequestSchema) },
    responses: {
      201: { description: "Session", ...json(ClusterfitSessionResponseSchema) },
      ...errorResponses,
    },
  });
  app.post(
    `${BASE}/sessions`,
    handle(async (request) => {
      const body = StartClusterfitSessionRequestSchema.parse(request.body);
      const session = await service.startSession({
        userId: actorUserId(request),
        idempotencyKey: body.idempotencyKey,
        journeySessionId: body.journeySessionId,
      });
      return { status: 201, body: { session } };
    }),
  );

  registry.registerPath({
    method: "get",
    path: `${BASE}/sessions/{sessionId}`,
    tags: TAGS,
    summary: "Get a clusterfit session with progress for Parts B, C and D",
    request: { headers: ActorHeaderSchema, params: SessionParamsSchema },
    responses: {
      200: { description: "Session", ...json(ClusterfitSessionResponseSchema) },
      ...errorResponses,
    },
  });
  app.get(
    `${BASE}/sessions/:sessionId`,
    handle(async (request) => {
      const { sessionId } = SessionParamsSchema.parse(request.params);
      return {
        status: 200,
        body: { session: await service.getSession(actorUserId(request), sessionId) },
      };
    }),
  );

  registry.registerPath({
    method: "get",
    path: `${BASE}/sessions/{sessionId}/parts/{part}/items`,
    tags: TAGS,
    summary:
      "Items of Part B, C or D with the student's saved answers (no cluster codes or answer key)",
    request: { headers: ActorHeaderSchema, params: PartParamsSchema },
    responses: {
      200: { description: "Items", ...json(ClusterfitPartItemsResponseSchema) },
      ...errorResponses,
    },
  });
  app.get(
    `${BASE}/sessions/:sessionId/parts/:part/items`,
    handle(async (request) => {
      const { sessionId, part } = PartParamsSchema.parse(request.params);
      return {
        status: 200,
        body: await service.getPartItems(actorUserId(request), sessionId, part),
      };
    }),
  );

  registry.registerPath({
    method: "put",
    path: `${BASE}/sessions/{sessionId}/responses`,
    tags: TAGS,
    summary: "Save one Part B, C or D answer (autosave; the last answer wins)",
    request: {
      headers: ActorHeaderSchema,
      params: SessionParamsSchema,
      body: json(SaveClusterfitResponseRequestSchema),
    },
    responses: {
      200: { description: "Saved", ...json(SaveClusterfitResponseResponseSchema) },
      ...errorResponses,
    },
  });
  app.put(
    `${BASE}/sessions/:sessionId/responses`,
    handle(async (request) => {
      const { sessionId } = SessionParamsSchema.parse(request.params);
      const body = SaveClusterfitResponseRequestSchema.parse(request.body);
      return {
        status: 200,
        body: await service.saveResponse(actorUserId(request), sessionId, body),
      };
    }),
  );

  registry.registerPath({
    method: "get",
    path: `${BASE}/sessions/{sessionId}/situation`,
    tags: TAGS,
    summary: "The Part A + E view from the chat (class, values, other fields)",
    request: { headers: ActorHeaderSchema, params: SessionParamsSchema },
    responses: {
      200: { description: "Situation", ...json(ClusterfitSituationResponseSchema) },
      ...errorResponses,
    },
  });
  app.get(
    `${BASE}/sessions/:sessionId/situation`,
    handle(async (request) => {
      const { sessionId } = SessionParamsSchema.parse(request.params);
      return { status: 200, body: await service.getSituation(actorUserId(request), sessionId) };
    }),
  );

  registry.registerPath({
    method: "put",
    path: `${BASE}/sessions/{sessionId}/situation`,
    tags: TAGS,
    summary: "Confirm card: the class (required; decides Part C) and the Part E top 3",
    request: {
      headers: ActorHeaderSchema,
      params: SessionParamsSchema,
      body: json(SaveClusterfitSituationRequestSchema),
    },
    responses: {
      200: { description: "Saved", ...json(ClusterfitSituationResponseSchema) },
      ...errorResponses,
    },
  });
  app.put(
    `${BASE}/sessions/:sessionId/situation`,
    handle(async (request) => {
      const { sessionId } = SessionParamsSchema.parse(request.params);
      const body = SaveClusterfitSituationRequestSchema.parse(request.body);
      return {
        status: 200,
        body: await service.saveSituationEdits(actorUserId(request), sessionId, body),
      };
    }),
  );

  registry.registerPath({
    method: "put",
    path: `${BASE}/sessions/{sessionId}/situation/complete`,
    tags: TAGS,
    summary:
      "Finish About you (chat ended, failed or skipped) and open the activities; safe to repeat",
    request: { headers: ActorHeaderSchema, params: SessionParamsSchema },
    responses: {
      200: { description: "Completed", ...json(ClusterfitCompleteSituationResponseSchema) },
      ...errorResponses,
    },
  });
  app.put(
    `${BASE}/sessions/:sessionId/situation/complete`,
    handle(async (request) => {
      const { sessionId } = SessionParamsSchema.parse(request.params);
      return {
        status: 200,
        body: await service.completeSituation(actorUserId(request), sessionId),
      };
    }),
  );

  registry.registerPath({
    method: "post",
    path: `${BASE}/sessions/{sessionId}/score`,
    tags: TAGS,
    summary: "Submit after Part D and score (unchanged answers return the stored result)",
    request: {
      headers: ActorHeaderSchema,
      params: SessionParamsSchema,
      body: json(ScoreClusterfitRequestSchema),
    },
    responses: {
      200: { description: "Scored", ...json(z.object({ scored: z.literal(true) })) },
      ...errorResponses,
    },
  });
  app.post(
    `${BASE}/sessions/:sessionId/score`,
    handle(async (request) => {
      const { sessionId } = SessionParamsSchema.parse(request.params);
      ScoreClusterfitRequestSchema.parse(request.body);
      await service.score(actorUserId(request), sessionId);
      return { status: 200, body: { scored: true } };
    }),
  );

  registry.registerPath({
    method: "post",
    path: `${BASE}/sessions/{sessionId}/reattempt`,
    tags: TAGS,
    summary:
      "Retake the test: archive the scored session and start a new attempt (idempotent on the key)",
    request: {
      headers: ActorHeaderSchema,
      params: SessionParamsSchema,
      body: json(ReattemptClusterfitRequestSchema),
    },
    responses: {
      201: { description: "New session", ...json(ClusterfitSessionResponseSchema) },
      ...errorResponses,
    },
  });
  app.post(
    `${BASE}/sessions/:sessionId/reattempt`,
    handle(async (request) => {
      const { sessionId } = SessionParamsSchema.parse(request.params);
      const body = ReattemptClusterfitRequestSchema.parse(request.body);
      const session = await service.reattempt(actorUserId(request), sessionId, body.idempotencyKey);
      return { status: 201, body: { session } };
    }),
  );

  registry.registerPath({
    method: "get",
    path: `${BASE}/sessions/{sessionId}/result`,
    tags: TAGS,
    summary:
      "The cluster recommendation: band names with the doc's roles and routes (no numbers or flags)",
    request: { headers: ActorHeaderSchema, params: SessionParamsSchema },
    responses: {
      200: { description: "Result", ...json(ClusterfitStudentResultResponseSchema) },
      ...errorResponses,
    },
  });
  app.get(
    `${BASE}/sessions/:sessionId/result`,
    handle(async (request) => {
      const { sessionId } = SessionParamsSchema.parse(request.params);
      return {
        status: 200,
        body: { result: await service.getStudentResult(actorUserId(request), sessionId) },
      };
    }),
  );
};
