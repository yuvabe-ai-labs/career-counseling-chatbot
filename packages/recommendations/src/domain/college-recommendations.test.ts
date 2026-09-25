import { describe, expect, it } from "vitest";
import type {
  CollegeCatalogRecord,
  CollegeEligibilityExplanation,
  CollegeOwnership,
  CollegeProgramRecord,
  MatchingConfig,
  ProfileSnapshotForRecommendations,
  RecommendationItem,
} from "@yuvapath/contracts";
import {
  buildCollegeRecommendationSet,
  COLLEGE_RING_PREVIEW_LIMIT,
  resolveEligibleColleges,
} from "./college-recommendations.js";

const createdAt = "2026-07-28T00:00:00.000Z";
const disciplineA = "00000000-0000-4000-8000-000000002001";
const disciplineB = "00000000-0000-4000-8000-000000002002";
const disciplineC = "00000000-0000-4000-8000-000000002003";

const config: MatchingConfig = {
  algorithmVersion: "college-fit-v1",
  weightsVersion: "college-weights-v1",
  interestWeight: 0.5,
  valuesWeight: 0.2,
  feasibilityWeight: 0.15,
  contextWeight: 0.15,
  roundingScale: 6,
  feasibilityLookupVersion: "feasibility-v1",
  riasecTieOrder: ["R", "I", "A", "S", "E", "C"],
};

const profile: ProfileSnapshotForRecommendations = {
  profileSnapshotId: "00000000-0000-4000-8000-000000002100",
  profileVersion: "profile-v1",
  profileHash: "profile-hash",
  segment: "pathfinder",
  state: "Tamil Nadu",
  marksBand: "high",
  riasec: { R: 2, I: 10, A: 8, S: 4, E: 3, C: 1 },
};

function program(
  disciplineId: string,
  programType: string,
  admissionRoute = "Direct application to the college",
): CollegeProgramRecord {
  return { disciplineId, programType, admissionRoute };
}

/** RecommendationSet.rings/items are generically typed (RecommendationItem, whose `explanation`
 *  is a union across every recommendation kind) — this narrows back to the college-specific shape
 *  for tests that read `.explanation` off a built RecommendationSet rather than
 *  resolveEligibleColleges()'s own properly-typed EligibleCollege[] return. */
function collegeExplanation(item: RecommendationItem): CollegeEligibilityExplanation {
  return item.explanation as CollegeEligibilityExplanation;
}

function college(
  collegeId: string,
  title: string,
  programs: CollegeProgramRecord[],
  options: {
    district?: string;
    instituteKind?: string;
    ownership?: CollegeOwnership;
    tier?: number;
  } = {},
): CollegeCatalogRecord {
  return {
    collegeId,
    title,
    state: "Tamil Nadu",
    district: options.district ?? "Chennai",
    instituteKind: options.instituteKind ?? "Arts & Science College",
    ownership: options.ownership ?? "government",
    tier: options.tier ?? 1,
    programs,
    datasetVersion: "colleges-2026-a",
    verified: true,
  };
}

describe("college recommendations — mandatory eligibility", () => {
  it("returns only colleges with at least one programme in a target discipline", () => {
    const colleges = [
      college("00000000-0000-4000-8000-000000002201", "Matches A", [program(disciplineA, "B.Sc")]),
      college("00000000-0000-4000-8000-000000002202", "No Match", [program(disciplineC, "B.Sc")]),
      college("00000000-0000-4000-8000-000000002203", "No Programmes At All", []),
    ];

    const items = resolveEligibleColleges({
      recommendationId: "college-rec-1",
      profile,
      colleges,
      targetDisciplineIds: [disciplineA],
      config,
      createdAt,
    });

    expect(items.map((item) => item.title)).toEqual(["Matches A"]);
  });

  it("returns an empty result when no target discipline is given", () => {
    const colleges = [college("00000000-0000-4000-8000-000000002201", "Any College", [program(disciplineA, "B.Sc")])];

    const items = resolveEligibleColleges({
      recommendationId: "college-rec-1",
      profile,
      colleges,
      targetDisciplineIds: [],
      config,
      createdAt,
    });

    expect(items).toEqual([]);
  });

  // No Career -> College direct matching exists to test at runtime: CollegeRecommendationInput
  // has no career-shaped field at all (no careerId, no rankedCareerIds) — every eligibility path
  // runs exclusively through targetDisciplineIds, which only ever comes from a pathway's linked
  // disciplines (see resolveTargetPathwayId() in recommendation-routes.ts). A direct Career ->
  // College match isn't avoided by a runtime check, it isn't representable by this type.
});

describe("college recommendations — programme-level joint matching (critical case)", () => {
  it("qualifies a college only when ONE programme satisfies both discipline and programType", () => {
    const collegeA = college("00000000-0000-4000-8000-000000002301", "College A", [
      program(disciplineA, "B.E."),
      program(disciplineA, "B.Voc"),
      program(disciplineB, "B.Com"),
    ]);

    const matchedBE = resolveEligibleColleges({
      recommendationId: "college-rec-1",
      profile,
      colleges: [collegeA],
      targetDisciplineIds: [disciplineA],
      programType: "B.E.",
      config,
      createdAt,
    });
    expect(matchedBE.map((item) => item.title)).toEqual(["College A"]);

    const matchedBVoc = resolveEligibleColleges({
      recommendationId: "college-rec-1",
      profile,
      colleges: [collegeA],
      targetDisciplineIds: [disciplineA],
      programType: "B.Voc",
      config,
      createdAt,
    });
    expect(matchedBVoc.map((item) => item.title)).toEqual(["College A"]);
  });

  it("does NOT qualify a college when the discipline and programType matches come from different programmes", () => {
    // College B: discipline A only via "B.Sc"; discipline it does NOT offer via "B.E." at all.
    const collegeB = college("00000000-0000-4000-8000-000000002302", "College B", [
      program(disciplineA, "B.Sc"),
      program(disciplineB, "B.E."),
    ]);

    const items = resolveEligibleColleges({
      recommendationId: "college-rec-1",
      profile,
      colleges: [collegeB],
      targetDisciplineIds: [disciplineA],
      programType: "B.E.",
      config,
      createdAt,
    });

    // discipline A is only offered via B.Sc, not B.E. — no single programme satisfies both.
    expect(items).toEqual([]);
  });

  it("matches admissionRoute jointly with discipline the same way", () => {
    const collegeC = college("00000000-0000-4000-8000-000000002303", "College C", [
      program(disciplineA, "B.Sc", "Direct application to the college"),
      program(disciplineB, "B.A", "TNEA single-window counselling"),
    ]);

    const matched = resolveEligibleColleges({
      recommendationId: "college-rec-1",
      profile,
      colleges: [collegeC],
      targetDisciplineIds: [disciplineA],
      admissionRoute: "TNEA single-window counselling",
      config,
      createdAt,
    });

    expect(matched).toEqual([]);
  });
});

describe("college recommendations — college-level filters", () => {
  const colleges = [
    college("00000000-0000-4000-8000-000000002401", "Government Engineering, Chennai", [program(disciplineA, "B.E.")], {
      instituteKind: "Engineering College",
      ownership: "government",
      district: "Chennai",
    }),
    college("00000000-0000-4000-8000-000000002402", "Private Engineering, Coimbatore", [program(disciplineA, "B.E.")], {
      instituteKind: "Engineering College",
      ownership: "private",
      district: "Coimbatore",
    }),
    college("00000000-0000-4000-8000-000000002403", "Government Arts, Coimbatore", [program(disciplineA, "B.Sc")], {
      instituteKind: "Arts & Science College",
      ownership: "government",
      district: "Coimbatore",
    }),
  ];

  it("filters by instituteKind alone", () => {
    const items = resolveEligibleColleges({
      recommendationId: "college-rec-1", profile, colleges, targetDisciplineIds: [disciplineA],
      instituteKind: "Engineering College", config, createdAt,
    });
    expect(items.map((i) => i.title).sort()).toEqual(["Government Engineering, Chennai", "Private Engineering, Coimbatore"]);
  });

  it("filters by ownership alone", () => {
    const items = resolveEligibleColleges({
      recommendationId: "college-rec-1", profile, colleges, targetDisciplineIds: [disciplineA],
      ownership: "government", config, createdAt,
    });
    expect(items.map((i) => i.title).sort()).toEqual(["Government Arts, Coimbatore", "Government Engineering, Chennai"]);
  });

  it("filters by district alone", () => {
    const items = resolveEligibleColleges({
      recommendationId: "college-rec-1", profile, colleges, targetDisciplineIds: [disciplineA],
      district: "Coimbatore", config, createdAt,
    });
    expect(items.map((i) => i.title).sort()).toEqual(["Government Arts, Coimbatore", "Private Engineering, Coimbatore"]);
  });

  it("composes discipline + instituteKind + ownership + district — ALL selected filters must match", () => {
    const items = resolveEligibleColleges({
      recommendationId: "college-rec-1", profile, colleges, targetDisciplineIds: [disciplineA],
      instituteKind: "Engineering College", ownership: "government", district: "Chennai", config, createdAt,
    });
    expect(items.map((i) => i.title)).toEqual(["Government Engineering, Chennai"]);
  });

  it("an unselected filter never restricts the result", () => {
    const withNoFilters = resolveEligibleColleges({
      recommendationId: "college-rec-1", profile, colleges, targetDisciplineIds: [disciplineA], config, createdAt,
    });
    expect(withNoFilters).toHaveLength(3);
  });

  it("a filter that matches nothing yields an empty result, not an error", () => {
    const items = resolveEligibleColleges({
      recommendationId: "college-rec-1", profile, colleges, targetDisciplineIds: [disciplineA],
      district: "Madurai", config, createdAt,
    });
    expect(items).toEqual([]);
  });
});

describe("college recommendations — location-proximity fitScore", () => {
  const chennaiCollege = college("00000000-0000-4000-8000-000000002501", "Chennai College", [
    program(disciplineA, "B.Sc"),
  ], { district: "Chennai" });
  // Tiruvallur is in the same region as Chennai (Chennai Metro) but a different district.
  const tiruvallurCollege = college("00000000-0000-4000-8000-000000002502", "Tiruvallur College", [
    program(disciplineA, "B.Sc"),
  ], { district: "Tiruvallur" });
  // Coimbatore is a different region entirely (Western Tamil Nadu).
  const coimbatoreCollege = college("00000000-0000-4000-8000-000000002503", "Coimbatore College", [
    program(disciplineA, "B.Sc"),
  ], { district: "Coimbatore" });

  it("scores same-district highest, same-region next, and rest-of-Tamil-Nadu lowest", () => {
    const chennaiStudent: ProfileSnapshotForRecommendations = { ...profile, homeDistrict: "Chennai" };
    const items = resolveEligibleColleges({
      recommendationId: "college-rec-1",
      profile: chennaiStudent,
      colleges: [chennaiCollege, tiruvallurCollege, coimbatoreCollege],
      targetDisciplineIds: [disciplineA],
      config,
      createdAt,
    });

    const byTitle = Object.fromEntries(items.map((item) => [item.title, item]));
    expect(byTitle["Chennai College"]?.explanation).toMatchObject({
      locationProximityTier: "same_district",
      locationProximity: 1,
    });
    expect(byTitle["Chennai College"]?.fitScore).toBe(1);
    expect(byTitle["Tiruvallur College"]?.explanation).toMatchObject({
      locationProximityTier: "same_region",
      locationProximity: 0.5,
    });
    expect(byTitle["Coimbatore College"]?.explanation).toMatchObject({
      locationProximityTier: "rest_of_tamil_nadu",
      locationProximity: 0,
    });

    // And ordering follows the score: same-district first, same-region next, rest last.
    expect(items.map((item) => item.title)).toEqual([
      "Chennai College",
      "Tiruvallur College",
      "Coimbatore College",
    ]);
  });

  it("scores every college as the unknown tier when the student has no home district on file", () => {
    const items = resolveEligibleColleges({
      recommendationId: "college-rec-1",
      profile, // shared fixture profile — no homeDistrict set.
      colleges: [chennaiCollege, coimbatoreCollege],
      targetDisciplineIds: [disciplineA],
      config,
      createdAt,
    });

    for (const item of items) {
      expect(item.explanation.locationProximityTier).toBe("unknown");
      expect(item.fitScore).toBe(0);
    }
  });

  it("never removes an otherwise-eligible college — proximity ranks, it does not filter", () => {
    const chennaiStudent: ProfileSnapshotForRecommendations = { ...profile, homeDistrict: "Chennai" };
    const items = resolveEligibleColleges({
      recommendationId: "college-rec-1",
      profile: chennaiStudent,
      colleges: [chennaiCollege, coimbatoreCollege],
      targetDisciplineIds: [disciplineA],
      config,
      createdAt,
    });

    // Coimbatore is eligible and far away — it must still appear, only ranked last.
    expect(items.map((item) => item.title)).toContain("Coimbatore College");
    expect(items).toHaveLength(2);
  });

  it("falls back to the deterministic title/entityId tiebreak within a tied tier", () => {
    const tied = [
      college("00000000-0000-4000-8000-000000002601", "Zeta College", [program(disciplineA, "B.Sc")]),
      college("00000000-0000-4000-8000-000000002602", "Alpha College", [program(disciplineA, "B.Sc")]),
      college("00000000-0000-4000-8000-000000002603", "Mid College", [program(disciplineA, "B.Sc")], { tier: 5 }),
    ];
    const items = resolveEligibleColleges({
      recommendationId: "college-rec-1", profile, colleges: tied, targetDisciplineIds: [disciplineA], config, createdAt,
    });

    expect(items.map((i) => i.title)).toEqual(["Alpha College", "Mid College", "Zeta College"]);
    expect(items.map((i) => i.rank)).toEqual([1, 2, 3]);
  });
});

describe("college recommendations — ring preview", () => {
  function makeColleges(count: number): CollegeCatalogRecord[] {
    return Array.from({ length: count }, (_, i) =>
      college(
        `00000000-0000-4000-8000-0000000027${String(i).padStart(2, "0")}`,
        `College ${String(i).padStart(2, "0")}`,
        [program(disciplineA, "B.Sc")],
      ),
    );
  }

  it("contains at most COLLEGE_RING_PREVIEW_LIMIT colleges when more are eligible", () => {
    const set = buildCollegeRecommendationSet({
      recommendationId: "college-rec-1", profile, colleges: makeColleges(20), targetDisciplineIds: [disciplineA], config, createdAt,
    });

    // No homeDistrict on the shared fixture profile — every college ties at the "unknown" tier,
    // so inner/middle/outer all backfill from the same undifferentiated pool. Real per-tier
    // partitioning is covered by the "ring partitioning by proximity tier" block below.
    expect(set.rings?.inner).toHaveLength(COLLEGE_RING_PREVIEW_LIMIT);
    expect(set.rings?.middle).toHaveLength(5);
    expect(set.rings?.outer).toHaveLength(5);
  });

  it("the ring preview is a strict subset of the full item list, in the same order", () => {
    const set = buildCollegeRecommendationSet({
      recommendationId: "college-rec-1", profile, colleges: makeColleges(20), targetDisciplineIds: [disciplineA], config, createdAt,
    });

    const previewIds = set.rings?.inner.map((item) => item.entityId) ?? [];
    const fullListIds = set.items.map((item) => item.entityId);
    expect(previewIds).toEqual(fullListIds.slice(0, COLLEGE_RING_PREVIEW_LIMIT));
    expect(set.items.length).toBe(20);
  });

  it("contains every eligible college when the eligible count is below the preview limit", () => {
    const set = buildCollegeRecommendationSet({
      recommendationId: "college-rec-1", profile, colleges: makeColleges(3), targetDisciplineIds: [disciplineA], config, createdAt,
    });

    expect(set.rings?.inner).toHaveLength(3);
    expect(set.items).toHaveLength(3);
  });

  it("produces an empty ring and an empty full list when nothing is eligible", () => {
    const set = buildCollegeRecommendationSet({
      recommendationId: "college-rec-1", profile, colleges: makeColleges(5), targetDisciplineIds: [disciplineC], config, createdAt,
    });

    expect(set.items).toEqual([]);
    expect(set.rings?.inner).toEqual([]);
  });

  it("is deterministic — repeated requests return an identical preview", () => {
    const colleges = makeColleges(20);
    const first = buildCollegeRecommendationSet({
      recommendationId: "college-rec-1", profile, colleges, targetDisciplineIds: [disciplineA], config, createdAt,
    });
    const second = buildCollegeRecommendationSet({
      recommendationId: "college-rec-2", profile, colleges: [...colleges].reverse(), targetDisciplineIds: [disciplineA], config, createdAt,
    });

    expect(second.rings?.inner.map((i) => i.entityId)).toEqual(first.rings?.inner.map((i) => i.entityId));
  });

  it("ring items carry a real fitScore", () => {
    const set = buildCollegeRecommendationSet({
      recommendationId: "college-rec-1", profile, colleges: makeColleges(20), targetDisciplineIds: [disciplineA], config, createdAt,
    });
    expect(set.rings?.inner.every((item) => typeof item.fitScore === "number")).toBe(true);
  });

  it("items beyond the ring keep their fitScore but carry no ring value", () => {
    const set = buildCollegeRecommendationSet({
      recommendationId: "college-rec-1", profile, colleges: makeColleges(20), targetDisciplineIds: [disciplineA], config, createdAt,
    });
    const ringedCount = set.rings!.inner.length + set.rings!.middle.length + set.rings!.outer.length;
    const unringed = set.items.filter((item) => item.ring === undefined);

    expect(ringedCount).toBe(15);
    expect(unringed).toHaveLength(5);
    expect(unringed.every((item) => typeof item.fitScore === "number")).toBe(true);
  });
});

describe("college recommendations — ring partitioning by proximity tier", () => {
  function makeCollegesInDistricts(district: string, count: number, startAt: number): CollegeCatalogRecord[] {
    return Array.from({ length: count }, (_, i) =>
      college(
        `00000000-0000-4000-8000-0000000028${String(startAt + i).padStart(2, "0")}`,
        `College ${startAt + i} in ${district}`,
        [program(disciplineA, "B.Sc")],
        { district },
      ),
    );
  }

  it("fills inner from same-district, middle from same-region, outer from the rest — with enough colleges per tier that no backfill is needed", () => {
    const chennaiStudent: ProfileSnapshotForRecommendations = { ...profile, homeDistrict: "Chennai" };
    // Exactly COLLEGE_RING_PREVIEW_LIMIT(5) same-district (Chennai) and same-region
    // (Tiruvallur, both Chennai Metro) colleges — inner/middle fill exactly from their own tier
    // with nothing left over to leak into outer (outer's own predicate is deliberately
    // unconditional, matching Pathway's real backfill philosophy — it isn't tier-restricted, so a
    // 6th same-tier college would legitimately spill into it). 6 rest-of-Tamil-Nadu (Coimbatore, a
    // different region) so outer has more than enough to fill from purely that tier.
    const colleges = [
      ...makeCollegesInDistricts("Chennai", 5, 0),
      ...makeCollegesInDistricts("Tiruvallur", 5, 10),
      ...makeCollegesInDistricts("Coimbatore", 6, 20),
    ];

    const set = buildCollegeRecommendationSet({
      recommendationId: "college-rec-1", profile: chennaiStudent, colleges, targetDisciplineIds: [disciplineA], config, createdAt,
    });

    expect(set.rings?.inner).toHaveLength(5);
    expect(set.rings?.inner.every((i) => collegeExplanation(i).locationProximityTier === "same_district")).toBe(true);
    expect(set.rings?.middle).toHaveLength(5);
    expect(set.rings?.middle.every((i) => collegeExplanation(i).locationProximityTier === "same_region")).toBe(true);
    expect(set.rings?.outer).toHaveLength(5);
    expect(set.rings?.outer.every((i) => collegeExplanation(i).locationProximityTier === "rest_of_tamil_nadu")).toBe(true);

    // Full list still has all 16 — ranking never drops an eligible college.
    expect(set.items).toHaveLength(16);
  });

  it("backfills inner from same-region when fewer than COLLEGE_RING_PREVIEW_LIMIT same-district colleges exist", () => {
    const chennaiStudent: ProfileSnapshotForRecommendations = { ...profile, homeDistrict: "Chennai" };
    // Only 1 same-district college, but 20 total eligible — inner must still fill to the limit.
    const colleges = [
      ...makeCollegesInDistricts("Chennai", 1, 0),
      ...makeCollegesInDistricts("Tiruvallur", 19, 10),
    ];

    const set = buildCollegeRecommendationSet({
      recommendationId: "college-rec-1", profile: chennaiStudent, colleges, targetDisciplineIds: [disciplineA], config, createdAt,
    });

    expect(set.rings?.inner).toHaveLength(COLLEGE_RING_PREVIEW_LIMIT);
    expect(collegeExplanation(set.rings!.inner[0]!).locationProximityTier).toBe("same_district");
    // The backfill (same-region) fills the rest of inner.
    expect(
      set.rings!.inner.slice(1).every((i) => collegeExplanation(i).locationProximityTier === "same_region"),
    ).toBe(true);
  });
});

describe("college recommendations — cache correctness", () => {
  const colleges = [
    college("00000000-0000-4000-8000-000000002801", "Engineering Chennai", [program(disciplineA, "B.E.")], {
      instituteKind: "Engineering College", ownership: "government", district: "Chennai",
    }),
    college("00000000-0000-4000-8000-000000002802", "Engineering Private Coimbatore", [program(disciplineA, "B.E.")], {
      instituteKind: "Engineering College", ownership: "private", district: "Coimbatore",
    }),
  ];

  it("different filter combinations produce different input and output hashes", () => {
    const government = buildCollegeRecommendationSet({
      recommendationId: "r1", profile, colleges, targetDisciplineIds: [disciplineA], ownership: "government", district: "Chennai", config, createdAt,
    });
    const privateDistrict = buildCollegeRecommendationSet({
      recommendationId: "r1", profile, colleges, targetDisciplineIds: [disciplineA], ownership: "private", district: "Coimbatore", config, createdAt,
    });

    expect(government.inputHash).not.toBe(privateDistrict.inputHash);
    expect(government.outputHash).not.toBe(privateDistrict.outputHash);
    expect(government.items.map((i) => i.title)).toEqual(["Engineering Chennai"]);
    expect(privateDistrict.items.map((i) => i.title)).toEqual(["Engineering Private Coimbatore"]);
  });

  it("the same filter combination remains deterministic across calls", () => {
    const first = buildCollegeRecommendationSet({
      recommendationId: "r1", profile, colleges, targetDisciplineIds: [disciplineA], ownership: "government", config, createdAt,
    });
    const second = buildCollegeRecommendationSet({
      recommendationId: "r1", profile, colleges, targetDisciplineIds: [disciplineA], ownership: "government", config, createdAt,
    });

    expect(second.inputHash).toBe(first.inputHash);
    expect(second.outputHash).toBe(first.outputHash);
  });

  it("no filters vs. an explicit filter produce different hashes even if unrelated to eligibility", () => {
    const unfiltered = buildCollegeRecommendationSet({
      recommendationId: "r1", profile, colleges, targetDisciplineIds: [disciplineA], config, createdAt,
    });
    const filtered = buildCollegeRecommendationSet({
      recommendationId: "r1", profile, colleges, targetDisciplineIds: [disciplineA], instituteKind: "Engineering College", config, createdAt,
    });

    expect(unfiltered.inputHash).not.toBe(filtered.inputHash);
  });

  it("two profiles identical except for homeDistrict produce different hashes and different ordering", () => {
    const chennaiStudent: ProfileSnapshotForRecommendations = { ...profile, homeDistrict: "Chennai" };
    const coimbatoreStudent: ProfileSnapshotForRecommendations = { ...profile, homeDistrict: "Coimbatore" };

    const chennaiResult = buildCollegeRecommendationSet({
      recommendationId: "r1", profile: chennaiStudent, colleges, targetDisciplineIds: [disciplineA], config, createdAt,
    });
    const coimbatoreResult = buildCollegeRecommendationSet({
      recommendationId: "r1", profile: coimbatoreStudent, colleges, targetDisciplineIds: [disciplineA], config, createdAt,
    });

    expect(chennaiResult.inputHash).not.toBe(coimbatoreResult.inputHash);
    expect(chennaiResult.outputHash).not.toBe(coimbatoreResult.outputHash);
    expect(chennaiResult.items[0]?.title).toBe("Engineering Chennai");
    expect(coimbatoreResult.items[0]?.title).toBe("Engineering Private Coimbatore");
  });
});
