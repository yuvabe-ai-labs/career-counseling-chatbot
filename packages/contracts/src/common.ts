import { z } from "zod";

export const UuidSchema = z.string().uuid();
export const IsoTimestampSchema = z.string().datetime({ offset: true });
/** YYYY-MM-DD, no time component — the backend is always the source of truth for age, computed
 * from this via calculateAgeAtOnboarding (packages/assessment/src/domain/user-profile.ts). */
export const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD.");

export const SegmentSchema = z.enum(["explorer", "pathfinder", "launcher"]);
export type Segment = z.infer<typeof SegmentSchema>;

// A full user-supplied state/UT value. Canonical lookup is a separate concern.
export const StateSchema = z.string().trim().min(1).max(120);
export type State = z.infer<typeof StateSchema>;

/**
 * A student's home district — Tamil Nadu's 38 official districts, a genuinely closed set (unlike
 * State/City, which are backed by a live searchable catalog — see
 * apps/web/src/features/assessment/api/location.ts). This is the canonical source of truth for
 * the value set: packages/recommendations/src/domain/tn-district-regions.ts's TN_DISTRICT_REGIONS
 * must flatten to exactly these values (enforced by that file's own test), and every value here
 * matches the real district names already live in knowledge.colleges.city (confirmed via a live
 * `select distinct city from knowledge.colleges` query, 2026-09-23) so a student's chosen district
 * can always exact-match a college's district with no separate normalization step.
 */
export const TnDistrictSchema = z.enum([
  "Ariyalur",
  "Chengalpattu",
  "Chennai",
  "Coimbatore",
  "Cuddalore",
  "Dharmapuri",
  "Dindigul",
  "Erode",
  "Kallakurichi",
  "Kancheepuram",
  "Kanniyakumari",
  "Karur",
  "Krishnagiri",
  "Madurai",
  "Mayiladuthurai",
  "Nagapattinam",
  "Namakkal",
  "Perambalur",
  "Pudukkottai",
  "Ramanathapuram",
  "Ranipet",
  "Salem",
  "Sivagangai",
  "Tenkasi",
  "Thanjavur",
  "The Nilgiris",
  "Theni",
  "Thoothukudi",
  "Tiruchirappalli",
  "Tirunelveli",
  "Tirupathur",
  "Tiruppur",
  "Tiruvallur",
  "Tiruvannamalai",
  "Tiruvarur",
  "Vellore",
  "Viluppuram",
  "Virudhunagar",
]);
export type TnDistrict = z.infer<typeof TnDistrictSchema>;

export const ModuleDescriptorSchema = z.object({
  code: z.enum(["m1", "m2", "m3", "m4", "m5-evaluation", "m5-safety"]),
  name: z.string().min(1),
  packageName: z.string().startsWith("@yuvapath/"),
  status: z.enum(["scaffolded", "in_progress", "ready"]),
});
export type ModuleDescriptor = z.infer<typeof ModuleDescriptorSchema>;
