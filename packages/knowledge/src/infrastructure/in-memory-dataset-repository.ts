import type { PublishedDataset } from "@yuvapath/contracts";
import type { DatasetRepository } from "../domain/dataset.js";

export class InMemoryDatasetRepository implements DatasetRepository {
  constructor(private readonly datasets: readonly PublishedDataset[]) {}

  listPublished(): Promise<readonly PublishedDataset[]> {
    return Promise.resolve(this.datasets);
  }
}
