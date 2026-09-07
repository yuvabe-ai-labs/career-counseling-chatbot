import { AssessmentApplicationError, type IdentityUserDirectory } from "@yuvanext/assessment";
import type { Pool } from "pg";

export type IdentityAdminClient = {
  auth: {
    admin: {
      createUser(attributes: {
        email: string;
        email_confirm: boolean;
        password?: string;
      }): Promise<{
        data: { user: { id: string } | null };
        error: { status: number | undefined; code: string | undefined; message: string } | null;
      }>;
    };
    /**
     * Ordinary (non-admin) password grant — same GoTrue `/auth/v1/token?grant_type=password`
     * endpoint the anon-key client would call, but reachable here too since it isn't gated by
     * the API key used to construct the client (see createSupabaseServerClient, apps/api's
     * service-role client). Used only by verifyPassword below, never to mint a session the
     * frontend keeps — see SignInWithPasswordResponseSchema's comment for why.
     */
    signInWithPassword(credentials: { email: string; password: string }): Promise<{
      data: { user: { id: string } | null };
      error: { status: number | undefined; code: string | undefined; message: string } | null;
    }>;
  };
};

const errorMessage = (error: unknown): string =>
  typeof error === "object" &&
  error !== null &&
  "message" in error &&
  typeof error.message === "string"
    ? error.message
    : "unknown error";

/**
 * Supabase Auth's own duplicate-email rejection — confirmed empirically against the real
 * project: `{ name: "AuthApiError", message: "A user with this email address has already been
 * registered", status: 422, code: "email_exists" }`, and it's already case-insensitive at that
 * layer (a differently-cased duplicate is rejected the same way). This is the actual source of
 * truth for uniqueness, not the SQL pre-check below — the pre-check only exists to fail fast
 * with a clean error in the common case; this is what makes createUserWithPassword safe even
 * when two requests for the same email race past that pre-check simultaneously.
 */
const isDuplicateEmailError = (
  error: { status: number | undefined; code: string | undefined } | null,
): boolean => error?.code === "email_exists" || error?.status === 422;

export type SupabaseIdentityDirectoryOptions = {
  pool: Pool;
  client: IdentityAdminClient;
};

/**
 * Implements IdentityUserDirectory (packages/assessment) against real Supabase Auth. This is
 * what closes Gap 1's FK-violation problem: every other Module 1 route requires
 * x-yuvanext-user-id to already exist in auth.users, and nothing previously created that row.
 *
 * Looks up an existing auth.users row directly via SQL first (cheap, avoids the admin API's
 * already-registered error path on the common "returning user" case), falling back to
 * auth.admin.createUser on first verification for an email. Compares case-insensitively since
 * email addresses are conventionally treated as such, even though the local part technically
 * isn't per spec — matches normalizeEmail's lowercasing in the identity service, and Supabase
 * Auth's own uniqueness enforcement (see isDuplicateEmailError above).
 */
export class SupabaseIdentityDirectory implements IdentityUserDirectory {
  private readonly pool: Pool;
  private readonly client: IdentityAdminClient;

  constructor(options: SupabaseIdentityDirectoryOptions) {
    this.pool = options.pool;
    this.client = options.client;
  }

  async emailExists(email: string): Promise<boolean> {
    const result = await this.pool.query<{ id: string }>(
      `select id from auth.users where lower(email) = lower($1) limit 1`,
      [email],
    );
    return result.rows.length > 0;
  }

  async findOrCreateUserIdByEmail(email: string): Promise<string> {
    const existing = await this.pool.query<{ id: string }>(
      `select id from auth.users where lower(email) = lower($1) limit 1`,
      [email],
    );
    const existingId = existing.rows[0]?.id;
    if (existingId) {
      return existingId;
    }

    const { data, error } = await this.client.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(
        `Failed to create Supabase Auth user for email verification: ${errorMessage(error)}`,
      );
    }
    return data.user.id;
  }

  /**
   * Unlike findOrCreateUserIdByEmail, always creates a *new* row — reusing an existing one here
   * would mean silently overwriting someone else's password, so an existing match is a 409, not
   * a resolve-to-existing-id like the OTP path.
   *
   * The SQL pre-check below is a fast, common-case rejection — it is NOT what makes this safe
   * under concurrent requests for the same email (two requests can both pass it before either
   * finishes). Safety comes from also mapping Supabase Auth's own duplicate-email rejection on
   * the actual createUser call: the loser of that race gets the same clean 409 as the pre-check
   * gives, instead of a raw 500.
   */
  async createUserWithPassword(email: string, password: string): Promise<string> {
    const existing = await this.pool.query<{ id: string }>(
      `select id from auth.users where lower(email) = lower($1) limit 1`,
      [email],
    );
    if (existing.rows[0]?.id) {
      throw new AssessmentApplicationError(
        "email_already_registered",
        "An account with this email already exists.",
        409,
      );
    }

    const { data, error } = await this.client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error && isDuplicateEmailError(error)) {
      throw new AssessmentApplicationError(
        "email_already_registered",
        "An account with this email already exists.",
        409,
      );
    }
    if (error || !data.user) {
      throw new Error(
        `Failed to create Supabase Auth user for password signup: ${errorMessage(error)}`,
      );
    }
    return data.user.id;
  }

  /**
   * Any failure — wrong password, an email with no auth.users row at all, or a transient GoTrue
   * error — collapses to the same null so IdentityService can throw one generic
   * invalid_credentials for all of them, rather than letting response shape leak which emails
   * are registered.
   */
  async verifyPassword(email: string, password: string): Promise<string | null> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return null;
    }
    return data.user.id;
  }
}
