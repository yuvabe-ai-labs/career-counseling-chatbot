import type {
  AdminAidListQuery,
  AdminAidListResponse,
  AdminAidScheme,
  AdminAidSchemeInput,
  AdminAidSchemePatch,
  AdminBulkPublishResponse,
  AdminBulkRequest,
  AdminBulkValidateResponse,
  AdminCollegeDetail,
  AdminCollegeInput,
  AdminCollegeListResponse,
  AdminCollegePatch,
  AdminDiscipline,
  AdminListQuery,
  AdminOverviewResponse,
  AdminProgram,
  AdminProgramInput,
  AdminProgramPatch,
} from "@yuvapath/contracts";

/** Who is calling, resolved by the route layer from the verified admin session. */
export type AdminScope = {
  adminId: string;
  /** The state this regional admin manages (staff_role_assignments.scope_json.state). */
  state: string;
  displayName: string;
};

export type AdminCatalogErrorCode = "not_found" | "out_of_scope" | "in_use" | "no_dataset";

export class AdminCatalogError extends Error {
  constructor(
    readonly code: AdminCatalogErrorCode,
    message: string,
    readonly statusCode: 403 | 404 | 409 | 503,
  ) {
    super(message);
    this.name = "AdminCatalogError";
  }
}

/** Port the routes use to confirm an x-yuvapath-admin-id header is an active regional admin. */
export type AdminScopeResolver = (adminId: string) => Promise<AdminScope | null>;

export interface AdminCatalogRepository {
  getOverview(scope: AdminScope): Promise<AdminOverviewResponse>;

  listColleges(scope: AdminScope, query: AdminListQuery): Promise<AdminCollegeListResponse>;
  getCollege(scope: AdminScope, id: string): Promise<AdminCollegeDetail>;
  createCollege(scope: AdminScope, input: AdminCollegeInput, idempotencyKey: string): Promise<AdminCollegeDetail>;
  updateCollege(scope: AdminScope, id: string, patch: AdminCollegePatch): Promise<AdminCollegeDetail>;
  deleteCollege(scope: AdminScope, id: string): Promise<{ removedPrograms: number }>;

  listDisciplines(): Promise<readonly AdminDiscipline[]>;
  createProgram(
    scope: AdminScope,
    collegeId: string,
    input: AdminProgramInput,
    idempotencyKey: string,
  ): Promise<AdminProgram>;
  updateProgram(
    scope: AdminScope,
    collegeId: string,
    programId: string,
    patch: AdminProgramPatch,
  ): Promise<AdminProgram>;
  deleteProgram(scope: AdminScope, collegeId: string, programId: string): Promise<void>;

  listAidSchemes(scope: AdminScope, query: AdminAidListQuery): Promise<AdminAidListResponse>;
  getAidScheme(scope: AdminScope, id: string): Promise<AdminAidScheme>;
  createAidScheme(scope: AdminScope, input: AdminAidSchemeInput, idempotencyKey: string): Promise<AdminAidScheme>;
  updateAidScheme(scope: AdminScope, id: string, patch: AdminAidSchemePatch): Promise<AdminAidScheme>;
  deleteAidScheme(scope: AdminScope, id: string): Promise<void>;

  validateBulk(scope: AdminScope, request: AdminBulkRequest): Promise<AdminBulkValidateResponse>;
  publishBulk(scope: AdminScope, request: AdminBulkRequest, idempotencyKey: string): Promise<AdminBulkPublishResponse>;
}
