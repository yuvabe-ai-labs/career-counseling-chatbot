import type { PublishedDatasetListResponse } from "@yuvapath/contracts";
import type { DatasetRepository } from "../domain/dataset.js";

export async function getPublishedDatasets(
  repository: DatasetRepository,
  now: () => Date = () => new Date(),
): Promise<PublishedDatasetListResponse> {
  return {
    data: [...await repository.listPublished()],
    retrievedAt: now().toISOString(),
  };
}
