/**
 * Client-side mirror of calculateAgeAtOnboarding
 * (packages/assessment/src/domain/user-profile.ts) — used only for immediate UI
 * feedback (field validation, which screen to route to next). The backend
 * recomputes this independently from the same dateOfBirth on every call that
 * matters (guardian-consent request, account signup) and is the only copy
 * that's ever actually trusted.
 */
export function calculateAge(dateOfBirth: string, now: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const birthDate = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    birthDate.getUTCFullYear() === year &&
    birthDate.getUTCMonth() === month - 1 &&
    birthDate.getUTCDate() === day;
  if (!isRealDate || birthDate.getTime() > now.getTime()) return null;

  let age = now.getUTCFullYear() - year;
  const currentMonth = now.getUTCMonth() + 1;
  const currentDay = now.getUTCDate();
  if (currentMonth < month || (currentMonth === month && currentDay < day)) {
    age -= 1;
  }
  return age;
}

export const MINOR_AGE_CEILING = 18;
export const MIN_ELIGIBLE_AGE = 12;
