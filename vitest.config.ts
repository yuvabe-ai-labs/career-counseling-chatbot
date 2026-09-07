import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts", "tests/**/*.test.ts"],
    // apps/web owns its own Vitest config (jsdom + Testing Library setup) and is run via
    // `pnpm web:test`/`pnpm --filter @yuvanext/web test`, not this node-environment suite.
    exclude: ["**/node_modules/**", "apps/web/**"],
    coverage: { provider: "v8", reporter: ["text", "html"] },
  },
});
