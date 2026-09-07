import type { CityRecord, StateRecord } from "@yuvanext/contracts";
import type {
  CitySearchFilters,
  LocationRepository,
  StateSearchFilters,
} from "../domain/location.js";

/** No-database fallback (fixture mode, unit tests) — mirrors PostgresLocationRepository's filtering. */
export class InMemoryLocationRepository implements LocationRepository {
  constructor(
    private readonly states: readonly StateRecord[] = [],
    private readonly cities: readonly CityRecord[] = [],
  ) {}

  searchStates(filters: StateSearchFilters): Promise<readonly StateRecord[]> {
    const query = filters.query?.trim().toLowerCase();
    return Promise.resolve(
      this.states
        .filter((state) => query === undefined || state.name.toLowerCase().includes(query))
        .slice(0, filters.limit),
    );
  }

  searchCities(filters: CitySearchFilters): Promise<readonly CityRecord[]> {
    const query = filters.query?.trim().toLowerCase();
    return Promise.resolve(
      this.cities
        .filter((city) => city.stateCode === filters.stateCode)
        .filter((city) => query === undefined || city.name.toLowerCase().includes(query))
        .slice(0, filters.limit),
    );
  }
}
