import type { CityRecord, StateRecord } from "@yuvanext/contracts";

export type StateSearchFilters = {
  query?: string;
  limit: number;
};

export type CitySearchFilters = {
  stateCode: string;
  query?: string;
  limit: number;
};

/** Backed by `reference.states`/`reference.cities` (Supabase) — see postgres-location-repository.ts. */
export interface LocationRepository {
  searchStates(filters: StateSearchFilters): Promise<readonly StateRecord[]>;
  searchCities(filters: CitySearchFilters): Promise<readonly CityRecord[]>;
}
