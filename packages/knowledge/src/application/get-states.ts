import type { StateListQuery, StateListResponse } from "@yuvanext/contracts";
import type { LocationRepository } from "../domain/location.js";

export async function getStates(
  repository: LocationRepository,
  query: StateListQuery,
): Promise<StateListResponse> {
  const data = await repository.searchStates({
    ...(query.query === undefined ? {} : { query: query.query }),
    limit: query.limit,
  });
  return { data: [...data] };
}
