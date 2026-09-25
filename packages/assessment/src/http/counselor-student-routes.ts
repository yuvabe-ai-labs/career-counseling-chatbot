import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  ApiErrorSchema,
  CounselorStudentListQuerySchema,
  CounselorStudentListResponseSchema,
  CounselorStudentReportResponseSchema,
  UuidSchema,
} from "@yuvapath/contracts";
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import type { CounselorStudentService } from "../application/counselor-student-service.js";
import { AssessmentApplicationError } from "../application/errors.js";

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
 * Counselor "View Students" routes — under /api/v1/counselor/students, gated by
 * x-yuvapath-counselor-id (see CounselorStudentService, which re-verifies the header against an
 * active counselor role on every call, same as counselor-dashboard-routes.ts).
 */
export const registerCounselorStudentRoutes = (
  app: Express,
  registry: OpenAPIRegistry,
  service: CounselorStudentService,
): void => {
  registry.registerPath({
    method: "get",
    path: "/api/v1/counselor/students",
    tags: ["Assessment"],
    summary: "List students visible to the counselor, with search and status filters",
    request: {
      headers: CounselorActorHeaderSchema,
      query: CounselorStudentListQuerySchema,
    },
    responses: {
      200: {
        description: "Student list",
        content: { "application/json": { schema: CounselorStudentListResponseSchema } },
      },
      401: {
        description: "x-yuvapath-counselor-id does not correspond to an active counselor",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.get("/api/v1/counselor/students", async (request, response, next) => {
    try {
      const counselorId = getActorCounselorId(request.headers);
      const query = CounselorStudentListQuerySchema.parse(request.query);
      const result = await service.listStudents(counselorId, {
        ...(query.search !== undefined ? { search: query.search } : {}),
        ...(query.status !== undefined ? { status: query.status } : {}),
      });
      response.status(200).json(result);
    } catch (error) {
      try {
        sendError(response, error);
      } catch (unhandled) {
        next(unhandled);
      }
    }
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/counselor/students/{studentId}/report",
    tags: ["Assessment"],
    summary: "A single student's name/segment plus their latest RIASEC result, if any",
    request: {
      headers: CounselorActorHeaderSchema,
      params: z.object({ studentId: UuidSchema }),
    },
    responses: {
      200: {
        description: "Student report",
        content: { "application/json": { schema: CounselorStudentReportResponseSchema } },
      },
      401: {
        description: "x-yuvapath-counselor-id does not correspond to an active counselor",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
      404: {
        description: "Student was not found",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.get("/api/v1/counselor/students/:studentId/report", async (request, response, next) => {
    try {
      const counselorId = getActorCounselorId(request.headers);
      const { studentId } = z.object({ studentId: UuidSchema }).parse(request.params);
      const report = await service.getStudentReport(counselorId, studentId);
      response.status(200).json(report);
    } catch (error) {
      try {
        sendError(response, error);
      } catch (unhandled) {
        next(unhandled);
      }
    }
  });
};
