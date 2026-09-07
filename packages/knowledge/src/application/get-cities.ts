import type { CityListQuery, CityListResponse } from "@yuvanext/contracts";
import type { LocationRepository } from "../domain/location.js";

export async function getCities(
  repository: LocationRepository,
  query: CityListQuery,
): Promise<CityListResponse> {
  const data = await repository.searchCities({
    stateCode: query.stateCode,
    ...(query.query === undefined ? {} : { query: query.query }),
    limit: query.limit,
  });
  return { data: [...data] };
}
