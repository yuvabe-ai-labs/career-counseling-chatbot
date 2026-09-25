import type { CounselorDirectory } from "@yuvapath/assessment";
import type { Pool } from "pg";

/**
 * The subset of the real Supabase Admin SDK this directory needs — a real
 * `createSupabaseServerClient(...)` instance (packages/database) already satisfies this
 * structurally, same pattern as IdentityAdminClient in supabase-identity-directory.ts.
 */
export type CounselorAdminClient = {
  auth: {
    admin: {
      updateUserById(
        userId: string,
        attributes: { password: string },
      ): Promise<{
        data: { user: { id: string } | null };
        error: { status: number | undefined; code: string | undefined; message: string } | null;
      }>;
    };
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

export type SupabaseCounselorDirectoryOptions = {
  pool: Pool;
  client: CounselorAdminClient;
};

/**
 * Implements CounselorDirectory (packages/assessment) against real Supabase Auth, gated by the
 * existing `operations.staff_profiles`/`operations.staff_role_assignments` schema — same tables
 * and same active/non-revoked/non-expired check packages/safety's getStaffRoles() already uses
 * for a different feature (the safety-escalation staff queue), duplicated here directly rather
 * than taking a cross-package dependency for one query. See
 * docs/architecture/counselor-auth-landing-page-plan.md.
 */
export class SupabaseCounselorDirectory implements CounselorDirectory {
  private readonly pool: Pool;
  private readonly client: CounselorAdminClient;

  constructor(options: SupabaseCounselorDirectoryOptions) {
    this.pool = options.pool;
    this.client = options.client;
  }

  private async getActiveCounselor(
    userId: string,
  ): Promise<{ mustResetPassword: boolean; displayName: string } | null> {
    const result = await this.pool.query<{ must_reset_password: boolean; display_name: string }>(
      `select profiles.must_reset_password, profiles.display_name
      from operations.staff_profiles profiles
      join operations.staff_role_assignments assignments
        on assignments.staff_user_id = profiles.user_id
      where profiles.user_id = $1
        and profiles.staff_status = 'active'
        and assignments.role = 'counselor'
        and assignments.revoked_at is null
        and (assignments.expires_at is null or assignments.expires_at > now())
      limit 1`,
      [userId],
    );
    const row = result.rows[0];
    return row ? { mustResetPassword: row.must_reset_password, displayName: row.display_name } : null;
  }

  async verifyCounselorPassword(
    email: string,
    password: string,
  ): Promise<{ userId: string; mustResetPassword: boolean; displayName: string } | null> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return null;
    }
    const counselor = await this.getActiveCounselor(data.user.id);
    return counselor
      ? { userId: data.user.id, mustResetPassword: counselor.mustResetPassword, displayName: counselor.displayName }
      : null;
  }

  async findActiveCounselorIdByEmail(email: string): Promise<string | null> {
    const result = await this.pool.query<{ id: string }>(
      `select id from auth.users where lower(email) = lower($1) limit 1`,
      [email],
    );
    const userId = result.rows[0]?.id;
    if (!userId) {
      return null;
    }
    return (await this.getActiveCounselor(userId)) ? userId : null;
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const { error } = await this.client.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) {
      throw new Error(`Failed to update counselor password: ${errorMessage(error)}`);
    }
  }

  async clearMustResetPassword(userId: string): Promise<void> {
    await this.pool.query(
      `update operations.staff_profiles set must_reset_password = false, updated_at = now() where user_id = $1`,
      [userId],
    );
  }

  async isActiveCounselor(userId: string): Promise<boolean> {
    return (await this.getActiveCounselor(userId)) !== null;
  }
}
