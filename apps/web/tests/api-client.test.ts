import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiRequest, ApiRequestError } from "@/lib/api-client";

const ResponseSchema = z.object({ ok: z.literal(true) });

/**
 * Regression coverage for the reported bug: a transient `fetch()` throw (a brief network blip,
 * or — the actual root cause diagnosed — a CORS rejection when Vite's dev server silently drifts
 * off its configured port) was surfacing as "We couldn't connect. Please check your internet
 * connection and try again." on the very first attempt, with no retry, so any one-off blip that
 * had already cleared by the time the user read the error still failed the whole request.
 */
describe("apiRequest — transient transport-failure retry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("recovers silently when the first fetch() throws but a retry succeeds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = apiRequest("/api/v1/example", ResponseSchema, { auth: false });
    // Let the internal retry's timer fire without a real 400ms wait.
    await vi.advanceTimersByTimeAsync(400);

    await expect(resultPromise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still throws a network_error ApiRequestError once the retry also fails", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = apiRequest("/api/v1/example", ResponseSchema, { auth: false });
    resultPromise.catch(() => {}); // avoid an unhandled-rejection warning while the timer advances
    await vi.advanceTimersByTimeAsync(400);

    await expect(resultPromise).rejects.toBeInstanceOf(ApiRequestError);
    await expect(resultPromise).rejects.toMatchObject({ code: "network_error" });

    // Exactly one retry — not a retry loop — so a genuinely broken request still fails fast.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry at all once a response is actually received (a real 500, not a transport failure)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "unknown_error", message: "boom" }), { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/api/v1/example", ResponseSchema, { auth: false })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
