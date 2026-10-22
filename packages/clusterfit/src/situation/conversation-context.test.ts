import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ConversationContextV3Schema,
  FIELD_SCHEMA_VERSION_V3,
  buildLivePrompt,
  consistencyWarnings,
  coverageInstruction,
  deriveFromContext,
  loadPrompts,
  missingTopics,
  pythonJsonDumps,
} from "./conversation-context.js";
import { mapSituation } from "./mapper.js";
import { POC_COVERAGE_EXAMPLES } from "./poc-constants.js";
import { PROMPT_FILE_V3 } from "./prompt-v3.js";

// Expected values were produced by running the Gemini Live POC's own yuvapath.py on these inputs.
type Fixture = {
  cases: { segment: string; context: Record<string, unknown>; expected: Record<string, unknown> }[];
  live_prompt: string;
  student: Record<string, string>;
  extraction_prompt: string;
  payload: string;
};
const fixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/poc-parity.json", import.meta.url), "utf8"),
) as Fixture;

const unknown = { status: "unknown", value: null, certainty: null, evidence: null };
const notApplicable = { status: "not_applicable", value: null, certainty: null, evidence: null };
/** A POC v2 context as v3: values_top3 not applicable, so every POC rule sees the same fields. */
const asV3 = (context: Record<string, unknown>, values: Record<string, unknown> = notApplicable) =>
  ConversationContextV3Schema.parse({ ...context, schema_version: "3", values_top3: values });

/** Reverses exactly the documented v3 edits (plan §18.2), leaving the POC's text. */
const TOPIC_11 =
  /### Also cover, near the end\n\n\*\*11\. What matters most\.\*\*[\s\S]*?\n\n(?=Age focus:)/;
const livePromptWithoutV3 = (text: string) =>
  text
    .replace(TOPIC_11, "")
    .replace(
      "After this conversation, YuvaPath will ask some activity questions and short everyday puzzles.",
      "YuvaPath measures interests and work values through formal assessments (RIASEC and work values).",
    );
const extractionPromptWithoutV3 = (text: string) =>
  text
    .replace("`yuvapath.conversation_context` v3)", "`yuvapath.conversation_context` v2)")
    .replace(/- `values_top3`: [^\n]*\n/, "")
    .replace(
      "# 3. Structured Output Schema — `yuvapath.conversation_context` v3",
      "# 3. Structured Output Schema — `yuvapath.conversation_context` v2",
    )
    .replace('"schema_version": "3"', '"schema_version": "2"')
    .replace(/ {2}"values_top3": [^\n]*\n/, "")
    .replace(/ {2}"ValueCard": [^\n]*\n/, "")
    .replace(/- `values_top3` has at most 3 entries[^\n]*\n/, "");

describe("parity with the Gemini Live POC (yuvapath.py)", () => {
  it.each(fixture.cases.map((entry, index) => [index + 1, entry] as const))(
    "case %i gives the same derived outputs",
    (_index, entry) => {
      expect(deriveFromContext(asV3(entry.context), entry.segment)).toEqual(entry.expected);
    },
  );

  it("builds the POC Live prompt plus only the documented Part E topic and sentence change", () => {
    const live = buildLivePrompt(fixture.student);
    expect(live).toContain("**11. What matters most.**");
    expect(live).not.toContain("RIASEC");
    expect(livePromptWithoutV3(live)).toBe(fixture.live_prompt);
  });

  it("builds the POC extraction prompt plus only the values_top3 additions", () => {
    expect(extractionPromptWithoutV3(loadPrompts().extraction)).toBe(fixture.extraction_prompt);
  });

  it("formats the extraction payload like Python's json.dumps", () => {
    expect(
      pythonJsonDumps({
        known_context: {
          segment: "pathfinder",
          state: "Tamil Nadu",
          city: "",
          already_answered: "",
        },
        transcript: [
          { speaker: "guide", text: "Hi Meena! Which class are you in?" },
          { speaker: "student", text: "Class 11, அறிவியல்." },
        ],
      }),
    ).toBe(fixture.payload);
  });

  it("words the coverage instruction the same", () => {
    expect(coverageInstruction([])).toBe(POC_COVERAGE_EXAMPLES.empty);
    expect(coverageInstruction(["topic one", "topic two"])).toBe(POC_COVERAGE_EXAMPLES.two);
  });

  it("embeds the current prompts/conversation-context-v3.md (run sync-prompt after editing)", () => {
    const markdown = readFileSync(
      new URL("../../prompts/conversation-context-v3.md", import.meta.url),
      "utf8",
    );
    expect(PROMPT_FILE_V3).toBe(markdown.replace(/\r\n/g, "\n"));
  });
});

describe("v3 Part E additions", () => {
  const base = fixture.cases[0]!.context;

  it("lists Part E as a missing topic until it is covered", () => {
    expect(missingTopics(asV3(base, unknown), "pathfinder").at(-1)).toMatch(
      /matter most to them in work/,
    );
    const covered = asV3(base, {
      status: "known",
      value: [{ value: "learn_grow", rank: 1 }],
      certainty: "firm",
      evidence: "learning matters most",
    });
    expect(
      missingTopics(covered, "pathfinder").some((topic) => topic.includes("matter most")),
    ).toBe(false);
  });

  it("warns on a repeated value or rank", () => {
    const repeated = asV3(base, {
      status: "known",
      value: [
        { value: "respect", rank: 1 },
        { value: "respect", rank: 1 },
      ],
      certainty: "firm",
      evidence: "respect",
    });
    expect(consistencyWarnings(repeated, "pathfinder")).toEqual(
      expect.arrayContaining([
        "values_top3: a value appears more than once.",
        "values_top3: a rank appears more than once.",
      ]),
    );
  });
});

describe("mapSituation", () => {
  const base = { ...fixture.cases[0]!.context, schema_version: "3", values_top3: unknown };

  it("maps class_level to grade and values_top3 to values, leaving medium null", () => {
    const mapping = mapSituation(FIELD_SCHEMA_VERSION_V3, {
      ...base,
      values_top3: {
        status: "known",
        value: [
          { value: "help_community", rank: 2 },
          { value: "steady_income", rank: 1 },
        ],
        certainty: "firm",
        evidence: "x",
      },
    });
    expect(mapping.canonical).toMatchObject({
      grade: 11,
      medium: null,
      values: [
        { value: "steady_income", rank: 1 },
        { value: "help_community", rank: 2 },
      ],
    });
    expect(mapping.canonical.context).not.toHaveProperty("wellbeing_flag");
    expect(mapping.missingFields).toEqual([]);
  });

  it.each([
    ["class_9", 9],
    ["class_10", 10],
    ["class_12", 12],
    ["other", null],
  ] as const)("maps %s to %s", (value, grade) => {
    const raw = {
      ...base,
      class_level: { status: "known", value, certainty: "firm", evidence: "x" },
    };
    expect(mapSituation(FIELD_SCHEMA_VERSION_V3, raw).canonical.grade).toBe(grade);
  });

  it("asks the confirm card for what's missing", () => {
    expect(
      mapSituation(FIELD_SCHEMA_VERSION_V3, { ...base, class_level: unknown }).missingFields,
    ).toEqual(["grade", "values"]);
  });

  it("keeps an unknown schema version raw with an empty view", () => {
    expect(mapSituation("conversation-context-v9", { a1: 1 })).toEqual({
      canonical: { grade: null, medium: null, values: null, context: {} },
      mapperVersion: null,
      missingFields: ["grade"],
      unmappedFields: ["a1"],
    });
  });
});
