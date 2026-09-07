/**
 * Delivery abstraction for every OTP/notification email in Module 1 — identity verification
 * and guardian consent both use this (no SMS/phone delivery remains anywhere in the app). We
 * own OTP generation, storage, and verification ourselves (identity-service.ts,
 * guardian-consent-service.ts); a provider only ever sends the message.
 */
export type EmailContext = "identity_otp" | "guardian_otp";

export type SendEmailInput = {
  to: string;
  context: EmailContext;
  /** Values to fill into the context's template (e.g. { OTP: "123456" }). */
  templateVars: Record<string, string>;
};

export type SendEmailResult = {
  /** Provider-assigned id for the send, kept for audit/troubleshooting. */
  providerMessageId: string;
};

export type EmailProvider = {
  send(input: SendEmailInput): Promise<SendEmailResult>;
};
