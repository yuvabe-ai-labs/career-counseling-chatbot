import { describe, expect, it } from "vitest";
import { calculateAge } from "@/features/assessment/domain/age";

const FIXED_NOW = new Date("2026-07-29T10:00:00.000Z");

describe("calculateAge", () => {
  it("computes age correctly when the birthday has already passed this year", () => {
    expect(calculateAge("2011-01-01", FIXED_NOW)).toBe(15);
  });

  it("computes age correctly when the birthday hasn't happened yet this year", () => {
    expect(calculateAge("2011-12-31", FIXED_NOW)).toBe(14);
  });

  it("treats an exact birthday-today as the new age (boundary case)", () => {
    expect(calculateAge("2008-07-29", FIXED_NOW)).toBe(18);
  });

  it("returns null for a date of birth in the future", () => {
    expect(calculateAge("2027-01-01", FIXED_NOW)).toBeNull();
  });

  it("returns null for a syntactically invalid calendar date", () => {
    expect(calculateAge("2024-02-30", FIXED_NOW)).toBeNull();
  });

  it("returns null for a malformed string", () => {
    expect(calculateAge("not-a-date", FIXED_NOW)).toBeNull();
    expect(calculateAge("", FIXED_NOW)).toBeNull();
  });
});
