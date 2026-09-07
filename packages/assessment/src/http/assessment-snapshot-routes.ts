import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  ApiErrorSchema,
  ProfileSnapshotResponseSchema,
  UuidSchema,
  type ProfileSnapshotResponse,
} from "@yuvanext/contracts";
import { z } from "zod";
import type { Express, NextFunction, Request, Response } from "express";
import {
  AssessmentSnapshotNotFoundError,
  type GetAssessmentSnapshotCommand,
} from "../application/get-assessment-snapshot.js";

const AssessmentSnapshotQuerySchema = z
  .object({
    profileSnapshotId: UuidSchema.optional(),
  })
  .strict();

export type AssessmentSnapshotService = {
  execute(command: GetAssessmentSnapshotCommand): Promise<ProfileSnapshotResponse>;
};

export type ResolveAssessmentUserId = (request: Request) => Promise<string | null>;

export type AssessmentHttpDependencies = {
  getAssessmentSnapshot?: AssessmentSnapshotService;
  resolveUserId?: ResolveAssessmentUserId;
};

const sendError = (response: Response, status: number, code: string, message: string): void => {
  response.status(status).json({ code, message });
};

export const registerAssessmentSnapshotRoutes = (
  app: Express,
  registry: OpenAPIRegistry,
  dependencies: AssessmentHttpDependencies = {},
): void => {
  registry.registerPath({
    method: "get",
    path: "/api/v1/assessment-snapshots",
    tags: ["Assessment"],
    summary: "Get an authenticated user's assessment snapshot",
    security: [{ bearerAuth: [] }],
    request: {
      query: AssessmentSnapshotQuerySchema,
    },
    responses: {
      200: {
        description: "Owned assessment snapshot, or the latest snapshot when no ID is supplied",
        content: { "application/json": { schema: ProfileSnapshotResponseSchema } },
      },
      400: {
        description: "Invalid assessment snapshot ID",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
      401: {
        description: "Authentication required",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
      404: {
        description: "Assessment snapshot not found",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
      503: {
        description: "Assessment snapshot service unavailable",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.get(
    "/api/v1/assessment-snapshots",
    async (request: Request, response: Response, next: NextFunction) => {
      if (!dependencies.getAssessmentSnapshot || !dependencies.resolveUserId) {
        sendError(
          response,
          503,
          "assessment_unavailable",
          "The assessment snapshot service is not configured.",
        );
        return;
      }
      const query = AssessmentSnapshotQuerySchema.safeParse(request.query);
      if (!query.success) {
        sendError(response, 400, "invalid_request", "The assessment snapshot ID is invalid.");
        return;
      }
      try {
        const userId = await dependencies.resolveUserId(request);
        if (!userId) {
          sendError(response, 401, "authentication_required", "A valid bearer token is required.");
          return;
        }
        response.status(200).json(
          ProfileSnapshotResponseSchema.parse(
            await dependencies.getAssessmentSnapshot.execute({
              userId,
              ...(query.data.profileSnapshotId
                ? { profileSnapshotId: query.data.profileSnapshotId }
                : {}),
            }),
          ),
        );
      } catch (error) {
        if (error instanceof AssessmentSnapshotNotFoundError) {
          sendError(response, 404, "assessment_snapshot_not_found", error.message);
          return;
        }
        next(error);
      }
    },
  );
};
