import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-lambda/**",
      ".deploy/**",
      "coverage/**",
      "docs/**",
      "packages/database/src/database.types.ts",
      "eslint.config.js",
      "scripts/**/*.mjs",
      "packages/*/scripts/**/*.mjs",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
    },
  },
  {
    // One-off, already-applied data-migration scripts that read untyped JSON manifests/rows. Only the
    // `any`-related rules are relaxed here; every other rule still applies to them.
    files: [
      "scripts/ingest/apply-tn-catalogue.ts",
      "scripts/ingest/apply-tn-stream-catalogue.ts",
      "scripts/ingest/remove-ai-pathways.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
    },
  },
  {
    // apps/web is browser code (React/JSX, DOM globals) — layered on top of the
    // shared TS rules above rather than duplicating them.
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
);
