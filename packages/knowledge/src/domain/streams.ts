import type {
  Segment,
  StreamResultItem,
} from "@yuvapath/contracts";

export type StreamLookup = {
  topTwo: string;
  segment: Segment;
};

export type StreamRepositoryResult = {
  items: StreamResultItem[];
  datasetVersionId: string | null;
};

export interface StreamRepository {
  findPublished(
    lookup: StreamLookup,
  ): Promise<StreamRepositoryResult>;
}
