// TypeScript port of the Gemini Live POC's yuvapath.py (plan §14.5), schema v3 = POC v2 +
// values_top3 (Part E, plan §18.2). Logic and wording are kept 1:1 with the Python so the same
// transcript gives the same result in both (parity tests); the v3 additions are marked.
import { z } from "zod";
import {
  ESSENTIAL_FIELDS,
  EXPLORER_SUPPORT,
  MARKS_BANDS,
  PATHFINDER_SUPPORT,
  RECOMMENDATION_FIELDS,
  SEGMENT_CLASSES,
  SEGMENT_LABELS,
  SKIPPED_TOPICS,
  TOPICS,
} from "./poc-constants.js";
import { PROMPT_FILE_V3 } from "./prompt-v3.js";

export const FIELD_SCHEMA_VERSION_V3 = "conversation-context-v3";
export const PROMPT_VERSION_V3 = "clusterfit-prompt-v3";

// ─── Schema ───────────────────────────────────────────────────────────────────

const contextField = <T extends z.ZodType>(value: T) =>
  z.object({
    status: z.enum(["known", "unknown", "declined", "not_applicable"]),
    value: value.nullable(),
    certainty: z.enum(["firm", "tentative"]).nullable(),
    evidence: z.string().nullable(),
  });

const ClassLevel = z.enum(["class_9", "class_10", "class_11", "class_12", "other"]);
const Board = z.enum(["cbse", "state_board", "icse", "other"]);
const Stream = z.enum([
  "science_pcm",
  "science_pcb",
  "commerce",
  "arts_humanities",
  "vocational",
  "not_decided",
  "other",
]);
const StreamInterest = z.enum([
  "science_pcm",
  "science_pcb",
  "commerce",
  "arts_humanities",
  "vocational",
  "not_decided",
]);
const Route = z.enum([
  "complete_class_12",
  "degree",
  "diploma",
  "certificate_course",
  "vocational_training",
  "apprenticeship",
  "work_after_school",
  "undecided",
]);
const Constraint = z.enum([
  "fees",
  "distance",
  "family_expectations",
  "entrance_exam",
  "language",
  "responsibilities",
  "other",
]);
const Confidence = z.enum([
  "very_confident",
  "somewhat_confident",
  "confused",
  "starting_from_zero",
]);
const SupportNeeded = z.enum([...new Set([...EXPLORER_SUPPORT, ...PATHFINDER_SUPPORT])] as [
  string,
  ...string[],
]);
const Place = z.object({
  preference: z.enum(["same_city", "same_state", "anywhere_in_india", "not_sure"]),
  strength: z.enum(["preference", "current_constraint", "firm_constraint"]),
});
/** v3 addition: the Pathfinder doc's Part E cards. */
const ValueCard = z.enum([
  "steady_income",
  "earn_early",
  "stay_close_home",
  "help_community",
  "own_boss",
  "learn_grow",
  "respect",
  "creative_freedom",
  "travel",
]);

export const ConversationContextV3Schema = z.object({
  schema_version: z.literal("3"),
  class_level: contextField(ClassLevel),
  school_board: contextField(Board),
  current_stream: contextField(Stream),
  stream_interest: contextField(z.array(StreamInterest)),
  subjects_enjoyed: contextField(z.array(z.string())),
  marks: contextField(
    z.object({ low: z.number().min(0).max(100), high: z.number().min(0).max(100) }),
  ),
  enjoyed_activities: contextField(z.array(z.string())),
  strengths: contextField(z.array(z.string())),
  wants_to_improve: contextField(z.array(z.string())),
  current_challenges: contextField(z.array(z.string())),
  careers_mentioned: contextField(
    z.array(
      z.object({
        name: z.string(),
        stance: z.enum(["interested", "considering", "not_interested"]),
        reason: z.string().nullable(),
      }),
    ),
  ),
  learning_routes: contextField(z.object({ open_to: z.array(Route), not_open_to: z.array(Route) })),
  location: contextField(z.object({ study: Place.nullable(), work: Place.nullable() })),
  earning: contextField(
    z.object({
      urgency: z.enum(["need", "wish"]),
      by_age: z.number().int().nullable(),
      alongside_study: z.enum(["needed", "wanted", "not_wanted"]).nullable(),
    }),
  ),
  constraints: contextField(z.array(Constraint)),
  seeks_aid: contextField(z.enum(["yes", "no"])),
  decision_confidence: contextField(Confidence),
  support_needed: contextField(SupportNeeded),
  values_top3: contextField(
    z.array(z.object({ value: ValueCard, rank: z.number().int().min(1).max(3) })).max(3),
  ),
  notes: z.array(z.string()).max(5),
  open_questions: z.array(z.string()).max(3),
  wellbeing_flag: z.boolean(),
});
export type ConversationContextV3 = z.infer<typeof ConversationContextV3Schema>;

type AnyContextField = {
  status: string;
  value: unknown;
  certainty: string | null;
  evidence: string | null;
};

/** ContextField names in model order (the POC's, then the v3 addition). */
export const CONTEXT_FIELD_NAMES = [
  "class_level",
  "school_board",
  "current_stream",
  "stream_interest",
  "subjects_enjoyed",
  "marks",
  "enjoyed_activities",
  "strengths",
  "wants_to_improve",
  "current_challenges",
  "careers_mentioned",
  "learning_routes",
  "location",
  "earning",
  "constraints",
  "seeks_aid",
  "decision_confidence",
  "support_needed",
  "values_top3",
] as const;
type ContextFieldName = (typeof CONTEXT_FIELD_NAMES)[number];

const field = (context: ConversationContextV3, name: string): AnyContextField =>
  context[name as ContextFieldName];

// ─── Prompts (load_prompts / build_live_prompt) ───────────────────────────────

const LIVE_PROMPT_HEADING = "# 1. YuvaPath — Gemini Live System Prompt";
const EXTRACTION_PROMPT_HEADING = "# 2. YuvaPath — Student Context Extraction System Prompt";
const SCHEMA_HEADING = "# 3. Structured Output Schema";

const readSection = (text: string, heading: string): string => {
  const start = text.indexOf(heading);
  if (start === -1) throw new Error(`Heading not found in prompt file: ${JSON.stringify(heading)}`);
  const section = text.slice(start);
  const end = section.indexOf("\n---\n");
  return (end === -1 ? section : section.slice(0, end)).trim();
};

export const loadPrompts = (text: string = PROMPT_FILE_V3) => ({
  live: readSection(text, LIVE_PROMPT_HEADING),
  extraction: `${readSection(text, EXTRACTION_PROMPT_HEADING)}\n\n${readSection(text, SCHEMA_HEADING)}`,
});

export type LivePromptStudent = {
  first_name?: string | null;
  segment?: string | null;
  state?: string | null;
  city?: string | null;
  already_answered?: string | null;
};

export const buildLivePrompt = (
  student: LivePromptStudent,
  text: string = PROMPT_FILE_V3,
): string => {
  let prompt = loadPrompts(text).live;
  for (const key of ["first_name", "segment", "state", "city", "already_answered"] as const) {
    prompt = prompt.replaceAll(`{{${key}}}`, student[key] || "none");
  }
  return prompt;
};

// ─── Deterministic post-processing (code, not the model) ──────────────────────

export const marksBand = (context: ConversationContextV3): string | null => {
  if (context.marks.status === "declined") return "prefer_not_to_say";
  if (context.marks.status !== "known" || context.marks.value === null) return null;
  const { low, high } = context.marks.value;
  for (const [band, lower, upper] of MARKS_BANDS) {
    if (lower <= low && low < upper && lower <= high && high < upper) return band;
  }
  return null;
};

export const consistencyWarnings = (context: ConversationContextV3, segment: string): string[] => {
  const warnings: string[] = [];
  for (const name of CONTEXT_FIELD_NAMES) {
    const entry = field(context, name);
    if (entry.status === "known") {
      if (entry.value === null || entry.certainty === null || !entry.evidence) {
        warnings.push(`${name}: 'known' needs a value, certainty and evidence.`);
      }
    } else if (entry.value !== null || entry.certainty !== null) {
      warnings.push(`${name}: '${entry.status}' must have value and certainty set to null.`);
    }
  }

  const label = SEGMENT_LABELS[segment] ?? segment;
  const otherSegmentField = segment === "explorer" ? "current_stream" : "stream_interest";
  if (!["not_applicable", "unknown"].includes(field(context, otherSegmentField).status)) {
    warnings.push(`${otherSegmentField}: should not be filled for ${label}.`);
  }

  const routes = context.learning_routes.value;
  const markerChecks: [string, string, readonly string[]][] = [
    ["stream_interest", "not_decided", context.stream_interest.value ?? []],
    ["learning_routes.open_to", "undecided", routes ? routes.open_to : []],
  ];
  for (const [name, marker, values] of markerChecks) {
    if (values.includes(marker) && values.length > 1)
      warnings.push(`${name}: '${marker}' must be the only value.`);
  }
  if (routes && routes.open_to.some((route) => routes.not_open_to.includes(route))) {
    warnings.push("learning_routes: a route is in both open_to and not_open_to.");
  }

  const location = context.location.value;
  if (location && location.study === null && location.work === null) {
    warnings.push("location: 'known' needs at least one of study or work.");
  }
  const earning = context.earning.value;
  if (earning && earning.by_age !== null && !(earning.by_age >= 12 && earning.by_age <= 30)) {
    warnings.push(`earning: by_age ${earning.by_age} is outside 12–30.`);
  }

  if (context.marks.value && context.marks.value.low > context.marks.value.high) {
    warnings.push("marks: low is greater than high.");
  }
  if (context.marks.status === "known" && marksBand(context) === null) {
    warnings.push("marks: the stated range spans more than one band, so no band is written.");
  }

  const allowedSupport: readonly string[] =
    segment === "explorer" ? EXPLORER_SUPPORT : PATHFINDER_SUPPORT;
  if (context.support_needed.value && !allowedSupport.includes(context.support_needed.value)) {
    warnings.push(
      `support_needed: '${context.support_needed.value}' is not an option for ${label}.`,
    );
  }

  const statedClass = context.class_level.value;
  if (statedClass && !(SEGMENT_CLASSES[segment] ?? []).includes(statedClass)) {
    warnings.push(
      `class_level: student said '${statedClass}' but the profile says ${label}; confirm with the student.`,
    );
  }

  // v3 addition (Part E): at most three, each value and rank once.
  const values = context.values_top3.value ?? [];
  if (new Set(values.map((entry) => entry.value)).size !== values.length) {
    warnings.push("values_top3: a value appears more than once.");
  }
  if (new Set(values.map((entry) => entry.rank)).size !== values.length) {
    warnings.push("values_top3: a rank appears more than once.");
  }
  return warnings;
};

export type CoverageGroup = { label: string; covered: string[]; missing: string[] };

/** Which fields the conversation established. Declined counts as covered: the student answered. */
export const coverage = (
  context: ConversationContextV3,
  segment: string,
): { groups: CoverageGroup[] } => {
  const split = (fields: readonly string[]) => {
    const covered = fields.filter((name) =>
      ["known", "declined"].includes(field(context, name).status),
    );
    return { covered, missing: fields.filter((name) => !covered.includes(name)) };
  };
  const applicable = CONTEXT_FIELD_NAMES.filter(
    (name) => field(context, name).status !== "not_applicable",
  );
  const groups: CoverageGroup[] = [];
  const candidates: [string, readonly string[]][] = [
    ["Essential", ESSENTIAL_FIELDS[segment] ?? []],
    ["Used by recommendations", RECOMMENDATION_FIELDS[segment] ?? []],
    ["All fields", applicable],
  ];
  for (const [label, fields] of candidates) {
    if (fields.length > 0) groups.push({ label, ...split(fields) });
  }
  return { groups };
};

/** Topics still unknown. Declined and not-applicable fields count as covered. */
export const missingTopics = (context: ConversationContextV3, segment: string): string[] => {
  const skipped = SKIPPED_TOPICS[segment] ?? [];
  return Object.entries(TOPICS)
    .filter(([name]) => !skipped.includes(name) && field(context, name).status === "unknown")
    .map(([, topic]) => topic);
};

/** The check_coverage tool result: what the guide should do next (POC wording). */
export const coverageInstruction = (topics: readonly string[]): string => {
  if (topics.length === 0)
    return "Everything is covered. Continue speaking now with the closing summary.";
  return (
    `Not covered yet: ${topics.join("; ")}. Continue speaking now: ask about the first of these. Then ask about the ` +
    "rest naturally, one per turn (you may combine two closely " +
    "related ones). Skip any the student declines, and stop if they want to stop. Then give the closing " +
    "summary. Do not call check_coverage again."
  );
};

/** POC intake_preview: what would map to intake keys (known + firm). Clusterfit stores it, never writes it. */
export const intakePreview = (
  context: ConversationContextV3,
  segment: string,
): Record<string, unknown> => {
  const firm = (entry: AnyContextField): unknown =>
    entry.status === "known" && entry.certainty === "firm" ? entry.value : null;
  const truthy = (value: unknown): boolean =>
    value !== null &&
    value !== undefined &&
    value !== "" &&
    !(Array.isArray(value) && value.length === 0);

  const preview: Record<string, unknown> = {};
  const statedClass = firm(context.class_level) as string | null;
  if (statedClass && (SEGMENT_CLASSES[segment] ?? []).includes(statedClass)) {
    preview[segment === "explorer" ? "class_level" : "education_stage"] = statedClass;
  }
  if (truthy(firm(context.support_needed))) preview.support_needed = context.support_needed.value;

  if (segment === "explorer") {
    if (context.school_board.status === "declined") preview.school_board = "prefer_not_to_say";
    else if (truthy(firm(context.school_board))) preview.school_board = context.school_board.value;
    if (truthy(firm(context.subjects_enjoyed)))
      preview.favorite_subject = context.subjects_enjoyed.value![0];
    if (truthy(firm(context.enjoyed_activities)))
      preview.flow_activity = context.enjoyed_activities.value![0];
    return preview;
  }

  if (truthy(firm(context.current_stream))) preview.current_stream = context.current_stream.value;
  const band = marksBand(context);
  if (band && (band === "prefer_not_to_say" || context.marks.certainty === "firm"))
    preview.marks_band = band;
  if (truthy(firm(context.decision_confidence)))
    preview.decision_confidence = context.decision_confidence.value;
  if (context.constraints.status === "declined") {
    preview.constraints = "prefer_not_to_say";
  } else if (firm(context.constraints) !== null) {
    const constraints = context.constraints.value ?? [];
    const named = constraints.filter((entry) => entry !== "responsibilities" && entry !== "other");
    if (constraints.length === 0) preview.constraints = "none";
    else if (constraints.length === 1 && named.length > 0) preview.constraints = named[0];
  }
  if (truthy(firm(context.location)) && context.location.value?.study) {
    preview.location_preference = context.location.value.study.preference;
  }
  if (truthy(firm(context.seeks_aid))) preview.seeks_aid = context.seeks_aid.value;
  return preview;
};

/** Python's json.dumps(..., ensure_ascii=False) formatting, so the extraction input matches the POC. */
export const pythonJsonDumps = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(pythonJsonDumps).join(", ")}]`;
  const entries = Object.entries(value as Record<string, unknown>);
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}: ${pythonJsonDumps(entry)}`).join(", ")}}`;
};

export type TranscriptTurn = { speaker: "student" | "guide"; text: string };
export type KnownContext = {
  segment: string;
  state: string;
  city: string;
  already_answered: string;
};

/** extract_context's deterministic tail: the same derived outputs the POC returns. */
export const deriveFromContext = (context: ConversationContextV3, segment: string) => ({
  marks_band: marksBand(context),
  coverage: coverage(context, segment),
  missing_topics: missingTopics(context, segment),
  intake_preview: intakePreview(context, segment),
  warnings: consistencyWarnings(context, segment),
});
