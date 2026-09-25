import type { PublishedDataset } from "@yuvapath/contracts";

export interface DatasetRepository {
  listPublished(): Promise<readonly PublishedDataset[]>;
}
