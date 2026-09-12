import { describe, expect, it, vi } from "vitest";
import type { PathwayDraftBatch } from "@yuvanext/contracts";
import { createGeminiCatalogDrafter } from "../src/index.js";

const createDrafter = (fetch: typeof globalThis.fetch) =>
  createGeminiCatalogDrafter({
    apiKey: "synthetic-gemini-key",
    model: "models/gemini-test",
    maxTokens: 500,
    timeoutMs: 1_000,
    fetch,
  });

function fetchReturning(text: string, status = 200): typeof globalThis.fetch {
  return vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
        { status },
      ),
    ),
  );
}

describe("createGeminiCatalogDrafter — draftColleges (flat wire shape, re-nested)", () => {
  it("re-assembles Gemini's flat colleges/programs response into nested CollegeDraftBatch", async () => {
    // Gemini's responseJsonSchema rejects a nested colleges[].programs[] shape whose program
    // item has more than one nullable field (empirically isolated while building this) — see
    // GEMINI_COLLEGE_DRAFT_JSON_SCHEMA's own comment. The wire format is two sibling
    // top-level arrays cross-referenced by collegeName; draftColleges() must re-nest them.
    const wireResponse = {
      colleges: [
        { name: "Chennai Technical College", city: "Chennai", institutionType: "college" },
        { name: "Madurai Polytechnic", city: "Madurai", institutionType: "polytechnic" },
      ],
      programs: [
        {
          collegeName: "Chennai Technical College",
          disciplineCode: "computing",
          programName: "BSc Data Science",
          qualificationLevel: "ug",
          durationBand: "3 years",
          admissionRoute: null,
          feesBand: null,
        },
        {
          collegeName: "Chennai Technical College",
          disciplineCode: "computing",
          programName: "Diploma in Computer Applications",
          qualificationLevel: "diploma",
          durationBand: null,
          admissionRoute: null,
          feesBand: null,
        },
        {
          collegeName: "Madurai Polytechnic",
          disciplineCode: "computing",
          programName: "Diploma in Computer Engineering",
          qualificationLevel: "diploma",
          durationBand: "2 years",
          admissionRoute: "Merit-based",
          feesBand: null,
        },
      ],
    };
    const drafter = createDrafter(fetchReturning(JSON.stringify(wireResponse)));

    const result = await drafter.draftColleges({
      state: "Tamil Nadu",
      disciplineCode: "computing",
      disciplineTitle: "Computing",
      count: 2,
      existingCollegeNamesInScope: [],
    });

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;
    expect(result.data.colleges).toHaveLength(2);
    const chennai = result.data.colleges.find((college) => college.name === "Chennai Technical College");
    const madurai = result.data.colleges.find((college) => college.name === "Madurai Polytechnic");
    expect(chennai?.programs).toHaveLength(2);
    expect(madurai?.programs).toHaveLength(1);
    // collegeName must not leak into the re-nested program shape.
    expect(chennai?.programs[0]).not.toHaveProperty("collegeName");
  });

  it("sends a flat (sibling colleges/programs) responseJsonSchema, never a nested one", async () => {
    const fetch = fetchReturning(
      JSON.stringify({ colleges: [{ name: "X", city: "Y", institutionType: "college" }], programs: [] }),
    );
    await createDrafter(fetch).draftColleges({
      state: "Tamil Nadu",
      disciplineCode: "computing",
      disciplineTitle: "Computing",
      count: 1,
      existingCollegeNamesInScope: [],
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
      generationConfig?: { responseJsonSchema?: { properties?: Record<string, unknown> } };
    };
    const schemaProperties = body.generationConfig?.responseJsonSchema?.properties ?? {};
    expect(Object.keys(schemaProperties)).toEqual(["colleges", "programs"]);
    // colleges[].items must NOT declare a nested "programs" property — that nested shape is
    // exactly what triggers Gemini's undocumented 400 (see GEMINI_COLLEGE_DRAFT_JSON_SCHEMA).
    const collegesItemSchema = (
      schemaProperties.colleges as { items?: { properties?: Record<string, unknown> } } | undefined
    )?.items;
    expect(collegesItemSchema?.properties).not.toHaveProperty("programs");
  });
});

describe("createGeminiCatalogDrafter — draftPathways", () => {
  it("returns validated pathway drafts and keeps the API key out of the URL/body", async () => {
    const draft: PathwayDraftBatch = {
      pathways: [
        {
          pathwayCode: "bsc-data-science",
          title: "BSc Data Science",
          description: "An undergraduate pathway combining statistics and computing.",
          educationRouteCode: "degree",
          durationBand: "3-4 years",
          backupRouteNote: null,
          relatedCareers: [
            { careerOnetCode: "15-1252.00", careerTitle: "Software Developer", relationshipType: "primary" },
          ],
          relatedDisciplines: [{ disciplineCode: "computing", relevanceWeight: 0.9 }],
        },
      ],
    };
    const fetch = fetchReturning(JSON.stringify(draft));
    const drafter = createDrafter(fetch);

    const result = await drafter.draftPathways({
      seedCareer: { onetCode: "15-1252.00", title: "Software Developer", domainCode: "technology" },
      knownEducationRoutes: [{ routeCode: "degree", title: "Degree Route", routeLevel: "degree" }],
      knownDisciplines: [{ disciplineCode: "computing", title: "Computing" }],
      existingPathwayTitlesInScope: [],
    });

    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.data).toEqual(draft);
      expect(result.rawResponse).toBeDefined();
    }

    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
    expect(typeof init?.body === "string" ? init.body : "").not.toContain("synthetic-gemini-key");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("synthetic-gemini-key");
  });

  it("rejects a draft that includes a forbidden field (e.g. tier)", async () => {
    const draftWithTier = {
      pathways: [
        {
          pathwayCode: "bsc-data-science",
          title: "BSc Data Science",
          description: "desc",
          educationRouteCode: "degree",
          durationBand: null,
          backupRouteNote: null,
          relatedCareers: [
            { careerOnetCode: null, careerTitle: "Software Developer", relationshipType: "primary" },
          ],
          relatedDisciplines: [{ disciplineCode: "computing", relevanceWeight: 0.9 }],
          tier: 1,
        },
      ],
    };
    const drafter = createDrafter(fetchReturning(JSON.stringify(draftWithTier)));

    const result = await drafter.draftPathways({
      seedCareer: { onetCode: null, title: "Software Developer", domainCode: "technology" },
      knownEducationRoutes: [],
      knownDisciplines: [],
      existingPathwayTitlesInScope: [],
    });

    expect(result).toEqual({ status: "failed", errorCode: "invalid_provider_output" });
  });

  it("maps a 429 response to rate_limited and malformed JSON to invalid_provider_output", async () => {
    const limited = createDrafter(
      vi.fn(() => Promise.resolve(new Response("limited", { status: 429 }))),
    );
    const malformed = createDrafter(fetchReturning("not-json"));

    await expect(
      limited.draftColleges({
        state: "Tamil Nadu",
        disciplineCode: "computing",
        disciplineTitle: "Computing",
        count: 3,
        existingCollegeNamesInScope: [],
      }),
    ).resolves.toEqual({ status: "failed", errorCode: "rate_limited" });

    await expect(
      malformed.draftStreamMapItems({
        topTwoCode: "RI",
        knownStreamOptions: [{ streamCode: "pcm", title: "Science-PCM", description: "desc" }],
      }),
    ).resolves.toEqual({ status: "failed", errorCode: "invalid_provider_output" });
  });
});
