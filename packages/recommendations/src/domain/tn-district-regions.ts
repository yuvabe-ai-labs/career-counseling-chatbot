// Static Tamil Nadu district->region grouping, used only by college-recommendations.ts's
// location-proximity ranking. This is a DIFFERENT axis from state-adjacency.ts/geo-scope.ts,
// which are India-wide and STATE-level (used only by the unrelated location_preference/
// resolveGeoScope() case) — every college in the product is already state="Tamil Nadu", so a
// state comparison there is a no-op. Proximity instead has to work one level down, comparing
// districts *within* Tamil Nadu. Do not confuse or merge these two files: one answers "which
// other states count as nearby," the other answers "which other TN districts count as nearby."
//
// The 38 keys below are Tamil Nadu's official districts (spellings match exactly what's already
// live in `knowledge.colleges.city` — confirmed by a live `select distinct city from
// knowledge.colleges` query, 2026-09-23 — since that's the same value a college's own district
// comes from; TnDistrictSchema, packages/contracts/src/common.ts, is the canonical source of
// truth these must stay in sync with, enforced by this file's own test). That same live query
// also returned two clearly-wrong non-district values ("Panthanenthal", "Pothavur" — town names
// from 2 polytechnic college rows, likely a source-data artifact from the DOTE scrape documented
// in the tn-college-dataset-sources memory) which are deliberately NOT included here: a student
// can never select a non-real district as their home, so those 2 colleges simply never get a
// same-district match and fall into the "rest_of_tamil_nadu" tier — degrades gracefully, doesn't
// filter them out, not a bug to fix in this file (that's a knowledge-package data-quality
// question, out of scope here).
//
// Grouping is a first-pass geographic split (Chennai-metro / north / west-Kongu / south /
// central-delta), not an official government region taxonomy — Tamil Nadu doesn't have one
// single canonical region list this product must match. Adjustable later without touching
// anything downstream, since college-recommendations.ts only ever calls proximityTierOf() below.
export const TN_DISTRICT_REGIONS: Readonly<Record<string, readonly string[]>> = {
  "Chennai Metro": [
    "Chennai",
    "Tiruvallur",
    "Kancheepuram",
    "Chengalpattu",
    "Ranipet",
    "Vellore",
    "Tirupathur",
  ],
  "Northern Tamil Nadu": ["Krishnagiri", "Dharmapuri", "Tiruvannamalai", "Viluppuram", "Kallakurichi"],
  "Western Tamil Nadu": ["Coimbatore", "Tiruppur", "Erode", "Salem", "Namakkal", "Karur", "The Nilgiris"],
  "Southern Tamil Nadu": [
    "Madurai",
    "Theni",
    "Dindigul",
    "Virudhunagar",
    "Sivagangai",
    "Ramanathapuram",
    "Tirunelveli",
    "Tenkasi",
    "Thoothukudi",
    "Kanniyakumari",
  ],
  "Central Tamil Nadu": [
    "Tiruchirappalli",
    "Thanjavur",
    "Tiruvarur",
    "Nagapattinam",
    "Mayiladuthurai",
    "Pudukkottai",
    "Perambalur",
    "Ariyalur",
    "Cuddalore",
  ],
} as const;

/** Every TN district known to this lookup — flattened, matching TnDistrictSchema's value set
 *  exactly (see this file's own test). */
export const ALL_TN_DISTRICTS: readonly string[] = Object.values(TN_DISTRICT_REGIONS).flat();

export function regionOfDistrict(district: string): string | undefined {
  return Object.entries(TN_DISTRICT_REGIONS).find(([, districts]) => districts.includes(district))?.[0];
}

export type LocationProximityTier = "same_district" | "same_region" | "rest_of_tamil_nadu" | "unknown";

/**
 * The one piece of real logic this file adds beyond a lookup table — the single place that owns
 * the proximity-tiering rule college-recommendations.ts scores against. `homeDistrict` absent
 * (no student value yet, or a pre-existing profile from before this field existed) always
 * resolves to "unknown", the same score as "rest_of_tamil_nadu" today but tracked separately so
 * it's distinguishable in the explanation/UI later without a schema change.
 */
export function proximityTierOf(
  homeDistrict: string | undefined,
  collegeDistrict: string,
): LocationProximityTier {
  if (!homeDistrict) {
    return "unknown";
  }
  if (homeDistrict === collegeDistrict) {
    return "same_district";
  }
  const homeRegion = regionOfDistrict(homeDistrict);
  if (homeRegion && homeRegion === regionOfDistrict(collegeDistrict)) {
    return "same_region";
  }
  return "rest_of_tamil_nadu";
}
