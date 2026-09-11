# Career Recommendation — Full Workflow, With a Real Worked Example

> **Status:** this documents the pipeline as it actually runs today — every call, payload, and
> number below (except where marked "illustrative") was pulled live from this project's own
> database and API on 2026-09-11, not invented. See `docs/poc/launcher-goal-based-recommendations.md`
> for the tab-gating rules this pipeline sits behind, and `packages/recommendations/src/domain/
> career-matching.ts` for the code every calculation below traces back to.

The real student used throughout: a **Pathfinder**, Class 11, Puducherry.
Profile snapshot id `2f1e8885-b1f2-4240-b56d-f4f50ba56fed`. Every number in Parts 1–4 is this
person's actual stored data; Part 4's full calculation is done for one of their real top
matches, **Web and Digital Interface Designers** (O\*NET `15-1255.00`), and cross-checked
against the live API response — the hand-computed and API numbers agree to 6 decimal places.

---

## Part 1 — RIASEC assessment produces a score

The student answers the IP-60 RIASEC quiz (`RiasecAssessmentPage`, submitting each answer via
`PUT /api/v1/assessment-runs/:runId/responses`). Once complete, `RiasecResultsPage` calls:

```
POST /api/v1/assessment-runs/:runId/score
```

This runs `scoreAssessmentResponses()` (`packages/assessment/src/domain/scoring.ts`) —
deterministic, no LLM involved:

1. **Sum each scale's answers** → `rawScores`.
2. **Normalize**: every scale ÷ the single highest raw score, so the top scale always reads
   100%.
3. **`resultCode`**: the top 3 scales, concatenated.
4. **Confidence**: `"soft"` if the 3rd- and 4th-place scores are within 1 point of each other
   (a genuinely close call between which trait is really 3rd) — used as an internal flag on
   the result, not shown to the student anywhere on `RiasecResultsPage`, which renders every
   scale's own bar regardless of confidence.

**This student's real result:**

| Scale | Raw score | Normalized (raw ÷ 33) |
|---|---:|---:|
| R — Realistic | 29 | 0.878788 |
| **I — Investigative** | **33** | **1.000000** |
| A — Artistic | 31 | 0.939394 |
| S — Social | 24 | 0.727273 |
| E — Enterprising | 29 | 0.878788 |
| C — Conventional | 30 | 0.909091 |

`resultCode = "IAC"` (top 3: I, A, C). 3rd place (C=30) and 4th place (R or E=29) differ by
only 1 → `confidence = "soft"`, `closeScores = true`.

This is exactly what `RiasecResultsPage` renders as the trait bars and the "IAC" coin — every
number on that screen is `normalizedScores × 100`, nothing hardcoded.

---

## Part 2 — Turning the result into a ProfileSnapshot

The RIASEC result alone isn't enough to recommend careers — segment, marks band, goal, and aid
preference all matter too. Clicking **"Explore Path"** on `RiasecResultsPage` triggers:

```
POST /api/v1/journey-sessions/:sessionId/assessment-runs/:runId/assessment-snapshot
```

→ `AssessmentService.buildAssessmentSnapshot()` (`packages/assessment/src/application/
assessment-service.ts`), which combines:

- the student's **segment** (`pathfinder`) and **profile** (state: `pondy`),
- their **intake answers** (`intake_summary_json`),
- their **RIASEC result** (`result_summary_json.riasec`, exactly the table above),

into one immutable row in `assessment.profile_snapshots`. Real stored intake for this student:

```json
{ "education_stage": { "value": "class_11" } }
```

*(Note the `{ "value": "..." }` wrapping — every intake answer is stored this way, not as a
bare string. A frontend reader has to unwrap `.value`; missing this was a real bug caught and
fixed during this build.)*

Response:

```json
{ "snapshot": {
    "snapshotId": "2f1e8885-b1f2-4240-b56d-f4f50ba56fed",
    "segment": "pathfinder",
    "wantsAid": false,
    "intakeSummary": { "education_stage": { "value": "class_11" } },
    "riasec": { "code": "IAC", "normalizedScores": { "...": "as above" } },
    "...": "profileVersion, algorithmVersion, createdAt, etc."
} }
```

The frontend stores `snapshotId` (`yuvanext.profileSnapshotId`) and a small gating-context
object — `{ segment, wantsAid, currentGoal }` — in `localStorage`, then navigates to
`/explore-path`. **This call is not idempotent** — the backend makes a fresh row every time —
so the frontend guards it with `getStoredProfileSnapshotId()` and only calls it once per run.

---

## Part 3 — Which tabs even get offered

`/explore-path` runs `tabsToShow(segment, intake)` — a pure function, ported line-for-line from
`docs/poc/launcher-goal-based-recommendations.md` Part 5 — before anything is fetched. For this
student (`pathfinder`, `wantsAid: false`):

```
{ career: true, stream: true, pathway: true, college: true, scholarship: false, plan: true }
```

Scholarship is the only tab hidden, because they didn't ask for aid help. Only **Career** has a
built screen right now, so it's the only clickable card — the rest render, disabled, for
segment/goal-logic visibility.

---

## Part 4 — The Career recommendation call, in full

Clicking the **Career** card navigates to `/explore-path/career`, which calls:

```
POST /api/v1/recommendations/careers
Content-Type: application/json

{ "profileSnapshotId": "2f1e8885-b1f2-4240-b56d-f4f50ba56fed" }
```

That's the *entire* request — the frontend sends nothing else. Everything the algorithm needs,
the backend loads itself (`recommendation-routes.ts` → `recommendation-data-source.ts`):

| Step | What it calls | What it gets |
|---|---|---|
| 1 | `dataSource.loadProfile(profileSnapshotId)` | The ProfileSnapshot row from Part 2, reshaped into `{ riasec, marksBand, segment, state }` |
| 2 | `dataSource.loadActiveConfig("career_match")` | The active weights row: `interest=0.5, values=0.2, feasibility=0.15, context=0.15, roundingScale=6` |
| 3 | `dataSource.loadCareers()` | **923** published careers, each with its own RIASEC vector (O\*NET-derived) |
| 4 | `dataSource.loadFeasibilityRules(config)` | 3 sparse rules (none apply to this career — see Part 6) |

Then `buildCareerRecommendationSet()` (`career-matching.ts`) runs the actual matching for
**every one of the 923 careers**. Below is that computation, done by hand, for one of them.

### 4.1 — The two RIASEC vectors going in

**Student** (from Part 1, but the raw scores are what matters here — see note below):
`R=29, I=33, A=31, S=24, E=29, C=30`

**Career** — Web and Digital Interface Designers, O\*NET `15-1255.00`, stored in
`knowledge.career_interest_profiles` (already ÷7-normalized from O\*NET's 1–7 scale at import
time):
`R=0.37000, I=0.69714, A=0.64000, S=0.31429, E=0.44714, C=0.62857`

### 4.2 — Normalize both vectors (min–max, per vector)

`normalizeRiasecVector()` scales each vector's own highest value to 1 and lowest to 0. Because
this is a *linear* rescale, running it on the student's raw scores or on their already-÷33
scores gives identical results — shown here on the raw scores for simpler arithmetic
(min=S=24, max=I=33, range=9):

| Letter | Student normalized | Career normalized (min=S=0.31429, max=I=0.69714, range=0.38285) |
|---|---:|---:|
| R | (29−24)/9 = **0.555556** | (0.370−0.314)/0.383 = **0.14550** |
| I | (33−24)/9 = **1.000000** | (0.697−0.314)/0.383 = **1.00000** |
| A | (31−24)/9 = **0.777778** | (0.640−0.314)/0.383 = **0.85078** |
| S | (24−24)/9 = **0.000000** | **0.00000** |
| E | (29−24)/9 = **0.555556** | (0.447−0.314)/0.383 = **0.34697** |
| C | (30−24)/9 = **0.666667** | (0.629−0.314)/0.383 = **0.82091** |

### 4.3 — Pearson correlation → `interestFit`

```
r = Σ(studentΔ · careerΔ) / (√Σ(studentΔ²) · √Σ(careerΔ²))
```

Means: student = 0.592593, career = 0.527360. Working the sums through those 6 pairs of
deltas:

```
Σ(studentΔ · careerΔ) = 0.607533
Σ(studentΔ²)           = 0.559672
Σ(careerΔ²)             = 0.870627

r = 0.607533 / (√0.559672 × √0.870627) = 0.607533 / 0.698046 = 0.870341

interestFit = (r + 1) / 2 = (0.870341 + 1) / 2 = 0.935171
```

**The live API returns `interestFit: 0.935171` for this exact pair** — matches the hand
calculation exactly. The `(r+1)/2` step exists purely to remap correlation's native `[-1, 1]`
range into the `[0, 1]` scale every other fit component uses.

### 4.4 — The other three components, for this specific pair

- **`valuesFit`** — **absent**. Neither this student nor (for most of the catalog) the career
  has a Work Values profile — no student has ever taken the WIP assessment through this app
  yet. When absent, weights don't just drop it — `resolveWeights()` folds `valuesWeight` (0.2)
  into `interestWeight`, making it **0.7** instead of 0.5. This is a designed, tested
  degradation path (`docs/data-model/module-2-recommendation-data-model.md`: *"Missing WIP
  redistributes weight exactly"*), not a bug.
- **`feasibility = 0.65`** — the flat default. `lookupFeasibility()` looks for a rule matching
  this student's `(segment, marksBand, routeId)`; this career's `routeIds` is the placeholder
  UUID (no `career_pathways` link exists for O\*NET-only careers yet — see Part 6), so no rule
  ever matches, and every career falls back to the middle reachability tier.
- **`contextBoost = 0`** — no counselor has set a priority boost on this career. No curation
  tooling exists yet either, so this is `0` for every career in the catalog right now.

### 4.5 — `fitScore`

```
fitScore = interestFit × 0.7  +  valuesFit × 0  +  feasibility × 0.15  +  contextBoost × 0.15
         = 0.935171 × 0.7     +  0              +  0.65 × 0.15         +  0
         = 0.654620                             +  0.097500
         = 0.752120
```

**The live API returns `fitScore: 0.75212`** — matches exactly. Rounded to whole percent for
display, that's the **75%** a student would see next to this career.

---

## Part 5 — Ranking and ring placement

Once every one of the 923 careers has a `fitScore`, `partitionCareerRings()` buckets the
top-scoring ones into three tiers — **not** simply "top N by score":

1. **Inner** (best fit, up to 4): careers whose own highest-scoring RIASEC letter
   (`topMatchingScales`) matches the student's own top letter.
2. **Middle** (up to 6 more): careers whose top letter is *adjacent* to the student's, on the
   R‑I‑A‑S‑E‑C hexagon.
3. **Outer** (up to 6 more): whatever's left, highest score first — with a rebalance step that
   guarantees at least one vocational-route career appears here if one exists among the
   candidates.

For this student, `topRiasecLetters()` picks **I** as their single top letter (raw score 33,
strictly highest). This career's own `topMatchingScales` is also `["I"]` (its I value, 0.69714,
is its clear highest) — same letter, so it lands in the **inner** ring. Confirmed directly from
the live response: `"ring": "inner"`.

---

## Part 6 — The real, complete API response (this student, this career, trimmed to one item)

```json
{
  "profileSnapshotId": "2f1e8885-b1f2-4240-b56d-f4f50ba56fed",
  "kind": "career",
  "algorithmVersion": "module-2-live-v1",
  "weightsVersion": "module-2-live-default-weights-v1",
  "items": [
    {
      "itemId": "career:f0000000-0000-4000-8000-000000000121",
      "entityType": "career",
      "entityId": "f0000000-0000-4000-8000-000000000121",
      "title": "Web and Digital Interface Designers",
      "rank": 1,
      "fitScore": 0.75212,
      "ring": "inner",
      "explanation": {
        "schemaVersion": 1,
        "interestFit": 0.935171,
        "feasibility": 0.65,
        "contextBoost": 0,
        "weights": { "interest": 0.7, "values": 0, "feasibility": 0.15, "context": 0.15 },
        "topMatchingScales": ["I"],
        "tradeoffKey": null
      },
      "entityDatasetVersion": "30.4-full-2026-09"
    }
  ],
  "rings": {
    "inner": ["4 careers, incl. the one above"],
    "middle": ["6 careers"],
    "outer": ["6 careers"]
  }
}
```

`inputHash`/`outputHash` (omitted above) are SHA-256 hashes of the request and the full result
— replaying the same input is guaranteed to reproduce the same output hash; that's what makes
this pipeline deterministic and auditable rather than an LLM call.

---

## Part 7 — What the student actually sees

`CareerPage` renders `CareerRingMap` (three zoomable rings — Top Matches/Strong Matches/Explore
More = inner/middle/outer) fed directly by the `rings` object above. Tapping the dot for this
career opens `CareerDetailSheet`, whose content is **segment-conditional**
(`docs/poc/launcher-goal-based-recommendations.md` Part 2):

- **Explorer** would see: "Web and Digital Interface Designers" only, no %, one line — *"This
  fits because you enjoy investigating and figuring things out"* (templated from
  `topMatchingScales[0] = "I"`).
- **This student (Pathfinder)** sees: the title, ring badge, **75%**, and the 4-part
  breakdown — Interest Fit 94%, Values Fit *(hidden — absent)*, Feasibility 65%, Boost 0% — plus
  the `I` scale badge.
- **Launcher** would see the same as Pathfinder — no salary/skills/next-role data is shown,
  because `CareerCatalogRecord` doesn't carry any; that was fictional example content in the
  design doc, not a real field this endpoint returns.

---

## Appendix — one-paragraph summary of the whole chain

Quiz answers → `scoreAssessmentResponses()` (raw → normalized → resultCode) → `POST
.../assessment-snapshot` freezes that result plus segment/intake into a `ProfileSnapshot` →
`tabsToShow()` decides which Explore Path cards render → `POST /recommendations/careers
{ profileSnapshotId }` loads that snapshot, the active weights config, all 923 careers, and
the feasibility rules → `scoreCareers()` computes `interestFit` (Pearson correlation between
two min-max-normalized RIASEC vectors), blends it with `valuesFit`/`feasibility`/`contextBoost`
into `fitScore` per career → `partitionCareerRings()` buckets the ranked list into inner/
middle/outer by RIASEC-letter adjacency → the frontend renders that directly as the ring map
and a segment-conditional detail sheet. Nothing in that chain is an LLM call — it's
deterministic, hash-verified, and (per this document) hand-checked against the live system to
6 decimal places.
