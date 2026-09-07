import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// vitest.config.ts doesn't set `test.globals: true` (kept explicit imports, matching the
// rest of the repo's style), so Testing Library's auto-cleanup detection doesn't kick in —
// register it manually or renders leak across tests.
afterEach(() => {
  cleanup();
});
