import { CityRecordSchema, StateRecordSchema, type CityRecord, type StateRecord } from "@yuvanext/contracts";
import type {
  CitySearchFilters,
  LocationRepository,
  StateSearchFilters,
} from "../domain/location.js";

export interface LocationQueryExecutor {
  query(sql: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** Reads India state/UT and city reference data seeded directly into Supabase (`reference` schema, not a Module 3 dataset). */
export class PostgresLocationRepository implements LocationRepository {
  constructor(private readonly database: LocationQueryExecutor) {}

  async searchStates(filters: StateSearchFilters): Promise<readonly StateRecord[]> {
    const limit = Math.min(Math.max(filters.limit, 1), 50);
    const result = await this.database.query(
      `
        select code, name
        from reference.states
        where $1::text is null or name ilike '%' || $1::text || '%'
        order by name
        limit $2
      `,
      [filters.query ?? null, limit],
    );
    return result.rows.map((row) => StateRecordSchema.parse(row));
  }

  async searchCities(filters: CitySearchFilters): Promise<readonly CityRecord[]> {
    const limit = Math.min(Math.max(filters.limit, 1), 50);
    const result = await this.database.query(
      `
        select id::text as id, city_name as name, state_code as "stateCode"
        from reference.cities
        where state_code = $1
          and ($2::text is null or city_name ilike '%' || $2::text || '%')
        order by city_name
        limit $3
      `,
      [filters.stateCode, filters.query ?? null, limit],
    );
    return result.rows.map((row) => CityRecordSchema.parse(row));
  }
}
