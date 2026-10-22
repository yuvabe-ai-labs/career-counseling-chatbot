# YuvaPath Agent Guide

## Current scope

YuvaPath helps students in Classes 9–12 discover the career fields (clusters) that fit them. The student journey is: sign up or sign in (guardian consent for under-18s) → the clusterfit chat (voice or text, Parts A + E) → activities (Part B) → puzzles (Part C) → work style (Part D) → career-cluster results. The React app in `apps/web` is the student product; `apps/api` serves it.

The earlier RIASEC journey (intake, RIASEC assessment, recommendations, Explore Path), the AI counsellor and the counsellor/regional-admin portals were removed on 2026-10-22. Their database tables and migrations remain in `supabase/migrations` and the hosted database, but no code reads them.

## Source-of-truth order

1. `docs/Pathfinder Career Exploration Questionnaire (Grades 9–12).docx` and `docs/Pathfinder Student Booklet.docx` — the instrument (items, scoring, clusters).
2. `docs/clusterfit-prototype-plan.md` (§18 and its decisions) — what is built and why.
3. `docs/clusterfit-scoring-explained.md` — how scoring and recommendations work.
4. `packages/clusterfit/README.md` — the module's own notes.

If two documents conflict, stop and raise the conflict. Do not silently invent assessment questions, scoring weights, safety copy, eligibility rules or tie-break logic.

## Architecture

- `apps/api` is the thin Express composition root.
- `apps/web` is the React (Vite) student app.
- `packages/contracts` owns shared Zod schemas and API types.
- `packages/assessment` owns student accounts: sign-up/sign-in, guardian consent, journey sessions, profiles and the state/city search used by sign-up.
- `packages/clusterfit` owns the journey: the Gemini Live chat and extraction, the instrument content, scoring and results.
- `packages/safety` owns approved safety copy (read by the chat's wellbeing message).
- `packages/config` owns stable shared constants; `packages/database` the Postgres/Supabase clients and generated types.
- Domain logic belongs in the module package, never in route handlers.
- Repository code owns SQL; domain code must not depend on Express or Supabase clients.
- Module packages communicate through contracts/ports and public exports, not another module's tables.
- React/browser clients must never receive the service-role key, database URL or Gemini API key (the chat uses single-use constrained tokens).

## Module ownership

| Module     | Owned package         | Primary docs                                                                        |
| ---------- | --------------------- | ----------------------------------------------------------------------------------- |
| Accounts   | `packages/assessment` | sign-up, guardian consent and profile code in this package                          |
| Clusterfit | `packages/clusterfit` | `docs/clusterfit-prototype-plan.md`, `docs/clusterfit-scoring-explained.md`, README |
| Safety     | `packages/safety`     | approved safety copy (`safety_private.approved_safety_messages`)                    |

## Frozen implementation rules

- YuvaPath serves Classes 9–12 only. Sign-up records every student's stage as `school` (shown, not editable) with no minimum age; under-18s need guardian consent. The chat learns the exact class; when "About you" is completed it is recorded as the stage (`school` for Classes 9–10, `higher_secondary` for 11–12). For now every student takes all 20 puzzles and the confirm card is switched off (plan §18.1 R11). Do not reintroduce college, graduate or working-adult ("launcher") paths.
- Use `user_profiles`, `journey_sessions` and `journey_session_id`; do not reintroduce `student_*` schema names.
- Store full state/UT text in `state`; do not add a fixed South-state-code union.
- Clusterfit scoring and ranking are deterministic TypeScript, never LLM-generated. Every item in Parts B, C and D must be answered.
- The hosted database is changed only through committed files in `supabase/migrations`.
- Every retryable write accepts an idempotency key.
- Swagger UI is shared at `/docs`; add every public endpoint to the OpenAPI registry.

## Required checks

Before handing off a change, run:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm web:typecheck
pnpm web:build
```

Do not commit `.env`, service-role keys, database passwords, access tokens or real user data.
