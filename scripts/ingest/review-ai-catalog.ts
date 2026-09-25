// CLI review/approve/reject for staged AI catalog drafts
// (docs/poc/ai-assisted-catalog-implementation-plan.md §12). Option A ("CLI-based") per the
// plan's decision — no admin UI. Never writes to a real knowledge.* table; only flips
// knowledge.ai_generation_items.review_status. Promotion is a separate script
// (scripts/ingest/promote-ai-catalog.ts).
//
// Usage:
//   tsx scripts/ingest/review-ai-catalog.ts --list
//   tsx scripts/ingest/review-ai-catalog.ts --approve <itemId>
//   tsx scripts/ingest/review-ai-catalog.ts --reject <itemId> --note "why"
//   tsx scripts/ingest/review-ai-catalog.ts --approve-all
//
// --approve-all (docs/architecture/career-stream-coverage-fill-plan.md Phase 0): bulk-approves
// every pending_review career_stream item EXCEPT a duplicate-match warning (matchedExistingId
// set). Scoped to career_stream only, never pathway/college/stream_pathway items — those still
// go through --list/--approve one at a time. This doesn't weaken any existing safeguard: an
// unknown streamCode is already dropped before staging (generate-ai-catalog-drafts.ts) and
// re-checked again at promotion time (promote-ai-catalog.ts), with a DB foreign key as the last
// line of defense either way — --approve-all only skips the human keystroke for links that
// already passed all of that.
//
// Originally also held back non-"primary" relationshipType links ("alternative"/
// "cross_disciplinary") for a human look. Dropped that carve-out after a live run: at ~140
// careers processed it had already produced 123 pending items, extrapolating to 700-800+ across
// the full ~860-career backfill — not reviewable one at a time. A spot-check of a sample found
// the same quality bar as the auto-approved primary links (valid stream codes, sensible
// weight-to-tier correlation), and the same 3 structural safeguards above still apply regardless
// of relationshipType — so the user chose to extend auto-approval to all relationship types
// rather than keep hitting this same growing-backlog decision on every future run.
import process from "node:process";
import { createDatabasePool } from "@yuvapath/database";
import { createPostgresAiGenerationStore } from "@yuvapath/knowledge";

const loadLocalEnvironment = (): void => {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
};

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const run = async (): Promise<void> => {
  loadLocalEnvironment();
  const args = process.argv.slice(2);
  const pool = createDatabasePool({
    connectionString: requireEnv("DATABASE_URL"),
    ssl: process.env.DATABASE_SSL !== "false",
    max: 1,
  });
  const store = createPostgresAiGenerationStore(pool);

  try {
    if (args.includes("--list")) {
      const items = await store.listPendingItems();
      if (items.length === 0) {
        console.log("No pending_review items.");
        return;
      }
      for (const item of items) {
        console.log("─".repeat(70));
        console.log(`item:        ${item.id}`);
        console.log(`run:         ${item.generationRunId}`);
        console.log(`entity type: ${item.proposedEntityType}`);
        console.log(`natural key: ${item.naturalKey}`);
        if (item.matchedExistingId) {
          console.log(`⚠ looks like a duplicate of existing entity: ${item.matchedExistingId}`);
        }
        console.log("payload:");
        console.log(JSON.stringify(item.proposedPayloadJson, null, 2));
      }
      console.log("─".repeat(70));
      console.log(`\n${items.length} pending item(s).`);
      return;
    }

    if (args.includes("--approve-all")) {
      const items = await store.listPendingItems();
      const careerStreamItems = items.filter((item) => item.proposedEntityType === "career_stream");
      const needsReview = careerStreamItems.filter((item) => item.matchedExistingId != null);
      const autoApprove = careerStreamItems.filter((item) => !needsReview.includes(item));

      for (const item of autoApprove) {
        await store.updateItemReview(item.id, { reviewStatus: "approved" });
      }

      console.log(
        `${autoApprove.length} career_stream item(s) auto-approved, ${needsReview.length} left pending (duplicate match) — run --list to review ${needsReview.length > 0 ? "them" : "the rest"}.`,
      );
      const otherPending = items.length - careerStreamItems.length;
      if (otherPending > 0) {
        console.log(`(${otherPending} pending item(s) of other entity types were left untouched.)`);
      }
      return;
    }

    const approveId = readFlag(args, "approve");
    if (approveId) {
      await store.updateItemReview(approveId, { reviewStatus: "approved" });
      console.log(`Approved item ${approveId}.`);
      return;
    }

    const rejectId = readFlag(args, "reject");
    if (rejectId) {
      const note = readFlag(args, "note");
      await store.updateItemReview(rejectId, { reviewStatus: "rejected", reviewerNote: note });
      console.log(`Rejected item ${rejectId}${note ? ` (${note})` : ""}.`);
      return;
    }

    throw new Error(
      "Pass --list, --approve <itemId>, --approve-all, or --reject <itemId> [--note \"...\"]",
    );
  } finally {
    await pool.end();
  }
};

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown review failure";
  process.stderr.write(`AI catalog review failed: ${message}\n`);
  process.exitCode = 1;
});
