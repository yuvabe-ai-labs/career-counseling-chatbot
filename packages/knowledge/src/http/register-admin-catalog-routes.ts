import {
  AdminAidListQuerySchema,
  AdminAidListResponseSchema,
  AdminAidSchemeInputSchema,
  AdminAidSchemePatchSchema,
  AdminAidSchemeSchema,
  AdminBulkPublishResponseSchema,
  AdminBulkRequestSchema,
  AdminBulkValidateResponseSchema,
  AdminCollegeDetailSchema,
  AdminCollegeInputSchema,
  AdminCollegeListResponseSchema,
  AdminCollegePatchSchema,
  AdminDeleteCollegeResponseSchema,
  AdminDeleteResponseSchema,
  AdminDisciplineListResponseSchema,
  AdminHeadersSchema,
  AdminIdempotencyHeadersSchema,
  AdminIdParamsSchema,
  AdminListQuerySchema,
  AdminOverviewResponseSchema,
  AdminProgramInputSchema,
  AdminProgramParamsSchema,
  AdminProgramPatchSchema,
  AdminProgramSchema,
  ApiErrorSchema,
  type OpenAPIRegistry,
} from "@yuvapath/contracts";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  AdminCatalogError,
  type AdminCatalogRepository,
  type AdminScope,
  type AdminScopeResolver,
} from "../domain/admin-catalog.js";

export type RegisterAdminCatalogRoutesDependencies = {
  repository: AdminCatalogRepository;
  /** Resolves an x-yuvapath-admin-id header to an active regional admin, or null. */
  resolveAdminScope: AdminScopeResolver;
};

const TAG = "Regional Admin";
const BASE = "/api/v1/admin";

const errorResponses = {
  400: { description: "Invalid request", content: { "application/json": { schema: ApiErrorSchema } } },
  401: { description: "Missing or inactive regional admin", content: { "application/json": { schema: ApiErrorSchema } } },
  403: { description: "Outside the admin's region", content: { "application/json": { schema: ApiErrorSchema } } },
  404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  409: { description: "Conflict", content: { "application/json": { schema: ApiErrorSchema } } },
};

const sendFailure = (response: Response, error: unknown): void => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ code: "invalid_request", message: "Request validation failed." });
    return;
  }
  if (error instanceof AdminCatalogError) {
    response.status(error.statusCode).json({ code: error.code, message: error.message });
    return;
  }
  throw error;
};

type Handler<Output> = (scope: AdminScope, request: Request) => Promise<Output>;

export function registerAdminCatalogRoutes(
  app: Express,
  registry: OpenAPIRegistry,
  dependencies: RegisterAdminCatalogRoutesDependencies,
): void {
  const { repository } = dependencies;

  /** Registers the OpenAPI entry and the Express handler together, behind the admin guard. */
  const define = <Output>(options: {
    method: "get" | "post" | "patch" | "delete";
    /** Path relative to /api/v1/admin, with {param} placeholders. */
    path: string;
    summary: string;
    status?: 200 | 201;
    idempotent?: boolean;
    params?: z.ZodObject<z.ZodRawShape>;
    query?: z.ZodObject<z.ZodRawShape>;
    body?: z.ZodType;
    response: z.ZodType;
    handler: Handler<Output>;
  }): void => {
    const status = options.status ?? 200;
    registry.registerPath({
      method: options.method,
      path: `${BASE}${options.path}`,
      tags: [TAG],
      summary: options.summary,
      request: {
        headers: options.idempotent ? AdminIdempotencyHeadersSchema : AdminHeadersSchema,
        ...(options.params ? { params: options.params } : {}),
        ...(options.query ? { query: options.query } : {}),
        ...(options.body ? { body: { content: { "application/json": { schema: options.body } } } } : {}),
      },
      responses: {
        [status]: { description: "Success", content: { "application/json": { schema: options.response } } },
        ...errorResponses,
      },
    });

    const expressPath = `${BASE}${options.path.replace(/\{(\w+)\}/g, ":$1")}`;
    app[options.method](expressPath, async (request, response, next) => {
      try {
        const headers = AdminHeadersSchema.safeParse({
          "x-yuvapath-admin-id": request.header("x-yuvapath-admin-id"),
        });
        const scope = headers.success
          ? await dependencies.resolveAdminScope(headers.data["x-yuvapath-admin-id"])
          : null;
        if (!scope) {
          response.status(401).json({ code: "unauthorized", message: "A regional admin session is required." });
          return;
        }
        response.status(status).json(await options.handler(scope, request));
      } catch (error) {
        try {
          sendFailure(response, error);
        } catch (unhandled) {
          next(unhandled);
        }
      }
    });
  };

  const idempotencyKey = (request: Request): string =>
    AdminIdempotencyHeadersSchema.shape["idempotency-key"].parse(request.header("idempotency-key"));
  const params = (request: Request) => AdminIdParamsSchema.parse(request.params);

  define({
    method: "get",
    path: "/overview",
    summary: "Regional admin dashboard counts and recent activity",
    response: AdminOverviewResponseSchema,
    handler: (scope) => repository.getOverview(scope),
  });

  // ------------------------------------------------------------------ colleges
  define({
    method: "get",
    path: "/colleges",
    summary: "List colleges in the admin's state",
    query: AdminListQuerySchema,
    response: AdminCollegeListResponseSchema,
    handler: (scope, request) => repository.listColleges(scope, AdminListQuerySchema.parse(request.query)),
  });
  define({
    method: "post",
    path: "/colleges",
    summary: "Create a college",
    status: 201,
    idempotent: true,
    body: AdminCollegeInputSchema,
    response: AdminCollegeDetailSchema,
    handler: (scope, request) =>
      repository.createCollege(scope, AdminCollegeInputSchema.parse(request.body), idempotencyKey(request)),
  });
  define({
    method: "get",
    path: "/colleges/{id}",
    summary: "Get a college with its programs",
    params: AdminIdParamsSchema,
    response: AdminCollegeDetailSchema,
    handler: (scope, request) => repository.getCollege(scope, params(request).id),
  });
  define({
    method: "patch",
    path: "/colleges/{id}",
    summary: "Update a college",
    params: AdminIdParamsSchema,
    body: AdminCollegePatchSchema,
    response: AdminCollegeDetailSchema,
    handler: (scope, request) =>
      repository.updateCollege(scope, params(request).id, AdminCollegePatchSchema.parse(request.body)),
  });
  define({
    method: "delete",
    path: "/colleges/{id}",
    summary: "Delete a college and its programs",
    params: AdminIdParamsSchema,
    response: AdminDeleteCollegeResponseSchema,
    handler: async (scope, request) => {
      const { removedPrograms } = await repository.deleteCollege(scope, params(request).id);
      return { deleted: true as const, removedPrograms };
    },
  });

  // ------------------------------------------------------------------ programs
  define({
    method: "get",
    path: "/disciplines",
    summary: "List disciplines for the program form",
    response: AdminDisciplineListResponseSchema,
    handler: async () => ({ data: await repository.listDisciplines() }),
  });
  define({
    method: "post",
    path: "/colleges/{id}/programs",
    summary: "Add a program to a college",
    status: 201,
    idempotent: true,
    params: AdminIdParamsSchema,
    body: AdminProgramInputSchema,
    response: AdminProgramSchema,
    handler: (scope, request) =>
      repository.createProgram(
        scope,
        params(request).id,
        AdminProgramInputSchema.parse(request.body),
        idempotencyKey(request),
      ),
  });
  define({
    method: "patch",
    path: "/colleges/{id}/programs/{programId}",
    summary: "Update a college program",
    params: AdminProgramParamsSchema,
    body: AdminProgramPatchSchema,
    response: AdminProgramSchema,
    handler: (scope, request) => {
      const ids = AdminProgramParamsSchema.parse(request.params);
      return repository.updateProgram(scope, ids.id, ids.programId, AdminProgramPatchSchema.parse(request.body));
    },
  });
  define({
    method: "delete",
    path: "/colleges/{id}/programs/{programId}",
    summary: "Delete a college program",
    params: AdminProgramParamsSchema,
    response: AdminDeleteResponseSchema,
    handler: async (scope, request) => {
      const ids = AdminProgramParamsSchema.parse(request.params);
      await repository.deleteProgram(scope, ids.id, ids.programId);
      return { deleted: true as const };
    },
  });

  // ---------------------------------------------------------------------- aid
  define({
    method: "get",
    path: "/aid-schemes",
    summary: "List aid schemes or scholarships visible to the admin's region",
    query: AdminAidListQuerySchema,
    response: AdminAidListResponseSchema,
    handler: (scope, request) => repository.listAidSchemes(scope, AdminAidListQuerySchema.parse(request.query)),
  });
  define({
    method: "post",
    path: "/aid-schemes",
    summary: "Create an aid scheme or scholarship",
    status: 201,
    idempotent: true,
    body: AdminAidSchemeInputSchema,
    response: AdminAidSchemeSchema,
    handler: (scope, request) =>
      repository.createAidScheme(scope, AdminAidSchemeInputSchema.parse(request.body), idempotencyKey(request)),
  });
  define({
    method: "get",
    path: "/aid-schemes/{id}",
    summary: "Get an aid scheme or scholarship",
    params: AdminIdParamsSchema,
    response: AdminAidSchemeSchema,
    handler: (scope, request) => repository.getAidScheme(scope, params(request).id),
  });
  define({
    method: "patch",
    path: "/aid-schemes/{id}",
    summary: "Update an aid scheme or scholarship",
    params: AdminIdParamsSchema,
    body: AdminAidSchemePatchSchema,
    response: AdminAidSchemeSchema,
    handler: (scope, request) =>
      repository.updateAidScheme(scope, params(request).id, AdminAidSchemePatchSchema.parse(request.body)),
  });
  define({
    method: "delete",
    path: "/aid-schemes/{id}",
    summary: "Delete an aid scheme or scholarship",
    params: AdminIdParamsSchema,
    response: AdminDeleteResponseSchema,
    handler: async (scope, request) => {
      await repository.deleteAidScheme(scope, params(request).id);
      return { deleted: true as const };
    },
  });

  // -------------------------------------------------------------- bulk upload
  define({
    method: "post",
    path: "/bulk-upload/validate",
    summary: "Validate staged CSV rows and flag duplicates",
    body: AdminBulkRequestSchema,
    response: AdminBulkValidateResponseSchema,
    handler: (scope, request) => repository.validateBulk(scope, AdminBulkRequestSchema.parse(request.body)),
  });
  define({
    method: "post",
    path: "/bulk-upload/publish",
    summary: "Publish staged CSV rows",
    idempotent: true,
    body: AdminBulkRequestSchema,
    response: AdminBulkPublishResponseSchema,
    handler: (scope, request) =>
      repository.publishBulk(scope, AdminBulkRequestSchema.parse(request.body), idempotencyKey(request)),
  });
}
