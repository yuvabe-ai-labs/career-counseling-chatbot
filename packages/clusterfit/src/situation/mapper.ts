import type { ClusterfitSituationCanonical, ClusterfitValuesRanking } from "@yuvapath/contracts";
import {
  CONTEXT_FIELD_NAMES,
  ConversationContextV3Schema,
  FIELD_SCHEMA_VERSION_V3,
} from "./conversation-context.js";

export const CANONICAL_VERSION = "canonical-v1";

export type SituationMapping = {
  canonical: ClusterfitSituationCanonical;
  mapperVersion: string | null;
  missingFields: string[];
  unmappedFields: string[];
};

const GRADE_BY_CLASS: Record<string, 9 | 10 | 11 | 12> = {
  class_9: 9,
  class_10: 10,
  class_11: 11,
  class_12: 12,
};
const KNOWN_KEYS = new Set<string>([
  "schema_version",
  ...CONTEXT_FIELD_NAMES,
  "notes",
  "open_questions",
  "wellbeing_flag",
]);

/**
 * Raw chat capture → canonical view (plan §4.1a). Scoring reads only `grade` (and `medium`);
 * `values` is Part E. Every other field passes through. An unknown schema version is kept raw
 * with an empty view, so the confirm card asks for the class and nothing is lost.
 */
export const mapSituation = (
  fieldSchemaVersion: string,
  rawFields: Record<string, unknown>,
): SituationMapping => {
  if (fieldSchemaVersion !== FIELD_SCHEMA_VERSION_V3) {
    return {
      canonical: { grade: null, medium: null, values: null, context: {} },
      mapperVersion: null,
      missingFields: ["grade"],
      unmappedFields: Object.keys(rawFields),
    };
  }
  const parsed = ConversationContextV3Schema.safeParse(rawFields);
  const classLevel = parsed.success ? parsed.data.class_level : null;
  const grade =
    classLevel?.status === "known" && classLevel.value
      ? (GRADE_BY_CLASS[classLevel.value] ?? null)
      : null;
  const valuesField = parsed.success ? parsed.data.values_top3 : null;
  const values: ClusterfitValuesRanking | null =
    valuesField?.status === "known" && valuesField.value && valuesField.value.length > 0
      ? [...valuesField.value].sort((a, b) => a.rank - b.rank)
      : null;

  // The wellbeing flag goes to the safety flow only, never into the situation view (POC rule §4.D).
  const context = Object.fromEntries(
    Object.entries(rawFields).filter(([key]) => key !== "wellbeing_flag"),
  );
  return {
    canonical: { grade, medium: null, values, context },
    mapperVersion: FIELD_SCHEMA_VERSION_V3,
    missingFields: [...(grade === null ? ["grade"] : []), ...(values === null ? ["values"] : [])],
    unmappedFields: Object.keys(rawFields).filter((key) => !KNOWN_KEYS.has(key)),
  };
};
