import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { ApiErrorSchema, CounselorDashboardStatsResponseSchema, UuidSchema } from "@yuvapath/contracts";
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { AssessmentApplicationError } from "../application/errors.js";
import type { CounselorDashboardService } from "../application/counselor-dashboard-service.js";

const CounselorActorHeaderSchema = z.object({ "x-yuvapath-counselor-id": UuidSchema });

const getActorCounselorId = (headers: unknown): string =>
  CounselorActorHeaderSchema.parse(headers)["x-yuvapath-counselor-id"];

const sendError = (response: Parameters<RequestHandler>[1], error: unknown): void => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ code: "invalid_request", message: "Request validation failed." });
    return;
  }

  if (error instanceof AssessmentApplicationError) {
    response.status(error.statusCode).json({ code: error.code, message: error.message });
    return;
  }

  throw error;
};

/**
 * Counselor dashboard read routes — under /api/v1/counselor/dashboard/*, gated by
 * x-yuvapath-counselor-id (see CounselorDashboardService.getStats, which re-verifies the header
 * against an active counselor role on every call). See
 * docs/architecture/counselor-auth-landing-page-plan.md.
 */
export const registerCounselorDashboardRoutes = (
  app: Express,
  registry: OpenAPIRegistry,
  service: CounselorDashboardService,
): void => {
  registry.registerPath({
    method: "get",
    path: "/api/v1/counselor/dashboard/stats",
    tags: ["Assessment"],
    summary: "Counselor dashboard overview stats (total students, assessment completion)",
    request: {
      headers: CounselorActorHeaderSchema,
    },
    responses: {
      200: {
        description: "Dashboard stats",
        content: { "application/json": { schema: CounselorDashboardStatsResponseSchema } },
      },
      401: {
        description: "x-yuvapath-counselor-id does not correspond to an active counselor",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.get("/api/v1/counselor/dashboard/stats", async (request, response, next) => {
    try {
      const counselorId = getActorCounselorId(request.headers);
      const stats = await service.getStats(counselorId);
      response.status(200).json(stats);
    } catch (error) {
      try {
        sendError(response, error);
      } catch (unhandled) {
        next(unhandled);
      }
    }
  });
};
