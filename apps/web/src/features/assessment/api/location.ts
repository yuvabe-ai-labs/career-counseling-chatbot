import { CityListResponseSchema, StateListResponseSchema } from "@yuvanext/contracts";
import { apiRequest } from "@/lib/api-client";

/**
 * GET /api/v1/catalog/states — searches `reference.states` (Supabase). Public
 * catalog data, no x-yuvanext-user-id needed, same as the other /catalog/* routes.
 */
export function searchStates(query: string) {
  return apiRequest("/api/v1/catalog/states", StateListResponseSchema, {
    query: { query: query || undefined, limit: "50" },
    auth: false,
  });
}

/** GET /api/v1/catalog/cities — searches `reference.cities`, scoped to one state's code. */
export function searchCities(stateCode: string, query: string) {
  return apiRequest("/api/v1/catalog/cities", CityListResponseSchema, {
    query: { stateCode, query: query || undefined, limit: "50" },
    auth: false,
  });
}
