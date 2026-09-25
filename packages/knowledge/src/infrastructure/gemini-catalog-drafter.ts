import { z } from "zod";
import {
  AidSchemeDraftBatchSchema,
  CareerStreamDraftBatchSchema,
  PathwayDraftBatchSchema,
  StreamMapItemDraftBatchSchema,
  StreamPathwayDraftBatchSchema,
  type AidSchemeDraftBatch,
  type CareerStreamDraftBatch,
  type CollegeDraftBatch,
  type PathwayDraftBatch,
  type StreamMapItemDraftBatch,
  type StreamPathwayDraftBatch,
} from "@yuvapath/contracts";

// Offline, batch-only catalog drafting via Gemini
// (docs/poc/ai-assisted-catalog-implementation-plan.md §16/§19). Deliberately NOT a subclass of
// or dependency on packages/counselor's GeminiAiProvider (that class's request/response shape is
// specific to counselor chat drafts) — this module reuses the exact same *pattern*
// (schema-constrained JSON via responseJsonSchema, then a second Zod re-validation pass,
// fetch-based, AbortSignal.timeout) with its own target-specific prompts/schemas.
// This module is never imported by apps/api's request path — only by the offline CLI scripts
// under scripts/ingest/.
//
// A 429 or 503 IS retried with backoff (see callGemini below) — this was originally "no retry
// loop, next script invocation is the retry story" for any failure, on the assumption sequential
// (one-call-at-a-time, no parallelism) calling would stay well under Gemini's rate limits with
// no dedicated limiter needed. That held at small scale (a 5-60 career pilot) but broke down for
// real at ~860 sequential calls with no inter-call delay: a live run
// (docs/architecture/career-stream-coverage-fill-plan.md) hit 124 real 429s out of 415 calls
// before being stopped. A second live run, after adding inter-call pacing and 429 retry, hit
// zero further 429s but a still-high rate of plain 503s (Gemini's own "temporarily unavailable"
// response, unrelated to caller request rate) — added to the same retry treatment as 429 for
// that reason. Timeout and malformed/invalid output still get no retry here — those aren't
// "wait and it'll work" the way 429/503 are, and the existing "next script invocation retries
// whatever's still a gap" story is still the right answer for them.

type Fetch = typeof fetch;

export type GeminiCatalogDrafterOptions = {
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  endpoint?: string;
  fetch?: Fetch;
};

export type CatalogDraftResult<T> =
  | { status: "completed"; data: T; rawResponse: unknown }
  | { status: "timed_out"; errorCode: string }
  | { status: "failed"; errorCode: string };

export const CATALOG_DRAFT_PROMPT_VERSIONS = {
  pathways: "catalog-pathway-draft-v1",
  colleges: "catalog-college-draft-v1",
  streamMapItems: "catalog-stream-map-item-draft-v1",
  careerStreams: "catalog-career-stream-draft-v1",
  streamPathways: "catalog-stream-pathway-draft-v1",
  aidSchemes: "catalog-aid-scheme-draft-v1",
} as const;

const normalizeModel = (model: string): string => model.replace(/^models\//, "");

// Every prompt shares this closing instruction — the belt-and-braces measure described in plan
// §19: the JSON schema's additionalProperties:false already structurally excludes forbidden
// fields, this is the second, explicit layer.
const SHARED_RULES = [
  "Never include a fit score, rank, ring, tier, eligibility label, verification status, or " +
    "dataset version anywhere in your response — those are decided by a separate deterministic " +
    "system and have no field in the requested JSON shape.",
  "Reference any existing catalog entity ONLY by the exact code/title given to you below — " +
    "never invent a new code for something you were told already exists, and never invent a " +
    "brand-new UUID for anything.",
  "If you are not confident a fact is correct (a fee amount, an admission route, a program " +
    "duration), return null for that field instead of guessing a plausible-sounding value.",
  "Do not propose an item that duplicates something already listed under 'existing catalog " +
    "content in this scope' below.",
  "Return only the JSON object matching the schema — no markdown fences, no commentary.",
].join("\n");

export type DraftPathwaysInput = {
  seedCareer: { onetCode: string | null; title: string; domainCode: string };
  knownEducationRoutes: ReadonlyArray<{ routeCode: string; title: string; routeLevel: string }>;
  knownDisciplines: ReadonlyArray<{ disciplineCode: string; title: string }>;
  existingPathwayTitlesInScope: readonly string[];
  maxPathways?: number;
};

export type DraftCollegesInput = {
  state: string;
  disciplineCode: string;
  disciplineTitle: string;
  count: number;
  existingCollegeNamesInScope: readonly string[];
};

export type DraftStreamMapItemsInput = {
  topTwoCode: string;
  knownStreamOptions: ReadonlyArray<{ streamCode: string; title: string; description: string }>;
};

export type DraftCareerStreamsInput = {
  seedCareer: { onetCode: string | null; title: string; domainCode: string };
  knownStreamOptions: ReadonlyArray<{ streamCode: string; title: string; description: string }>;
  existingLinkedStreamCodesForCareer: readonly string[];
  maxLinks?: number;
};

export type DraftStreamPathwaysInput = {
  seedStream: { streamCode: string; title: string; description: string };
  knownPathways: ReadonlyArray<{ pathwayCode: string; title: string }>;
  existingLinkedPathwayCodesForStream: readonly string[];
  maxLinks?: number;
};

export type DraftAidSchemesInput = {
  sourceUrl: string;
  sourceTitle: string;
  /** Cleaned page text (HTML/PDF already stripped down to readable text by the caller) — the
   *  ONLY thing Gemini extracts facts from; it is never given free rein to browse or recall. */
  sourceText: string;
  existingSchemeNamesInScope: readonly string[];
};

export type CatalogDrafter = {
  draftPathways(input: DraftPathwaysInput): Promise<CatalogDraftResult<PathwayDraftBatch>>;
  draftColleges(input: DraftCollegesInput): Promise<CatalogDraftResult<CollegeDraftBatch>>;
  draftStreamMapItems(
    input: DraftStreamMapItemsInput,
  ): Promise<CatalogDraftResult<StreamMapItemDraftBatch>>;
  draftCareerStreams(
    input: DraftCareerStreamsInput,
  ): Promise<CatalogDraftResult<CareerStreamDraftBatch>>;
  draftStreamPathways(
    input: DraftStreamPathwaysInput,
  ): Promise<CatalogDraftResult<StreamPathwayDraftBatch>>;
  draftAidSchemes(input: DraftAidSchemesInput): Promise<CatalogDraftResult<AidSchemeDraftBatch>>;
};

const CAREER_PATHWAY_LINK_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    careerOnetCode: { type: ["string", "null"] },
    careerTitle: { type: "string" },
    relationshipType: { type: "string", enum: ["primary", "alternative", "vocational"] },
  },
  required: ["careerOnetCode", "careerTitle", "relationshipType"],
} as const;

const PATHWAY_DISCIPLINE_LINK_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    disciplineCode: { type: "string" },
    relevanceWeight: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["disciplineCode", "relevanceWeight"],
} as const;

const PATHWAY_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    pathways: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          pathwayCode: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          educationRouteCode: { type: "string" },
          durationBand: { type: ["string", "null"] },
          backupRouteNote: { type: ["string", "null"] },
          relatedCareers: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: CAREER_PATHWAY_LINK_JSON_SCHEMA,
          },
          relatedDisciplines: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: PATHWAY_DISCIPLINE_LINK_JSON_SCHEMA,
          },
        },
        required: [
          "pathwayCode",
          "title",
          "description",
          "educationRouteCode",
          "durationBand",
          "backupRouteNote",
          "relatedCareers",
          "relatedDisciplines",
        ],
      },
    },
  },
  required: ["pathways"],
} as const;

// Gemini's responseJsonSchema support has undocumented limits found only by bisecting live
// 400 INVALID_ARGUMENT responses (the error body carries no field-level detail, and neither
// limit is documented) while implementing this:
//   1. An array nested two levels deep (root -> array -> object -> array -> object) tolerates
//      far fewer nullable (`type: [x, "null"]`) fields on its item schema than the same item
//      schema does at one level of nesting — the natural "colleges, each with a nested programs
//      array" shape, where programs has three nullable fields (durationBand/admissionRoute/
//      feesBand), reliably triggered this.
//   2. Independently, an array's `maxItems` has a ceiling somewhere between 20 and 30 for an
//      object this wide (7 properties) — above it, the request is rejected even with zero
//      nesting.
// Fix for (1): keep `colleges` and `programs` as SIBLING top-level arrays instead of nesting one
// inside the other, cross-referencing a program to its college by `collegeName`; draftColleges()
// re-assembles the nested CollegeDraftBatch shape the rest of the codebase (contracts,
// promotion script) already expects, so nothing outside this file needs to know about the flat
// wire shape. Fix for (2): keep `programs.maxItems` well under the observed ceiling (see below).
const GEMINI_COLLEGE_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    colleges: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          city: { type: "string" },
          institutionType: { type: "string" },
        },
        required: ["name", "city", "institutionType"],
      },
    },
    programs: {
      type: "array",
      minItems: 1,
      // Found empirically: Gemini's responseJsonSchema support silently rejects the whole
      // request (bare 400 INVALID_ARGUMENT, no field-level detail) once an array's maxItems
      // crosses some threshold between 20 and 30 for an object this wide (7 properties) — this
      // was the actual root cause of the earlier "two-level nesting" symptom above, not nesting
      // depth itself (a flat single array with maxItems:40 fails the exact same way with zero
      // nesting). Kept comfortably under that threshold; 20 programs is already more than one
      // gap-fill batch (~10 colleges × up to 6 programs, per collegePrompt's own `count`) would
      // realistically produce.
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          // Must exactly match one of this response's own colleges[].name values.
          collegeName: { type: "string" },
          disciplineCode: { type: "string" },
          programName: { type: "string" },
          qualificationLevel: {
            type: "string",
            enum: ["certificate", "iti", "diploma", "ug", "pg", "open"],
          },
          durationBand: { type: ["string", "null"] },
          admissionRoute: { type: ["string", "null"] },
          feesBand: { type: ["string", "null"] },
        },
        required: [
          "collegeName",
          "disciplineCode",
          "programName",
          "qualificationLevel",
          "durationBand",
          "admissionRoute",
          "feesBand",
        ],
      },
    },
  },
  required: ["colleges", "programs"],
} as const;

const GeminiCollegeDraftWireSchema = z
  .object({
    colleges: z
      .array(
        z
          .object({
            name: z.string(),
            city: z.string(),
            institutionType: z.string(),
          })
          .strict(),
      )
      .min(1),
    programs: z
      .array(
        z
          .object({
            collegeName: z.string(),
            disciplineCode: z.string(),
            programName: z.string(),
            qualificationLevel: z.enum(["certificate", "iti", "diploma", "ug", "pg", "open"]),
            durationBand: z.string().nullable(),
            admissionRoute: z.string().nullable(),
            feesBand: z.string().nullable(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

/** Re-nests the flat Gemini wire response into the CollegeDraftBatch shape the rest of the app expects. */
function assembleCollegeDraftBatch(wire: z.infer<typeof GeminiCollegeDraftWireSchema>): CollegeDraftBatch {
  return {
    colleges: wire.colleges.map((college) => ({
      name: college.name,
      city: college.city,
      institutionType: college.institutionType,
      programs: wire.programs
        .filter((program) => program.collegeName === college.name)
        .map(({ collegeName: _collegeName, ...program }) => {
          void _collegeName;
          return program;
        }),
    })),
  };
}

const STREAM_MAP_ITEM_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          streamCode: { type: "string" },
          reasonText: { type: "string" },
        },
        required: ["streamCode", "reasonText"],
      },
    },
  },
  required: ["items"],
} as const;

const CAREER_STREAM_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    careerStreams: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          streamCode: { type: "string" },
          relationshipType: {
            type: "string",
            enum: ["primary", "alternative", "cross_disciplinary"],
          },
          weight: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["streamCode", "relationshipType", "weight"],
      },
    },
  },
  required: ["careerStreams"],
} as const;

const STREAM_PATHWAY_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    streamPathways: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          pathwayCode: { type: "string" },
          relationshipType: {
            type: "string",
            enum: ["primary", "alternative", "cross_disciplinary"],
          },
          weight: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["pathwayCode", "relationshipType", "weight"],
      },
    },
  },
  required: ["streamPathways"],
} as const;

// Same flattening fix as GEMINI_COLLEGE_DRAFT_JSON_SCHEMA above, applied for the same reason:
// `schemes` and `criteria` are kept as SIBLING top-level arrays rather than nesting criteria
// inside each scheme, and a criterion's `value` union (amount vs. category list) is flattened
// into two separate nullable fields instead of a oneOf/union — no schema in this file uses
// oneOf/anyOf anywhere, and a scheme object here already carries 7 nullable fields of its own,
// well past what the college nesting bug needed to trigger. draftAidSchemes() re-nests the flat
// wire response into AidSchemeDraftBatch before returning, so nothing outside this file needs to
// know about the flat wire shape.
//
// categoryValues is a COMMA-SEPARATED STRING (categoryValuesText), not an array, and
// criteria.maxItems is 10, not a bigger number — both found empirically, live, against this
// pipeline's actual configured model (bisected via a throwaway script hitting the real Gemini
// endpoint directly, isolating exactly which change flipped the response from 400 to 200):
//   1. `categoryValues: { type: ["array","null"], items: {...} }` — a plain array nested two
//      levels deep (root -> criteria[] -> item -> categoryValues[]) — reliably 400s on its own,
//      REGARDLESS of the array being nullable or not; the college-nesting write-up above only
//      identified "nullable fields at two levels deep" as the trigger, but a required (non-
//      nullable) array at that same depth fails identically. Flattened to a single string here
//      and parsed back into an array (split on comma, filtered to known category codes) by
//      assembleAidSchemeDraftBatch below, so nothing outside this file ever sees the flat wire
//      shape.
//   2. Separately, and even with (1) fixed: `schemes` (maxItems 8, 13 properties) combined with
//      `criteria` at maxItems 24 (7 properties) still 400s as a WHOLE-SCHEMA combination, even
//      though `schemes` alone and `criteria` alone (at 24) each pass independently — this is a
//      genuinely different failure mode from the maxItems-for-one-array ceiling the college
//      schema's own comment describes (that one was single-array; this is cross-array). Bisected
//      down to: 8+10 passes, 8+12 fails. Kept at 10, comfortably under that line — a page
//      listing more than ~10 total eligibility criteria across up to 8 schemes is already an
//      unusual outlier for a scholarships listing page.
const GEMINI_AID_SCHEME_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    schemes: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          providerType: { type: ["string", "null"] },
          provider: { type: "string" },
          level: { type: "string" },
          educationScope: { type: "string", enum: ["ug_only", "ug_and_other_levels", "not_ug"] },
          states: { type: "array", minItems: 1, items: { type: "string" } },
          eligibilitySummary: { type: ["string", "null"] },
          benefitSummary: { type: ["string", "null"] },
          amountText: { type: ["string", "null"] },
          applicationUrl: { type: ["string", "null"] },
          portalName: { type: ["string", "null"] },
          applyWindowStart: { type: ["string", "null"] },
          applyWindowEnd: { type: ["string", "null"] },
        },
        required: [
          "name",
          "providerType",
          "provider",
          "level",
          "educationScope",
          "states",
          "eligibilitySummary",
          "benefitSummary",
          "amountText",
          "applicationUrl",
          "portalName",
          "applyWindowStart",
          "applyWindowEnd",
        ],
      },
    },
    criteria: {
      type: "array",
      minItems: 0,
      // See this const's own header comment — 10, not a bigger number, is load-bearing.
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          // Must exactly match one of this response's own schemes[].name values.
          schemeName: { type: "string" },
          criterionType: { type: "string", enum: ["annual_income_max", "student_category"] },
          operator: { type: "string", enum: ["lte", "in"] },
          // Used when criterionType is annual_income_max; null otherwise.
          amountValue: { type: ["number", "null"] },
          // Used when criterionType is student_category; null otherwise. Comma-separated (e.g.
          // "sc,st"), not an array — see this const's own header comment.
          categoryValuesText: { type: ["string", "null"] },
          isRequired: { type: "boolean" },
          sourceText: { type: "string" },
        },
        required: [
          "schemeName",
          "criterionType",
          "operator",
          "amountValue",
          "categoryValuesText",
          "isRequired",
          "sourceText",
        ],
      },
    },
  },
  required: ["schemes", "criteria"],
} as const;

const GeminiAidSchemeDraftWireSchema = z
  .object({
    schemes: z
      .array(
        z
          .object({
            name: z.string(),
            providerType: z.string().nullable(),
            provider: z.string(),
            level: z.string(),
            educationScope: z.enum(["ug_only", "ug_and_other_levels", "not_ug"]),
            states: z.array(z.string()).min(1),
            eligibilitySummary: z.string().nullable(),
            benefitSummary: z.string().nullable(),
            amountText: z.string().nullable(),
            applicationUrl: z.string().nullable(),
            portalName: z.string().nullable(),
            applyWindowStart: z.string().nullable(),
            applyWindowEnd: z.string().nullable(),
          })
          .strict(),
      )
      .min(1),
    criteria: z.array(
      z
        .object({
          schemeName: z.string(),
          criterionType: z.enum(["annual_income_max", "student_category"]),
          operator: z.enum(["lte", "in"]),
          amountValue: z.number().nullable(),
          categoryValuesText: z.string().nullable(),
          isRequired: z.boolean(),
          sourceText: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

const KNOWN_AID_STUDENT_CATEGORIES = new Set([
  "general",
  "obc",
  "sc",
  "st",
  "ews",
  "minority",
  "other",
]);

/** "sc, st , general" -> ["sc","st","general"] — trims, lowercases, and drops any token Gemini
 *  produced that isn't one of the known category codes rather than letting an unrecognized value
 *  through (same "drop, don't guess" rule as the criterionType/value mismatch case below). */
function parseCategoryValuesText(text: string | null): string[] {
  if (text === null) return [];
  return text
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => KNOWN_AID_STUDENT_CATEGORIES.has(token));
}

/** Real source pages routinely give a bare domain ("www.scholarships.gov.in") rather than a
 *  full URL — found live, against the actual TN DCE source page, which is a genuine value the
 *  page gave, just missing the scheme. Prefixing https:// is normalizing that value's format,
 *  not inventing a URL Gemini wasn't given (Phase 7's "never invent a URL" rule is about
 *  fabricating a destination that isn't in the source at all — this is neither). Anything that
 *  still isn't a valid https URL after this (garbage text, a phone number, etc.) is left alone
 *  and rejected by AidSchemeDraftSchema's own `.url()` check same as before. */
function normalizeApplicationUrl(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Re-nests the flat Gemini wire response into the AidSchemeDraftBatch shape the rest of the app
 *  expects — mirrors assembleCollegeDraftBatch above. A criterion whose declared amountValue/
 *  categoryValues doesn't match its own criterionType (e.g. annual_income_max with a null
 *  amountValue) is dropped rather than guessed at. Unlike assembleCollegeDraftBatch, the result
 *  here is re-validated against AidSchemeDraftBatchSchema by the caller (draftAidSchemes) rather
 *  than trusted by construction — this is the only place applicationUrl's real https/URL-format
 *  requirement actually gets enforced, and that matters more here than elsewhere given real
 *  eligibility/money data is involved. */
function assembleAidSchemeDraftBatch(
  wire: z.infer<typeof GeminiAidSchemeDraftWireSchema>,
): unknown {
  return {
    schemes: wire.schemes.map((scheme) => ({
      name: scheme.name,
      providerType: scheme.providerType,
      provider: scheme.provider,
      level: scheme.level,
      educationScope: scheme.educationScope,
      states: scheme.states,
      eligibilitySummary: scheme.eligibilitySummary,
      benefitSummary: scheme.benefitSummary,
      amountText: scheme.amountText,
      applicationUrl: normalizeApplicationUrl(scheme.applicationUrl),
      portalName: scheme.portalName,
      applyWindowStart: scheme.applyWindowStart,
      applyWindowEnd: scheme.applyWindowEnd,
      criteria: wire.criteria
        .filter((criterion) => criterion.schemeName === scheme.name)
        .map((criterion) => {
          const categoryValues = parseCategoryValuesText(criterion.categoryValuesText);
          const value =
            criterion.criterionType === "annual_income_max"
              ? criterion.amountValue !== null
                ? { amount: criterion.amountValue }
                : undefined
              : categoryValues.length > 0
                ? { values: categoryValues }
                : undefined;
          if (value === undefined) return undefined;
          return {
            criterionType: criterion.criterionType,
            operator: criterion.operator,
            value,
            isRequired: criterion.isRequired,
            sourceText: criterion.sourceText,
          };
        })
        .filter((criterion): criterion is NonNullable<typeof criterion> => criterion !== undefined),
    })),
  };
}

function aidSchemeSystemInstruction(): string {
  return [
    "You are a factual data extraction agent for a Tamil Nadu undergraduate scholarship and",
    "financial-aid catalog, for YuvaPath, an Indian student career-guidance product. Extract ONLY",
    "information explicitly supported by the supplied source text below — never hallucinate,",
    "never infer an eligibility condition that is not stated, never invent an amount, income",
    "limit, deadline, application URL, or provider. Do not convert an ambiguous statement into a",
    "precise value. If a field is not clearly supported by the source, return null for it rather",
    "than guessing a plausible-sounding value — this applies especially to applicationUrl: only",
    "return a URL if the source text itself states or clearly implies the official application",
    "destination, never a URL you are inferring from the provider's name.",
    "Classify educationScope honestly per scheme: 'ug_only' if the scheme is exclusively for",
    "undergraduate/college-going students, 'ug_and_other_levels' if it spans UG plus other levels",
    "(e.g. school, diploma, PG, PhD) but a UG student can genuinely use it, 'not_ug' if it cannot",
    "be used by a UG student at all (e.g. PG-only, PhD/research fellowships, school-only). Extract",
    "every distinct scheme the source text describes — if it lists several schemes, return all of",
    "them, not just one merged summary.",
    "Every eligibility criterion you extract as structured data (income cap, community/category)",
    "must include the exact source sentence or clause it came from in sourceText — do not",
    "structure a criterion you cannot point to a specific source statement for.",
    SHARED_RULES,
  ].join(" ");
}

function aidSchemePrompt(input: DraftAidSchemesInput): string {
  return JSON.stringify({
    task:
      "Extract every distinct Tamil-Nadu-applicable scholarship/financial-aid scheme usable by " +
      "a UG/college-going student from the source text below.",
    sourceUrl: input.sourceUrl,
    sourceTitle: input.sourceTitle,
    sourceText: input.sourceText,
    existingCatalogContentInScope: { schemeNames: input.existingSchemeNamesInScope },
  });
}

function pathwaySystemInstruction(): string {
  return [
    "You are a catalog-content drafting assistant for YuvaPath, an Indian student career-",
    "guidance product. Draft one or more realistic EDUCATION PATHWAYS (a route of study — for",
    "example a degree, diploma, or certificate track) that lead toward the given seed career or",
    "closely related careers, for an Indian student audience.",
    SHARED_RULES,
  ].join(" ");
}

function pathwayPrompt(input: DraftPathwaysInput): string {
  return JSON.stringify({
    task: "Draft education pathways for the seed career below.",
    seedCareer: input.seedCareer,
    trustedContext: {
      knownEducationRoutes: input.knownEducationRoutes,
      knownDisciplines: input.knownDisciplines,
    },
    existingCatalogContentInScope: { pathwayTitles: input.existingPathwayTitlesInScope },
    maxPathways: input.maxPathways ?? 2,
  });
}

function collegeSystemInstruction(): string {
  return [
    "You are a catalog-content drafting assistant for YuvaPath, an Indian student career-",
    "guidance product. Draft realistic-shaped colleges/institutions and the programs they",
    "offer, for the given Indian state and discipline. This content is EXPLICITLY unverified —",
    "a human will review it before publication, and it is never shown to students without that",
    "review — so favor a plausible, well-formed draft over asserting facts you cannot support.",
    "Do not invent a specific street address, a specific website URL, or an official college",
    "code — leave institutional facts you cannot verify generic.",
    "Return colleges and their programs as two separate top-level lists: every program's",
    "collegeName must exactly match the name of one of the colleges you listed — this is how a",
    "program is linked back to its college, not by nesting.",
    SHARED_RULES,
  ].join(" ");
}

function collegePrompt(input: DraftCollegesInput): string {
  return JSON.stringify({
    task: `Draft up to ${input.count} colleges in ${input.state} offering programs in the ${input.disciplineTitle} discipline.`,
    targetState: input.state,
    targetDiscipline: { disciplineCode: input.disciplineCode, title: input.disciplineTitle },
    existingCatalogContentInScope: { collegeNames: input.existingCollegeNamesInScope },
    count: input.count,
  });
}

function streamMapItemSystemInstruction(): string {
  return [
    "You are a catalog-content drafting assistant for YuvaPath, an Indian student career-",
    "guidance product. For the given RIASEC top-two interest code, write one short",
    "explanation (reasonText) per stream option describing why that school stream fits a",
    "student with that interest pattern. Do not assign or imply a ranking between the",
    "options — order does not matter, wording does.",
    SHARED_RULES,
  ].join(" ");
}

function streamMapItemPrompt(input: DraftStreamMapItemsInput): string {
  return JSON.stringify({
    task: "Draft one reasonText per stream option for this RIASEC top-two code.",
    topTwoCode: input.topTwoCode,
    knownStreamOptions: input.knownStreamOptions,
  });
}

function careerStreamSystemInstruction(): string {
  return [
    "You are a catalog-content drafting assistant for YuvaPath, an Indian student career-",
    "guidance product. For the given seed career, identify which of the listed school/college",
    "streams a student would realistically need to have taken (or would need to bridge into) to",
    "reach that career in the Indian education system. relationshipType 'primary' means the",
    "standard/expected stream for this career; 'alternative' means a less obvious but valid",
    "route; 'cross_disciplinary' means an unconventional but real path (e.g. a Commerce student",
    "reaching a design career via a bridge course). weight is your confidence in the strength of",
    "that link, not a ranking position.",
    SHARED_RULES,
  ].join(" ");
}

function careerStreamPrompt(input: DraftCareerStreamsInput): string {
  return JSON.stringify({
    task: "Draft career-stream links for the seed career below.",
    seedCareer: input.seedCareer,
    trustedContext: { knownStreamOptions: input.knownStreamOptions },
    existingCatalogContentInScope: {
      streamCodesAlreadyLinkedToThisCareer: input.existingLinkedStreamCodesForCareer,
    },
    maxLinks: input.maxLinks ?? 3,
  });
}

function streamPathwaySystemInstruction(): string {
  return [
    "You are a catalog-content drafting assistant for YuvaPath, an Indian student career-",
    "guidance product. For the given seed school/college stream, identify which of the listed",
    "education pathways a student who took that stream would realistically be able to enter.",
    "relationshipType 'primary' means the standard/expected pathway from this stream;",
    "'alternative' means a less obvious but valid route; 'cross_disciplinary' means an",
    "unconventional but real bridge into a pathway outside the stream's usual scope. weight is",
    "your confidence in the strength of that link, not a ranking position.",
    SHARED_RULES,
  ].join(" ");
}

function streamPathwayPrompt(input: DraftStreamPathwaysInput): string {
  return JSON.stringify({
    task: "Draft stream-pathway links for the seed stream below.",
    seedStream: input.seedStream,
    trustedContext: { knownPathways: input.knownPathways },
    existingCatalogContentInScope: {
      pathwayCodesAlreadyLinkedToThisStream: input.existingLinkedPathwayCodesForStream,
    },
    maxLinks: input.maxLinks ?? 4,
  });
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Fixed schedule, not exponential-from-zero: both retryable codes mean "try again shortly, not
// right now," so the first wait should be substantial rather than a token 1s/2s backoff that
// just hits the same condition again immediately. 3 attempts total (1 initial + 2 retries) — if
// Gemini is still failing after a 15s and a 45s wait, this career's gap is left for the next
// script invocation rather than the caller building a long backoff chain into what's meant to be
// one draft call.
const RETRYABLE_ERROR_CODES = new Set(["rate_limited", "provider_http_503"]);
const RETRY_BACKOFF_MS = [15_000, 45_000];

export function createGeminiCatalogDrafter(options: GeminiCatalogDrafterOptions): CatalogDrafter {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const endpoint =
    options.endpoint ??
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalizeModel(options.model))}:generateContent`;

  async function callGeminiOnce(
    systemInstruction: string,
    prompt: string,
    responseJsonSchema: unknown,
  ): Promise<
    { status: "completed"; text: string; raw: unknown } | { status: "timed_out" | "failed"; errorCode: string }
  > {
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: options.maxTokens,
            responseMimeType: "application/json",
            responseJsonSchema,
          },
        }),
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      if (!response.ok) {
        return {
          status: "failed",
          errorCode: response.status === 429 ? "rate_limited" : `provider_http_${response.status}`,
        };
      }
      const raw: unknown = await response.json();
      const text = extractText(raw);
      return text ? { status: "completed", text, raw } : { status: "failed", errorCode: "empty_provider_output" };
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        return { status: "timed_out", errorCode: "provider_timeout" };
      }
      return { status: "failed", errorCode: "provider_request_failed" };
    }
  }

  async function callGemini(
    systemInstruction: string,
    prompt: string,
    responseJsonSchema: unknown,
  ): Promise<{ status: "completed"; text: string; raw: unknown } | { status: "timed_out" | "failed"; errorCode: string }> {
    for (let attempt = 0; ; attempt++) {
      const result = await callGeminiOnce(systemInstruction, prompt, responseJsonSchema);
      if (
        result.status !== "failed" ||
        !RETRYABLE_ERROR_CODES.has(result.errorCode) ||
        attempt >= RETRY_BACKOFF_MS.length
      ) {
        return result;
      }
      await sleep(RETRY_BACKOFF_MS[attempt]!);
    }
  }

  return {
    async draftPathways(input) {
      const result = await callGemini(
        pathwaySystemInstruction(),
        pathwayPrompt(input),
        PATHWAY_DRAFT_JSON_SCHEMA,
      );
      if (result.status !== "completed") {
        return result;
      }
      return parseDraft(PathwayDraftBatchSchema, result.text, result.raw);
    },

    async draftColleges(input) {
      const result = await callGemini(
        collegeSystemInstruction(),
        collegePrompt(input),
        GEMINI_COLLEGE_DRAFT_JSON_SCHEMA,
      );
      if (result.status !== "completed") {
        return result;
      }
      const wireResult = parseDraft(GeminiCollegeDraftWireSchema, result.text, result.raw);
      if (wireResult.status !== "completed") {
        return wireResult;
      }
      return { status: "completed", data: assembleCollegeDraftBatch(wireResult.data), rawResponse: wireResult.rawResponse };
    },

    async draftStreamMapItems(input) {
      const result = await callGemini(
        streamMapItemSystemInstruction(),
        streamMapItemPrompt(input),
        STREAM_MAP_ITEM_DRAFT_JSON_SCHEMA,
      );
      if (result.status !== "completed") {
        return result;
      }
      return parseDraft(StreamMapItemDraftBatchSchema, result.text, result.raw);
    },

    async draftCareerStreams(input) {
      const result = await callGemini(
        careerStreamSystemInstruction(),
        careerStreamPrompt(input),
        CAREER_STREAM_DRAFT_JSON_SCHEMA,
      );
      if (result.status !== "completed") {
        return result;
      }
      return parseDraft(CareerStreamDraftBatchSchema, result.text, result.raw);
    },

    async draftStreamPathways(input) {
      const result = await callGemini(
        streamPathwaySystemInstruction(),
        streamPathwayPrompt(input),
        STREAM_PATHWAY_DRAFT_JSON_SCHEMA,
      );
      if (result.status !== "completed") {
        return result;
      }
      return parseDraft(StreamPathwayDraftBatchSchema, result.text, result.raw);
    },

    async draftAidSchemes(input) {
      const result = await callGemini(
        aidSchemeSystemInstruction(),
        aidSchemePrompt(input),
        GEMINI_AID_SCHEME_DRAFT_JSON_SCHEMA,
      );
      if (result.status !== "completed") {
        return result;
      }
      const wireResult = parseDraft(GeminiAidSchemeDraftWireSchema, result.text, result.raw);
      if (wireResult.status !== "completed") {
        return wireResult;
      }
      const assembled = assembleAidSchemeDraftBatch(wireResult.data);
      const validated = AidSchemeDraftBatchSchema.safeParse(assembled);
      if (!validated.success) {
        return { status: "failed", errorCode: "invalid_provider_output" };
      }
      return { status: "completed", data: validated.data, rawResponse: wireResult.rawResponse };
    },
  };
}

function extractText(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidates = (raw as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return undefined;
  const text = candidates
    .flatMap((candidate): unknown[] => {
      if (!candidate || typeof candidate !== "object") return [];
      const content = (candidate as { content?: unknown }).content;
      if (!content || typeof content !== "object") return [];
      const parts: unknown = (content as { parts?: unknown }).parts;
      return Array.isArray(parts) ? (parts as unknown[]) : [];
    })
    .map((part) => (part && typeof part === "object" ? (part as { text?: unknown }).text : undefined))
    .filter((value): value is string => typeof value === "string")
    .join("")
    .trim();
  return text || undefined;
}

function parseDraft<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown } },
  text: string,
  raw: unknown,
): CatalogDraftResult<T> {
  const normalized = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const parsed: unknown = JSON.parse(normalized);
    const result = schema.safeParse(parsed);
    if (!result.success) {
      return { status: "failed", errorCode: "invalid_provider_output" };
    }
    return { status: "completed", data: result.data, rawResponse: raw };
  } catch {
    return { status: "failed", errorCode: "invalid_provider_output" };
  }
}
