import { describe, expect, it } from "vitest";
import { validateStreamRecords } from "../src/index.js";

const datasetVersionId = "a4444444-4444-4444-8444-444444444444";
const routeId = "b1111111-1111-4111-8111-111111111111";
const pathwayId = "b4444444-4444-4444-8444-444444444444";
const careerId = "c0000000-0000-4000-8000-000000000001";

function baseRecords() {
  return {
    educationRoutes: [
      {
        id: routeId,
        routeCode: "degree",
        title: "Degree Route",
        routeLevel: "degree",
        description: "A higher-education route.",
        publicationStatus: "published",
      },
    ],
    pathways: [
      {
        id: pathwayId,
        pathwayCode: "bsc-data-science",
        title: "BSc Data Science",
        description: "An undergraduate pathway.",
        educationRouteId: routeId,
        durationBand: "3-4 years",
        backupRouteNote: null,
        publicationStatus: "published",
        datasetVersionId,
      },
    ],
    streamOptions: [],
    streamMaps: [],
    streamMapItems: [],
  };
}

describe("validateStreamRecords — knowledge.stream_maps.segment nullable (general mappings)", () => {
  it("accepts a NULL-segment stream map as a valid general mapping", () => {
    const result = validateStreamRecords(
      {
        ...baseRecords(),
        streamOptions: [
          {
            id: "d0000000-0000-4000-8000-000000000001",
            streamCode: "science-mathematics",
            title: "Science with Mathematics",
            description: "Foundations in mathematics and science.",
            status: "active",
          },
        ],
        streamMaps: [
          {
            id: "e0000000-0000-4000-8000-000000000001",
            topTwoCode: "RI",
            segment: null,
            version: "poc-1",
            datasetVersionId,
            status: "published",
          },
        ],
        streamMapItems: [
          {
            mapId: "e0000000-0000-4000-8000-000000000001",
            streamOptionId: "d0000000-0000-4000-8000-000000000001",
            rank: 1,
            reasonKey: "general-fit",
          },
        ],
      },
      datasetVersionId,
    );

    expect(result.success).toBe(true);
  });
});

describe("validateStreamRecords — knownEducationRouteIds (cross-batch pathway references)", () => {
  it("rejects a pathway whose educationRouteId is neither in this batch nor in a supplied known list", () => {
    const result = validateStreamRecords(
      {
        ...baseRecords(),
        educationRoutes: [],
        pathways: [
          {
            id: pathwayId,
            pathwayCode: "bsc-data-science",
            title: "BSc Data Science",
            description: "An undergraduate pathway.",
            educationRouteId: routeId,
            durationBand: "3-4 years",
            backupRouteNote: null,
            publicationStatus: "published",
            datasetVersionId,
          },
        ],
      },
      datasetVersionId,
    );

    expect(result.success).toBe(false);
  });

  it("accepts the same pathway when its educationRouteId is supplied via knownEducationRouteIds", () => {
    // AI-catalog promotion (scripts/ingest/promote-ai-catalog.ts) always hits this case — a
    // drafted pathway references an education route already published in an earlier batch,
    // not one newly included in the same import.
    const result = validateStreamRecords(
      {
        ...baseRecords(),
        educationRoutes: [],
        pathways: [
          {
            id: pathwayId,
            pathwayCode: "bsc-data-science",
            title: "BSc Data Science",
            description: "An undergraduate pathway.",
            educationRouteId: routeId,
            durationBand: "3-4 years",
            backupRouteNote: null,
            publicationStatus: "published",
            datasetVersionId,
          },
        ],
      },
      datasetVersionId,
      [],
      [routeId],
    );

    expect(result.success).toBe(true);
  });
});

describe("validateStreamRecords — careerPathways (knowledge.career_pathways)", () => {
  it("accepts a valid career-pathway link", () => {
    const result = validateStreamRecords(
      {
        ...baseRecords(),
        careerPathways: [
          { careerId, pathwayId, relationshipType: "primary", displayOrder: 1 },
        ],
      },
      datasetVersionId,
    );

    expect(result.success).toBe(true);
  });

  it("rejects a career-pathway link to an unknown pathway", () => {
    const result = validateStreamRecords(
      {
        ...baseRecords(),
        careerPathways: [
          {
            careerId,
            pathwayId: "00000000-0000-4000-8000-000000000000",
            relationshipType: "primary",
            displayOrder: 1,
          },
        ],
      },
      datasetVersionId,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map((issue) => issue.code)).toContain("ORPHAN_REFERENCE");
    }
  });

  it("rejects a career-pathway link to a career outside a supplied known-career list", () => {
    const result = validateStreamRecords(
      {
        ...baseRecords(),
        careerPathways: [
          { careerId, pathwayId, relationshipType: "primary", displayOrder: 1 },
        ],
      },
      datasetVersionId,
      ["some-other-career-id"],
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map((issue) => issue.code)).toContain("ORPHAN_REFERENCE");
    }
  });

  it("rejects a duplicate career-pathway link", () => {
    const result = validateStreamRecords(
      {
        ...baseRecords(),
        careerPathways: [
          { careerId, pathwayId, relationshipType: "primary", displayOrder: 1 },
          { careerId, pathwayId, relationshipType: "alternative", displayOrder: 2 },
        ],
      },
      datasetVersionId,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map((issue) => issue.code)).toContain("DUPLICATE_LINK");
    }
  });

  it("defaults careerPathways to an empty array when omitted (backward compatible)", () => {
    const result = validateStreamRecords(baseRecords(), datasetVersionId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.careerPathways).toEqual([]);
    }
  });
});
