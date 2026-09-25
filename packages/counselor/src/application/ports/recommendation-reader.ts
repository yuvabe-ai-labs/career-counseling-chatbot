import type { RecommendationSet } from "@yuvapath/contracts";

export type ReadRecommendationInput = {
  userId: string;
  profileSnapshotId: string;
  recommendationId?: string;
};

export interface RecommendationReader {
  getRecommendationSet(input: ReadRecommendationInput): Promise<RecommendationSet | null>;
}
