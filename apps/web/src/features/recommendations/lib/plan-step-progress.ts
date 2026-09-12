/**
 * Purely client-side "mark this step done" state for PlanPage's checklist cards (Figma node
 * 611:147) — there's no backend concept of step completion (recommendation.plan_template_steps
 * has no completion column, and generated plans aren't otherwise mutated by the student), so
 * this is a per-viewer convenience like the rest of this app's localStorage usage, not a
 * server-tracked feature. Keyed by templateId + stepOrder so it survives a refetch of the same
 * plan but naturally resets if the student's recommended template changes.
 */

const STORAGE_KEY = "yuvanext.planStepsDone";

function readDoneKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((key) => typeof key === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function writeDoneKeys(keys: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    /* localStorage unavailable (private mode, disabled storage) — degrade silently */
  }
}

function stepKey(templateId: string, stepOrder: number): string {
  return `${templateId}:${stepOrder}`;
}

export function isPlanStepDone(templateId: string, stepOrder: number): boolean {
  return readDoneKeys().has(stepKey(templateId, stepOrder));
}

export function togglePlanStepDone(templateId: string, stepOrder: number): boolean {
  const keys = readDoneKeys();
  const key = stepKey(templateId, stepOrder);
  const nowDone = !keys.has(key);
  if (nowDone) {
    keys.add(key);
  } else {
    keys.delete(key);
  }
  writeDoneKeys(keys);
  return nowDone;
}
