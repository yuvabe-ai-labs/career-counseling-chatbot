import type { EducationStage } from "@yuvanext/contracts";

// State/city are no longer a hardcoded list (the Yuva Path Connect prototype's
// original STATES/CITIES arrays) — they're looked up live from `reference.states`/
// `reference.cities` in Supabase via the state/city Combobox (see api/location.ts,
// ProfileFieldsForm.tsx).

/**
 * Version tag sent as `RequestGuardianConsentRequest.textVersion` (packages/contracts/src/guardian-consent.ts).
 * Placeholder until Module 5 publishes an approved, versioned guardian-consent copy string —
 * bump this alongside that copy once it exists.
 */
export const GUARDIAN_CONSENT_TEXT_VERSION = "v1";

/** Display labels for EducationStageSchema (packages/contracts/src/profile.ts) — not in the prototype, required by the real contract. */
export const EDUCATION_STAGE_OPTIONS: { value: EducationStage; label: string }[] = [
  { value: "school", label: "In school" },
  { value: "higher_secondary", label: "Higher secondary (11th / 12th)" },
  { value: "college", label: "In college" },
  { value: "graduate", label: "Graduate" },
  { value: "working", label: "Working" },
  { value: "other", label: "Other" },
];
