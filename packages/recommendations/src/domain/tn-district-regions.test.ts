import { TnDistrictSchema } from "@yuvapath/contracts";
import { describe, expect, it } from "vitest";
import { ALL_TN_DISTRICTS, TN_DISTRICT_REGIONS, proximityTierOf, regionOfDistrict } from "./tn-district-regions.js";

describe("TN_DISTRICT_REGIONS", () => {
  it("flattens to exactly TnDistrictSchema's value set — no gaps, no duplicates, no strays", () => {
    const canonical = [...TnDistrictSchema.options].sort();
    const flattened = [...ALL_TN_DISTRICTS].sort();

    expect(flattened).toEqual(canonical);
    expect(new Set(ALL_TN_DISTRICTS).size).toBe(ALL_TN_DISTRICTS.length);
  });

  it("assigns every district to exactly one region", () => {
    const seen = new Set<string>();
    for (const districts of Object.values(TN_DISTRICT_REGIONS)) {
      for (const district of districts) {
        expect(seen.has(district)).toBe(false);
        seen.add(district);
      }
    }
  });
});

describe("regionOfDistrict", () => {
  it("resolves a known district to its region", () => {
    expect(regionOfDistrict("Chennai")).toBe("Chennai Metro");
    expect(regionOfDistrict("Coimbatore")).toBe("Western Tamil Nadu");
  });

  it("returns undefined for an unknown district", () => {
    expect(regionOfDistrict("Not A Real District")).toBeUndefined();
  });
});

describe("proximityTierOf", () => {
  it("returns same_district when the college is in the student's own district", () => {
    expect(proximityTierOf("Chennai", "Chennai")).toBe("same_district");
  });

  it("returns same_region when the college is in a different district but the same region", () => {
    // Chennai and Tiruvallur are both in the Chennai Metro region.
    expect(proximityTierOf("Chennai", "Tiruvallur")).toBe("same_region");
  });

  it("returns rest_of_tamil_nadu when the college is in a different region entirely", () => {
    // Chennai (Chennai Metro) vs. Coimbatore (Western Tamil Nadu).
    expect(proximityTierOf("Chennai", "Coimbatore")).toBe("rest_of_tamil_nadu");
  });

  it("returns unknown when the student has no home district on file", () => {
    expect(proximityTierOf(undefined, "Chennai")).toBe("unknown");
  });
});
