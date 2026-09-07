import { z } from "zod";

/**
 * Env vars are frequently left present-but-blank in .env files (e.g. `ANTHROPIC_API_KEY=`)
 * to document an optional setting without configuring it. Zod's `.optional()` only accepts a
 * missing key (`undefined`), not an empty string, so a blank line would otherwise fail
 * `.min(1)`/`.url()` validation and crash the server on boot. Treat blank as unset everywhere.
 */
const blankToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalString = (schema: z.ZodString) => z.preprocess(blankToUndefined, schema.optional());

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    COUNSELOR_RUNTIME: z.enum(["unconfigured", "fixture", "integrated"]).default("unconfigured"),
    COUNSELOR_FIXTURE_TOKEN: z.string().min(1).default("fixture-token"),
    PORT: z.coerce.number().int().positive().max(65535).default(3000),
    HOST: z.string().min(1).default("0.0.0.0"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    SUPABASE_URL: optionalString(z.string().url()),
    SUPABASE_ANON_KEY: optionalString(z.string().min(1)),
    SUPABASE_SERVICE_ROLE_KEY: optionalString(z.string().min(1)),
    DATABASE_URL: optionalString(z.string().min(1)),
    INTERNAL_API_KEY: optionalString(z.string().min(32)),
    // At least one of the Gemini/Anthropic pairs below must be fully configured unless
    // AI_PROVIDER=disabled — enforced in the .superRefine() below, not per-field, so that
    // configuring only one provider is valid and never trips a per-field validation error.
    AI_PROVIDER: z.enum(["auto", "anthropic", "gemini", "disabled"]).default("auto"),
    ANTHROPIC_API_KEY: optionalString(z.string().min(1)),
    ANTHROPIC_MODEL: optionalString(z.string().min(1)),
    ANTHROPIC_MAX_TOKENS: z.coerce.number().int().positive().max(4096).default(700),
    ANTHROPIC_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    GEMINI_API_KEY: optionalString(z.string().min(1)),
    GEMINI_MODEL: optionalString(z.string().min(1)),
    GEMINI_MAX_TOKENS: z.coerce.number().int().positive().max(4096).default(700),
    GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    GEMINI_THINKING_LEVEL: z.enum(["minimal", "low", "medium", "high"]).default("minimal"),
    SAFETY_SERVICE_URL: optionalString(z.string().url()),
    SAFETY_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
    // Email delivery for both the student identity-OTP and guardian consent (Module 1) — no
    // SMS/phone delivery, and no dev-echo/no-op fallback, exists anywhere in the app. Without
    // these configured, OTP requests fail with a clear 503 (UnavailableEmailProvider in
    // @yuvanext/assessment) rather than a silent fake send — required in production (below),
    // optional otherwise so tests/local dev without real SMTP still boot.
    SMTP_HOST: optionalString(z.string().min(1)),
    SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
    SMTP_USER: optionalString(z.string().min(1)),
    SMTP_PASSWORD: optionalString(z.string().min(1)),
    // Defaults to SMTP_USER at the call site (apps/api/src/app/create-app.ts) if unset.
    SMTP_FROM: optionalString(z.string().min(1)),
    COUNSELOR_COPY_VERSION: z.string().min(1).default("1"),
    COUNSELOR_WELCOME_EXPLORER: z
      .string()
      .min(1)
      .default("Welcome. I can help you explore your saved career profile and options."),
    COUNSELOR_WELCOME_PATHFINDER: z
      .string()
      .min(1)
      .default("Welcome. I can help you understand your saved recommendations and next steps."),
    COUNSELOR_WELCOME_LAUNCHER: z
      .string()
      .min(1)
      .default("Welcome. I can help you review your saved career plan and practical next steps."),
    COUNSELOR_FALLBACK_COPY: z
      .string()
      .min(1)
      .default(
        "The AI counselor is temporarily unavailable. You can continue exploring your saved recommendations.",
      ),
    COUNSELOR_PRIVATE_REPORT_BUCKET: z.string().min(1).default("private-reports"),
    COUNSELOR_SHARE_CARD_BUCKET: z.string().min(1).default("share-cards"),
    COUNSELOR_PRIVATE_ASSET_TTL_MS: z.coerce.number().int().positive().default(900_000),
    COUNSELOR_SHARE_ASSET_TTL_MS: z.coerce.number().int().positive().default(86_400_000),
    DATABASE_SSL: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
  })
  .superRefine((data, ctx) => {
    // Only validate credentials when a specific provider is explicitly selected. AI_PROVIDER's
    // own defined behavior for "auto" is "use whichever of Gemini/Anthropic is configured, or
    // fall back to disabled if neither is" — that is a normal, supported state (used throughout
    // the test suite and local dev), not a misconfiguration, so it must never fail here.
    const hasGemini = Boolean(data.GEMINI_API_KEY && data.GEMINI_MODEL);
    const hasAnthropic = Boolean(data.ANTHROPIC_API_KEY && data.ANTHROPIC_MODEL);

    if (data.AI_PROVIDER === "gemini" && !hasGemini) {
      ctx.addIssue({
        code: "custom",
        path: ["GEMINI_API_KEY"],
        message: "GEMINI_API_KEY and GEMINI_MODEL are both required when AI_PROVIDER=gemini.",
      });
    }

    if (data.AI_PROVIDER === "anthropic" && !hasAnthropic) {
      ctx.addIssue({
        code: "custom",
        path: ["ANTHROPIC_API_KEY"],
        message: "ANTHROPIC_API_KEY and ANTHROPIC_MODEL are both required when AI_PROVIDER=anthropic.",
      });
    }

    // Production must always have real SMTP configured — there is no dev-echo/no-op fallback
    // to silently fall back to for identity or guardian-consent OTPs.
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
