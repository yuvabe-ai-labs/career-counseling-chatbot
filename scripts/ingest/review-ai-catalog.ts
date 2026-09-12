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
import process from "node:process";
import { createDatabasePool } from "@yuvanext/database";
import { createPostgresAiGenerationStore } from "@yuvanext/knowledge";

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

    throw new Error("Pass --list, --approve <itemId>, or --reject <itemId> [--note \"...\"]");
  } finally {
    await pool.end();
  }
};

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown review failure";
  process.stderr.write(`AI catalog review failed: ${message}\n`);
  process.exitCode = 1;
});
