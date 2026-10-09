# YuvaPath — Platform Methodology Overview

Purpose: one reference describing how the platform works, which assessments it uses, how results are evaluated and ranked, which frameworks and tools it is built on, and where it is limited. It is written so the system can be compared with other career-counseling platforms.

Status of this document: it describes the code as implemented in this repository (not only the planning docs). Where the code differs from the planning docs in `docs/poc/`, the **code is described** and the difference is flagged in section 13.

---

## 1. What the platform is

YuvaPath is a career-counseling platform for Indian students and early-career users, with Phase A focused on **Tamil Nadu**. It combines:

1. A short psychometric-style **interest and work-values assessment**.
2. A **deterministic recommendation engine** (careers → streams → pathways → colleges → scholarships/aid → plan).
3. A **grounded AI counselor** (LLM) that may only talk about facts the system supplies.
4. A **safety layer** that runs before the AI and escalates to human counselors.
5. A **counselor/admin console** for human staff.

Core design principle: **the LLM never decides scores, ranks, eligibility, or safety.** Everything that determines a recommendation is plain, reproducible TypeScript. The LLM only phrases answers, and its output is validated against the supplied facts.

### Users and segments

Users are routed into one of three segments by their **self-described education stage** (age is stored but does not override stage):

| Segment | Self-stage | Meaning |
|---|---|---|
| Explorer | school | School students (class 7–10 in intake) |
| Pathfinder | higher_secondary | Class 11–12 / diploma / gap year |
| Launcher | college or graduate | College students, graduates, job-seekers |

Age bands: `minor_12_13`, `minor_14_15`, `minor_16_17`, `adult_18`, `adult_19_plus`. Under 18 is treated as a minor and needs guardian consent before an assessment can start.

---

## 2. End-to-end user journey

```
Landing → sign-up (name, DOB, city, state, home district, stage)
  → email OTP verification
  → minor? guardian consent (email OTP to guardian)
  → segment-specific intake questions
  → interest assessment (RIASEC) [+ work-values assessment]
  → deterministic scoring → ProfileSnapshot (immutable, versioned)
  → recommendations: Careers → Streams → Pathways → Colleges → Aid → Plan
  → grounded AI counselor chat + downloadable report
  → safety pre-check on every chat message; human handoff when triggered
```

Sessions are resumable. A journey session lives 7 days; assessment runs can be paused and resumed at the exact next unanswered item, and answers are idempotent (one response per run/item).

---

## 3. Assessments used

### 3.1 Instruments in the code

| Instrument code | Name | Construct | Items | Scales | Used for |
|---|---|---|---|---|---|
| `mini_ip_30` | YuvaPath Mini Interest Profiler 30 | Interest | 30 | R, I, A, S, E, C (5 items each) | **Explorer** segment |
| `ip_60` (v2.0) | YuvaPath Interest Profiler | Interest | **30** (the bank was halved from 60; see below) | R, I, A, S, E, C (5 items each) | **Pathfinder and Launcher** |
| `wip` | YuvaPath Work Importance Profiler | Work values | 18 | achievement, independence, recognition, relationships, support, working_conditions (3 items each) | Optional, adds a values signal to career matching |
| `photo_ip` | Photo interest profiler | Interest | Selectable in code for explorers (`mode=photo`) but **no item bank is seeded** in the repo | — | Not yet usable |

Notes on `ip_60` v2.0: the original 60-item bank (10 waves × 6 scales) was reduced to 30 items (5 waves × 6 scales) by sampling every other wave (1, 3, 5, 7, 9) so that each distinct item framing (direct enjoyment, preference, career-interest, tool/comparison, motivation) stays represented. The 60-item v1.0 bank is retired but kept for audit history. The name `ip_60` is therefore historical: it currently holds 30 items, the same count as `mini_ip_30`, so the main difference between explorer and others is the item wording and batch size, not length.

### 3.2 Theoretical framework

- **Holland's RIASEC model** (Realistic, Investigative, Artistic, Social, Enterprising, Conventional) for interests. The career catalogue uses the same six-factor profile, which is what makes direct comparison possible.
- **Work values** for the work-importance profiler use six dimensions that mirror **O*NET Work Values** (Achievement, Independence, Recognition, Relationships, Support, Working Conditions).
- **O*NET** (U.S. Department of Labor, v30.x, CC BY 4.0) supplies the career catalogue and per-career RIASEC interest and work-value profiles. O*NET interest scores (1–7) are divided by 7 to give 0–1.

### 3.3 Item format and administration

- **Item type:** Likert-style statements such as "I enjoy building, fixing, or working with tools and materials." Each item belongs to exactly one scale. Work-values items are phrased like "I want work where I can set challenging goals…".
- **Response scale:** integer **1–5**. The student UI shows five emoji anchors: Dislike, Not really, Unsure, Like, Love it.
- **Batching:** 5 items per screen for Explorers, 10 for others. Items are shown in fixed order.
- **Support in the schema** for reverse-scored items, quality-control (QC) items, tie-break items and option-based (MCQ/photo) items. The currently seeded banks use **only plain Likert items, with no reverse scoring and no QC items**.
- **Content status:** all item banks are flagged `review_status = mock` with license ref `yuvapath-mock-content-v1`. They are original, unvalidated item wordings, not a licensed or norm-referenced instrument.
- **Language:** English only. Tamil content is planned but gated on native review.

### 3.4 Intake questionnaire (non-psychometric context)

Segment-specific, versioned, short. Examples:

- Explorer: school board, class, favorite subject, flow activity, support needed.
- Pathfinder: education stage, current stream, **marks band**, preferred work style, decision confidence, constraints, support needed, location preference, whether they want aid.
- Launcher: current goal, education level, field of study, decision confidence, **marks band**, constraints, support needed.

Marks are captured as **bands** (`below_50`, `50_60`, `60_75`, `75_90`, `90_plus`, `prefer_not_to_say`), not exact marks. Sensitive questions allow "prefer not to say." Only `marks_band` and the aid question feed automated ranking; the rest are context for the counselor and AI.

---

## 4. How assessment results are calculated

Scoring is deterministic pure code (`packages/assessment/src/domain/scoring.ts`). No LLM is involved.

For one completed run:

1. For each scored response, `score = scoreDelta ?? responseValue ?? 0` (1–5 for Likert).
2. **Raw score per scale = sum of that scale's item scores.** With 5 items per scale, the range is 5–25 for RIASEC; with 3 items, 3–15 for work values.
3. **Normalized score = raw / maximum raw among the scales in that run** (so the top scale is 1.0). Rounded to 6 decimals.
4. Scales are sorted by raw score descending; ties are broken by the **fixed order R > I > A > S > E > C** (work values use their listed order).
5. **Result code:** top 3 letters for RIASEC (for example `IRA`); top 2 for work values (for example `achievement_independence`).
6. **Confidence:** `soft` if the 3rd and 4th scale scores differ by **≤ 1 raw point** (the code is ambiguous), otherwise `normal`.
7. QC items, if any, are counted but excluded from scoring.
8. The result stores `inputHash` and `outputHash` (SHA-256) plus instrument and algorithm versions, so any result can be replayed and verified. Results are immutable.

Algorithm versions: `riasec-deterministic-v1`, `wip-deterministic-v1`.

### What is NOT done (compare carefully with other platforms)

- No reverse scoring, no consistency/QC checks in the live item banks.
- No norming against a reference population; scores are **ipsative-style within the person** (normalized to their own max), not compared with peers.
- No reliability or validity statistics (Cronbach's alpha, test-retest) have been computed.
- No Big Five or aptitude instruments are implemented. They appear in the early POC docs but not in the code.
- No age/gender fairness analysis of the item bank yet.

### ProfileSnapshot (the handoff object)

After scoring, an immutable `ProfileSnapshot` is created with a payload hash and version number. It holds profile fields, intake summary, RIASEC result (raw, normalized, code, confidence), optional work-values result (normalized scores, top two), and a `profile-builder-v1` algorithm tag. All downstream modules read this snapshot, never raw responses.

---

## 5. How recommendations are evaluated

All ranking logic lives in `packages/recommendations/src/domain/` and is deterministic. The same inputs always give the same ordered output, and every set stores input and output hashes plus algorithm and weight versions.

Pipeline (each stage consumes the stored ranking of the stage before):

```
RIASEC profile ─► Careers ─► Streams ─► Pathways ─► Colleges ─► Scholarships/Aid ─► Plan
```

### 5.1 Careers

**Data:** about 923 O*NET careers, each with a RIASEC vector (0–1), optionally a work-values vector, and links to education routes.

**Per-career score** (config `career_match`, algorithm `module-2-live-v1`):

```
interestFit = (Pearson(normalized student RIASEC, normalized career RIASEC) + 1) / 2
valuesFit   = (Pearson(student work values, career work values) + 1) / 2   [if both exist]
feasibility = rule lookup on (segment, marks band, education route) → 0.30 | 0.65 | 1.00 (default 0.65)
contextBoost = counselor priority boost, 0..1 (currently 0: no loader wired)

fitScore = 0.50 × interestFit + 0.20 × valuesFit + 0.15 × feasibility + 0.15 × contextBoost
```

- Both vectors are min-max normalized first; Pearson compares the **shape** of the six-letter profile, not only the top letter. All six letters matter.
- If work values are missing, the 0.20 values weight moves to interest (0.70 interest).
- Sort: fitScore desc, then title asc, then career id asc (fully deterministic).
- Because contextBoost is always 0 and feasibility mostly defaults to 0.65, today's ranking is driven mainly by interest fit and, when taken, values fit.

**Rings (16 shown, from the top 18):** inner 4 (careers whose top letter matches the student's top letter), middle 6 (careers whose top letter is adjacent on the hexagon R-I-A-S-E-C), outer 6 (next best; if none is vocational, one vocational route is swapped in).

### 5.2 Streams (for example Science-PCM, Commerce, Arts)

Candidate streams come from a curated map of the student's **top-2 RIASEC code** (segment-specific rows take precedence), plus streams reachable from the student's top-ranked careers through the career→stream table (about 1,300 hand-reviewed links covering 447 careers, including all 229 that can appear in a top-18).

```
No career signal:   0.55 × riasecOverlap + 0.25 × segmentFit + 0.15 × marksFit + 0.05 × priorityFit
With career signal: 0.30 × riasecOverlap + 0.35 × careerAlignment + 0.20 × segmentFit
                    + 0.10 × marksFit + 0.05 × priorityFit
```

`riasecOverlap` = share of the student's top-3 letters present in the stream. `careerAlignment` = rank-weighted share (weights 1/(rank+1)) of the student's ranked careers that the stream leads to, multiplied by each link's weight. `marksFit` is 1/0, or 0.5 if unknown.

### 5.3 Pathways (a specific qualification route, for example "B.Sc Computer Science")

```
fitScore = 0.40 × careerAlignment + 0.30 × streamAlignment + 0.15 × collegeAvailability
         + 0.06 × segmentFit + 0.04 × marksFit + 0.045 × reachability + 0.005 × backupRouteFit
```

`collegeAvailability` is a log-scaled count of Tamil Nadu colleges offering it (reference ceiling 1,500). Rings of 4/6/6 are built from the top 18 using career/stream hits (inner), widely available routes (middle) and backfill (outer). The weights are documented in the code as an initial design hypothesis, not a final calibration.

### 5.4 Colleges (Tamil Nadu only)

Eligibility is by **filter**, not by score: a college qualifies if at least one of its programmes matches the target discipline and the chosen programme type, based on the pathway's qualification. Optional filters are institute kind, ownership, district and admission route. Among eligible colleges, the only ranking signal is **location proximity** to the student's home district: same district = 1.0, same region = 0.5, elsewhere in Tamil Nadu = 0. No cutoff or placement data is used.

### 5.5 Scholarships and aid

Each scheme has criteria (fact key plus accepted values). Student facts are compared:

- any mismatch → `explore`
- all criteria matched, none unknown → `likely`
- some matched, some unknown → `check_conditions`

`fitScore = 0.70 × label score + 0.25 × evidence share + 0.05 × priority`. Sorting is by label first, then score. The system tells students what is likely or needs checking; it does **not** guarantee eligibility.

### 5.6 Plan

A template-based plan (no generation): the template is selected by segment (explorer = exploration plan, pathfinder = pathway plan, launcher = 90-day career plan) and priority, then placeholders (target title, state) are filled. All text comes from approved templates.

---

## 6. Knowledge/catalog layer

- Careers: O*NET 30.x (923 careers, RIASEC and work-value profiles). Streams, pathways, colleges and aid schemes use Tamil Nadu sources (DOTE/DCE lists and official scheme pages), versioned as datasets with source and publication status.
- Structured retrieval is the source of truth. **RAG/vector search is explicitly excluded from Phase A.**
- Optional **Gemini-drafted** catalog content (for example the career→stream mapping) is produced offline, staged as drafts, **reviewed by a person**, then promoted. Drafts are not auto-published.
- A regional admin console lets staff edit colleges and aid/scholarship records.
- Data discipline: DB changes only through committed Supabase migrations; seed data lives in `data/seed/knowledge/` with dated versions.

---

## 7. AI counselor

- Provider: pluggable, **Gemini by default** (`gemini-3.6-flash` in `.env.example`), or Anthropic Claude, or disabled (config `AI_PROVIDER`).
- The prompt is JSON: the user's message, profile snapshot, stored recommendations, retrieved grounding evidence, and the last 8 messages. The system prompt tells the model to use **only** those facts, never to compute or change scores/ranks/eligibility/URLs, and not to give crisis advice. The model must return `{text, grounding:{entityIds, recommendationIds}}`.
- **Grounding validator (post-generation):** the reply is rejected if it cites an entity or recommendation not in scope, includes a URL not in the allowed list, or contains any **number** not present in the supplied facts. On a violation the model gets **one retry** with the violations listed; a second failure falls back to approved static copy.
- If the AI is disabled or fails, the journey still works and the user gets approved fallback copy.
- Conversations, tool/grounding records and generated report assets are stored with idempotency keys.

---

## 8. Safety

- **Pre-check before the AI:** every chat message is classified by a **keyword-rule engine** (normalized text, substring match) into Tier 1 (immediate risk), Tier 2 (serious concern needing staff), Tier 3 (distress, supportive).
- Tier 1 and 2 **pause the journey** and **create a staff handoff** (packet includes profile summary, last 10 turns, trigger excerpt, plan state). Tier 3 keeps the journey open with gentle approved copy and no automatic handoff.
- The LLM never writes safety copy; the response comes from versioned approved messages.
- Current policy is **`mock-safety-md-v1`: placeholder content, explicitly not signed or legally reviewed for production.** English keywords only, no semantic classifier, so it will miss paraphrased or non-English risk language.
- Privacy and operations: audit events, privacy-job queue (export/deletion), staff queue and handoff tooling, hashed contact data, soft-deleted users excluded from queries.

---

## 9. Evaluation and quality assurance

What exists:

- **Determinism by design:** hashes of inputs and outputs on every result and recommendation set; algorithm and weight versions stored with each run.
- **Automated tests** (Vitest) cover scoring vectors, tie-breaking, ranking determinism, ring construction, aid labelling, geo/district logic, plan generation, service logic and web components. CI-style gates: `typecheck`, `lint`, `test`, `build`.
- **Runtime guardrails:** grounding validator (section 7), safety pre-check (section 8), Zod validation on every API contract.

What is **not** implemented (important for comparisons):

- The Module 5 **evaluation service is a synthetic stub**: it returns six hard-coded "passed" smoke results. It does not yet run real regression suites.
- No predictive-validity study (do recommended careers match actual outcomes?), no inter-rater or counselor-agreement study, no user-satisfaction or outcome tracking.
- No fairness or bias audit across gender, language, region or marks band.
- No psychometric reliability/validity analysis of the item banks.
- Recommendation weights are a design hypothesis awaiting owner and fairness review.

---

## 10. Architecture and frameworks

| Layer | Technology |
|---|---|
| Language | TypeScript (strict), Node.js ≥ 22, pnpm monorepo |
| API | Express 5 on a thin composition root (`apps/api`), Helmet, CORS, Pino logging; deployable as a server or an AWS-Lambda-style handler (serverless-http) |
| Validation and contracts | Zod schemas in `packages/contracts`, OpenAPI generated via zod-to-openapi, Swagger UI at `/docs` |
| Database | Supabase Postgres, schemas `assessment`, `recommendation`, `knowledge`, `counselor`, `safety_private`, `operations`; raw SQL repositories via `pg`; about 69 project-owned tables in Phase A |
| Frontend | React 19, Vite, React Router 7, TanStack Query, Tailwind CSS 4, Vitest and Testing Library |
| AI | Gemini or Anthropic via provider interface (ports/adapters) |
| Email | SMTP (nodemailer) for OTPs |
| Auth | Email OTP sign-up for students; guardian OTP for minors; separate staff auth for counselors (email, OTP password reset, forced password reset) and a regional-admin role |
| Module packages | `assessment`, `recommendations`, `knowledge`, `counselor`, `safety`, `evaluation`; domain logic is independent of Express/Supabase, and modules talk through contracts/ports |

Auth note: the early POC docs described phone/SMS OTP. The implementation uses **email OTP**; no SMS is sent anywhere.

---

## 11. Privacy, consent and compliance

- Minors (< 18) cannot start an assessment until a guardian grants consent. The guardian email is stored hashed. Guardian OTP: 5-minute expiry, resend delays 1/3/5 minutes, maximum 3 resends, plus a 24-hour decline link.
- Under-12 users are stopped without saving data (per the POC flow).
- The service-role key and database URL are never sent to browsers. Secrets are not committed.
- A DPDP (India) review is listed as a pending production follow-up.

---

## 12. Comparison cheat-sheet (the questions to ask another platform)

| Dimension | YuvaPath |
|---|---|
| Interest model | Holland RIASEC, 6 scales |
| Assessment length | 30 interest items (+18 optional work-values) |
| Item format | 5-point Likert statements, original wording, English |
| Norms / reliability / validity | **None established** |
| Aptitude / personality tests | **Not implemented** |
| Score method | Raw sum per scale, normalized to personal max; top-3 code; soft-confidence flag |
| Career database | O*NET 30.x, ~923 careers (US-based taxonomy, mapped to Tamil Nadu education routes) |
| Matching algorithm | Pearson correlation of RIASEC (+ work values) with rule-based feasibility; weights 0.50/0.20/0.15/0.15 |
| Is AI used to rank? | **No.** AI only phrases grounded answers |
| Explainability | Every item stores its component scores and weights; every set is hash-replayable |
| Geographic scope | Tamil Nadu colleges and schemes (Phase A) |
| College ranking | Eligibility filter plus district proximity only (no cutoffs, fees, placements, or NIRF) |
| Aid matching | Criteria matching with likely / check-conditions / explore labels |
| Safety | Keyword tiers, mock policy, human handoff, AI cannot write safety copy |
| Human in the loop | Counselor dashboard, handoff queue, report card, admin console |
| Outcome validation | None yet |

---

## 13. Known gaps and planning-doc differences

1. **Planning docs vs code (assessment):** `docs/poc/module-1-*.md` describes QC items, tie-break items, Big Five, aptitude subtests, photo quiz and a WIP forced-choice format. The code implements only Likert RIASEC and Likert work values, with a simple "3rd vs 4th within 1 point" soft-confidence rule and no QC or tie-break logic.
2. **Planning docs vs code (identity):** docs describe phone/SMS OTP with 3 attempts and a 30-minute lock; code uses email OTP (details in the `identity-service` and guardian-consent code).
3. **`docs/poc/module-2-career-calculation-guide.md`** matches the career engine. It does not cover the later stream, pathway, college, aid and proximity logic, which is described here.
4. **Evaluation module** is a stub (section 9). **Safety policy** is mock (section 8).
5. **Counselor priorities** (context boost) have no database loader, so context boost is effectively 0.
6. **Feasibility rules** fall back to 0.65 whenever no rule matches, which flattens the feasibility signal.
7. **Content validity:** item banks are unreviewed mock content; Tamil content is not enabled.
8. **Multi-state support:** geo-scope logic for other states exists but is unused; Phase A ranks Tamil Nadu only.
9. The `ip_60` code name no longer reflects its 30-item length.

## 14. Where to look in the code

| Topic | Location |
|---|---|
| Assessment scoring | `packages/assessment/src/domain/scoring.ts` |
| Item banks | `packages/assessment/scripts/seed-assessment.ts`, `seed-ip60.ts`, `seed-wip.ts` |
| Intake questions | `packages/assessment/scripts/seed-intake.ts` |
| Segment and age routing | `packages/assessment/src/domain/user-profile.ts` |
| Career matching | `packages/recommendations/src/domain/career-matching.ts` (guide: `docs/poc/module-2-career-calculation-guide.md`) |
| Stream / pathway / college / aid / plan | `packages/recommendations/src/domain/*.ts` (stream mapping explained in `docs/career-to-stream-mapping.md`) |
| Catalog and imports | `packages/knowledge`, `data/seed/knowledge/`, `supabase/migrations/` |
| AI counselor and grounding | `packages/counselor/src/application/send-conversation-message.ts`, `.../infrastructure/ai-provider-shared.ts` |
| Safety | `packages/safety/src/domain/safety-policy.ts`, `safety-rules.ts`; policy doc `docs/reference/SAFETY.md` |
| Evaluation stub | `packages/evaluation/src/domain/evaluation-runs.ts` |
| Data model | `docs/data-model/phase-a-mvp-data-model.md` |
