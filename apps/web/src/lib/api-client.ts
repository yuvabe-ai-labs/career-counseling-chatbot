import { ApiErrorSchema } from "@yuvanext/contracts";
import type { z } from "zod";
import { getStoredUserId } from "./storage";

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;

/** Thrown for both transport-level failures and `ApiError` responses from the backend. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retry: ApiErrorBody["retry"];

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = body.code;
    this.retry = body.retry;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Query params to append. Undefined values are omitted. */
  query?: Record<string, string | undefined>;
  /**
   * Attach the `x-yuvanext-user-id` header from stored identity state.
   * Defaults to true; set false for routes reachable before identity exists
   * (e.g. `POST /sessions/anonymous`) or for the one bearer-auth route.
   */
  auth?: boolean;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `fetch()` throwing (as opposed to resolving with a non-ok response) means the browser never
 * got a response at all — a transient blip (a brief Wi-Fi drop, mobile network handoff, or the
 * dev API server mid-restart) and a genuinely broken request (CORS rejection, server down) throw
 * the exact same generic TypeError, indistinguishable from here. Retrying once, briefly, costs
 * nothing in the broken case (it still fails, just slightly slower) but silently recovers the
 * transient case instead of surfacing "check your internet connection" for a blip that was
 * already gone by the time the user reads it. Safe to retry even for POSTs: a `fetch()` throw
 * happens before any response is received, and for a CORS-preflighted request (this API's
 * `Content-Type: application/json` + custom headers always trigger one) the actual request body
 * is never even sent to the server until the preflight succeeds — so there's nothing to
 * double-submit in the failure case this is actually meant to catch.
 */
async function fetchWithRetry(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (attempt >= 1) throw error;
    await sleep(400);
    return fetchWithRetry(url, init, attempt + 1);
  }
}

function buildUrl(path: string, query?: Record<string, string | undefined>): string {
  const url = new URL(path, API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

/**
 * Calls the YuvaNext API and validates the response against a contract schema
 * from `@yuvanext/contracts` — the same Zod schemas the backend itself uses,
 * so the frontend can never silently drift from the real response shape.
 */
export async function apiRequest<Schema extends z.ZodTypeAny>(
  path: string,
  schema: Schema,
  options: RequestOptions = {},
): Promise<z.infer<Schema>> {
  const { method = "GET", body, query, auth = true } = options;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const userId = getStoredUserId();
    if (userId) headers["x-yuvanext-user-id"] = userId;
  }

  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  const url = buildUrl(path, query);
  let response: Response;
  try {
    response = await fetchWithRetry(url, init);
  } catch {
    throw new ApiRequestError(0, {
      code: "network_error",
      message: "Could not reach the YuvaNext API. Check your connection and try again.",
    });
  }

  const json: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsedError = ApiErrorSchema.safeParse(json);
    throw new ApiRequestError(
      response.status,
      parsedError.success
        ? parsedError.data
        : { code: "unknown_error", message: `Request failed with status ${response.status}.` },
    );
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Unexpected response shape from ${path}: ${parsed.error.message}`);
  }
  return parsed.data;
}
