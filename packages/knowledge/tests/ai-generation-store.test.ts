import { describe, expect, it } from "vitest";
import {
  computeInputHash,
  normalizeCollegeNaturalKey,
  normalizeCollegeProgramNaturalKey,
  normalizePathwayNaturalKey,
} from "../src/index.js";

describe("computeInputHash", () => {
  it("is stable regardless of key order in inputParamsJson", () => {
    const a = computeInputHash("colleges", "v1", { state: "Tamil Nadu", disciplineCode: "computing" });
    const b = computeInputHash("colleges", "v1", { disciplineCode: "computing", state: "Tamil Nadu" });

    expect(a).toBe(b);
  });

  it("changes when the target table, prompt version, or params change", () => {
    const base = computeInputHash("colleges", "v1", { state: "Tamil Nadu" });

    expect(computeInputHash("pathways", "v1", { state: "Tamil Nadu" })).not.toBe(base);
    expect(computeInputHash("colleges", "v2", { state: "Tamil Nadu" })).not.toBe(base);
    expect(computeInputHash("colleges", "v1", { state: "Karnataka" })).not.toBe(base);
  });
});

describe("natural-key normalization", () => {
  it("normalizes case/whitespace so near-duplicates collide", () => {
    const a = normalizeCollegeNaturalKey({ name: "  Chennai Technical College ", city: "Chennai", state: "Tamil Nadu" });
    const b = normalizeCollegeNaturalKey({ name: "chennai technical college", city: "CHENNAI", state: "tamil nadu" });

    expect(a).toBe(b);
  });

  it("treats a different city or state as a different college", () => {
    const chennai = normalizeCollegeNaturalKey({ name: "Government Arts College", city: "Chennai", state: "Tamil Nadu" });
    const madurai = normalizeCollegeNaturalKey({ name: "Government Arts College", city: "Madurai", state: "Tamil Nadu" });

    expect(chennai).not.toBe(madurai);
  });

  it("scopes a program's natural key to its college", () => {
    const collegeKey = normalizeCollegeNaturalKey({ name: "Chennai Technical College", city: "Chennai", state: "Tamil Nadu" });
    const program = normalizeCollegeProgramNaturalKey({
      collegeNaturalKey: collegeKey,
      programName: "BSc Data Science",
      qualificationLevel: "ug",
    });

    expect(program).toContain(collegeKey);
  });

  it("distinguishes pathways by education route as well as title", () => {
    const degree = normalizePathwayNaturalKey({ title: "Data Science", educationRouteCode: "degree" });
    const diploma = normalizePathwayNaturalKey({ title: "Data Science", educationRouteCode: "diploma" });

    expect(degree).not.toBe(diploma);
  });
});
