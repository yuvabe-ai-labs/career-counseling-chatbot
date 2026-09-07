import { describe, expect, it, vi } from "vitest";
import {
  SupabaseIdentityDirectory,
  type IdentityAdminClient,
} from "../src/auth/supabase-identity-directory.js";

type FakePool = { query: ReturnType<typeof vi.fn> };

const fakePool = (rows: { id: string }[]): FakePool => ({
  query: vi.fn(() => Promise.resolve({ rows })),
});

describe("SupabaseIdentityDirectory", () => {
  describe("emailExists", () => {
    it("returns true when a matching row is found", async () => {
      const pool = fakePool([{ id: "existing-user-id" }]);
      const client = { auth: { admin: { createUser: vi.fn() } } } as unknown as IdentityAdminClient;
      const directory = new SupabaseIdentityDirectory({ pool: pool as never, client });

      await expect(directory.emailExists("someone@example.com")).resolves.toBe(true);
    });

    it("returns false when no row is found", async () => {
      const pool = fakePool([]);
      const client = { auth: { admin: { createUser: vi.fn() } } } as unknown as IdentityAdminClient;
      const directory = new SupabaseIdentityDirectory({ pool: pool as never, client });

      await expect(directory.emailExists("nobody@example.com")).resolves.toBe(false);
    });

    it("compares case-insensitively — the query normalizes both sides with lower()", async () => {
      const pool = fakePool([]);
      const client = { auth: { admin: { createUser: vi.fn() } } } as unknown as IdentityAdminClient;
      const directory = new SupabaseIdentityDirectory({ pool: pool as never, client });

      await directory.emailExists("User@Example.com");

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("lower(email) = lower($1)"), [
        "User@Example.com",
      ]);
    });
  });

  describe("createUserWithPassword", () => {
    it("rejects with email_already_registered when the pre-check finds an existing row — never calls createUser", async () => {
      const pool = fakePool([{ id: "existing-user-id" }]);
      const createUser = vi.fn();
      const client = { auth: { admin: { createUser } } } as unknown as IdentityAdminClient;
      const directory = new SupabaseIdentityDirectory({ pool: pool as never, client });

      await expect(
        directory.createUserWithPassword("taken@example.com", "Str0ng!Pass"),
      ).rejects.toMatchObject({ code: "email_already_registered" });
      expect(createUser).not.toHaveBeenCalled();
    });

    it("creates the account when the email is available", async () => {
      const pool = fakePool([]);
      const createUser = vi.fn(() =>
        Promise.resolve({ data: { user: { id: "new-user-id" } }, error: null }),
      );
      const client = { auth: { admin: { createUser } } } as unknown as IdentityAdminClient;
      const directory = new SupabaseIdentityDirectory({ pool: pool as never, client });

      await expect(
        directory.createUserWithPassword("fresh@example.com", "Str0ng!Pass"),
      ).resolves.toBe("new-user-id");
      expect(createUser).toHaveBeenCalledWith({
        email: "fresh@example.com",
        password: "Str0ng!Pass",
        email_confirm: true,
      });
    });

    /**
     * The actual race-condition safety net (section 10 of the email-uniqueness spec): two
     * requests for the same email can both pass the pre-check above before either finishes.
     * Supabase Auth's own uniqueness enforcement is what decides between them — confirmed
     * empirically against the real project: `{ code: "email_exists", status: 422 }`. Whichever
     * request loses that race must still get a clean 409, not a raw 500.
     */
    it("maps Supabase's own duplicate-email rejection (a real concurrent-request race) to email_already_registered, not a raw 500", async () => {
      const pool = fakePool([]); // pre-check passes for both "concurrent" callers
      const createUser = vi.fn(() =>
        Promise.resolve({
          data: { user: null },
          error: {
            name: "AuthApiError",
            message: "A user with this email address has already been registered",
            status: 422,
            code: "email_exists",
          },
        }),
      );
      const client = { auth: { admin: { createUser } } } as unknown as IdentityAdminClient;
      const directory = new SupabaseIdentityDirectory({ pool: pool as never, client });

      await expect(
        directory.createUserWithPassword("race@example.com", "Str0ng!Pass"),
      ).rejects.toMatchObject({ code: "email_already_registered", statusCode: 409 });
    });

    it("still surfaces an unrelated createUser failure as a generic error, not a false duplicate", async () => {
      const pool = fakePool([]);
      const createUser = vi.fn(() =>
        Promise.resolve({
          data: { user: null },
          error: { name: "AuthApiError", message: "Service unavailable", status: 500, code: undefined },
        }),
      );
      const client = { auth: { admin: { createUser } } } as unknown as IdentityAdminClient;
      const directory = new SupabaseIdentityDirectory({ pool: pool as never, client });

      const rejection = directory.createUserWithPassword("other-failure@example.com", "Str0ng!Pass");
      await expect(rejection).rejects.not.toMatchObject({ code: "email_already_registered" });
      await expect(rejection).rejects.toThrow(/Service unavailable/);
    });
  });

  describe("verifyPassword", () => {
    it("resolves the userId when Supabase Auth's password grant succeeds", async () => {
      const pool = fakePool([]);
      const signInWithPassword = vi.fn(() =>
        Promise.resolve({ data: { user: { id: "signed-in-user-id" } }, error: null }),
      );
      const client = {
        auth: { admin: { createUser: vi.fn() }, signInWithPassword },
      } as unknown as IdentityAdminClient;
      const directory = new SupabaseIdentityDirectory({ pool: pool as never, client });

      await expect(
        directory.verifyPassword("someone@example.com", "Str0ng!Pass"),
      ).resolves.toBe("signed-in-user-id");
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: "someone@example.com",
        password: "Str0ng!Pass",
      });
    });

    /**
     * Wrong password and unknown email both collapse to the same null — the caller (IdentityService)
     * turns that into one generic invalid_credentials error either way, so a response never leaks
     * whether a given email is registered.
     */
    it("resolves null when Supabase Auth rejects the password grant", async () => {
      const pool = fakePool([]);
      const signInWithPassword = vi.fn(() =>
        Promise.resolve({
          data: { user: null },
          error: {
            name: "AuthApiError",
            message: "Invalid login credentials",
            status: 400,
            code: "invalid_credentials",
          },
        }),
      );
      const client = {
        auth: { admin: { createUser: vi.fn() }, signInWithPassword },
      } as unknown as IdentityAdminClient;
      const directory = new SupabaseIdentityDirectory({ pool: pool as never, client });

      await expect(directory.verifyPassword("nobody@example.com", "Wr0ng!Pass")).resolves.toBeNull();
    });
  });
});
