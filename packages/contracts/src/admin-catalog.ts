import { z } from "zod";
import { IsoTimestampSchema, StateSchema, UuidSchema } from "./common.js";
import { VerificationStatusSchema } from "./catalog.js";

/**
 * Regional-admin catalog management (colleges, college programs, aid schemes/scholarships).
 * Separate from the student-facing CollegeSchema/AidSchemeSchema in catalog.ts: those are the
 * published read model; these are the editable admin shapes, with blank form inputs normalised
 * to null and a few list-only aggregates (programCount).
 */

export const AdminHeadersSchema = z.object({
  "x-yuvapath-admin-id": UuidSchema,
});

export const AdminIdempotencyHeadersSchema = AdminHeadersSchema.extend({
  "idempotency-key": UuidSchema,
});

/** Blank / whitespace-only form inputs become null; otherwise the trimmed text. */
const nullableText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().min(1).max(max).nullable(),
  );

const httpsUrl = z
  .string()
  .trim()
  .url()
  .refine((url) => url.startsWith("https://"), { message: "URL must use HTTPS" });

const nullableHttpsUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  httpsUrl.nullable(),
);

export const AidKindSchema = z.enum(["aid", "scholarship"]);
export type AidKind = z.infer<typeof AidKindSchema>;

// ---------------------------------------------------------------- colleges

export const AdminCollegeSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  city: z.string(),
  state: z.string(),
  institutionType: z.string(),
  tier: z.number().int().nullable(),
  admissionRoute: z.string().nullable(),
  feesBand: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  verificationStatus: VerificationStatusSchema,
  lastVerifiedAt: IsoTimestampSchema.nullable(),
  programCount: z.number().int().nonnegative(),
});
export type AdminCollege = z.infer<typeof AdminCollegeSchema>;

export const AdminCollegeInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(160),
  state: StateSchema,
  institutionType: z.string().trim().min(1).max(100),
  tier: z.preprocess(
    (value) => (value === "" ? null : value),
    z.coerce.number().int().min(1).max(3).nullable(),
  ),
  admissionRoute: nullableText(300),
  feesBand: nullableText(160),
  websiteUrl: nullableHttpsUrl,
  verificationStatus: VerificationStatusSchema,
});
export type AdminCollegeInput = z.infer<typeof AdminCollegeInputSchema>;

export const AdminCollegePatchSchema = AdminCollegeInputSchema.partial();
export type AdminCollegePatch = z.infer<typeof AdminCollegePatchSchema>;

export const AdminProgramSchema = z.object({
  id: UuidSchema,
  collegeId: UuidSchema,
  disciplineId: UuidSchema,
  disciplineTitle: z.string(),
  programName: z.string(),
  qualificationLevel: z.string(),
  durationBand: z.string().nullable(),
  admissionRoute: z.string().nullable(),
  feesBand: z.string().nullable(),
  verificationStatus: VerificationStatusSchema,
  lastVerifiedAt: IsoTimestampSchema.nullable(),
});
export type AdminProgram = z.infer<typeof AdminProgramSchema>;

export const AdminProgramInputSchema = z.object({
  disciplineId: UuidSchema,
  programName: z.string().trim().min(1).max(240),
  qualificationLevel: z.string().trim().min(1).max(120),
  durationBand: nullableText(80),
  admissionRoute: nullableText(300),
  feesBand: nullableText(160),
  verificationStatus: VerificationStatusSchema,
});
export type AdminProgramInput = z.infer<typeof AdminProgramInputSchema>;

export const AdminProgramPatchSchema = AdminProgramInputSchema.partial();
export type AdminProgramPatch = z.infer<typeof AdminProgramPatchSchema>;

export const AdminCollegeDetailSchema = AdminCollegeSchema.extend({
  programs: z.array(AdminProgramSchema),
});
export type AdminCollegeDetail = z.infer<typeof AdminCollegeDetailSchema>;

export const AdminDisciplineSchema = z.object({
  id: UuidSchema,
  title: z.string(),
});
export type AdminDiscipline = z.infer<typeof AdminDisciplineSchema>;

export const AdminDisciplineListResponseSchema = z.object({
  data: z.array(AdminDisciplineSchema),
});

// ------------------------------------------------------------------- aid

export const AdminAidSchemeSchema = z.object({
  id: UuidSchema,
  aidCode: z.string(),
  name: z.string(),
  aidKind: AidKindSchema,
  providerType: z.string().nullable(),
  provider: z.string(),
  level: z.string(),
  states: z.array(z.string()),
  eligibilitySummary: z.string().nullable(),
  benefitSummary: z.string().nullable(),
  amountText: z.string().nullable(),
  applicationUrl: z.string(),
  portalName: z.string().nullable(),
  verificationStatus: VerificationStatusSchema,
  lastVerifiedAt: IsoTimestampSchema,
});
export type AdminAidScheme = z.infer<typeof AdminAidSchemeSchema>;

export const AdminAidSchemeInputSchema = z.object({
  name: z.string().trim().min(1).max(240),
  aidKind: AidKindSchema,
  providerType: nullableText(80),
  provider: z.string().trim().min(1).max(200),
  level: z.string().trim().min(1).max(100),
  states: z.array(StateSchema).max(40),
  eligibilitySummary: nullableText(4000),
  benefitSummary: nullableText(4000),
  amountText: nullableText(200),
  applicationUrl: httpsUrl,
  portalName: nullableText(200),
  verificationStatus: VerificationStatusSchema,
});
export type AdminAidSchemeInput = z.infer<typeof AdminAidSchemeInputSchema>;

export const AdminAidSchemePatchSchema = AdminAidSchemeInputSchema.partial();
export type AdminAidSchemePatch = z.infer<typeof AdminAidSchemePatchSchema>;

// ------------------------------------------------------------------ lists

export const AdminListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: VerificationStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminListQuery = z.infer<typeof AdminListQuerySchema>;

export const AdminAidListQuerySchema = AdminListQuerySchema.extend({
  aidKind: AidKindSchema,
});
export type AdminAidListQuery = z.infer<typeof AdminAidListQuerySchema>;

const statusCounts = z.object({
  all: z.number().int().nonnegative(),
  verified: z.number().int().nonnegative(),
  unverified: z.number().int().nonnegative(),
  stale: z.number().int().nonnegative(),
  retired: z.number().int().nonnegative(),
});

export const AdminCollegeListResponseSchema = z.object({
  data: z.array(AdminCollegeSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int(),
  pageSize: z.number().int(),
  statusCounts,
});
export type AdminCollegeListResponse = z.infer<typeof AdminCollegeListResponseSchema>;

export const AdminAidListResponseSchema = z.object({
  data: z.array(AdminAidSchemeSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int(),
  pageSize: z.number().int(),
  statusCounts,
});
export type AdminAidListResponse = z.infer<typeof AdminAidListResponseSchema>;

export const AdminDeleteCollegeResponseSchema = z.object({
  deleted: z.literal(true),
  removedPrograms: z.number().int().nonnegative(),
});

export const AdminDeleteResponseSchema = z.object({ deleted: z.literal(true) });

export const AdminIdParamsSchema = z.object({ id: UuidSchema });
export const AdminProgramParamsSchema = z.object({ id: UuidSchema, programId: UuidSchema });

// --------------------------------------------------------------- overview

export const AdminOverviewResponseSchema = z.object({
  state: z.string(),
  displayName: z.string(),
  collegeCount: z.number().int().nonnegative(),
  programCount: z.number().int().nonnegative(),
  aidCount: z.number().int().nonnegative(),
  scholarshipCount: z.number().int().nonnegative(),
  unverifiedColleges: z.number().int().nonnegative(),
  recentActivity: z.array(z.object({ at: IsoTimestampSchema, text: z.string() })),
});
export type AdminOverviewResponse = z.infer<typeof AdminOverviewResponseSchema>;

// ------------------------------------------------------------ bulk upload

export const AdminBulkCategorySchema = z.enum(["colleges", "aid"]);
export type AdminBulkCategory = z.infer<typeof AdminBulkCategorySchema>;

/** One CSV row after the client mapped its columns onto the target field names. */
export const AdminBulkRowSchema = z.record(z.string(), z.string().max(2000));

export const AdminBulkRequestSchema = z.object({
  category: AdminBulkCategorySchema,
  rows: z.array(AdminBulkRowSchema).min(1).max(500),
});
export type AdminBulkRequest = z.infer<typeof AdminBulkRequestSchema>;

export const AdminBulkValidateResponseSchema = z.object({
  rows: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      name: z.string(),
      duplicate: z.boolean(),
      errors: z.array(z.string()),
    }),
  ),
});
export type AdminBulkValidateResponse = z.infer<typeof AdminBulkValidateResponseSchema>;

export const AdminBulkPublishResponseSchema = z.object({
  published: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});
export type AdminBulkPublishResponse = z.infer<typeof AdminBulkPublishResponseSchema>;
