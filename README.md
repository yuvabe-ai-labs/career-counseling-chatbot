# YuvaNext

> AI-powered career counseling platform — assessment, recommendations, grounded knowledge, and a conversational counselor experience for students.

## What this is

YuvaNext is a monorepo for a career-counseling chatbot: students take a RIASEC-style assessment, get deterministic recommendations, explore an entity-grounded knowledge base, and talk to an AI counselor — with safety checks and evaluation baked in.

| Module               | Responsibility                                  |
| --------------------- | ------------------------------------------------ |
| 1. Assessment         | Profile intake and RIASEC scoring                |
| 2. Recommendations    | Deterministic ranking of streams/careers/colleges |
| 3. Knowledge          | Grounded facts (colleges, careers, streams, aid)  |
| 4. Counselor          | Conversational AI experience (Gemini / Anthropic) |
| 5. Safety & Evaluation | Guardrails, moderation, and quality checks        |

## Tech stack

- **API** — Node 22, TypeScript, Express 5, Zod + OpenAPI, Swagger UI
- **Web** — React 19, Vite, TanStack Query, Tailwind
- **Data** — Supabase (Postgres + Auth), migration-first schema
- **Quality** — Vitest, Supertest, ESLint, Prettier

## Project structure

```
apps/
  api/        Express API (composition root)
  web/        React frontend
packages/
  assessment/ recommendations/ knowledge/ counselor/ safety/ evaluation/
  contracts/  Shared Zod schemas & API types
  database/   Supabase client & generated types
  config/     Shared constants
  test-fixtures/
supabase/     Migrations
docs/         Architecture, data model, and module specs
```

## Getting started

```powershell
Copy-Item .env.example .env
pnpm install
```

Run the API:

```powershell
pnpm dev
```

Run the web app:

```powershell
pnpm web:dev
```
