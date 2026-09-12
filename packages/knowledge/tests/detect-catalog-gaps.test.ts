import { describe, expect, it } from "vitest";
import { ALL_RIASEC_PAIRS } from "../src/index.js";

describe("ALL_RIASEC_PAIRS", () => {
  it("enumerates exactly the 15 unordered RIASEC pairs, each written canonically", () => {
    expect(ALL_RIASEC_PAIRS).toHaveLength(15);
    expect(new Set(ALL_RIASEC_PAIRS).size).toBe(15);
    // Every pair must already be in tie-order (R before I before A before S before E before C)
    // — this is the same canonical form recommendation-data-source.ts's
    // canonicalizeRiasecPair() produces, so a gap flagged here corresponds exactly to the key
    // loadStreams() actually queries with.
    const order = ["R", "I", "A", "S", "E", "C"];
    for (const pair of ALL_RIASEC_PAIRS) {
      const [left, right] = pair.split("");
      expect(order.indexOf(left ?? "")).toBeLessThan(order.indexOf(right ?? ""));
    }
  });
});
