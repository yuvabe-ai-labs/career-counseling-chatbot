import { z } from "zod";

/**
 * Env vars are frequently left present-but-blank in .env files (e.g. `GEMINI_API_KEY=`) to
 * document an optional setting without configuring it. Zod's `.optional()` only accepts a missing
 * key (`undefined`), not an empty string, so a blank line would otherwise fail `.min(1)`/`.url()`
 * validation and crash the server on boot. Treat blank as unset everywhere.
 */
const blankToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalString = (schema: z.ZodString) => z.preprocess(blankToUndefined, schema.optional());

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().max(65535).default(3000),
    HOST: z.string().min(1).default("0.0.0.0"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    SUPABASE_URL: optionalString(z.string().url()),
    SUPABASE_SERVICE_ROLE_KEY: optionalString(z.string().min(1)),
    DATABASE_URL: optionalString(z.string().min(1)),
    DATABASE_SSL: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    // Email delivery for the guardian-consent OTP — no SMS/phone delivery, and no dev-echo/no-op
    // fallback, exists anywhere in the app. Without these configured, OTP requests fail with a
    // clear 503 (UnavailableEmailProvider in @yuvapath/assessment) — required in production
    // (below), optional otherwise so tests/local dev without real SMTP still boot.
    SMTP_HOST: optionalString(z.string().min(1)),
    SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
    SMTP_USER: optionalString(z.string().min(1)),
    SMTP_PASSWORD: optionalString(z.string().min(1)),
    // Defaults to SMTP_USER at the call site (apps/api/src/app/create-app.ts) if unset.
    SMTP_FROM: optionalString(z.string().min(1)),
    // Gemini powers the clusterfit chat (Live API) and the post-chat extraction. Without a key
    // the chat is unavailable and students go straight to the confirm card.
    GEMINI_API_KEY: optionalString(z.string().min(1)),
    GEMINI_LIVE_MODEL: z.string().min(1).default("gemini-3.8-live"),
    // Tried in order. Lite first: on a full chat flash-latest took 23 s vs 3.8 s.
    CLUSTERFIT_EXTRACTION_MODELS: z
      .string()
      .min(1)
      .default("gemini-flash-lite-latest,gemini-flash-latest"),
    // Total time for all extraction attempts. 27 s fits Lambda's 30 s timeout; raise it together
    // with the Lambda timeout, or locally where there is no 30 s limit.
    CLUSTERFIT_EXTRACTION_BUDGET_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(900_000)
      .default(27_000),
  })
  .superRefine((data, ctx) => {
    // Production must always have real SMTP configured — there is no dev-echo/no-op fallback for
    // guardian-consent OTPs.
    if (data.NODE_ENV === "production") {
      const required: Array<keyof typeof data> = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"];
      for (const key of required) {
        if (!data[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required in production.`,
          });
        }
      }
    }
  });

export type AppEnv = z.infer<typeof EnvSchema>;
export const env: AppEnv = EnvSchema.parse(process.env);
