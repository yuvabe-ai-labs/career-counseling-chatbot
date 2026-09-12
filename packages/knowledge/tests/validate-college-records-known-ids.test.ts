import { describe, expect, it } from "vitest";
import { validateCollegeRecords } from "../src/index.js";

// Covers the knownDisciplineIds/knownCollegeIds/knownPathwayIds parameters added for the
// AI-catalog promotion script (scripts/ingest/promote-ai-catalog.ts), which routinely
// references disciplines/colleges/pathways already published in an earlier batch rather than
// ones newly included in the same import — see validateCollegeRecords()'s own comments.

const datasetVersionId = "a4444444-4444-4444-8444-444444444444";
const collegeId = "e1000000-0000-4000-8000-000000000001";
const disciplineId = "e2000000-0000-4000-8000-000000000001";
const pathwayId = "e3000000-0000-4000-8000-000000000001";

function baseRecords() {
  return { colleges: [], disciplines: [], programs: [], pathwayDisciplines: [] };
}

describe("validateCollegeRecords — knownDisciplineIds / knownCollegeIds for programs", () => {
  const program = {
    id: "e4000000-0000-4000-8000-000000000001",
    collegeId,
    disciplineId,
    programName: "BSc Data Science",
    qualificationLevel: "ug" as const,
    durationBand: null,
    admissionRoute: null,
    feesBand: null,
    verificationStatus: "unverified" as const,
    lastVerifiedAt: null,
    datasetVersionId,
  };

  it("rejects a program whose college and discipline are neither in this batch nor known", () => {
    const result = validateCollegeRecords({ ...baseRecords(), programs: [program] }, datasetVersionId);
    expect(result.success).toBe(false);
  });

  it("accepts the same program once its college and discipline are supplied as known ids", () => {
    const result = validateCollegeRecords(
      { ...baseRecords(), programs: [program] },
      datasetVersionId,
      [],
      [disciplineId],
      [collegeId],
    );
    expect(result.success).toBe(true);
  });
});

describe("validateCollegeRecords — knownPathwayIds / knownDisciplineIds for pathwayDisciplines", () => {
  const mapping = { pathwayId, disciplineId, relevanceWeight: 0.8, mappingVersion: "ai-run-1" };

  it("rejects a mapping whose discipline is neither in this batch nor known (pathway permissive by default)", () => {
    const result = validateCollegeRecords(
      { ...baseRecords(), pathwayDisciplines: [mapping] },
      datasetVersionId,
    );
    expect(result.success).toBe(false);
  });

  it("accepts the same mapping once the discipline is supplied as a known id", () => {
    const result = validateCollegeRecords(
      { ...baseRecords(), pathwayDisciplines: [mapping] },
      datasetVersionId,
      [],
      [disciplineId],
    );
    expect(result.success).toBe(true);
  });

  it("still rejects when a non-empty knownPathwayIds list doesn't include the referenced pathway", () => {
    const result = validateCollegeRecords(
      { ...baseRecords(), pathwayDisciplines: [mapping] },
      datasetVersionId,
      ["some-other-pathway-id"],
      [disciplineId],
    );
    expect(result.success).toBe(false);
  });
});
