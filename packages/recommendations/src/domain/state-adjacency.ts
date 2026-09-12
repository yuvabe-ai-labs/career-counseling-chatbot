// Static India state/UT border-adjacency lookup, used only by geo-scope.ts's "not_sure"
// location-preference case. This is plain geography — closed-form, exhaustively
// enumerable, and not something that benefits from review or an LLM call (see
// docs/poc/ai-assisted-catalog-implementation-plan.md §13). Names must match the
// `state`/`StateSchema` spelling used elsewhere in this codebase (knowledge.colleges.state,
// assessment.profile_snapshots.state) — full official state/UT names, not abbreviations.
//
// Promote this to a `knowledge.state_adjacency` table only if it ever needs non-developer
// edits (plan §28 open decision) — not needed for v1.

export const STATE_ADJACENCY: Readonly<Record<string, readonly string[]>> = {
  "Andhra Pradesh": ["Telangana", "Odisha", "Chhattisgarh", "Karnataka", "Tamil Nadu", "Puducherry"],
  "Arunachal Pradesh": ["Assam", "Nagaland"],
  Assam: [
    "Arunachal Pradesh",
    "Nagaland",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Tripura",
    "West Bengal",
  ],
  Bihar: ["Uttar Pradesh", "Jharkhand", "West Bengal"],
  Chhattisgarh: [
    "Madhya Pradesh",
    "Maharashtra",
    "Telangana",
    "Odisha",
    "Jharkhand",
    "Uttar Pradesh",
    "Andhra Pradesh",
  ],
  Goa: ["Maharashtra", "Karnataka"],
  Gujarat: ["Rajasthan", "Madhya Pradesh", "Maharashtra"],
  Haryana: ["Punjab", "Himachal Pradesh", "Uttar Pradesh", "Rajasthan", "Delhi", "Chandigarh"],
  "Himachal Pradesh": ["Jammu and Kashmir", "Punjab", "Haryana", "Uttarakhand", "Ladakh"],
  Jharkhand: ["Bihar", "West Bengal", "Odisha", "Chhattisgarh", "Uttar Pradesh"],
  Karnataka: ["Goa", "Maharashtra", "Telangana", "Andhra Pradesh", "Tamil Nadu", "Kerala"],
  Kerala: ["Karnataka", "Tamil Nadu", "Puducherry"],
  "Madhya Pradesh": [
    "Rajasthan",
    "Uttar Pradesh",
    "Chhattisgarh",
    "Maharashtra",
    "Gujarat",
  ],
  Maharashtra: [
    "Gujarat",
    "Madhya Pradesh",
    "Chhattisgarh",
    "Telangana",
    "Karnataka",
    "Goa",
    "Dadra and Nagar Haveli and Daman and Diu",
  ],
  Manipur: ["Nagaland", "Mizoram", "Assam"],
  Meghalaya: ["Assam"],
  Mizoram: ["Assam", "Manipur", "Tripura"],
  Nagaland: ["Assam", "Arunachal Pradesh", "Manipur"],
  Odisha: [
    "West Bengal",
    "Jharkhand",
    "Chhattisgarh",
    "Andhra Pradesh",
  ],
  Punjab: ["Jammu and Kashmir", "Himachal Pradesh", "Haryana", "Rajasthan", "Chandigarh"],
  Rajasthan: ["Punjab", "Haryana", "Uttar Pradesh", "Madhya Pradesh", "Gujarat"],
  Sikkim: ["West Bengal"],
  "Tamil Nadu": ["Andhra Pradesh", "Karnataka", "Kerala", "Puducherry"],
  Telangana: ["Maharashtra", "Chhattisgarh", "Odisha", "Andhra Pradesh", "Karnataka"],
  Tripura: ["Assam", "Mizoram"],
  "Uttar Pradesh": [
    "Uttarakhand",
    "Himachal Pradesh",
    "Haryana",
    "Delhi",
    "Rajasthan",
    "Madhya Pradesh",
    "Chhattisgarh",
    "Jharkhand",
    "Bihar",
  ],
  Uttarakhand: ["Himachal Pradesh", "Uttar Pradesh"],
  "West Bengal": [
    "Sikkim",
    "Assam",
    "Odisha",
    "Jharkhand",
    "Bihar",
  ],
  // Union territories
  "Andaman and Nicobar Islands": [],
  Chandigarh: ["Punjab", "Haryana"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Gujarat", "Maharashtra"],
  Delhi: ["Haryana", "Uttar Pradesh"],
  "Jammu and Kashmir": ["Ladakh", "Himachal Pradesh", "Punjab"],
  Ladakh: ["Jammu and Kashmir", "Himachal Pradesh"],
  Lakshadweep: [],
  Puducherry: ["Tamil Nadu", "Andhra Pradesh", "Kerala"],
} as const;

/** Every Indian state/UT name known to this lookup — used for the "anywhere in India"/"remote" case. */
export const ALL_INDIAN_STATES: readonly string[] = Object.keys(STATE_ADJACENCY);

export function neighboringStatesOf(state: string): readonly string[] {
  return STATE_ADJACENCY[state] ?? [];
}
