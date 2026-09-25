import { describe, expect, it, vi } from "vitest";
import type { CareerStreamDraftBatch, PathwayDraftBatch, StreamPathwayDraftBatch } from "@yuvapath/contracts";
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

  it("retries a 429 with backoff (2 retries, 3 calls total) before giving up as rate_limited", async () => {
    // callGemini now retries a 429 with backoff (docs/architecture/
    // career-stream-coverage-fill-plan.md — a live run with no retry/pacing hit 124 real 429s
    // out of 415 calls) — fake timers stand in for the real 15s/45s waits so this stays a fast
    // unit test while still exercising the actual retry loop, not just its final outcome.
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(() => Promise.resolve(new Response("limited", { status: 429 })));
      const limited = createDrafter(fetchMock);

      const resultPromise = limited.draftColleges({
        state: "Tamil Nadu",
        disciplineCode: "computing",
        disciplineTitle: "Computing",
        count: 3,
        existingCollegeNamesInScope: [],
      });

      await vi.advanceTimersByTimeAsync(15_000);
      await vi.advanceTimersByTimeAsync(45_000);

      await expect(resultPromise).resolves.toEqual({ status: "failed", errorCode: "rate_limited" });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("also retries a plain 503 with the same backoff (a real live run hit far more of these than actual 429s)", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(() => Promise.resolve(new Response("unavailable", { status: 503 })));
      const unavailable = createDrafter(fetchMock);

      const resultPromise = unavailable.draftColleges({
        state: "Tamil Nadu",
        disciplineCode: "computing",
        disciplineTitle: "Computing",
        count: 3,
        existingCollegeNamesInScope: [],
      });

      await vi.advanceTimersByTimeAsync(15_000);
      await vi.advanceTimersByTimeAsync(45_000);

      await expect(resultPromise).resolves.toEqual({
        status: "failed",
        errorCode: "provider_http_503",
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry malformed JSON or other HTTP errors — those aren't a 'try again shortly' condition", async () => {
    const malformed = createDrafter(fetchReturning("not-json"));

    await expect(
      malformed.draftStreamMapItems({
        topTwoCode: "RI",
        knownStreamOptions: [{ streamCode: "pcm", title: "Science-PCM", description: "desc" }],
      }),
    ).resolves.toEqual({ status: "failed", errorCode: "invalid_provider_output" });
  });
});

describe("createGeminiCatalogDrafter — draftCareerStreams (Iteration 1)", () => {
  it("returns validated career-stream link drafts, referencing streams only by natural key", async () => {
    const draft: CareerStreamDraftBatch = {
      careerStreams: [
        { streamCode: "science-pcm", relationshipType: "primary", weight: 0.9 },
        { streamCode: "commerce-general", relationshipType: "cross_disciplinary", weight: 0.3 },
      ],
    };
    const fetch = fetchReturning(JSON.stringify(draft));
    const drafter = createDrafter(fetch);

    const result = await drafter.draftCareerStreams({
      seedCareer: { onetCode: "15-1252.00", title: "Software Developer", domainCode: "technology" },
      knownStreamOptions: [
        { streamCode: "science-pcm", title: "Science with PCM", description: "desc" },
        { streamCode: "commerce-general", title: "Commerce", description: "desc" },
      ],
      existingLinkedStreamCodesForCareer: [],
    });

    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.data).toEqual(draft);
    }
  });

  it("rejects a career-stream draft that includes a forbidden field (e.g. rank)", async () => {
    const draftWithRank = {
      careerStreams: [{ streamCode: "science-pcm", relationshipType: "primary", weight: 0.9, rank: 1 }],
    };
    const drafter = createDrafter(fetchReturning(JSON.stringify(draftWithRank)));

    const result = await drafter.draftCareerStreams({
      seedCareer: { onetCode: null, title: "Software Developer", domainCode: "technology" },
      knownStreamOptions: [{ streamCode: "science-pcm", title: "Science with PCM", description: "desc" }],
      existingLinkedStreamCodesForCareer: [],
    });

    expect(result).toEqual({ status: "failed", errorCode: "invalid_provider_output" });
  });
});

describe("createGeminiCatalogDrafter — draftStreamPathways (Iteration 2)", () => {
  it("returns validated stream-pathway link drafts, referencing pathways only by natural key", async () => {
    const draft: StreamPathwayDraftBatch = {
      streamPathways: [
        { pathwayCode: "bsc-computer-science", relationshipType: "primary", weight: 0.9 },
        { pathwayCode: "bcom-commerce", relationshipType: "alternative", weight: 0.5 },
      ],
    };
    const fetch = fetchReturning(JSON.stringify(draft));
    const drafter = createDrafter(fetch);

    const result = await drafter.draftStreamPathways({
      seedStream: { streamCode: "science-pcm", title: "Science with PCM", description: "desc" },
      knownPathways: [
        { pathwayCode: "bsc-computer-science", title: "BSc Computer Science" },
        { pathwayCode: "bcom-commerce", title: "BCom Commerce" },
      ],
      existingLinkedPathwayCodesForStream: [],
    });

    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.data).toEqual(draft);
    }
  });

  it("rejects a stream-pathway draft that includes a forbidden field (e.g. rank)", async () => {
    const draftWithRank = {
      streamPathways: [{ pathwayCode: "bsc-computer-science", relationshipType: "primary", weight: 0.9, rank: 1 }],
    };
    const drafter = createDrafter(fetchReturning(JSON.stringify(draftWithRank)));

    const result = await drafter.draftStreamPathways({
      seedStream: { streamCode: "science-pcm", title: "Science with PCM", description: "desc" },
      knownPathways: [{ pathwayCode: "bsc-computer-science", title: "BSc Computer Science" }],
      existingLinkedPathwayCodesForStream: [],
    });

    expect(result).toEqual({ status: "failed", errorCode: "invalid_provider_output" });
  });
});

describe("createGeminiCatalogDrafter — draftAidSchemes (TN UG scholarship catalog)", () => {
  it("re-assembles Gemini's flat schemes/criteria response into nested AidSchemeDraftBatch", async () => {
    // Same flat-wire-shape fix as draftColleges above, for the same reason: a scheme object
    // here has 7 nullable fields of its own, well past what triggered the college nesting bug.
    const wireResponse = {
      schemes: [
        {
          name: "Post-Metric Scholarship for SC/ST",
          providerType: "government",
          provider: "Adi Dravidar Welfare Department, Government of Tamil Nadu",
          level: "Undergraduate",
          educationScope: "ug_only",
          states: ["Tamil Nadu"],
          eligibilitySummary: "SC/ST students in undergraduate courses with family income below the prescribed limit.",
          benefitSummary: "Tuition fee reimbursement and maintenance allowance.",
          amountText: null,
          applicationUrl: "https://tnadw.tn.gov.in/postmatric_scheme/en",
          portalName: "TN Adi Dravidar Welfare Department",
          applyWindowStart: null,
          applyWindowEnd: null,
        },
        {
          name: "Central Sector Scheme of Scholarship",
          providerType: "government",
          provider: "Ministry of Education, Government of India",
          level: "UG and PG",
          educationScope: "ug_and_other_levels",
          states: ["Tamil Nadu"],
          eligibilitySummary: null,
          benefitSummary: "Rs. 12,000/year for UG.",
          amountText: "Rs. 12,000/year",
          applicationUrl: "https://scholarships.gov.in/",
          portalName: "National Scholarship Portal",
          applyWindowStart: null,
          applyWindowEnd: null,
        },
      ],
      criteria: [
        {
          schemeName: "Post-Metric Scholarship for SC/ST",
          criterionType: "annual_income_max",
          operator: "lte",
          amountValue: 250_000,
          categoryValuesText: null,
          isRequired: true,
          sourceText: "Annual family income should not exceed Rs. 2.5 lakh.",
        },
        {
          schemeName: "Post-Metric Scholarship for SC/ST",
          criterionType: "student_category",
          operator: "in",
          amountValue: null,
          categoryValuesText: "sc, st",
          isRequired: true,
          sourceText: "Open to Scheduled Caste and Scheduled Tribe students.",
        },
      ],
    };
    const drafter = createDrafter(fetchReturning(JSON.stringify(wireResponse)));

    const result = await drafter.draftAidSchemes({
      sourceUrl: "https://tnadw.tn.gov.in/postmatric_scheme/en",
      sourceTitle: "Post-Matric Scholarship Scheme",
      sourceText: "raw fetched page text...",
      existingSchemeNamesInScope: [],
    });

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;
    expect(result.data.schemes).toHaveLength(2);
    const scst = result.data.schemes.find((scheme) => scheme.name === "Post-Metric Scholarship for SC/ST");
    expect(scst?.criteria).toEqual([
      {
        criterionType: "annual_income_max",
        operator: "lte",
        value: { amount: 250_000 },
        isRequired: true,
        sourceText: "Annual family income should not exceed Rs. 2.5 lakh.",
      },
      {
        criterionType: "student_category",
        operator: "in",
        value: { values: ["sc", "st"] },
        isRequired: true,
        sourceText: "Open to Scheduled Caste and Scheduled Tribe students.",
      },
    ]);
    const csss = result.data.schemes.find((scheme) => scheme.name === "Central Sector Scheme of Scholarship");
    expect(csss?.criteria).toEqual([]);
    expect(csss?.applicationUrl).toBe("https://scholarships.gov.in/");
    // schemeName must not leak into the re-nested criterion shape.
    expect(scst?.criteria[0]).not.toHaveProperty("schemeName");
  });

  it("sends a flat (sibling schemes/criteria) responseJsonSchema, never a nested one", async () => {
    const fetch = fetchReturning(
      JSON.stringify({
        schemes: [
          {
            name: "X",
            providerType: null,
            provider: "Y",
            level: "UG",
            educationScope: "ug_only",
            states: ["Tamil Nadu"],
            eligibilitySummary: null,
            benefitSummary: null,
            amountText: null,
            applicationUrl: "https://example.gov.in/",
            portalName: null,
            applyWindowStart: null,
            applyWindowEnd: null,
          },
        ],
        criteria: [],
      }),
    );
    await createDrafter(fetch).draftAidSchemes({
      sourceUrl: "https://example.gov.in/",
      sourceTitle: "Example",
      sourceText: "text",
      existingSchemeNamesInScope: [],
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
      generationConfig?: { responseJsonSchema?: { properties?: Record<string, unknown> } };
    };
    const schemaProperties = body.generationConfig?.responseJsonSchema?.properties ?? {};
    expect(Object.keys(schemaProperties)).toEqual(["schemes", "criteria"]);
    const schemesItemSchema = (
      schemaProperties.schemes as { items?: { properties?: Record<string, unknown> } } | undefined
    )?.items;
    expect(schemesItemSchema?.properties).not.toHaveProperty("criteria");
    // Never a oneOf/anyOf union anywhere — Gemini's responseJsonSchema support is only exercised
    // elsewhere in this file with plain type/enum/nullable, so the criterion "value" union is
    // flattened into amountValue/categoryValuesText instead (see
    // GEMINI_AID_SCHEME_DRAFT_JSON_SCHEMA).
    expect(JSON.stringify(body)).not.toContain("oneOf");
    expect(JSON.stringify(body)).not.toContain("anyOf");
    // Regression guards for two undocumented Gemini responseJsonSchema limits found empirically
    // (bisected live, against this pipeline's real configured model) — see
    // GEMINI_AID_SCHEME_DRAFT_JSON_SCHEMA's own header comment for the exact bisection:
    //   1. categoryValues must never be an array — even a required (non-nullable) array nested
    //      two levels deep (root -> criteria[] -> item -> categoryValues[]) reliably 400s.
    //   2. criteria.maxItems must stay at 10, not a bigger number — 8 schemes + 10 criteria
    //      passes, 8 schemes + 12 criteria 400s, even though each array alone at 24 passes.
    const criteriaItemSchema = (
      schemaProperties.criteria as { items?: { properties?: Record<string, unknown> } } | undefined
    )?.items;
    expect(criteriaItemSchema?.properties?.categoryValuesText).toEqual({ type: ["string", "null"] });
    expect(criteriaItemSchema?.properties).not.toHaveProperty("categoryValues");
    expect((schemaProperties.criteria as { maxItems?: number } | undefined)?.maxItems).toBeLessThanOrEqual(10);
  });

  it("honestly returns a null applicationUrl rather than let Gemini invent one — never fabricated by this layer", async () => {
    const wireResponse = {
      schemes: [
        {
          name: "Some Scheme With No Confirmed URL",
          providerType: null,
          provider: "Some Department",
          level: "UG",
          educationScope: "ug_only",
          states: ["Tamil Nadu"],
          eligibilitySummary: null,
          benefitSummary: null,
          amountText: null,
          applicationUrl: null,
          portalName: null,
          applyWindowStart: null,
          applyWindowEnd: null,
        },
      ],
      criteria: [],
    };
    const drafter = createDrafter(fetchReturning(JSON.stringify(wireResponse)));

    const result = await drafter.draftAidSchemes({
      sourceUrl: "https://example.gov.in/",
      sourceTitle: "Example",
      sourceText: "text",
      existingSchemeNamesInScope: [],
    });

    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.data.schemes[0]?.applicationUrl).toBeNull();
    }
  });

  it("normalizes a bare domain into a full https URL rather than rejecting it — found live against the real TN DCE source page", async () => {
    // Real source pages routinely give "www.scholarships.gov.in" rather than a full URL — this
    // is the actual value Gemini returned when this pipeline was first run against
    // https://tndce.tn.gov.in/Home/scholarship, and it broke validation until this fix.
    const wireResponse = {
      schemes: [
        {
          name: "Central Sector Scheme of Scholarship",
          providerType: "government",
          provider: "Ministry of Human Resource Development (MHRD)",
          level: "Undergraduate and Postgraduate",
          educationScope: "ug_and_other_levels",
          states: ["Tamil Nadu"],
          eligibilitySummary: null,
          benefitSummary: null,
          amountText: "UG yearly INR 10,000",
          applicationUrl: "www.scholarships.gov.in",
          portalName: "National Scholarship Portal",
          applyWindowStart: null,
          applyWindowEnd: null,
        },
      ],
      criteria: [],
    };
    const drafter = createDrafter(fetchReturning(JSON.stringify(wireResponse)));

    const result = await drafter.draftAidSchemes({
      sourceUrl: "https://tndce.tn.gov.in/Home/scholarship",
      sourceTitle: "Scholarships",
      sourceText: "text",
      existingSchemeNamesInScope: [],
    });

    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.data.schemes[0]?.applicationUrl).toBe("https://www.scholarships.gov.in");
    }
  });

  it("rejects a draft that includes a forbidden field (e.g. a fit score)", async () => {
    const draftWithScore = {
      schemes: [
        {
          name: "X",
          providerType: null,
          provider: "Y",
          level: "UG",
          educationScope: "ug_only",
          states: ["Tamil Nadu"],
          eligibilitySummary: null,
          benefitSummary: null,
          amountText: null,
          applicationUrl: "https://example.gov.in/",
          portalName: null,
          applyWindowStart: null,
          applyWindowEnd: null,
          fitScore: 0.9,
        },
      ],
      criteria: [],
    };
    const drafter = createDrafter(fetchReturning(JSON.stringify(draftWithScore)));

    const result = await drafter.draftAidSchemes({
      sourceUrl: "https://example.gov.in/",
      sourceTitle: "Example",
      sourceText: "text",
      existingSchemeNamesInScope: [],
    });

    expect(result).toEqual({ status: "failed", errorCode: "invalid_provider_output" });
  });

  it("drops a criterion whose declared value doesn't match its own criterionType instead of guessing", async () => {
    const wireResponse = {
      schemes: [
        {
          name: "X",
          providerType: null,
          provider: "Y",
          level: "UG",
          educationScope: "ug_only",
          states: ["Tamil Nadu"],
          eligibilitySummary: null,
          benefitSummary: null,
          amountText: null,
          applicationUrl: "https://example.gov.in/",
          portalName: null,
          applyWindowStart: null,
          applyWindowEnd: null,
        },
      ],
      criteria: [
        {
          // criterionType says income, but amountValue is null and categoryValuesText is set —
          // an internally inconsistent Gemini output; must be dropped, not guessed at.
          schemeName: "X",
          criterionType: "annual_income_max",
          operator: "lte",
          amountValue: null,
          categoryValuesText: "sc",
          isRequired: true,
          sourceText: "some sentence",
        },
      ],
    };
    const drafter = createDrafter(fetchReturning(JSON.stringify(wireResponse)));

    const result = await drafter.draftAidSchemes({
      sourceUrl: "https://example.gov.in/",
      sourceTitle: "Example",
      sourceText: "text",
      existingSchemeNamesInScope: [],
    });

    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.data.schemes[0]?.criteria).toEqual([]);
    }
  });
});
