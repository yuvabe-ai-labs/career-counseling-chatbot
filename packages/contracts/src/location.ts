import { z } from "zod";
import { StateSchema } from "./common.js";

/**
 * India state/UT and city reference lookups (`reference.states`/`reference.cities` in
 * Supabase — census-code data, not part of any Module 3 dataset-version/provenance
 * pipeline, so these responses stay plain: no sourceDataVersions/caveats envelope).
 */
export const StateRecordSchema = z.object({
  code: z.string().trim().min(1).max(10),
  name: StateSchema,
});
export type StateRecord = z.infer<typeof StateRecordSchema>;

export const StateListQuerySchema = z.object({
  query: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type StateListQuery = z.infer<typeof StateListQuerySchema>;

export const StateListResponseSchema = z.object({
  data: z.array(StateRecordSchema),
});
export type StateListResponse = z.infer<typeof StateListResponseSchema>;

export const CityRecordSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(160),
  stateCode: z.string().trim().min(1).max(10),
});
export type CityRecord = z.infer<typeof CityRecordSchema>;

export const CityListQuerySchema = z.object({
  stateCode: z.string().trim().min(1).max(10),
  query: z.string().trim().min(1).max(160).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type CityListQuery = z.infer<typeof CityListQuerySchema>;

export const CityListResponseSchema = z.object({
  data: z.array(CityRecordSchema),
});
export type CityListResponse = z.infer<typeof CityListResponseSchema>;
