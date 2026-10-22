import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  ApiErrorSchema,
  ClusterfitCaptureRequestSchema,
  ClusterfitCaptureResponseSchema,
  ClusterfitCoverageRequestSchema,
  ClusterfitCoverageResponseSchema,
  ClusterfitDevExtractRequestSchema,
  ClusterfitLiveTokenResponseSchema,
  ClusterfitWellbeingRequestSchema,
  ClusterfitWellbeingResponseSchema,
} from "@yuvapath/contracts";
import type { Express } from "express";
import { z } from "zod";
import type { SituationService } from "../application/situation-service.js";
import {
  ActorHeaderSchema,
  BASE,
  SessionParamsSchema,
  TAGS,
  actorUserId,
  errorResponses,
  handle,
} from "./clusterfit-routes.js";

const json = (schema: z.ZodType) => ({ content: { "application/json": { schema } } });
const unavailable = {
  503: { description: "Voice chat not configured; use the form", ...json(ApiErrorSchema) },
};

/**
 * Part A + E chat routes (plan §14.3, §15.3). The browser talks to Gemini Live directly; these are
 * the short calls around it: token, check_coverage, capture at end_discovery, wellbeing copy.
 */
export const registerClusterfitSituationRoutes = (
  app: Express,
  registry: OpenAPIRegistry,
  service: SituationService,
  options: { devRoutes: boolean },
): void => {
  registry.registerPath({
    method: "post",
    path: `${BASE}/sessions/{sessionId}/live-token`,
    tags: TAGS,
    summary:
      "Mint a single-use Gemini Live token with the prompt, tools and voice locked server-side",
    request: { headers: ActorHeaderSchema, params: SessionParamsSchema },
    responses: {
      200: { description: "Token", ...json(ClusterfitLiveTokenResponseSchema) },
      429: { description: "All chat connections used", ...json(ApiErrorSchema) },
      ...unavailable,
      ...errorResponses,
    },
  });
  app.post(
    `${BASE}/sessions/:sessionId/live-token`,
    handle(async (request) => {
      const { sessionId } = SessionParamsSchema.parse(request.params);
      return { status: 200, body: await service.issueLiveToken(actorUserId(request), sessionId) };
    }),
  );

  registry.registerPath({
    method: "post",
    path: `${BASE}/sessions/{sessionId}/situation/coverage`,
    tags: TAGS,
    summary: "The guide's check_coverage tool: which topics are still not covered",
    request: {
      headers: ActorHeaderSchema,
      params: SessionParamsSchema,
      body: json(ClusterfitCoverageRequestSchema),
    },
    responses: {
      200: { description: "Tool result", ...json(ClusterfitCoverageResponseSchema) },
      ...errorResponses,
    },
  });
  app.post(
    `${BASE}/sessions/:sessionId/situation/coverage`,
    handle(async (request) => {
      const { sessionId } = SessionParamsSchema.parse(request.params);
      const { transcript } = ClusterfitCoverageRequestSchema.parse(request.body);
      return {
        status: 200,
        body: await service.coverageCheck(actorUserId(request), sessionId, transcript),
      };
    }),
  );

  registry.registerPath({
    method: "post",
    path: `${BASE}/sessions/{sessionId}/situation-captures`,
    tags: TAGS,
    summary:
      "end_discovery: extract the chat (Part A + E), store the raw capture and the class/values view",
    request: {
      headers: ActorHeaderSchema,
      params: SessionParamsSchema,
      body: json(ClusterfitCaptureRequestSchema),
    },
    responses: {
      201: { description: "Captured", ...json(ClusterfitCaptureResponseSchema) },
      502: { description: "Extraction failed; use the form", ...json(ApiErrorSchema) },
      ...unavailable,
      ...errorResponses,
    },
  });
  app.post(
    `${BASE}/sessions/:sessionId/situation-captures`,
    handle(async (request) => {
      const { sessionId } = SessionParamsSchema.parse(request.params);
      const body = ClusterfitCaptureRequestSchema.parse(request.body);
      return {
        status: 201,
        body: await service.captureSituation(actorUserId(request), sessionId, body),
      };
    }),
  );

  registry.registerPath({
    method: "post",
    path: `${BASE}/sessions/{sessionId}/situation/wellbeing`,
    tags: TAGS,
    summary: "flag_wellbeing_concern: the safety module's approved support message (null if none)",
    request: {
      headers: ActorHeaderSchema,
      params: SessionParamsSchema,
      body: json(ClusterfitWellbeingRequestSchema),
    },
    responses: {
      200: { description: "Approved copy", ...json(ClusterfitWellbeingResponseSchema) },
      ...errorResponses,
    },
  });
  app.post(
    `${BASE}/sessions/:sessionId/situation/wellbeing`,
    handle(async (request) => {
      const { sessionId } = SessionParamsSchema.parse(request.params);
      ClusterfitWellbeingRequestSchema.parse(request.body);
      return { status: 200, body: await service.wellbeingMessage(actorUserId(request), sessionId) };
    }),
  );

  if (!options.devRoutes) return;
  registry.registerPath({
    method: "post",
    path: `${BASE}/dev/extract`,
    tags: TAGS,
    summary:
      "Dev only: run the chat extraction on a pasted transcript (twin of the POC's /api/extract)",
    request: { body: json(ClusterfitDevExtractRequestSchema) },
    responses: {
      200: { description: "Extraction", ...json(z.record(z.string(), z.unknown())) },
      ...unavailable,
      ...errorResponses,
    },
  });
  app.post(
    `${BASE}/dev/extract`,
    handle(async (request) => {
      const body = ClusterfitDevExtractRequestSchema.parse(request.body);
      return { status: 200, body: await service.devExtract(body.known_context, body.transcript) };
    }),
  );
};
