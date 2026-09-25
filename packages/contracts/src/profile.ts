import { z } from "zod";
import {
  DateOnlySchema,
  IsoTimestampSchema,
  SegmentSchema,
  StateSchema,
  TnDistrictSchema,
  UuidSchema,
} from "./common.js";

export const EducationStageSchema = z.enum([
  "school",
  "higher_secondary",
  "college",
  "graduate",
]);
export type EducationStage = z.infer<typeof EducationStageSchema>;

export const AgeBandSchema = z.enum([
  "minor_12_13",
  "minor_14_15",
  "minor_16_17",
  "adult_18",
  "adult_19_plus",
]);
export type AgeBand = z.infer<typeof AgeBandSchema>;

export const UserProfileSchema = z.object({
  userId: UuidSchema,
  firstName: z.string().trim().min(1).max(100),
  ageAtOnboarding: z.number().int().min(12).max(100),
  ageBand: AgeBandSchema,
  city: z.string().trim().min(1).max(160),
  state: StateSchema,
  // Optional — not collected at signup (see UpsertUserProfileRequestSchema's own comment); the
  // student's district for College recommendations is instead picked directly on that screen,
  // per-request (CollegeRecommendationRouteRequestSchema.homeDistrict). Kept here as a genuinely
  // nullable column so this schema still parses whether or not a value was ever set.
  homeDistrict: TnDistrictSchema.optional(),
  countryCode: z.string().length(2),
  segment: SegmentSchema,
  selfStage: EducationStageSchema,
  profileStatus: z.enum(["active", "deletion_pending", "deleted"]),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
  deletedAt: IsoTimestampSchema.nullable(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const UpsertUserProfileRequestSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    dateOfBirth: DateOnlySchema.optional(),
    ageAtOnboarding: z.number().int().min(0).max(120).optional(),
    city: z.string().trim().min(1).max(160),
    state: StateSchema,
    // Optional — no longer collected at signup (moved to a dynamic picker on the College
    // recommendations screen, see CollegeRecommendationRouteRequestSchema.homeDistrict). Kept
    // here, unused by any current caller, in case a future "save my district to my profile"
    // feature wants to persist it — UserProfileSchema above already tolerates its absence.
    homeDistrict: TnDistrictSchema.optional(),
    countryCode: z.string().trim().length(2).default("IN"),
    selfStage: EducationStageSchema,
  })
  .refine((input) => input.dateOfBirth || input.ageAtOnboarding !== undefined, {
    message: "Either dateOfBirth or ageAtOnboarding is required.",
    path: ["dateOfBirth"],
  });
export type UpsertUserProfileRequest = z.infer<typeof UpsertUserProfileRequestSchema>;

export const UserProfileResponseSchema = z.object({
  profile: UserProfileSchema,
});
export type UserProfileResponse = z.infer<typeof UserProfileResponseSchema>;
