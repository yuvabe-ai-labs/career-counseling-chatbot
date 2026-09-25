import {
  FixtureRecommendationSetReader,
  GetRecommendationSetService,
  type RecommendationHttpDependencies,
} from "@yuvapath/recommendations";
import { validProfileSnapshot, validRecommendationSet } from "@yuvapath/test-fixtures";

export const createRecommendationFixtureRuntime = (
  bearerToken: string,
): Required<RecommendationHttpDependencies> => ({
  getRecommendationSet: new GetRecommendationSetService(
    new FixtureRecommendationSetReader([validRecommendationSet], validProfileSnapshot.userId),
  ),
  resolveUserId: (request) => {
    const authorization = request.header("authorization");
    const match = authorization ? /^Bearer\s+(\S+)$/i.exec(authorization.trim()) : null;
    return Promise.resolve(match?.[1] === bearerToken ? validProfileSnapshot.userId : null);
  },
});
