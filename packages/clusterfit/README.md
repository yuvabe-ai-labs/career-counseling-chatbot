# @yuvapath/clusterfit

The student journey: the Pathfinder career-cluster flow (plan: `docs/clusterfit-prototype-plan.md`, scope §18; scoring: `docs/clusterfit-scoring-explained.md`).

**Flow:** sign-up/sign-in → Gemini Live chat (Part A + Part E) → confirm card → Parts B, C, D → all 12 clusters, top 3 highlighted. The results page offers "Retake the test" (`POST /sessions/{id}/reattempt`, plan §18.1 R12): the scored session is archived as `abandoned` (kept, hidden) and a new attempt starts at About you.

**Source of truth:**

- `docs/Pathfinder Career Exploration Questionnaire (Grades 9–12).docx`: items, scoring, bands, flags
- `docs/Pathfinder Student Booklet.docx`: student-facing wording
- The Gemini Live POC (`gemini-live-api-examples/gemini-live-genai-python-sdk`): Part A prompt, tools and fields, ported in `src/situation`

**Wiring:** `registerClusterfitModule` in `src/module.ts`, called from `apps/api/src/app/create-app.ts`; the web app's routes are `/clusterfit` and `/clusterfit/results` (`apps/web/src/features/clusterfit`). Settings: `GEMINI_API_KEY`, `GEMINI_LIVE_MODEL`, `CLUSTERFIT_EXTRACTION_MODELS`, `CLUSTERFIT_EXTRACTION_BUDGET_MS`.

**Prompt:** edit `prompts/conversation-context-v3.md`, then run `pnpm --filter @yuvapath/clusterfit sync-prompt`. The Lambda build bundles only TypeScript, so the prompt is embedded as a TS string.
