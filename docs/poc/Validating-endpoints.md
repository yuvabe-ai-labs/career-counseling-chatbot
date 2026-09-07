# Module 1 — Assessment: Prototype vs Backend Validation

## 1. Objective

Check whether a frontend can build the Module 1 flow — identity → consent → intake → assessment → scoring → profile — using only the backend APIs that exist today, and list every gap that would block it.

**Method:** Read every Module 1 route/schema/service in the backend, then exercised the live API (dev server, port 3000) against the real Supabase database using two throwaway test users (adult + mi  nor), created and fully deleted afterward.

**Headline finding:** The prototype makes **zero API calls** — it's a pure client-side simulation (hardcoded OTP, local scoring, "no data stored"). So it can't be diffed wire-for-wire. Instead this report checks the backend against the POC spec's API contract (which the prototype's screens are labeled against) and the prototype's flow logic. Core assessment mechanics work well; identity and guardian-OTP are the real blockers.

## 2. Assessment Flow

Traced from the prototype's JS (confirmed: no `fetch`/`XHR` anywhere in the file):

1. **Landing** — name, age, city/state (no under-12 stop actually wired in JS).
2. **OTP modal** — fixed fake code, always succeeds. No request, no failure/lock states.
3. **Guardian consent** (minors only) — two fake choices: "approves" or "still waiting." Choosing "waiting" doesn't block anything — the demo continues into the full assessment anyway ("ephemeral mode").
4. **Intake** — 2–4 chip questions, branched by persona (Explorer/Pathfinder/Launcher), stored only in local JS state.
5. **Assessment** — 12 Likert items (R/I/A/S/E/C) or a photo-pair quiz for Explorer, scored client-side.
6. **Reveal** — RIASEC code computed from local state.
7. **Guidance/maps** — 3-ring career maps from a hardcoded 96-entry local table, not from any backend.
8. **Aptitude sample** — local-only bonus mini-quiz.

Payloads in §3 are inferred from this state shape and the spec's API contract, not observed on the wire.

## 3. Endpoint Validation

Actor identity for every call: header `x-yuvanext-user-id: <uuid>`. Adult test persona: age 23, `selfStage: graduate` → segment `launcher`. Minor: age 14, `selfStage: school` → segment `explorer`.

| Endpoint | Method | Purpose | Payload Tested | Result | Status |
|---|---|---|---|---|---|
| `/api/v1/journey-sessions` | POST | Start a journey session | `{}` | `201`, session created — but fails `500` unless `userId` already exists in Supabase `auth.users` | ⚠️ Mismatch |
| `/api/v1/journey-sessions/{id}` | GET | Fetch a session | — | `200` | ✅ Working |
| `/api/v1/journey-sessions/{id}/resume` | POST | Resume a session | — | `200`, refreshes expiry | ✅ Working (unused by prototype) |
| `/api/v1/journey-sessions/{id}/user-profile` | PUT | Create/update profile | `{firstName, ageAtOnboarding:23, city, state, countryCode:"IN", selfStage:"graduate", wantsAid:false}` | `200`, `ageBand`/`segment` correctly derived server-side | ✅ Working |
| `/api/v1/journey-sessions/{id}/user-profile` | GET | Fetch profile | — | `200` | ✅ Working |
| `/api/v1/journey-sessions/{id}/guardian-consents` | POST | Request guardian consent | `{guardianPhone, studentPhone, textVersion}` | `201`, status `pending` | ✅ Working |
| `/api/v1/journey-sessions/{id}/guardian-consents/verify` | POST | Verify guardian OTP | Wrong code | `400 invalid_guardian_otp` (correct). **Correct-code path not testable** — code is never exposed | ⚠️ Needs Verification |
| `/api/v1/journey-sessions/{id}/guardian-consents/status` | GET | Poll consent status | — | `200` | ✅ Working |
| `/api/v1/journey-sessions/{id}/intake/questions` | GET | Segment intake questions | `?language=en` | `200` for `explorer` (5 Qs) and `launcher` (9 Qs) | ✅ Working |
| `/api/v1/journey-sessions/{id}/intake/answers/{qId}` | PUT | Save an intake answer | `{"value":"working"}` | Adult: `200`. Minor before consent: `409 guardian_consent_required` (correctly blocked) | ✅ Working |
| `/api/v1/journey-sessions/{id}/assessment-runs` | POST | Start default (RIASEC) run | `{"language":"en"}` | Adult: `201`, `ip_60`. Minor before consent: `409` (correctly blocked) | ✅ Working |
| `/api/v1/journey-sessions/{id}/work-values-runs` | POST | Start WIP run | `{"language":"en"}` | `201`, `wip` | ⚠️ Works, undocumented in Swagger |
| `/api/v1/assessment-runs/{id}/next` | GET | Progress + next batch | — | `200`; batch size 10 (Launcher), 5 (Explorer, code-confirmed) | ✅ Working |
| `/api/v1/assessment-runs/{id}/responses` | PUT | Submit one response | `{itemId, responseValue:3}` | `200`; resubmitting same `itemId` updates in place (idempotent). Missing value → `400` | ✅ Working |
| `/api/v1/assessment-runs/{id}/score` | POST | Score a completed run | — | `200` after all responses submitted. On incomplete run → `409` | ✅ Working |
| `/api/v1/journey-sessions/{id}/assessment-runs/{id}/profile-snapshot` | POST | Build `ProfileSnapshot` | — | `201`; merges RIASEC + WIP results, versioned (`profileVersion` incremented) | ⚠️ Works, shape differs from spec (see §4) |
| `/api/v1/profile/snapshot` | GET | Re-fetch the latest (or a specific) `ProfileSnapshot` later | `Authorization: Bearer <token>` (real Supabase JWT — **not** the `x-yuvanext-user-id` header every other Module 1 route uses) | **Newly implemented** (was `404` in earlier testing). `401` with no token; `404` for an authenticated user with no snapshot yet; `200` with the correct, latest snapshot for an authenticated owner — response wrapped as `{"profile": {...}}`, whereas the POST that creates a snapshot wraps it as `{"snapshot": {...}}` | 🆕 New, ⚠️ mixed auth model |

**Confirmed missing** (all `404`): `POST /api/v1/sessions/anonymous`, `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify`, `GET /api/v1/results`.

## 4. Gaps / Mismatches

**Gap: Identity/OTP API missing**
- **Prototype/spec expects:** Anonymous session + phone-OTP flow producing the user identity.
- **Backend:** No such routes exist. Every call requires a `userId` that must already exist in Supabase `auth.users` (confirmed via live FK violation) — nothing creates that row.
- **Update (later branch check):** A first real Supabase-bearer-token-authenticated route now exists (`GET /api/v1/profile/snapshot`, see §3) — a sign of Supabase Auth integration starting, but it coexists with the `x-yuvanext-user-id` header every other Module 1 route still uses, and there is still no route that *creates*/*authenticates* the identity itself (sign-up/OTP/sign-in remain entirely outside Module 1's HTTP surface).
- **Impact:** No real frontend can start the flow.
- **Action:** Build the spec's OTP service, or officially adopt Supabase Auth phone-OTP and update the spec; if the latter, migrate the rest of Module 1 off the `x-yuvanext-user-id` header onto the same bearer-token model.
- **Priority:** High.

**Gap: Guardian OTP is unrecoverable**
- **Prototype/spec expects:** A dev `SmsProvider` that exposes the OTP code for testing/demo.
- **Backend:** Code is random, stored only in an in-memory `Map`, never returned or logged. No `SmsProvider` implementation exists anywhere.
- **Impact:** The minor-consent path (Explorer + most of Pathfinder) can't be completed by a frontend, QA, or a demo.
- **Action:** Add a dev-mode provider that echoes the code outside production.
- **Priority:** High.

**Gap: No guardian-decline capability**
- **Prototype/spec expects:** `declined`/`expired` consent states with a decline event.
- **Backend:** Schema has `declined`/`revoked` statuses, but no method or route ever sets them — only `grant` and time-based `expire` exist.
- **Impact:** A guardian who refuses has no way to communicate that; prototype's "declined" banner state has nothing to bind to.
- **Action:** Add a decline transition/endpoint.
- **Priority:** Medium.

**Gap: `ProfileSnapshot` shape differs from spec**
- **Prototype/spec expects:** `{ firstName, riasec:{scores,...}, values:{normalized,...}, bigFive?, aptitude? }`.
- **Backend:** No `firstName` field at all; scores split into `rawScores`+`normalizedScores` (renamed); extra fields `closeScores`/`sourceResultIds`; `bigFive`/`aptitude` never populated.
- **Impact:** Code written against the spec's type won't match the real payload — affects Module 2/4 integration.
- **Action:** Reconcile spec type with actual schema (`packages/contracts/src/assessment.ts:172`); add `firstName` if needed downstream.
- **Priority:** Medium-High.

**Gap: `work-values-runs` not in Swagger**
- **Backend:** Fully implemented and working, but never registered in the OpenAPI doc — invisible in `/docs`.
- **Impact:** Low functional risk, but frontend devs won't discover it exists without reading source.
- **Action:** Add the missing `registry.registerPath()` call.
- **Priority:** Low-Medium.

**Gap: Big Five / Aptitude instruments unreachable**
- **Prototype/spec expects:** Launcher persona uses RIASEC+WIP+Big Five; Explorer has an aptitude sample. Both instrument codes exist in the schema.
- **Backend:** Only two run-starters exist (`startRun` → RIASEC, `startWorkValuesRun` → WIP, both hardcoded). No request field or route can start `mini_ipip` or `aptitude`.
- **Impact:** Launcher/Pathfinder's full instrument stack can't be built.
- **Action:** Add a way to start these runs (generic `instrumentCode` field, or dedicated routes).
- **Priority:** Medium.

**Gap: `mode:"photo"` accepted but ignored**
- **Prototype/spec expects:** Explorer photo-pair quiz should be selectable via the run-start request (schema has `mode: "text"|"photo"`).
- **Backend:** Instrument selection only looks at `segment`; `mode` has no effect — always resolves to text (`mini_ip_30`).
- **Impact:** Photo-quiz variant unreachable from a real frontend.
- **Action:** Wire `mode` into instrument selection, or remove the unused field.
- **Priority:** Medium.

**Gap: No bulk "flush" for offline/pending minor answers**
- **Prototype/spec expects:** IndexedDB-queued minor answers flushed in one sync once consent is granted; POSTs accept `Idempotency-Key`.
- **Backend:** Only single-item PUT endpoints exist; both correctly `409` for a minor pending consent. No bulk endpoint. `Idempotency-Key` header isn't read at all — idempotency instead comes from a DB-level `(run_id, item_id)` upsert (confirmed working, but a different mechanism).
- **Impact:** Not a hard blocker (N sequential replays work and are idempotent), but diverges from the documented "sync once" UX and header contract.
- **Action:** Document replay-based flush as the intended pattern, or add a bulk endpoint + real `Idempotency-Key` support.
- **Priority:** Low-Medium.

## 5. Missing Functionality

| Requirement | Suggested Fix | Priority |
|---|---|---|
| Create/authenticate a student identity | `POST /sessions/anonymous`, `/auth/otp/request`, `/auth/otp/verify` — or adopt Supabase Auth phone-OTP | High |
| Retrieve guardian OTP in dev/test | Dev-only `SmsProvider` that echoes the code | High |
| Guardian declines consent | Decline endpoint/link | Medium |
| Start Big Five / Aptitude runs | Generic `instrumentCode`, or `big-five-runs`/`aptitude-runs` routes | Medium |
| Select photo-pair variant | Wire `mode` into instrument selection | Medium |
| ~~Re-fetch a result/snapshot later~~ | ~~`GET /assessment-runs/{id}/result`, `GET /journey-sessions/{id}/profile-snapshot`~~ — **Done for the profile snapshot** via `GET /api/v1/profile/snapshot` (bearer-auth). A result-by-id `GET` (`/assessment-runs/{id}/result`) is still missing. | Medium |

## 6. Backend-Only APIs

- **`resume`** and **`GET journey-session`** — implemented, unused by the prototype (which has no pause/resume UI). Ahead of the prototype, not behind — **keep, integrate into frontend later** for resilience/reload UX.
- **`work-values-runs`** — works, just undocumented (see Gap 5). **Keep and document** — required for `ProfileSnapshot.values`.
- Recommendation endpoints (`/api/v1/recommendations/*`) exist in the same OpenAPI doc but belong to Module 2 — out of scope here.

Nothing found warrants deprecation.

## 7. Test Summary

- **Endpoints identified:** 17 (incl. 1 undocumented, 1 newly-implemented `GET /api/v1/profile/snapshot`)
- **Endpoints tested live:** 17
- **Working correctly:** 13
- **Working with mismatches:** 4 (identity precondition, undocumented route, snapshot shape, new profile-snapshot GET's mixed auth model/envelope naming)
- **Failed:** 0
- **Missing (no route at all):** 4 confirmed `404` (`sessions/anonymous`, `auth/otp/request`, `auth/otp/verify`, `results`), plus 2 unreachable-functionality gaps (Big Five/Aptitude start, guardian decline)
- **Needs Verification:** 1 — guardian-consent OTP grant path, and everything gated behind it for a minor (intake persistence, assessment run, snapshot). The *blocking* behavior (409s, wrong-code rejection) **was** live-verified; only the successful-grant path could not be, since the OTP is unrecoverable outside the server process.

## 8. Recommended Backlog

| Priority | Task | Related Endpoint(s) |
|---|---|---|
| High | Decide and implement identity-bootstrap (own OTP or Supabase Auth) | `/journey-sessions` |
| High | Dev-mode `SmsProvider` to surface guardian OTP | `/guardian-consents/verify` |
| Medium-High | Reconcile `ProfileSnapshot` shape with spec (`firstName`, score field names, `bigFive`/`aptitude`) | `/profile-snapshot` |
| Medium | Enable starting Big Five and Aptitude runs | `AssessmentService.startRun` |
| Medium | Wire `mode:"photo"` into instrument selection | `POST /assessment-runs` |
| Medium | Add guardian-decline transition | Guardian consent module |
| Low-Medium | Register `work-values-runs` in OpenAPI | `/work-values-runs` |
| Low-Medium | ~~Add `GET` routes to re-fetch result/snapshot~~ Add the remaining one (`/assessment-runs/{id}/result`) — snapshot GET now exists; align its envelope key (`profile`) with the create endpoint's (`snapshot`), and decide whether it should also accept `x-yuvanext-user-id` or fully move Module 1 to bearer auth | New/updated routes |
| Low | Real `Idempotency-Key` support, or update spec to match upsert behavior | `PUT /assessment-runs/{id}/responses` |

## 9. Final Assessment

**Supported today:** Once a `userId` exists, the adult path is fully working end-to-end — profile (with correct server-side segment/age-band derivation) → intake → RIASEC + WIP runs → paginated, idempotent responses → deterministic scoring → merged, versioned `ProfileSnapshot`. All live-verified, including error paths.

**Major gaps:** No identity-bootstrap endpoint exists, so the flow can't start for a real user without out-of-band access to Supabase Auth. The guardian-consent flow (first-class for every persona under 18) is blocked at the last step — the OTP needed to unlock it is unrecoverable outside the server.

**Must fix before frontend build:** (1) identity-bootstrap approach, (2) retrievable guardian OTP in dev, (3) `ProfileSnapshot` shape reconciled with spec. These block a working minor-persona demo and Module 2/4 integration.

**Usable as-is:** Adult/Launcher-and-up flow (profile → intake → RIASEC + WIP → scoring → snapshot), including its validation/error behavior.

**Needs team clarification:** Is the spec's original API contract (`/sessions/anonymous`, `/auth/otp/*`, `/results`) still the target and just unbuilt, or has the team since moved to Supabase Auth directly (spec needs updating — `/profile/snapshot` now uses real Supabase bearer auth, unlike the rest of Module 1)? Are Big Five/Aptitude/photo-mode in scope for this POC milestone or deferred?

---
*Live testing performed 2026-08-26 against the local dev server and the project's configured Supabase instance, using two throwaway test users created and fully deleted (including all dependent rows) for this validation.*

*Updated 2026-08-27 after a regression check against branch `poc/m1-m5-dev` — see [`module-1-2-regression-validation.md`](./module-1-2-regression-validation.md) for the full comparison. All previously-tested behavior was confirmed unchanged (including byte-identical scoring hashes); the only change was the new `GET /api/v1/profile/snapshot` endpoint reflected above.*

<br>

# Module 2 — Recommendations: Prototype vs Backend Validation

## 1. Objective

Check whether a frontend can build the Module 2 flow — career/stream/pathway/college/aid/plan recommendations, rendered as the prototype's 3-ring maps — using only the backend APIs that exist today.

**Method:** Read every Module 2 route/schema/service (`packages/recommendations`), then exercised the live API against the real Supabase database. Since Module 2 needs a `profileSnapshotId`, a fresh one was produced by re-running the Module 1 chain (throwaway adult test user, deleted afterward along with all dependent rows).

**Headline finding:** Like Module 1, the prototype makes **zero API calls** for recommendations — all career/college/scholarship/plan content is a hardcoded local table (`PROF`, 96 entries) rendered as bubble maps. So this section validates the backend against its own contract and the prototype's *conceptual* flow, not an observed payload. Unlike Module 1, the core recommendation engine works very well end-to-end once a real `profileSnapshotId` is supplied — but two concrete data-mapping bugs silently degrade its inputs, and (as of the original testing) the routes carried no authorization at all. *(Update from a later branch check: `GET /recommendations/{id}` now requires bearer auth + ownership; the 6 create endpoints and `/replay` are still open — see §4.)*

## 2. Recommendations Flow

Traced from the prototype's JS (`guidance()`, `cvExplore()`, `cvRings()`, `cvCollegeRings()`, `cvAid()`, `planFor()`, `cvReport()`) — again, no `fetch`/`XHR` anywhere:

1. **Explore map** — after the assessment reveal, bubbles for streams (Explorer), pathways (Pathfinder), or careers (Launcher), rendered from the local `PROF`/`G` tables.
2. **College map** (Pathfinder) — student picks a state from a 5-state chip list; prototype says colleges are filtered by state ("183 institutions, 5 states").
3. **Aid/scholarship bubble** (purple, shown only if `S.aid`/`wantsAid`) — named real-world scholarships with amount, window, link, eligibility.
4. **3-ring career map** — explicitly described as *"closest ring = strongest matches, middle = related, outer = discoveries"* — this maps directly onto Module 2's `ring: "inner"|"middle"|"outer"` field.
5. **90-day plan** (`planFor()`) — tapping a career bubble; the prototype's own fallback text says *"the real app generates your 90-day plan from your profile + this career's pathway"*.
6. **Report card** (`cvReport()`) — aggregates profile, RIASEC result, every card the student tapped (`S.sel`), and a summary sentence, entirely client-side, into one screen.
7. Selections (`sel()`) — every career/college/scholarship/pathway card tapped is pushed into a local `S.sel` array; nothing is sent anywhere.

## 3. Endpoint Validation

No actor/session header is required by any of the 6 create endpoints or `/replay` (confirmed — all calls below were made with no `x-yuvanext-user-id`). `GET /recommendations/{id}` is the one exception — see its row below and §4. Test profile: real `profileSnapshotId` from a fresh Module 1 run (Launcher, Tamil Nadu, RIASEC code `IAS`).

| Endpoint | Method | Purpose | Payload Tested | Result | Status |
|---|---|---|---|---|---|
| `/api/v1/recommendations/careers` | POST | Career recommendations | `{profileSnapshotId, limit:8}` | `200`; 18 ranked careers, each with `fitScore`, `explanation`, and `ring` (`inner`/`middle`/`outer`) — matches prototype's 3-ring map exactly | ✅ Working |
| `/api/v1/recommendations/streams` | POST | Stream recommendations (Explorer/Pathfinder) | `{profileSnapshotId, limit:5}` | `200`; ranked streams with `riasecOverlap`/`segmentFit`/`marksFit` | ✅ Working |
| `/api/v1/recommendations/pathways` | POST | Pathway recommendations | `{profileSnapshotId, limit:5}` | `200`; ranked pathways with `reachability`/`backupRouteFit` | ✅ Working |
| `/api/v1/recommendations/colleges` | POST | College recommendations | `{profileSnapshotId, selectedState:"Tamil Nadu", limit:5}` | `200`; ranked colleges with `stateFit`/`tierFit`; `disciplineAlignment:0` when no prior pathway ranking exists to derive a target discipline from | ⚠️ Works, needs correct call order |
| `/api/v1/recommendations/aid` | POST | Aid/scholarship recommendations | `{profileSnapshotId, limit:5}` | `200`; ranked schemes with `likelihoodLabel` (`likely`/`check_conditions`/`explore`) | ✅ Working |
| `/api/v1/recommendations/plans` | POST | 90-day plan generation | `{profileSnapshotId, target:{entityType:"career",...}}` and again with **no** `target` | `200` both times; with a target the plan is career-specific, without it falls back to a generic segment plan | ✅ Working |
| `/api/v1/recommendations/{id}` | GET | Fetch a stored, immutable recommendation set | Real id from the careers POST above | **Behavior changed on a later branch check:** now requires `Authorization: Bearer <token>` (`401` without one) and enforces per-user ownership of the underlying `profileSnapshotId` (`404`, not leaked, for a valid token that doesn't own it — confirmed with a cross-user test). Response is now wrapped as `{"recommendation": {...}}` (previously flat), and its `items[].itemId` values are bare UUIDs, unlike the kind-prefixed format (`career:<uuid>`) the POST create responses still use for the same data — see §4 | ⚠️ Changed (see §4) |
| `/api/v1/recommendations/{id}/replay` | POST | Recompute and hash-compare a stored set | Same id | `200`, `originalOutputHash === replayOutputHash`, `matches:true` — confirms deterministic scoring | ✅ Working |
| Any create endpoint | POST | Inline profile without a real snapshot | `{profile:{...fabricated profileSnapshotId...}}` | `404 recommendation_dependency_not_found` — the "provide `profile` inline" escape hatch still requires that id to exist in `assessment.profile_snapshots` at **save** time (see §4) | ⚠️ Mismatch |
| Any create endpoint | POST | Missing both `profile` and `profileSnapshotId` | `{}` | `400 invalid_recommendation_request` with a clear per-field issue | ✅ Working |
| Any create endpoint | POST | Re-POST with the same `recommendationId` + identical inputs | Same body twice | `200` both times, same content (idempotent return, not an error) | ✅ Working |
| `/api/v1/recommendations/{id}` | GET | Bad literal id (`{id}`) | — | `400`, friendly message telling the caller to use a real id | ✅ Working |

**Not tested live:** a `recommendationId` reused with genuinely different inputs, which the code path maps to `409 recommendation_already_exists` (read-verified in `recommendation-routes.ts`, not reproduced). Marked **Needs Verification**.

## 4. Gaps / Mismatches

**Gap: No authorization on any recommendation endpoint**
- **Prototype/spec expects:** Recommendations are personal — generated for and returned to the student who owns the profile.
- **Backend:** No actor header, no ownership check. Anyone who knows or guesses a `profileSnapshotId` UUID can generate/read/replay recommendations for it — confirmed live (no header sent on any call above, all succeeded).
- **Update (later branch check):** **Partially fixed.** `GET /api/v1/recommendations/{id}` now requires a bearer token and correctly enforces per-user ownership (live-verified: a different authenticated user gets `404`, not the data). The 6 create endpoints (`/careers`, `/streams`, etc.) and `POST /{id}/replay` are still fully open with no auth at all — confirmed unchanged.
- **Impact:** A `profileSnapshotId` is still effectively a bearer token for *generating* or *replaying* a student's recommendations, even though *reading* an already-generated one is now protected.
- **Action:** Extend the same bearer-auth + ownership check from the GET route to the create and replay routes.
- **Priority:** High (downgraded from "affects every route" to "affects create + replay only", but still High — generation is the more sensitive operation).

**Gap: `marksBand` is never actually extracted from a real profile snapshot**
- **Prototype/spec expects:** College/pathway feasibility scoring uses the student's marks band from intake.
- **Backend:** Module 1 stores every intake answer as `{ "<questionKey>": { "value": "<answer>" } }` (confirmed in `pg-assessment-repository.ts`). Module 2's `readFirstString()` for `marksBand`/`marks_band` only accepts a **plain string** value — it never unwraps the `{value: ...}` object. Result: `marksBand` silently resolves to `undefined` for every real snapshot, no matter what the student answered.
- **Impact:** Feasibility/marks-fit scoring for streams, pathways, and colleges is quietly running without marks data for every real student.
- **Action:** Fix `readFirstString`/`readNestedRecord` in `recommendation-data-source.ts` to unwrap `{value}` answer objects.
- **Priority:** High.

**Gap: `wantsAid` from Module 1 is dropped before reaching Module 2**
- **Prototype/spec expects:** The aid/scholarship bubble only appears if the student opted in (`wantsAid`); prototype gates it on `S.aid`.
- **Backend:** `assessment.profile_snapshots.wants_aid` is stored correctly by Module 1, but Module 2's `loadProfile()` SQL never selects that column — `ProfileSnapshotForRecommendationsSchema` has no `wantsAid` field at all.
- **Impact:** `/recommendations/aid` can't currently condition on whether the student actually wants aid guidance.
- **Action:** Add `wantsAid` to the recommendations profile schema and the `loadProfile` query.
- **Priority:** Medium.

**Gap: inline `profile` doesn't fully bypass the Module 1 dependency**
- **Prototype/spec expects (per schema):** Supplying `profile` inline should let a caller generate recommendations without a stored Module 1 snapshot.
- **Backend:** True for the profile *read*, but the store still requires `profile.profileSnapshotId` to match a real row in `assessment.profile_snapshots` (FK-enforced — confirmed live: a fabricated id → `404`). Every create endpoint therefore still depends on Module 1 having produced a real snapshot first.
- **Impact:** Minor documentation/expectation gap — not a functional blocker since the real integration path (via `profileSnapshotId`) works well.
- **Action:** Document that inline `profile` still needs a real, pre-existing snapshot id; or relax the store's FK requirement for genuinely ad-hoc/test profiles.
- **Priority:** Low.

**Gap: all recommendation kinds share one matching configuration**
- **Backend:** Only one row exists in `recommendation.matching_configurations` (`career_match`). `loadActiveConfig` silently falls back to it for every kind (`stream_rank`, `pathway_rank`, `college_rank`, `aid_rank`, `plan_generation`) when a dedicated one is missing — confirmed via direct query.
- **Impact:** Stream/pathway/college/aid/plan ranking currently runs on career-tuned weights; may be intentional for a POC, but is easy to miss.
- **Action:** Seed dedicated configuration rows per kind, or confirm the shared-config fallback is the intended POC behavior.
- **Priority:** Medium.

**Gap: response id field name changes between create and fetch**
- **Backend:** `POST .../careers` renames the id to `careerRecommendationId` (and `streamRecommendationId`, etc., per kind); the replay endpoint returns the generic `recommendationId` instead.
- **Impact:** A frontend has to know to read a different field name depending on whether the data came from create vs. fetch.
- **Action:** Either keep one field name everywhere, or document the rename explicitly.
- **Priority:** Low.

**Gap: `GET /recommendations/{id}` now disagrees with the create response on shape (new, later branch check)**
- **Backend:** Since the GET route moved to bearer auth (see the authorization gap above), it also changed shape: the whole set is now wrapped as `{"recommendation": {...}}` instead of the flat object the create endpoints and the old GET both used, and `items[].itemId` is now a bare UUID instead of the kind-prefixed format (`career:<uuid>`) the POST create response still returns for the exact same stored recommendation.
- **Impact:** A frontend reading a recommendation right after creating it (from the POST response) and later re-fetching it (via GET) has to handle two different envelopes and two different `itemId` formats for the same data.
- **Action:** Make the GET response's envelope and `itemId` format match the create response (or vice versa) — pick one shape.
- **Priority:** Medium.

**Gap: no backend equivalent of the prototype's "report card" or "selections"**
- **Prototype/spec expects:** `cvReport()` aggregates profile + results + every card the student tapped (`sel()`) into one summary view.
- **Backend:** No endpoint aggregates multiple recommendation sets into one document, and nothing persists which cards a student selected — `sel()` is local-only in the prototype today, so this isn't a regression, but a real product would need it server-side to survive a reload/device change.
- **Impact:** Frontend must assemble the report card from six separate recommendation responses itself; a student's picks don't survive a refresh unless something new stores them.
- **Action:** Decide if "selections" need a backend home (new small endpoint) or stay client-side (e.g., in `ProfileSnapshot`-adjacent local storage).
- **Priority:** Low-Medium.

## 5. Missing Functionality

| Requirement | Suggested Fix | Priority |
|---|---|---|
| ~~Verify a caller owns the `profileSnapshotId` they're requesting recommendations for~~ — **done for `GET /recommendations/{id}`** (bearer auth + ownership check, live-verified); still needed for the 6 create endpoints and `/replay` | Extend the same bearer-auth + ownership check to create/replay routes | High |
| Correctly read `marksBand` from real intake answers | Unwrap `{value}` in `recommendation-data-source.ts` | High |
| Propagate `wantsAid` into recommendation profile data | Add field to schema + `loadProfile` query | Medium |
| Per-kind matching configurations (stream/pathway/college/aid/plan) | Seed `recommendation.matching_configurations` rows beyond `career_match` | Medium |
| Persist a student's selected cards (for the report card) | New small "selections" endpoint, or confirm client-only is fine | Low-Medium |

## 6. Backend-Only APIs

- **`GET /recommendations/{id}` and `POST /recommendations/{id}/replay`** — both work well (deterministic replay confirmed), but the prototype has no "come back and view a past recommendation" or "verify reproducibility" UI at all. **Keep and integrate** — replay is exactly the kind of auditability the module's design goals call for. (Later branch check: `GET` now requires bearer auth + ownership — a frontend integrating this needs a real signed-in session, not just the id.)
- **`rings` on the career/pathway response** — a richer structure than the prototype needs (prototype just renders three visual rings from local data); the backend's `rings.inner/middle/outer` grouping is ready-made for that UI and should be **used directly** instead of the frontend re-bucketing `items` by `fitScore` itself.

Nothing found warrants deprecation.

## 7. Test Summary

- **Endpoints identified:** 8 (6 create + get + replay)
- **Endpoints tested live:** 8, all via a real Module 1 `profileSnapshotId`
- **Working correctly:** 5 (streams, pathways, aid, plans, replay)
- **Working with mismatches:** 3 (colleges — needs correct call order for discipline targeting; careers — fine functionally, but feeds on the `marksBand`/`wantsAid` gaps below; GET by id — now requires bearer auth + ownership, and disagrees with the create response's envelope/`itemId` format, all confirmed on a later branch check)
- **Failed:** 0
- **Missing:** 0 routes missing, but 2 profile fields (`marksBand` effectively, `wantsAid` entirely) never reach the engine due to mapping bugs
- **Needs Verification:** 1 — the `409 recommendation_already_exists` path for a reused id with different inputs (code-read only, not reproduced live)

## 8. Recommended Backlog

| Priority | Task | Related Endpoint(s) |
|---|---|---|
| High | ~~Add actor/ownership check to all recommendation routes~~ — done for `GET /{id}`; extend to the 6 create endpoints + `/replay` | `/recommendations/*` (create, replay) |
| High | Fix `marksBand` extraction to unwrap `{value}` intake answers | `recommendation-data-source.ts` |
| Medium | Propagate `wantsAid` from Module 1 into the recommendations profile | `loadProfile`, `ProfileSnapshotForRecommendationsSchema` |
| Medium | Seed per-kind matching configurations, or confirm shared fallback is intended | `recommendation.matching_configurations` |
| Medium | Make `GET /{id}`'s envelope/`itemId` format match the create response (new, later branch check) | `GET /recommendations/{id}` |
| Low-Medium | Decide where "selected cards" for the report card live | New endpoint or client-only |
| Low | Align id field naming between create response and replay | `/recommendations/*` |
| Low | Document that inline `profile` still needs a real snapshot row to persist | Recommendation route docs |

## 9. Final Assessment

**Supported today:** Once a real Module 1 `profileSnapshotId` exists, all six recommendation kinds (career, stream, pathway, college, aid, plan) work end-to-end, live-verified, including the 3-ring career map structure that matches the prototype's visual design directly, and deterministic replay (hash-verified). This is the strongest-working part of the backend seen so far.

**Major gaps:** Authorization is now only partially missing — `GET /recommendations/{id}` requires a bearer token and enforces ownership (fixed on a later branch check), but a `profileSnapshotId` alone is still enough to *generate* or *replay* a student's full recommendation set via the create endpoints and `/replay`. Two silent data-mapping bugs (`marksBand` never unwrapped, `wantsAid` never selected) mean real student intake answers aren't fully reaching the matching engine, even though the endpoints report success.

**Must fix before frontend build:** (1) extend authorization from the GET route to the create/replay routes, (2) the `marksBand` unwrap bug, (3) decide on `wantsAid` propagation. None of these block basic integration, but all three affect whether recommendations are correct/safe for real students.

**Usable as-is:** The full create → fetch → replay cycle for all six kinds, using a real `profileSnapshotId` from Module 1. Catalog data is present (32 careers, 25 colleges, 21 pathways, 23 aid schemes) but is demo-scale and partly placeholder — far short of the prototype's claimed 96 careers / 183 colleges, so recommendation variety will look thin against the prototype's presentation until real catalog data is loaded.

**Needs team clarification:** Is the single shared `career_match` configuration intentional for this POC, or should stream/pathway/college/aid/plan get their own weights? Does "selections"/report-card state need to persist server-side, or is client-only acceptable for this milestone?

---
*Live testing performed 2026-08-26 against the local dev server and the project's configured Supabase instance, using one throwaway test user (and a fresh Module 1 profile snapshot) created and fully deleted, including all dependent recommendation rows, for this validation.*

*Updated 2026-08-27 after a regression check against branch `poc/m1-m5-dev` — see [`module-1-2-regression-validation.md`](./module-1-2-regression-validation.md) for the full comparison. The 6 create endpoints, validation errors, and `/replay` were all confirmed unchanged (including a byte-identical `outputHash` on replay); the only change was `GET /recommendations/{id}` moving to bearer auth with ownership checks, reflected above.*

<br>

# Module 3 — Knowledge

Prototype's catalog content (careers, colleges, scholarships) is a hardcoded local table (`PROF`, 96 entries; scholarship cards with real names/URLs — see Module 2 §2), same as everywhere else — no wire payload to diff against. This section checks the backend's own catalog API against its contract and live data.

## Endpoint Validation

Public `GET /catalog/*` routes need no auth. `POST/GET /internal/catalog/imports*` require `Authorization: Bearer <INTERNAL_API_KEY>` — not configured in this environment (`INTERNAL_API_KEY` unset in `.env`), so both always reject.

| Endpoint | Method | Purpose | Payload Tested | Result | Status |
|---|---|---|---|---|---|
| `/api/v1/catalog/datasets` | GET | List published dataset versions | — | `200`; 25 datasets, including real O*NET (30.4) and Tamil Nadu DCE government sources (`trustLevel: authoritative_external`) | ✅ Working |
| `/api/v1/catalog/careers/search` | GET | Search published careers | `?limit=3` | `200`; cursor-paginated, real O*NET career titles/slugs | ✅ Working |
| `/api/v1/catalog/careers/{slug}` | GET | Get one published career | `accountants-and-auditors` | `200`, full detail. Bad slug → `404 CATALOG_ENTITY_NOT_FOUND` | ✅ Working |
| `/api/v1/catalog/streams` | GET | Approved stream mappings for a RIASEC pair | Missing `topTwo`/`segment` → `400`. `?topTwo=IA&segment=pathfinder` | `400` correctly on missing params. Valid request → `200` but `data: []` with caveat `"No approved stream mapping is available for this profile yet."` | ⚠️ Needs Verification (no coverage for this combo — unclear if that's a data gap or expected) |
| `/api/v1/catalog/colleges` | GET | Verified colleges | Missing `state` → `400`. `?state=Tamil Nadu&limit=3` | `400` correctly on missing required `state`. Valid request → `200`, real TN DCE government college directory | ✅ Working |
| `/api/v1/catalog/aid-schemes` | GET | Verified aid/scholarship schemes | `?limit=3` | `200`, real TN DCE scholarship data (e.g. Central Sector Scheme of Scholarship) | ✅ Working |
| `/api/v1/internal/catalog/imports` | POST | Import an allowlisted dataset | No auth, then fake bearer | `401 UNAUTHORIZED` both times — internal key not configured, so this is unusable regardless of caller | ⚠️ Blocked by env config |
| `/api/v1/internal/catalog/imports/{id}/report` | GET | Get an import audit report | No auth | `401 UNAUTHORIZED` | ⚠️ Blocked by env config |

## Gaps / Mismatches

**Issue: Catalog data is far richer than Module 2's testing suggested**
- **Previously found (Module 2):** Catalog data was demo-scale (32 careers, 25 colleges) and partly `[MOCK]`-labeled placeholder.
- **Now found (Module 3):** The same `knowledge.*` tables now hold real O*NET 30.4 career data (64 careers, 30 skill profiles) and real Tamil Nadu government college/scholarship directories (`authoritative_external` trust level) — a large, real data-loading effort happened between the two testing passes.
- **Impact:** Positive — recommendation quality and catalog richness are substantially better today than Module 2's original assessment reflects.
- **Action:** None; noted for context when reading Module 2's catalog-scale gap.
- **Priority:** Informational.

**Issue: Internal catalog-import endpoints are unusable in this environment**
- **Backend:** `INTERNAL_API_KEY` is unset, and `createInternalAuthorizer` always returns `false` when the expected key is undefined — so no caller, with any token, can ever pass.
- **Impact:** No way to trigger or audit a catalog import through the API today.
- **Action:** Set `INTERNAL_API_KEY` wherever this needs to run (CI/ops), or confirm imports are only ever run by an internal job with direct DB access.
- **Priority:** Low (expected for a POC environment, not a code defect).

## Missing Functionality

Nothing structurally missing — all catalog reads a frontend would need (careers, colleges, streams, aid schemes, datasets) exist and work.

## Test Summary

- **Endpoints identified:** 8 (6 public + 2 internal)
- **Endpoints tested live:** 8
- **Working correctly:** 5
- **Working with mismatches / needs verification:** 1 (`streams` — empty result for a plausible query)
- **Blocked by environment config:** 2 (internal import endpoints — `INTERNAL_API_KEY` unset)
- **Failed:** 0

<br>

# Module 4 — Counselor

Prototype's `sendFree()` free-chat function and safety-demo trigger (`safetyDemo()`, a self-harm-phrase message) map directly onto this module's conversation endpoints — again, the prototype itself makes no real API calls, so this validates the backend's own contract.

## Endpoint Validation

Every route requires `Authorization: Bearer <token>` (`resolveUserId`, real Supabase JWT resolution — confirmed consistent across all 10 routes).

| Endpoint | Method | Purpose | Payload Tested | Result | Status |
|---|---|---|---|---|---|
| `/api/v1/conversations` | POST | Start a conversation | `{}` with no auth → `400` (validation runs before auth). `{profileSnapshotId, idempotencyKey}` with bearer | `400 invalid_request` (empty body, no auth). Valid body + no auth → `401`. Valid body + bearer → `200`, `aiMode:"enabled"` (Gemini now configured — re-tested after `GEMINI_API_KEY`/`GEMINI_MODEL` were added to `.env`; was `"degraded"` in the original pass), welcome turn returned | ⚠️ Works, but validates before authenticating |
| `/api/v1/conversations/{id}/messages` | GET | Conversation history | Real `conversationId` | `200`, conversation + messages array | ✅ Working |
| `/api/v1/conversations/{id}/messages` | POST | Send a message | Safe: `{content:"What careers suit someone who likes solving science problems?", idempotencyKey}`. Unsafe: `{content:"I want to kill myself now, this is urgent", idempotencyKey}` | Both `200`, streamed as SSE (`event: assistant_turn`). Safe message → real Gemini reply. Unsafe message → the tier_1 approved safety copy instead, **not** the AI, and the DB confirms `safety_events.decision="triggered"`, `journey_states.is_safety_paused=true`, and a real `safety_private.handoffs` row created (`status:"alerted"`, full packet incl. last turns) | ✅ Working (fixed, see Gaps) |
| `/api/v1/exploration/events` | POST | Log a card view/select/compare | `{conversationId, recommendationId, recommendationItemId:null, action:"viewed", clientEventId}` | `200` (first attempt without `conversationId` → `400`, it's required despite not being obvious from the summary) | ✅ Working |
| `/api/v1/journey` | GET | Current journey state | — | `200`, `currentStep:1`, `currentStateKey:"welcome"` | ✅ Working |
| `/api/v1/journey/events` | POST | Log a journey event | `{eventType:"viewed_report", idempotencyKey}` | `200`, event + updated journey state | ✅ Working |
| `/api/v1/reports` | POST | Build an aggregated report ("report card") | `{profileSnapshotId, idempotencyKey}` | `200`; full payload merges profile, RIASEC scores, career recommendations, and exploration events into one document — `summaryMode:"template"` | ✅ Working |
| `/api/v1/reports/{id}` | GET | Fetch a report | Real id | `200` | ✅ Working |
| `/api/v1/reports/{id}/pdf` | POST | Render a private PDF asset | `{idempotencyKey}` | `200`; real Supabase Storage asset (`private-reports` bucket, `report.pdf`) | ✅ Working |
| `/api/v1/share-cards` | POST | Render a shareable card | `{reportId, idempotencyKey}` | `200`; real Supabase Storage asset (`share-cards` bucket, `share-card.svg`) | ✅ Working |

## Gaps / Mismatches

**Issue (fixed): sending a message was completely blocked**
- **Prototype expects:** Free-chat (`sendFree()`) works, including a safety-demo trigger phrase.
- **Original finding:** `POST /conversations/{id}/messages` hard-failed with `503` because the only safety-checker implementation wired up (`HttpSafetyChecker`) requires `SAFETY_SERVICE_URL`, which was unset — message generation is gated on a successful safety check, independent of AI provider status.
- **Root cause, once traced:** the POC spec (Module 5) describes safety as *"a synchronous pre-check port that Module 4 calls"* — not a network service. `HttpSafetyChecker` was making an HTTP call from the counselor module back to this exact same running server's own `/api/v1/internal/safety/check` endpoint, entirely unnecessarily, since both modules run in one process here.
- **Fix:** added `InProcessSafetyChecker` (`packages/counselor/src/infrastructure/in-process-safety-checker.ts`) — calls Module 5's safety operations directly, no HTTP, no `SAFETY_SERVICE_URL` needed. Wired into `apps/api/src/server.ts` as the default whenever the counselor and safety modules are composed into one server; `HttpSafetyChecker` remains available/exported for a genuinely separate future safety deployment.
- **Verified live, end-to-end, twice:** a safe message now reaches Gemini and returns a real reply. A message matching a tier_1 rule (e.g. containing "kill myself now" / "urgent") returns the approved safety copy instead of the AI, and — confirmed directly in the database — correctly sets `safety_events.decision="triggered"`, pauses the journey (`journey_states.is_safety_paused=true`), and creates a real handoff row (`safety_private.handoffs`, `status:"alerted"`) with a full packet including the flagged excerpt and recent turns.
- **Impact:** The core AI-counselor chat now works, and the prototype's safety-demo flow can be fully exercised end-to-end (see Module 5 — its "can't test the full flow" gap is resolved too).
- **Priority:** Resolved.

**Issue: Body validation runs before authentication on `POST /conversations`**
- **Backend:** An empty/invalid body with no `Authorization` header returns `400 invalid_request`, not `401` — the schema parse happens before the auth check, unlike `POST /conversations/{id}/messages` and others which check auth first.
- **Impact:** Minor information-disclosure/consistency issue (confirms the endpoint exists and validates shape before confirming identity); no functional risk.
- **Action:** Reorder to check auth first, for consistency with the rest of the module.
- **Priority:** Low.

## Missing Functionality

Nothing missing at the route level — every prototype-relevant capability (start conversation, send message, history, journey, exploration tracking, report + PDF + share card) has a corresponding, mostly-working endpoint. The blocker is environment configuration (safety/AI), not missing endpoints.

## Test Summary

- **Endpoints identified:** 10
- **Endpoints tested live:** 10
- **Working correctly:** 9 (message-sending fixed — see Gaps)
- **Working with mismatches:** 1 (`POST /conversations` — auth/validation ordering)
- **Failed:** 0
- **Needs Verification:** 0

<br>

# Module 5 — Safety, Staff, Privacy & Evaluation

The prototype's `safetyDemo()` function simulates a self-harm-phrase message and a counselor handoff; the `SESSIONS` seed table's `flags`/`consent` columns imply a staff review queue. Both map onto this module. Tested with the same bearer-token user as Module 4, plus a directly-granted `operations.staff_role_assignments` row (`role: counselor`) to reach the staff-only endpoints' success path — all test rows removed afterward, including reverting a seed handoff's status back to its original value after exercising the action endpoint on it.

## Endpoint Validation

`/internal/safety/check` and `/internal/handoffs` have **no auth at all**. `/staff/*` require bearer auth **and** an active staff role. `/privacy/*` require just bearer auth (any authenticated user, scoped to themselves). `/internal/evaluations/*` have no auth.

| Endpoint | Method | Purpose | Payload Tested | Result | Status |
|---|---|---|---|---|---|
| `/api/v1/internal/safety/check` | POST | Screen a persisted message | `{sourceEventId:<fabricated uuid>, message:"..."}`, no auth | `500 internal_error` (server log: *"Safety source message context was not found."*) | ❌ Bug — should be `404`, not `500` |
| `/api/v1/internal/handoffs` | POST | Create a handoff from a triggered safety event | `{idempotencyKey, sourceEventId:<fabricated uuid>}`, no auth | `500 internal_error` (server log: *"Handoff safety source was not found or did not require a handoff."*) | ❌ Bug — should be `404`, not `500` |
| `/api/v1/staff/sessions` | GET | Staff dashboard session list | No auth → `401`. Bearer, no staff role → `403`. Bearer + granted `counselor` role → `200` | All three confirmed live | ✅ Working |
| `/api/v1/staff/packets/{userId}` | GET | Privacy-restricted staff packet | Own test user's id, staff role granted | `200`, full packet (profile, intake, recommendations, flags) | ✅ Working |
| `/api/v1/staff/queue` | GET | Handoff queue | Staff role granted | `200`; real seed queue data (multiple tiers/statuses) | ✅ Working |
| `/api/v1/staff/queue/{id}/action` | POST | Mark a handoff actioned | `{idempotencyKey, actionCategory:"reviewed", note:"..."}` on a real seeded `queued` item | `200`; status updated to `actioned`, audit event recorded | ✅ Working |
| `/api/v1/privacy/export` | POST | Queue a data-export job | `{idempotencyKey}` | `202`, job `status:"queued"` + audit event | ✅ Working |
| `/api/v1/privacy/delete` | POST | Queue a data-delete job | `{idempotencyKey}` | `202`, job `status:"queued"` + audit event | ✅ Working |
| `/api/v1/privacy/jobs/{id}` | GET | Poll a privacy job | Real id | `200` | ✅ Working |
| `/api/v1/internal/evaluations/run` | POST | Run the Module 5 evaluation suite | `{idempotencyKey, runType:"manual"}`, no auth | `202`; 6 case results, all `passed`. `completedAt` (`2026-07-30`) predates `startedAt` (`2026-08-27`) | ⚠️ Works, but results look like a canned/synthetic fixture, not a real run |
| `/api/v1/internal/evaluations/{id}` | GET | Fetch a run result | Real id, then a random unknown id | `200` for real id. `404 evaluation_run_not_found` for unknown id (correct) | ✅ Working |

## Gaps / Mismatches

**Issue: `internal/safety/check` and `internal/handoffs` return `500` instead of `404` for an unresolvable source event**
- **Backend:** Both routes throw an unhandled `Error` with a clear, specific message (confirmed in server logs) when the `sourceEventId` doesn't resolve to a real persisted record — but the route handler doesn't catch it, so it falls through to the generic `500 internal_error` instead of a proper `404`.
- **Impact:** Callers (and monitoring) can't distinguish "bad/expired reference" from "the server is broken" — every malformed-but-plausible request looks like an outage.
- **Action:** Catch the domain "not found" error in both handlers and map it to `404`.
- **Priority:** Medium.

**Issue: `internal/safety/check` and `internal/handoffs` have no authorization at all**
- **Backend:** Unlike Module 3's internal catalog-import endpoints (which correctly gate behind `authorizeInternalRequest`, even if unconfigured) and Module 5's own `/staff/*`/`/privacy/*` routes (bearer + role-checked), these two routes check nothing — no bearer token, no internal API key, no check of any kind.
- **Impact:** Anyone who can reach the API can trigger a safety check or a handoff for an arbitrary `sourceEventId`, with no authentication trail beyond the (currently broken) 500/404 behavior above.
- **Action:** Apply the same internal-service authorization pattern used in Module 3, for consistency and to close the gap.
- **Priority:** Medium-High (inconsistent with every other "internal" surface in the codebase).

**Issue: Evaluation run results look synthetic**
- **Backend:** `completedAt` is dated *before* `startedAt` in the response, and the same 6 fixed case IDs/durations came back for a run just triggered — strongly suggesting `runSyntheticEvaluation`'s canned fixture data is being returned even though a real `evaluationRunRepository` is wired up (or the repository itself just persists+replays a fixture).
- **Impact:** The endpoint is real and persists to the database (confirmed — `GET` by the returned id worked, unknown ids correctly `404`), but it's unclear whether it's actually *evaluating* anything yet, or just recording a fixed result each time.
- **Action:** Confirm with the team whether this is intentional (POC placeholder) or an integration gap in wiring real evaluation logic behind the API.
- **Priority:** Low (doesn't block anything; worth a one-line confirmation).

## Missing Functionality

Nothing missing at the route level for Staff/Privacy/Evaluation. The intended end-to-end flow (a real conversation message → automatic safety check → handoff) was previously untestable because message-sending was blocked (Module 4's `503`) — now that the in-process safety fix is in, this **was tested live end-to-end**: a triggered message correctly paused the journey and produced a real, queued handoff (see Module 4's Gaps section for the confirmed detail). Nothing missing here anymore.

## Test Summary

- **Endpoints identified:** 11
- **Endpoints tested live:** 11
- **Working correctly:** 8
- **Working with mismatches:** 1 (evaluation run — looks synthetic)
- **Failed:** 2 (`internal/safety/check`, `internal/handoffs` — `500` instead of `404`)
- **Needs Verification:** 0 (both failures fully diagnosed via server logs)

<br>

## Overall Backlog (Modules 3–5)

| Priority | Task | Related Endpoint(s) |
|---|---|---|
| ~~High~~ Done | ~~Configure `SAFETY_SERVICE_URL`~~ — fixed properly instead: added `InProcessSafetyChecker` so the counselor calls Module 5's safety check directly, no URL needed | `POST /conversations/{id}/messages` |
| Medium-High | Add internal-service authorization to `/internal/safety/check` and `/internal/handoffs`, matching Module 3's pattern | `/internal/safety/check`, `/internal/handoffs` |
| Medium | Map the "source event not found" domain error to `404` instead of an unhandled `500` | `/internal/safety/check`, `/internal/handoffs` |
| Low | Reorder `POST /conversations` to check auth before body validation | `POST /conversations` |
| Low | Confirm whether `/internal/evaluations/run` is meant to return canned fixture data at this stage, or should run real checks | `/internal/evaluations/run` |
| Low | Set `INTERNAL_API_KEY` for any environment that needs to exercise catalog imports | `/internal/catalog/imports*` |

## Final Assessment

**Module 3 (Knowledge):** Solid and working. Public catalog endpoints are complete, correctly validated, and backed by real, high-quality data (O*NET, Tamil Nadu government sources) — a marked improvement over the smaller/placeholder catalog seen during Module 2's testing. Only the internal import endpoints are blocked, and only by environment configuration (no `INTERNAL_API_KEY`), not a defect.

**Module 4 (Counselor):** The supporting infrastructure — conversation lifecycle, journey tracking, exploration events, and especially the report/PDF/share-card pipeline — is fully built and working, including real Supabase Storage asset generation. An AI provider (Gemini) is configured and confirmed wired in (`aiMode:"enabled"`). Sending a message — the prototype's core chat experience — now works end-to-end: a safe message reaches Gemini and gets a real reply; an unsafe one is caught by the safety pre-check and returns the approved copy instead. Nothing left blocking this module.

**Module 5 (Safety, Staff, Privacy, Evaluation):** Staff, privacy, and evaluation surfaces all work correctly, including real role-based access control (verified both the 403-denied and 200-granted paths) and real audit-event recording. Safety's two "internal" endpoints still have a real bug (500 instead of 404 for a bad reference) and a real gap (no authorization at all, inconsistent with the rest of the codebase) — those remain open. But the full safety-detection-to-handoff flow the prototype demonstrates is no longer untestable: it was exercised end-to-end (a triggered chat message → paused journey → real queued handoff, confirmed in the database).

**Bottom line for Modules 3–5:** almost everything that's supposed to exist does exist and works correctly when tested directly, including the full chat + safety pipeline now that the counselor talks to Module 5 in-process instead of over an unconfigured HTTP URL. What's left is two real code issues in the two internal safety endpoints (§Gaps) and the `INTERNAL_API_KEY` config gap for Module 3's imports — nothing blocking a full demo anymore.

---
*Updated 2026-08-27 (identity/AI key): `GEMINI_API_KEY`/`GEMINI_MODEL` were added to `.env` and a boot-time `.env` validation bug was fixed. Re-tested `POST /conversations` live: `aiMode` now correctly reports `"enabled"` (was `"degraded"`).*

*Updated 2026-08-27 (safety architecture fix): traced why `SAFETY_SERVICE_URL` was required at all — the counselor was calling this same server's own Module 5 safety endpoint over HTTP, unnecessarily, since both run in one process. Added `InProcessSafetyChecker` (`packages/counselor/src/infrastructure/in-process-safety-checker.ts`), wired as the default in `apps/api/src/server.ts`; `HttpSafetyChecker` remains available for a genuinely separate future safety deployment. `SAFETY_SERVICE_URL` is no longer needed at all for this deployment shape. Re-verified live end-to-end: a safe message now gets a real Gemini reply; a tier_1-triggering message returns the approved safety copy and — confirmed directly in the database — pauses the journey and creates a real, queued handoff record. `pnpm typecheck` and the full test suite (`apps/api` + `packages/counselor`) pass. Module 4's endpoint table, its "message blocked" gap, Module 5's "can't test the full flow" note, and both modules' Final Assessments above are updated accordingly.*
