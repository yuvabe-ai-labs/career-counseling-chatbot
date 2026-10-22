import type {
  CityListQuery,
  CityListResponse,
  StateListQuery,
  StateListResponse,
} from "@yuvapath/contracts";
import type { LocationRepository } from "../domain/location.js";

/** State and city search for the sign-up form (reference.states / reference.cities). */
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
