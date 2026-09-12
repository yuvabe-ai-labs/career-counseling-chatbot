import { z } from "zod";
import {
  PathwayDraftBatchSchema,
  StreamMapItemDraftBatchSchema,
  type CollegeDraftBatch,
  type PathwayDraftBatch,
  type StreamMapItemDraftBatch,
} from "@yuvanext/contracts";

// Offline, batch-only catalog drafting via Gemini
// (docs/poc/ai-assisted-catalog-implementation-plan.md §16/§19). Deliberately NOT a subclass of
// or dependency on packages/counselor's GeminiAiProvider (that class's request/response shape is
// specific to counselor chat drafts) — this module reuses the exact same *pattern*
// (schema-constrained JSON via responseJsonSchema, then a second Zod re-validation pass,
// fetch-based, AbortSignal.timeout, no retry loop) with its own target-specific prompts/schemas.
// This module is never imported by apps/api's request path — only by the offline CLI scripts
// under scripts/ingest/.

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

export type CatalogDrafter = {
  draftPathways(input: DraftPathwaysInput): Promise<CatalogDraftResult<PathwayDraftBatch>>;
  draftColleges(input: DraftCollegesInput): Promise<CatalogDraftResult<CollegeDraftBatch>>;
  draftStreamMapItems(
    input: DraftStreamMapItemsInput,
  ): Promise<CatalogDraftResult<StreamMapItemDraftBatch>>;
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

function pathwaySystemInstruction(): string {
  return [
    "You are a catalog-content drafting assistant for YuvaNext, an Indian student career-",
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
    "You are a catalog-content drafting assistant for YuvaNext, an Indian student career-",
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
    "You are a catalog-content drafting assistant for YuvaNext, an Indian student career-",
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

export function createGeminiCatalogDrafter(options: GeminiCatalogDrafterOptions): CatalogDrafter {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const endpoint =
    options.endpoint ??
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalizeModel(options.model))}:generateContent`;

  async function callGemini(
    systemInstruction: string,
    prompt: string,
    responseJsonSchema: unknown,
  ): Promise<{ status: "completed"; text: string; raw: unknown } | { status: "timed_out" | "failed"; errorCode: string }> {
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
