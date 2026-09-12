import { describe, expect, it } from "vitest";
import { resolveGeoScope } from "./geo-scope.js";

describe("resolveGeoScope", () => {
  it("narrows to only the home state for same_city / same_state", () => {
    expect(resolveGeoScope("same_city", "Tamil Nadu")).toEqual({
      selectedState: "Tamil Nadu",
      neighboringStates: [],
    });
    expect(resolveGeoScope("same_state", "Tamil Nadu")).toEqual({
      selectedState: "Tamil Nadu",
      neighboringStates: [],
    });
  });

  it("uses the static adjacency lookup for not_sure and for no answer at all", () => {
    const result = resolveGeoScope("not_sure", "Tamil Nadu");
    expect(result.selectedState).toBe("Tamil Nadu");
    expect(result.neighboringStates).toEqual(
      expect.arrayContaining(["Kerala", "Karnataka", "Andhra Pradesh", "Puducherry"]),
    );
    expect(result.neighboringStates).not.toContain("Tamil Nadu");

    expect(resolveGeoScope(undefined, "Tamil Nadu")).toEqual(result);
  });

  it("treats every other state/UT as neighboring for anywhere_in_india and remote", () => {
    const anywhere = resolveGeoScope("anywhere_in_india", "Tamil Nadu");
    const remote = resolveGeoScope("remote", "Tamil Nadu");

    expect(anywhere.selectedState).toBe("Tamil Nadu");
    expect(anywhere.neighboringStates).not.toContain("Tamil Nadu");
    expect(anywhere.neighboringStates.length).toBeGreaterThan(20);
    expect(remote).toEqual(anywhere);
  });
});
