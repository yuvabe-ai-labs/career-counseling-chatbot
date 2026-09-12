import {
  StreamDatasetRecordsSchema,
  type StreamDatasetRecords,
} from "@yuvanext/contracts";

export type StreamValidationIssue = {
  code:
    | "INVALID_RECORD"
    | "DUPLICATE_ID"
    | "DUPLICATE_CODE"
    | "DUPLICATE_RANK"
    | "DUPLICATE_LINK"
    | "ORPHAN_REFERENCE"
    | "DATASET_VERSION_MISMATCH"
    | "INACTIVE_PUBLISHED_REFERENCE";
  path: string;
  message: string;
};

export type StreamValidationResult =
  | { success: true; data: StreamDatasetRecords; issues: [] }
  | { success: false; issues: StreamValidationIssue[] };

export function validateStreamRecords(
  input: unknown,
  expectedDatasetVersionId: string,
  // Career IDs are a cross-dataset reference (careers are never part of a stream dataset
  // batch) — this pure validator has no DB access, so it can only check careerPathways'
  // pathwayId against this same payload's own pathways array; careerId is checked against
  // this list only when the caller supplies one (same permissive-by-default pattern as
  // validate-college-records.ts's knownPathwayIds).
  knownCareerIds: readonly string[] = [],
  // Same reasoning for education routes: a pathway promoted from an AI draft commonly
  // references an education route that already exists (published in an earlier batch) rather
  // than one newly included in this same batch — permissive-by-default when the caller
  // doesn't supply a list, exactly like knownCareerIds/knownPathwayIds above.
  knownEducationRouteIds: readonly string[] = [],
): StreamValidationResult {
  const parsed = StreamDatasetRecordsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "INVALID_RECORD",
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  const issues: StreamValidationIssue[] = [];
  const routeIds = new Set<string>();
  const routeCodes = new Set<string>();
  const optionIds = new Set<string>();
  const optionCodes = new Set<string>();
  const mapIds = new Set<string>();
  const optionById = new Map(
    parsed.data.streamOptions.map((option) => [option.id, option]),
  );

  parsed.data.educationRoutes.forEach((route, index) => {
    addDuplicate(routeIds, route.id, `educationRoutes.${index}.id`, issues);
    addDuplicate(
      routeCodes,
      route.routeCode,
      `educationRoutes.${index}.routeCode`,
      issues,
      "DUPLICATE_CODE",
    );
  });

  const pathwayIds = new Set<string>();
  parsed.data.pathways.forEach((pathway, index) => {
    pathwayIds.add(pathway.id);
    const routeKnown =
      routeIds.has(pathway.educationRouteId) || knownEducationRouteIds.includes(pathway.educationRouteId);
    if (!routeKnown) {
      issues.push({
        code: "ORPHAN_REFERENCE",
        path: `pathways.${index}.educationRouteId`,
        message: "Pathway references an unknown education route",
      });
    }
    if (pathway.datasetVersionId !== expectedDatasetVersionId) {
      issues.push(versionIssue(`pathways.${index}.datasetVersionId`));
    }
  });

  const careerPathwayKeys = new Set<string>();
  parsed.data.careerPathways.forEach((link, index) => {
    const careerKnown = knownCareerIds.length === 0 || knownCareerIds.includes(link.careerId);
    if (!pathwayIds.has(link.pathwayId) || !careerKnown) {
      issues.push({
        code: "ORPHAN_REFERENCE",
        path: `careerPathways.${index}`,
        message: "Career-pathway link references an unknown pathway or career",
      });
    }
    const key = `${link.careerId}:${link.pathwayId}`;
    if (careerPathwayKeys.has(key)) {
      issues.push({
        code: "DUPLICATE_LINK",
        path: `careerPathways.${index}`,
        message: "Duplicate career-pathway link",
      });
    }
    careerPathwayKeys.add(key);
  });

  parsed.data.streamOptions.forEach((option, index) => {
    addDuplicate(optionIds, option.id, `streamOptions.${index}.id`, issues);
    addDuplicate(
      optionCodes,
      option.streamCode,
      `streamOptions.${index}.streamCode`,
      issues,
      "DUPLICATE_CODE",
    );
  });

  parsed.data.streamMaps.forEach((map, index) => {
    addDuplicate(mapIds, map.id, `streamMaps.${index}.id`, issues);
    if (map.datasetVersionId !== expectedDatasetVersionId) {
      issues.push(versionIssue(`streamMaps.${index}.datasetVersionId`));
    }
  });

  const ranksByMap = new Set<string>();
  parsed.data.streamMapItems.forEach((item, index) => {
    if (!mapIds.has(item.mapId) || !optionIds.has(item.streamOptionId)) {
      issues.push({
        code: "ORPHAN_REFERENCE",
        path: `streamMapItems.${index}`,
        message: "Stream-map item contains an unknown map or option",
      });
    }
    const rankKey = `${item.mapId}:${item.rank}`;
    if (ranksByMap.has(rankKey)) {
      issues.push({
        code: "DUPLICATE_RANK",
        path: `streamMapItems.${index}.rank`,
        message: "Ranks must be unique within a stream map",
      });
    }
    ranksByMap.add(rankKey);

    const map = parsed.data.streamMaps.find(
      (candidate) => candidate.id === item.mapId,
    );
    const option = optionById.get(item.streamOptionId);
    if (
      map?.status === "published" &&
      option !== undefined &&
      option.status !== "active"
    ) {
      issues.push({
        code: "INACTIVE_PUBLISHED_REFERENCE",
        path: `streamMapItems.${index}.streamOptionId`,
        message: "Published maps may reference only active options",
      });
    }
  });

  return issues.length === 0
    ? { success: true, data: parsed.data, issues: [] }
    : { success: false, issues };
}

const addDuplicate = (
  values: Set<string>,
  value: string,
  path: string,
  issues: StreamValidationIssue[],
  code: StreamValidationIssue["code"] = "DUPLICATE_ID",
): void => {
  if (values.has(value)) {
    issues.push({ code, path, message: `Duplicate value: ${value}` });
  }
  values.add(value);
};

const versionIssue = (path: string): StreamValidationIssue => ({
  code: "DATASET_VERSION_MISMATCH",
  path,
  message: "Record dataset version does not match the manifest",
});
