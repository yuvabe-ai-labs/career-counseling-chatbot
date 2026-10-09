import {
  AdminAidListResponseSchema,
  AdminAidSchemeSchema,
  AdminBulkPublishResponseSchema,
  AdminBulkValidateResponseSchema,
  AdminCollegeDetailSchema,
  AdminCollegeListResponseSchema,
  AdminDeleteCollegeResponseSchema,
  AdminDeleteResponseSchema,
  AdminDisciplineListResponseSchema,
  AdminOverviewResponseSchema,
  AdminProgramSchema,
  type AidKind,
  type AdminAidSchemeInput,
  type AdminAidSchemePatch,
  type AdminBulkRequest,
  type AdminCollegeInput,
  type AdminCollegePatch,
  type AdminProgramInput,
  type AdminProgramPatch,
  type VerificationStatus,
} from "@yuvapath/contracts";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import { clearStoredAdminDisplayName, clearStoredAdminUserId } from "@/lib/storage";

const BASE = "/api/v1/admin";

type Options = Parameters<typeof apiRequest>[2];

/**
 * Every admin call carries x-yuvapath-admin-id. A 401 means the session is gone (expired, or the
 * role was revoked), so it is cleared here and the visitor is sent back to the sign-in screen
 * instead of leaving every page showing the same failed request.
 */
async function adminRequest<Schema extends Parameters<typeof apiRequest>[1]>(
  path: string,
  schema: Schema,
  options: Options = {},
) {
  try {
    return await apiRequest(path, schema, { ...options, auth: "admin" });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      clearStoredAdminUserId();
      clearStoredAdminDisplayName();
      window.location.assign("/admin/sign-in");
    }
    throw error;
  }
}

const withKey = (idempotencyKey: string) => ({ headers: { "Idempotency-Key": idempotencyKey } });

export type ListParams = {
  q?: string;
  status?: VerificationStatus;
  page: number;
  pageSize: number;
};

const listQuery = (params: ListParams) => ({
  q: params.q || undefined,
  status: params.status,
  page: String(params.page),
  pageSize: String(params.pageSize),
});

export const getAdminOverview = () => adminRequest(`${BASE}/overview`, AdminOverviewResponseSchema);

export const listAdminColleges = (params: ListParams) =>
  adminRequest(`${BASE}/colleges`, AdminCollegeListResponseSchema, { query: listQuery(params) });
export const getAdminCollege = (id: string) =>
  adminRequest(`${BASE}/colleges/${id}`, AdminCollegeDetailSchema);
export const createAdminCollege = (input: AdminCollegeInput, idempotencyKey: string) =>
  adminRequest(`${BASE}/colleges`, AdminCollegeDetailSchema, {
    method: "POST",
    body: input,
    ...withKey(idempotencyKey),
  });
export const updateAdminCollege = (id: string, patch: AdminCollegePatch) =>
  adminRequest(`${BASE}/colleges/${id}`, AdminCollegeDetailSchema, { method: "PATCH", body: patch });
export const deleteAdminCollege = (id: string) =>
  adminRequest(`${BASE}/colleges/${id}`, AdminDeleteCollegeResponseSchema, { method: "DELETE" });

export const listAdminDisciplines = () =>
  adminRequest(`${BASE}/disciplines`, AdminDisciplineListResponseSchema);
export const createAdminProgram = (collegeId: string, input: AdminProgramInput, idempotencyKey: string) =>
  adminRequest(`${BASE}/colleges/${collegeId}/programs`, AdminProgramSchema, {
    method: "POST",
    body: input,
    ...withKey(idempotencyKey),
  });
export const updateAdminProgram = (collegeId: string, programId: string, patch: AdminProgramPatch) =>
  adminRequest(`${BASE}/colleges/${collegeId}/programs/${programId}`, AdminProgramSchema, {
    method: "PATCH",
    body: patch,
  });
export const deleteAdminProgram = (collegeId: string, programId: string) =>
  adminRequest(`${BASE}/colleges/${collegeId}/programs/${programId}`, AdminDeleteResponseSchema, {
    method: "DELETE",
  });

export const listAdminAidSchemes = (aidKind: AidKind, params: ListParams) =>
  adminRequest(`${BASE}/aid-schemes`, AdminAidListResponseSchema, {
    query: { ...listQuery(params), aidKind },
  });
export const getAdminAidScheme = (id: string) =>
  adminRequest(`${BASE}/aid-schemes/${id}`, AdminAidSchemeSchema);
export const createAdminAidScheme = (input: AdminAidSchemeInput, idempotencyKey: string) =>
  adminRequest(`${BASE}/aid-schemes`, AdminAidSchemeSchema, {
    method: "POST",
    body: input,
    ...withKey(idempotencyKey),
  });
export const updateAdminAidScheme = (id: string, patch: AdminAidSchemePatch) =>
  adminRequest(`${BASE}/aid-schemes/${id}`, AdminAidSchemeSchema, { method: "PATCH", body: patch });
export const deleteAdminAidScheme = (id: string) =>
  adminRequest(`${BASE}/aid-schemes/${id}`, AdminDeleteResponseSchema, { method: "DELETE" });

export const validateAdminBulk = (request: AdminBulkRequest) =>
  adminRequest(`${BASE}/bulk-upload/validate`, AdminBulkValidateResponseSchema, {
    method: "POST",
    body: request,
  });
export const publishAdminBulk = (request: AdminBulkRequest, idempotencyKey: string) =>
  adminRequest(`${BASE}/bulk-upload/publish`, AdminBulkPublishResponseSchema, {
    method: "POST",
    body: request,
    ...withKey(idempotencyKey),
  });
