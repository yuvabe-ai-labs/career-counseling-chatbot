import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  AiGenerationItem,
  AiGenerationItemReviewStatus,
  AiGenerationProposedEntityType,
  AiGenerationRun,
  AiGenerationRunStatus,
  AiGenerationTargetTable,
} from "@yuvanext/contracts";

// ---------------------------------------------------------------------------
// Deterministic hashing / natural-key normalization
// (docs/poc/ai-assisted-catalog-implementation-plan.md §10/§11) — pure functions, no Gemini,
// no DB. These are what make the pipeline idempotent and duplicate-resistant.
// ---------------------------------------------------------------------------

/** sha256(target_table + prompt_version + input_params_json), stable regardless of key order. */
export function computeInputHash(
  targetTable: AiGenerationTargetTable,
  promptVersion: string,
  inputParams: Record<string, unknown>,
): string {
  const stable = stableStringify(inputParams);
  return createHash("sha256").update(`${targetTable}:${promptVersion}:${stable}`).digest("hex");
}

function stableStringify(value: Record<string, unknown>): string {
  return JSON.stringify(value, Object.keys(value).sort());
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

export function normalizeCollegeNaturalKey(input: { name: string; city: string; state: string }): string {
  return [input.name, input.city, input.state].map(normalizeText).join("|");
}

export function normalizePathwayNaturalKey(input: { title: string; educationRouteCode: string }): string {
  return [input.title, input.educationRouteCode].map(normalizeText).join("|");
}

export function normalizeCollegeProgramNaturalKey(input: {
  collegeNaturalKey: string;
  programName: string;
  qualificationLevel: string;
}): string {
  return [input.collegeNaturalKey, input.programName, input.qualificationLevel]
    .map(normalizeText)
    .join("|");
}

export function normalizeCareerPathwayNaturalKey(input: { careerNaturalKey: string; pathwayNaturalKey: string }): string {
  return [input.careerNaturalKey, input.pathwayNaturalKey].map(normalizeText).join("|");
}

export function normalizePathwayDisciplineNaturalKey(input: {
  pathwayNaturalKey: string;
  disciplineCode: string;
}): string {
  return [input.pathwayNaturalKey, input.disciplineCode].map(normalizeText).join("|");
}

export function normalizeStreamMapItemNaturalKey(input: { mapNaturalKey: string; streamCode: string }): string {
  return [input.mapNaturalKey, input.streamCode].map(normalizeText).join("|");
}

// ---------------------------------------------------------------------------
// Store port + Postgres implementation
// ---------------------------------------------------------------------------

export type CreateRunInput = {
  targetTable: AiGenerationTargetTable;
  provider: string;
  model: string;
  promptVersion: string;
  inputParamsJson: Record<string, unknown>;
  inputHash: string;
};

export type CreateItemInput = {
  proposedEntityType: AiGenerationProposedEntityType;
  proposedPayloadJson: Record<string, unknown>;
  naturalKey: string;
  matchedExistingId?: string | undefined;
};

export type AiGenerationStore = {
  findRunByInputHash(
    targetTable: AiGenerationTargetTable,
    inputHash: string,
  ): Promise<AiGenerationRun | undefined>;
  createRun(input: CreateRunInput): Promise<AiGenerationRun>;
  recordRunResponse(runId: string, rawResponseJson: unknown): Promise<void>;
  markRunFailed(runId: string, errorCode: string, errorMessage: string): Promise<void>;
  updateRunStatus(
    runId: string,
    status: AiGenerationRunStatus,
    reviewedBy?: string,
  ): Promise<void>;
  createItems(runId: string, items: CreateItemInput[]): Promise<AiGenerationItem[]>;
  listPendingItems(): Promise<AiGenerationItem[]>;
  listItemsForRun(runId: string): Promise<AiGenerationItem[]>;
  getRun(runId: string): Promise<AiGenerationRun | undefined>;
  updateItemReview(
    itemId: string,
    update: {
      reviewStatus: AiGenerationItemReviewStatus;
      reviewerNote?: string | undefined;
      proposedPayloadJson?: Record<string, unknown> | undefined;
    },
  ): Promise<void>;
  markItemPromoted(itemId: string, promotedEntityId: string): Promise<void>;
};

type RunRow = {
  id: string;
  target_table: AiGenerationTargetTable;
  provider: string;
  model: string;
  prompt_version: string;
  input_params_json: Record<string, unknown>;
  input_hash: string;
  raw_response_json: unknown;
  status: AiGenerationRunStatus;
  error_code: string | null;
  error_message: string | null;
  reviewed_by: string | null;
  reviewed_at: string | Date | null;
  created_at: string | Date;
};

type ItemRow = {
  id: string;
  generation_run_id: string;
  proposed_entity_type: AiGenerationProposedEntityType;
  proposed_payload_json: Record<string, unknown>;
  natural_key: string;
  matched_existing_id: string | null;
  promoted_entity_id: string | null;
  review_status: AiGenerationItemReviewStatus;
  reviewer_note: string | null;
  created_at: string | Date;
};

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return typeof value === "string" ? value : value.toISOString();
}

function mapRun(row: RunRow): AiGenerationRun {
  return {
    id: row.id,
    targetTable: row.target_table,
    provider: row.provider,
    model: row.model,
    promptVersion: row.prompt_version,
    inputParamsJson: row.input_params_json,
    inputHash: row.input_hash,
    rawResponseJson: row.raw_response_json,
    status: row.status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    reviewedBy: row.reviewed_by,
    reviewedAt: toIso(row.reviewed_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

function mapItem(row: ItemRow): AiGenerationItem {
  return {
    id: row.id,
    generationRunId: row.generation_run_id,
    proposedEntityType: row.proposed_entity_type,
    proposedPayloadJson: row.proposed_payload_json,
    naturalKey: row.natural_key,
    matchedExistingId: row.matched_existing_id,
    promotedEntityId: row.promoted_entity_id,
    reviewStatus: row.review_status,
    reviewerNote: row.reviewer_note,
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

export function createPostgresAiGenerationStore(pool: Pool): AiGenerationStore {
  return {
    async findRunByInputHash(targetTable, inputHash) {
      // A 'failed' run (e.g. a rate-limited or timed-out Gemini call) does NOT count as a
      // cache hit — the whole point of recording it (plan §16) is so the *next* offline run
      // retries it, not so it's permanently treated as "already asked". Only a run that
      // actually got a response (or was reviewed) short-circuits a fresh Gemini call.
      const result = await pool.query<RunRow>(
        `select * from knowledge.ai_generation_runs
         where target_table = $1 and input_hash = $2 and status <> 'failed'`,
        [targetTable, inputHash],
      );
      const row = result.rows[0];
      return row ? mapRun(row) : undefined;
    },

    async createRun(input) {
      // (target_table, input_hash) is globally unique, so a retry after a prior 'failed' run
      // must UPDATE that row in place rather than INSERT a new one (which would violate the
      // constraint) — but only when the existing row is still 'failed'; if something else
      // already turned it into a real result between the cache check above and this call
      // (e.g. a concurrent generator run), leave that result alone and return it as-is rather
      // than clobbering it.
      const id = randomUUID();
      const result = await pool.query<RunRow>(
        `insert into knowledge.ai_generation_runs (
          id, target_table, provider, model, prompt_version,
          input_params_json, input_hash, status, created_at
        ) values ($1, $2, $3, $4, $5, $6::jsonb, $7, 'pending_review', now())
        on conflict (target_table, input_hash) do update set
          provider = excluded.provider,
          model = excluded.model,
          prompt_version = excluded.prompt_version,
          input_params_json = excluded.input_params_json,
          status = 'pending_review',
          error_code = null,
          error_message = null,
          raw_response_json = null,
          created_at = now()
        where knowledge.ai_generation_runs.status = 'failed'
        returning *`,
        [
          id,
          input.targetTable,
          input.provider,
          input.model,
          input.promptVersion,
          JSON.stringify(input.inputParamsJson),
          input.inputHash,
        ],
      );
      const row = result.rows[0];
      if (row) {
        return mapRun(row);
      }
      // The conflicting row existed but wasn't 'failed' (a concurrent run already completed
      // it) — return that existing row instead of erroring.
      const existing = await pool.query<RunRow>(
        `select * from knowledge.ai_generation_runs where target_table = $1 and input_hash = $2`,
        [input.targetTable, input.inputHash],
      );
      const existingRow = existing.rows[0];
      if (!existingRow) {
        throw new Error("Failed to create ai_generation_runs row");
      }
      return mapRun(existingRow);
    },

    async recordRunResponse(runId, rawResponseJson) {
      await pool.query(
        `update knowledge.ai_generation_runs set raw_response_json = $2::jsonb where id = $1`,
        [runId, JSON.stringify(rawResponseJson)],
      );
    },

    async markRunFailed(runId, errorCode, errorMessage) {
      await pool.query(
        `update knowledge.ai_generation_runs
         set status = 'failed', error_code = $2, error_message = $3
         where id = $1`,
        [runId, errorCode, errorMessage],
      );
    },

    async updateRunStatus(runId, status, reviewedBy) {
      await pool.query(
        `update knowledge.ai_generation_runs
         set status = $2, reviewed_by = coalesce($3, reviewed_by),
             reviewed_at = case when $3 is not null then now() else reviewed_at end
         where id = $1`,
        [runId, status, reviewedBy ?? null],
      );
    },

    async createItems(runId, items) {
      const created: AiGenerationItem[] = [];
      for (const item of items) {
        const id = randomUUID();
        const result = await pool.query<ItemRow>(
          `insert into knowledge.ai_generation_items (
            id, generation_run_id, proposed_entity_type, proposed_payload_json,
            natural_key, matched_existing_id, review_status, created_at
          ) values ($1, $2, $3, $4::jsonb, $5, $6, 'pending_review', now())
          on conflict (proposed_entity_type, natural_key) where review_status <> 'rejected'
          do nothing
          returning *`,
          [
            id,
            runId,
            item.proposedEntityType,
            JSON.stringify(item.proposedPayloadJson),
            item.naturalKey,
            item.matchedExistingId ?? null,
          ],
        );
        const row = result.rows[0];
        // A conflict (row === undefined) means an item with this natural key is already
        // staged (pending_review or approved) elsewhere — silently skipped rather than
        // duplicated, per the plan's duplicate-generation guarantee (§10/§11).
        if (row) {
          created.push(mapItem(row));
        }
      }
      return created;
    },

    async listPendingItems() {
      const result = await pool.query<ItemRow>(
        `select * from knowledge.ai_generation_items where review_status = 'pending_review' order by created_at asc`,
      );
      return result.rows.map(mapItem);
    },

    async listItemsForRun(runId) {
      const result = await pool.query<ItemRow>(
        `select * from knowledge.ai_generation_items where generation_run_id = $1 order by created_at asc`,
        [runId],
      );
      return result.rows.map(mapItem);
    },

    async getRun(runId) {
      const result = await pool.query<RunRow>(
        `select * from knowledge.ai_generation_runs where id = $1`,
        [runId],
      );
      const row = result.rows[0];
      return row ? mapRun(row) : undefined;
    },

    async updateItemReview(itemId, update) {
      await pool.query(
        `update knowledge.ai_generation_items
         set review_status = $2,
             reviewer_note = coalesce($3, reviewer_note),
             proposed_payload_json = coalesce($4::jsonb, proposed_payload_json)
         where id = $1`,
        [
          itemId,
          update.reviewStatus,
          update.reviewerNote ?? null,
          update.proposedPayloadJson ? JSON.stringify(update.proposedPayloadJson) : null,
        ],
      );
    },

    async markItemPromoted(itemId, promotedEntityId) {
      await pool.query(
        `update knowledge.ai_generation_items set promoted_entity_id = $2 where id = $1`,
        [itemId, promotedEntityId],
      );
    },
  };
}
