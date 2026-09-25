/**
 * Derives the 1–2 letter initials shown on the account avatar from a free-text display name
 * (a student's `UserProfile.firstName` or a counselor's `staff_profiles.display_name` — both are
 * single free-text fields a person can type multiple words into, e.g. "Adarsh Kumar Yuva", not
 * separate first/last name columns). Rules: one word -> its first letter; two or more words ->
 * the first letter of the first two words only (a middle/third name never adds a third letter).
 * Returns "" for a missing/empty/whitespace-only/non-string name so callers can fall back to a
 * generic icon instead of rendering a blank or malformed badge.
 */
export function getInitials(name: string | null | undefined): string {
  if (typeof name !== "string") {
    return "";
  }

  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "";
  }

  const initials = words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  // A name with no actual letters in it (stray punctuation, digits, symbols) isn't something
  // worth badging — fall back to the generic icon instead of showing "." or "1".
  return /\p{L}/u.test(initials) ? initials : "";
}
