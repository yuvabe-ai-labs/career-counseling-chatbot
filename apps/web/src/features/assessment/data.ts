import type { EducationStage, TnDistrict } from "@yuvapath/contracts";

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
  { value: "higher_secondary", label: "Higher secondary" },
  { value: "college", label: "In college" },
  { value: "graduate", label: "Graduate" },
];

/** Display labels for TnDistrictSchema (packages/contracts/src/common.ts) — a genuinely closed
 *  ~38-value list (Tamil Nadu's official districts), so a plain SelectField here, same as
 *  EDUCATION_STAGE_OPTIONS above, rather than State/City's live-search Combobox machinery. */
export const DISTRICT_OPTIONS: { value: TnDistrict; label: string }[] = [
  { value: "Ariyalur", label: "Ariyalur" },
  { value: "Chengalpattu", label: "Chengalpattu" },
  { value: "Chennai", label: "Chennai" },
  { value: "Coimbatore", label: "Coimbatore" },
  { value: "Cuddalore", label: "Cuddalore" },
  { value: "Dharmapuri", label: "Dharmapuri" },
  { value: "Dindigul", label: "Dindigul" },
  { value: "Erode", label: "Erode" },
  { value: "Kallakurichi", label: "Kallakurichi" },
  { value: "Kancheepuram", label: "Kancheepuram" },
  { value: "Kanniyakumari", label: "Kanniyakumari" },
  { value: "Karur", label: "Karur" },
  { value: "Krishnagiri", label: "Krishnagiri" },
  { value: "Madurai", label: "Madurai" },
  { value: "Mayiladuthurai", label: "Mayiladuthurai" },
  { value: "Nagapattinam", label: "Nagapattinam" },
  { value: "Namakkal", label: "Namakkal" },
  { value: "Perambalur", label: "Perambalur" },
  { value: "Pudukkottai", label: "Pudukkottai" },
  { value: "Ramanathapuram", label: "Ramanathapuram" },
  { value: "Ranipet", label: "Ranipet" },
  { value: "Salem", label: "Salem" },
  { value: "Sivagangai", label: "Sivagangai" },
  { value: "Tenkasi", label: "Tenkasi" },
  { value: "Thanjavur", label: "Thanjavur" },
  { value: "The Nilgiris", label: "The Nilgiris" },
  { value: "Theni", label: "Theni" },
  { value: "Thoothukudi", label: "Thoothukudi" },
  { value: "Tiruchirappalli", label: "Tiruchirappalli" },
  { value: "Tirunelveli", label: "Tirunelveli" },
  { value: "Tirupathur", label: "Tirupathur" },
  { value: "Tiruppur", label: "Tiruppur" },
  { value: "Tiruvallur", label: "Tiruvallur" },
  { value: "Tiruvannamalai", label: "Tiruvannamalai" },
  { value: "Tiruvarur", label: "Tiruvarur" },
  { value: "Vellore", label: "Vellore" },
  { value: "Viluppuram", label: "Viluppuram" },
  { value: "Virudhunagar", label: "Virudhunagar" },
];
