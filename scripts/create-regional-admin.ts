// Provisions a regional admin (staff) account: creates the Supabase Auth user (if it doesn't
// already exist), then the operations.staff_profiles row, then an
// operations.staff_role_assignments row with role='regional_admin' and scope_json
// {"state": "<state>"} — the state whose colleges and aid schemes this admin manages. Mirrors
// scripts/create-counselor.ts; this is the one place regional-admin credentials get created.
//
// Usage:
//   pnpm admin:create --email admin@example.com --name "Jane Doe" --state "Tamil Nadu" [--password "..."]
//
// If --password is omitted, a random one is generated and printed once — copy it immediately,
// it is not stored anywhere retrievable after this script exits (Supabase Auth only ever holds
// the hash). Either way, this is a TEMPORARY password: must_reset_password is set so the
// admin is forced into the "Create New Password" screen on their first successful sign-in
// (CounselorAuthService.signIn(), reused for /admin/auth) — their real, permanent password is always one they chose
// themselves, never the one printed here. Re-running for an email that already has an active
// regional_admin role, with no --password given, is a no-op that reports the existing state rather
// than creating a duplicate or touching their current password/reset-flag.
import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import { createDatabasePool, createSupabaseServerClient } from "@yuvapath/database";

const loadLocalEnvironment = (): void => {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
};

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

/** Same policy as SetCounselorPasswordRequestSchema/SignUpWithPasswordRequestSchema
 *  (packages/contracts/src/auth.ts) — a generated password must pass the same rules a
 *  admin's own chosen replacement would have to. */
function generatePassword(): string {
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const special = "!@#$%^&*";
  const pick = (chars: string) => chars[randomBytes(1)[0]! % chars.length]!;
  const required = [pick(lower), pick(upper), pick(digits), pick(special)];
  const rest = Array.from({ length: 8 }, () => pick(lower + upper + digits + special));
  return [...required, ...rest].sort(() => randomBytes(1)[0]! - 128).join("");
}

const run = async (): Promise<void> => {
  loadLocalEnvironment();
  const args = process.argv.slice(2);
  const email = readFlag(args, "email");
  const displayName = readFlag(args, "name");
  const explicitPassword = readFlag(args, "password");
  const adminState = readFlag(args, "state");
  if (!email || !displayName || !adminState) {
    throw new Error("Usage: pnpm admin:create --email <email> --name <display name> --state <state> [--password <password>]");
  }

  const pool = createDatabasePool({
    connectionString: requireEnv("DATABASE_URL"),
    ssl: process.env.DATABASE_SSL !== "false",
    max: 1,
  });
  const client = createSupabaseServerClient({
    url: requireEnv("SUPABASE_URL"),
    apiKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  });

  try {
    const existing = await pool.query<{ id: string }>(
      `select id from auth.users where lower(email) = lower($1) limit 1`,
      [email],
    );
    let userId = existing.rows[0]?.id;
    let password = explicitPassword;
    // True whenever THIS run set a password on the admin's behalf (new account, or an
    // explicit --password against an existing one) — that's exactly when the temporary-password
    // flag needs to go on. Reusing an existing account with no --password given leaves both the
    // password and the flag untouched.
    let passwordSetThisRun = false;

    if (userId) {
      console.log(`Auth user already exists for ${email} (${userId}) — reusing it.`);
      if (explicitPassword) {
        const { error } = await client.auth.admin.updateUserById(userId, { password: explicitPassword });
        if (error) throw new Error(`Failed to set password: ${error.message}`);
        passwordSetThisRun = true;
        console.log("Password updated to the one provided via --password.");
      }
    } else {
      password = password ?? generatePassword();
      const { data, error } = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) {
        throw new Error(`Failed to create Supabase Auth user: ${error?.message ?? "unknown error"}`);
      }
      userId = data.user.id;
      passwordSetThisRun = true;
      console.log(`Created auth user ${email} (${userId}).`);
    }

    await pool.query(
      `insert into operations.staff_profiles
        (user_id, display_name, staff_status, mfa_required, must_reset_password, created_at, updated_at)
       values ($1, $2, 'active', false, $3, now(), now())
       on conflict (user_id) do update set
         display_name = excluded.display_name,
         staff_status = 'active',
         must_reset_password = staff_profiles.must_reset_password or excluded.must_reset_password,
         updated_at = now()`,
      [userId, displayName, passwordSetThisRun],
    );
    if (passwordSetThisRun) {
      console.log("Marked as a temporary password — the admin will be asked to set their own on first sign-in.");
    }

    const existingRole = await pool.query<{ id: string }>(
      `select id from operations.staff_role_assignments
       where staff_user_id = $1 and role = 'regional_admin' and revoked_at is null
         and (expires_at is null or expires_at > now())
       limit 1`,
      [userId],
    );
    if (existingRole.rows.length === 0) {
      await pool.query(
        `insert into operations.staff_role_assignments
          (id, staff_user_id, role, scope_json, granted_by, granted_at)
         values ($1, $2, 'regional_admin', $3::jsonb, $2, now())`,
        [randomUUID(), userId, JSON.stringify({ state: adminState })],
      );
      console.log(`Granted the 'regional_admin' role for "${adminState}".`);
    } else {
      console.log("Already has an active 'regional_admin' role — nothing to grant.");
    }

    console.log("\nDone. Regional admin credentials:");
    console.log(`  Email:    ${email}`);
    console.log(`  Password: ${password ?? "(unchanged — no --password given for an existing user)"}`);
    console.log("\nHand these to the admin directly. They are not stored or retrievable after this point.");
  } finally {
    await pool.end();
  }
};

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`Regional admin provisioning failed: ${message}\n`);
  process.exitCode = 1;
});
