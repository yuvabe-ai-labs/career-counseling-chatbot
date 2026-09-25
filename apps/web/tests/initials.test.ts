import { describe, expect, it } from "vitest";
import { getInitials } from "@/lib/initials";

describe("getInitials", () => {
  it("returns the first letter, uppercased, for a single name", () => {
    expect(getInitials("Adarsh")).toBe("A");
    expect(getInitials("adarsh")).toBe("A");
  });

  it("returns the first letter of the first two words for a two-word name", () => {
    expect(getInitials("Adarsh Yuva")).toBe("AY");
  });

  it("ignores any name beyond the second word", () => {
    expect(getInitials("Adarsh Kumar Yuva")).toBe("AK");
    expect(getInitials("Adarsh Kumar Reddy Yuva")).toBe("AK");
  });

  it("collapses repeated/leading/trailing whitespace before splitting into words", () => {
    expect(getInitials("  Adarsh   Yuva  ")).toBe("AY");
  });

  it("returns an empty string for missing names, so callers can fall back to the generic icon", () => {
    expect(getInitials(null)).toBe("");
    expect(getInitials(undefined)).toBe("");
    expect(getInitials("")).toBe("");
    expect(getInitials("   ")).toBe("");
  });

  it("returns an empty string for a non-string input rather than throwing", () => {
    // @ts-expect-error — deliberately exercising a malformed/non-string value.
    expect(getInitials(12345)).toBe("");
  });

  it("returns an empty string when the name has no actual letters in it", () => {
    expect(getInitials("...")).toBe("");
    expect(getInitials("123 456")).toBe("");
  });

  it("still derives initials from a mixed alphanumeric word", () => {
    expect(getInitials("A1 B2")).toBe("AB");
  });
});
