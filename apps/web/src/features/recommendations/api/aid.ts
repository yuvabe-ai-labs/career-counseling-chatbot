import { AidSchemeListResponseSchema } from "@yuvapath/contracts";
import { apiRequest } from "@/lib/api-client";

/**
 * GET /api/v1/catalog/aid-schemes — every verified scholarship/aid scheme in the catalogue (max
 * 50 per the endpoint's own limit), unranked. Deliberately not POST /recommendations/aid: that
 * engine ranks by income/category facts this app doesn't collect, so it would label every
 * scheme "explore" and add nothing over the plain list. Public catalogue data, so no identity
 * header is sent.
 */
export function getAidSchemes() {
  return apiRequest("/api/v1/catalog/aid-schemes", AidSchemeListResponseSchema, {
    auth: false,
    query: { limit: "50" },
  });
}
