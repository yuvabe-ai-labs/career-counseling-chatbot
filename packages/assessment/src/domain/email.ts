/** Format/case validity is enforced at the contract boundary (z.string().email()) — this just
 * canonicalizes so "Person@Example.com " and "person@example.com" resolve to the same OTP
 * challenge and the same auth.users row. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Masked display form ("ab***@example.com") — staff-facing only, never used for lookups. */
export const maskEmail = (email: string): string => {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visibleLength = Math.min(2, local.length);
  const visible = local.slice(0, visibleLength);
  const hiddenLength = Math.max(local.length - visibleLength, 1);
  return `${visible}${"*".repeat(hiddenLength)}@${domain}`;
};
