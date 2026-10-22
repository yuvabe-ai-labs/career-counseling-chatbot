import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  ApiErrorSchema,
  CityListQuerySchema,
  CityListResponseSchema,
  StateListQuerySchema,
  StateListResponseSchema,
} from "@yuvapath/contracts";
import type { Express } from "express";
import { getCities, getStates } from "../application/location-service.js";
import type { LocationRepository } from "../domain/location.js";

/** State/city search used by the sign-up form. Public: no identity exists yet at that point. */
export const registerLocationRoutes = (
  app: Express,
  registry: OpenAPIRegistry,
  repository: LocationRepository,
): void => {
  registry.registerPath({
    method: "get",
    path: "/api/v1/catalog/states",
    tags: ["Sign-up"],
    summary: "Search India states/UTs by typed text",
    request: { query: StateListQuerySchema },
    responses: {
      200: {
        description: "States/UTs matching the search text",
        content: { "application/json": { schema: StateListResponseSchema } },
      },
      400: {
        description: "Invalid state search parameters",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });
  app.get("/api/v1/catalog/states", async (request, response) => {
    const parsedQuery = StateListQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      response
        .status(400)
        .json({ code: "INVALID_CATALOG_QUERY", message: "State search parameters are invalid" });
      return;
    }
    response.status(200).json(await getStates(repository, parsedQuery.data));
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/catalog/cities",
    tags: ["Sign-up"],
    summary: "Search cities within a state by typed text",
    request: { query: CityListQuerySchema },
    responses: {
      200: {
        description: "Cities in the given state matching the search text",
        content: { "application/json": { schema: CityListResponseSchema } },
      },
      400: {
        description: "Invalid city search parameters",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });
  app.get("/api/v1/catalog/cities", async (request, response) => {
    const parsedQuery = CityListQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      response
        .status(400)
        .json({ code: "INVALID_CATALOG_QUERY", message: "City search parameters are invalid" });
      return;
    }
    response.status(200).json(await getCities(repository, parsedQuery.data));
  });
};
