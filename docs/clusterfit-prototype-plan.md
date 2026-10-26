# Clusterfit Prototype: Pathfinder Instrument, Inputs, Scoring and Cluster Output

> Tracking doc: `docs/clusterfit-prototype-plan.md`. The checkboxes in §11 are the progress tracker.
> **Rev 4 (2026-10-20): the final scope for this iteration is §18, which overrides every earlier section.** The flow: existing auth → Gemini Live chat (Part A + Part E) → Parts B, C, D → cluster recommendation, and nothing more.
> **Rev 3 (2026-10-20): clusterfit is built as a removable plug-in (§17).** The first build (2026-10-18) was reverted; §16.4 records what it proved. **§17 overrides §9 and §16.2 where they differ; §16 overrides everything before it.**
> **Decisions and pre-implementation fixes are in §16, which overrides earlier sections where they differ.**
> **Rev 2:** scoring is done by the application, not by hand: §6 covers how, §7 covers the efficiency gain. The doc's rules and formulas are unchanged.
> **Naming:** this iteration is called **clusterfit** in code: package `@yuvapath/clusterfit`, DB schema `clusterfit`, routes `/api/v1/clusterfit/*`, pages `/clusterfit/*`, flag `CLUSTERFIT_ENABLED`. "Pathfinder" is only the name of the source questionnaire. It is *not* used in code, because `pathfinder` is already an existing student segment (explorer / pathfinder / launcher) in 96 repo files. Searching `clusterfit` finds every change from this iteration and nothing else.
> Sources: `docs/Pathfinder Career Exploration Questionnaire (Grades 9–12).docx` (facilitator spec) and `docs/Pathfinder Student Booklet.docx` (student-facing wording).
> **Scope:** everything from the student's first input to the **banded 12-cluster profile with counsellor flags**. Mapping clusters to careers, streams or colleges, and the "routes that fit your situation" report narrative, are **out of scope** (next phase).

---

## 1. Context

The current student journey is intake → RIASEC (`ip_60` / `mini_ip_30`, Likert, 6 letters) → Pearson match to careers. For the prototype we are moving to **Pathfinder**, a 5-part instrument built for Indian Grades 9–12 students from middle- and low-income families in city, semi-urban and rural settings. It suggests **broad career clusters, not single careers**, and it combines four independent signals:

- interest
- aptitude
- work style
- values

Of these, only interest, aptitude and work style enter the score; values guide the counselling conversation.

**Decisions taken:**
- **Parallel new flow.** New package, tables and routes. RIASEC code stays in the repo but leaves the student journey. Nothing is migrated or dropped destructively.
- **Part A comes from the existing Gemini Live voice chat** (built in a separate repo, to be integrated here). Its fields (`ConversationContext` v2) are used **unchanged** as the Part A fields (§4.1, §14).
- **English only** for Parts B–E. Item text is keyed by `locale` so Tamil can be added later without a schema change. The Part A chat follows the POC language rules, so the student may switch to Tamil; extracted values are English codes either way.

---

## 2. The instrument at a glance

| Part | Explores | Items | Response | Scored? | Grades 9–10 | Grades 11–12 | Digital delivery |
|---|---|---|---|---|---|---|---|
| **A. My situation** | Exposure, supports, constraints, aspirations | 18 fields (POC chat, §4.1) | Voice or typed conversation | ❌ Unscored (context and flags only) | Full | Full | **Gemini Live voice chat** with a confirm/edit card |
| **B. Interests** | Liking for 12 activity groups | 48 | Yes / Maybe-or-never-tried / No | ✅ Interest **I** (50%) | Full | Full | Item cards with 3 buttons |
| **C. Aptitude** | NUM, VER, LOG, MEC, PRA | 20 | MCQ, one right answer | ✅ Aptitude fit **A** (30%) | **10 items** (items 1–2 of each domain) | 20 items | MCQ cards, no timer, no right/wrong feedback |
| **D. Work style** | Social, Initiative, Order, Curiosity, Steadiness | 20 | 4-point "like me" scale | ✅ Style fit **S** (20%) | Full | Full | 4-option scale |
| **E. What matters** | Livelihood priorities | 1 task | Rank top 3 of 9 | ❌ Unscored (conversation guide) | Full | Full | Pick-and-rank cards |

- The paper version takes about 60 minutes. The doc recommends two sittings (A+B+E, then C+D). Digitally, every answer autosaves and the student can resume at any item.
- **Order: A first** (friendly tone, and it fixes the grade path for Part C) **→ B → C → D → E last** (E is the bridge to the counselling conversation).
- Framing shown to students: *"This is not an exam. There is no pass or fail."* Cluster and dimension codes are **never shown** to students.

---

## 3. What a "cluster" is

A cluster is a **broad field of work** identified by a **3-letter code** (the codes are letters, not digits: `SCI`, `ENG`…). Three properties set it apart from the RIASEC letters we use today:

1. **It is a field, not a personality type.** RIASEC says *what kind of person* you are (Realistic, Investigative…). A Pathfinder cluster says *which area of work* your signals point to.
2. **Every cluster spans several education levels.** Each one includes skilled-trade, diploma/ITI, degree and professional roles, so the student is never told there is only one route in. For example, ENG covers electrician → CNC operator → diploma engineer → B.Tech.
3. **Each cluster has an "earn-while-learn" or low-cost route.** This matters for the target population: ITI, polytechnic, apprenticeships, NIOS, Skill Council certificates.

| # (k) | Code | Cluster | Example roles (low → high) | Entry routes |
|---|---|---|---|---|
| 1 | SCI | Science and Research | Lab technician, quality tester, data analyst, scientist, science teacher | B.Sc., integrated M.Sc., lab-tech diplomas, research fellowships |
| 2 | ENG | Engineering and Manufacturing | Electrician, fitter, CNC operator, auto mechanic, diploma/degree engineer | ITI, polytechnic, B.Tech. (JEE/state), apprenticeships |
| 3 | DIG | Computing and Digital | IT support, data operator, web/app developer, digital marketer, cybersecurity | Short certified courses, BCA, B.Sc. CS, B.Tech., portfolio |
| 4 | HLT | Health, Wellness and Sports | ANM/GNM nurse, paramedic, pharmacist, physio, doctor, coach | Nursing/paramedic diplomas, B.Pharm., BPT, MBBS (NEET), sports quotas |
| 5 | AGR | Agriculture, Environment and Natural Resources | Progressive farmer, dairy/poultry entrepreneur, agri-extension officer, forest guard, solar tech | B.Sc. Agri, horticulture/vet diplomas, forestry, KVK training |
| 6 | BUS | Business, Finance and Enterprise | Shop owner, accountant, bank/insurance staff, sales manager, CA | B.Com., BBA, CA/CMA foundation, banking exams |
| 7 | EDU | Education and Social Impact | Teacher, trainer, anganwadi worker, counsellor, NGO officer | D.El.Ed., B.Ed., B.A./M.S.W., CTET/TET |
| 8 | GOV | Law, Governance and Public Service | Police, armed forces, forest/revenue services, lawyer, civil servant | NDA/defence, SSC/state exams, UPSC, CLAT |
| 9 | MED | Media, Communication and Languages | Reporter, radio/video producer, content writer, translator | BJMC, language degrees, community media, portfolio |
| 10 | ART | Arts, Design and Crafts | Artisan, tailor, fashion designer, animator, photographer, musician | Craft apprenticeships, design diplomas, UCEED/NID, B.F.A. |
| 11 | HOS | Hospitality, Tourism and Personal Services | Cook/chef, front office, tour guide, event planner, beautician | Skill Council certification, hotel management, tourism courses |
| 12 | CON | Construction, Infrastructure and Transport | Mason, plumber, surveyor, site supervisor, civil engineer, architect, driver | ITI, civil diploma, B.Arch./B.E. Civil, driving/logistics certification |

The order **k = 1…12 matters**, because it drives the Part B item layout (§4.2). Each cluster is defined by three things:
- its **4 interest items**
- **2 key aptitudes**
- **2 key work styles**

These come from the cluster matrix (§5.4). The doc calls the matrix *"a starting hypothesis… revise after the pilot"*, so it must be **config, not code** (§5.6).

---

## 4. Inputs, part by part

### 4.1 Part A: My situation, via Gemini Live (unscored)

**Purpose (doc):** tell the counsellor which routes are realistic, without ever asking about income. Every question is optional.

**The fields are exactly the POC's.** Part A collects the same fields, with the same names, types and allowed values, as the POC in `gemini-live-api-examples/gemini-live-genai-python-sdk`:
- the schema is `ConversationContext`, `schema_version "2"`, in `yuvapath.py`
- the 10 topics come from `prompt.revised.v3.md` §1, "What to understand"

The doc's A1–A8 are **not** asked as separate questions. The table shows which POC field covers which doc question.

**Already known, passed into the prompt and never asked** (POC placeholders, filled server-side from this repo's data):

| Placeholder | Filled from |
|---|---|
| `first_name` | `assessment.user_profiles.first_name` |
| `segment` | `user_profiles.segment`: `explorer` = Classes 9–10, `pathfinder` = Classes 11–12. Clusterfit is offered only to these two; `launcher` students don't get it, matching the POC's `SEGMENTS` |
| `state`, `city` | `user_profiles` |
| `already_answered` | Saved intake answers as `key=value`, e.g. `school_board=cbse` |

**Every field is a `ContextField`:** `{ status: known | unknown | declined | not_applicable, value, certainty: firm | tentative, evidence }`.

| # | Field | Allowed values (POC, unchanged) | POC topic | Covers doc question | Used by clusterfit |
|---|---|---|---|---|---|
| 1 | `support_needed` | Classes 9–10: `choose_stream`, `understand_strengths`, `study_plan`, `career_ideas`, `scholarship_or_aid`, `not_sure` · Classes 11–12: `stream_choice`, `career_shortlist`, `college_pathway`, `exam_plan`, `aid_options`, `not_sure` | 1 Help wanted | – | Counsellor context |
| 2 | `class_level` | `class_9`, `class_10`, `class_11`, `class_12`, `other` | 2 Studies | A1 (grade) | **Grade path for Part C** |
| 3 | `school_board` | `cbse`, `state_board`, `icse`, `other` | 2 Studies | – | Context |
| 4 | `current_stream` *(Classes 11–12)* | `science_pcm`, `science_pcb`, `commerce`, `arts_humanities`, `vocational`, `not_decided`, `other` | 2 Studies | A1 (stream) | Context |
| 5 | `stream_interest` *(Classes 9–10)* | list of: `science_pcm`, `science_pcb`, `commerce`, `arts_humanities`, `vocational`, `not_decided` | 2 Studies | A1 (stream in mind) | Context |
| 6 | `subjects_enjoyed` | `string[]` | 2 Studies | A1 (subjects, partly) | Context |
| 7 | `enjoyed_activities` | `string[]` | 3 Interests and strengths | – | Context |
| 8 | `strengths` | `string[]` (self-described) | 3 Interests and strengths | – | Context. **Never adjusts Part C aptitude** (POC rule §4.D) |
| 9 | `wants_to_improve` | `string[]` | 4 Growth and challenges | – | Context |
| 10 | `current_challenges` | `string[]` | 4 Growth and challenges | – | Context |
| 11 | `careers_mentioned` | `[{ name, stance: interested \| considering \| not_interested, reason }]` | 5 Aspirations | A4 | Context |
| 12 | `learning_routes` | `{ open_to: Route[], not_open_to: Route[] }`, where Route is one of `complete_class_12`, `degree`, `diploma`, `certificate_course`, `vocational_training`, `apprenticeship`, `work_after_school`, `undecided` | 6 Routes after school | A5 (partly) | Kept for route selection (next phase) |
| 13 | `location` | `{ study?: Place, work?: Place }`; Place = `{ preference: same_city \| same_state \| anywhere_in_india \| not_sure, strength: preference \| current_constraint \| firm_constraint }` | 7 Location | A7 | Kept for route selection |
| 14 | `earning` | `{ urgency: need \| wish, by_age?: 12–30, alongside_study?: needed \| wanted \| not_wanted }` | 8 Practical considerations | A5 ("earn early"), A6 ("paid work"), partly | Kept for route selection |
| 15 | `constraints` | list of: `fees`, `distance`, `family_expectations`, `entrance_exam`, `language`, `responsibilities`, `other` | 8 Practical considerations | A6 (partly, via `responsibilities`) | Context |
| 16 | `seeks_aid` | `yes`, `no` | 8 Practical considerations | – | Context |
| 17 | `marks` *(Classes 11–12 only)* | `{ low, high }` (0–100), converted to `marks_band` by code | 9 Marks | – | Context |
| 18 | `decision_confidence` | `very_confident`, `somewhat_confident`, `confused`, `starting_from_zero` | 10 Confidence | – | Context |
| – | `notes` (≤ 5), `open_questions` (≤ 3) | `string[]` | – | – | Counsellor context |
| – | `wellbeing_flag` | `boolean` | Wellbeing | – | **Safety flow only**, never counsellor notes or scoring (POC rule §4.D) |

**Also stored with each capture** (the POC's derived outputs, computed by code, not the model):
- `marks_band`
- `coverage`
- `missing_topics`
- `intake_preview`
- `warnings`

`intake_preview` is **stored only**. Clusterfit does not write it into `assessment.intake_answers`, so the existing intake data stays untouched (§9).

**Doc questions the POC fields don't cover:**

| Doc question | Effect in clusterfit | Fix when refining (no migration needed, §4.1a) |
|---|---|---|
| A1 **medium of instruction** | The language-caution flag (§8.2) has no medium, so it is reported as **`unknown`**. Indices and bands are unaffected | Add a `medium_of_instruction` field in the next schema version |
| A2 languages read comfortably | Not available | Add a field |
| A3 jobs known through people (exposure) | The counsellor doesn't see the exposure signal | Add a field |
| A8 who helps with decisions | Not available | Add a field |

**How Part A is captured** (full design in §14):
1. The student talks (voice or typing) with the guide, using the **POC prompt and tools unchanged**.
2. When the guide calls `end_discovery`, the browser sends the transcript to `POST /api/v1/clusterfit/sessions/:id/situation-captures` with `{ source: "live", transcript, idempotencyKey }`.
3. The **server** runs the POC extraction and stores its output raw, labelled `fieldSchemaVersion: "conversation-context-v2"`.
4. **Confirm card:** "Here's what I understood", with editable values. **`class_level` is required**, because it selects the Part C path. If it's `unknown` or `other`, the card asks for it. Everything else can stay blank.
5. **Fallback:** if the mic is blocked, the same chat works with typed text. If the student skips the chat entirely, the card works as a plain form (`source: "form"`).
6. **Prefill:** `already_answered` comes from the saved intake answers, so the guide doesn't re-ask them, as in the POC.

### 4.1a Saving Part A when the chat's fields aren't fixed

The chat's fields will change later: fields get added (e.g. medium of instruction), renamed or restructured. Saving them must never need a DB migration, and must never break scoring or old students' records. The design keeps **two layers**:

| Layer | What it is | Who defines it | Can change freely? |
|---|---|---|---|
| **Raw capture** | The POC extraction output exactly as produced, saved as JSON with a `field_schema_version` label (`conversation-context-v2` now) | The POC prompt and schema (§14) | ✅ Yes. Stored as `jsonb`, no column per field |
| **Canonical view** | The few fields the app reads in fixed names: `grade` and `medium`, plus the raw context passed through for the counsellor | This repo (`packages/contracts/src/clusterfit.ts`) | Only additively (new optional fields) |

**How a capture is saved:**
```
end_discovery → POST …/situation-captures { source: "live", transcript: [{speaker, text}, …], idempotencyKey }
  → 0. server runs the POC extraction → rawFields, labelled "conversation-context-v2"
       e.g. { "schema_version": "2", "class_level": {status:"known", value:"class_11", certainty:"firm", evidence:"…"},
              "current_stream": {…"science_pcb"…}, "careers_mentioned": {…}, … }
  → 1. light check on raw: must be a JSON object, ≤ 64 KB; unknown keys are KEPT, not rejected
  → 2. insert clusterfit.situation_captures (append-only, never edited)
  → 3. mapper "conversation-context-v2" → canonical:
         grade  ← class_level (class_9→9 … class_12→12; other/unknown → null, so the confirm card asks)
         medium ← null (no such field in v2, so language caution = "unknown")
         context ← every other field, passed through unchanged
  → 4. upsert clusterfit.situations (the current canonical view for the session)
  → 5. return canonical + missing + unmapped + warnings → confirm card
Student edits on the confirm card → PUT …/situation (saved on the canonical view, student_edited = true)
```

**What happens when you change the chat's fields later:**
1. Update the prompt and schema (§14.4–14.5), and bump the label to `conversation-context-v3`.
2. Add `mappers/conversation-context-v3.ts`. Keep the v2 mapper, so old captures still map.
3. **No migration, no scoring change.** Old rows keep their v2 raw JSON, and new rows store v3.
4. Optionally re-map old captures (`pnpm clusterfit:remap-situations`) if the canonical view gains a field.

If a capture arrives with an **unknown version**, it's still saved raw. The canonical view is left empty and the confirm card asks for the grade, so nothing is lost and the student isn't blocked.

**Why scoring stays safe:** the scorer reads only `canonical.grade` (grade path) and `canonical.medium` (language caution, `unknown` when null). It never reads raw fields.

**Showing Part A to the counsellor:**
- **Known POC fields** appear with labels from a small registry (`situation-fields.ts`, built from the POC's `TOPICS` wording).
- **Raw fields the registry doesn't know yet** appear under "Other details from the chat" as plain key/value pairs.
- `wellbeing_flag` is **not** shown in the counsellor notes; it goes to the safety flow (§14.7).

### 4.2 Part B: Interests (48 items, scored)

- **Student sees:** *"Imagine you could spend a free day doing each activity…"* Each item gets **Yes / Maybe (not sure or never tried) / No**.
- **Scoring:** Yes = 2, Maybe = 1, No = 0. "Never tried" scores as curiosity (1), so lack of exposure is never read as dislike.
- **Item → cluster:** the printed order cycles through the 12 clusters four times. **Cluster k owns items k, k+12, k+24 and k+36.** For example, SCI = B1, B13, B25, B37 and CON = B12, B24, B36, B48. Store `clusterCode` per item anyway, so the rule isn't a hidden assumption.
- **Item text:** use the Student Booklet wording, with the default (non-urban/rural-swapped) variants. The swap bank (B2, B6, B8, B19, B24, PRA2) is modelled as optional `variants: { urban, rural }` on the item but **not used** in the prototype.

### 4.3 Part C: Aptitude (20 items, scored)

- 5 domains × 4 items. Items 1–2 are easier (all grades). Items 3–4 are harder (★, **Grades 11–12 only**).
- **Grade path:** Grades 9–10 see 10 items (NUM1–2, VER1–2, LOG1–2, MEC1–2, PRA1–2). Grades 11–12 see all 20.
- No timer, no calculator, no penalty. Answers are never revealed, and the **answer key never reaches the client**: it lives only in the server-side scoring module.
- The student can skip items and come back; an unanswered item scores 0, exactly as on paper.

**Answer key (doc), checked by hand. One error found:**

| Domain | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| NUM | A ✔ | C ✔ | D ✔ | A ✔ |
| VER | B ✔ | D ✔ | C ✔ | A ✔ |
| LOG | C ✔ | A ✔ | C ✔ | D ✔ |
| MEC | D ✔ | B ✔ | A ✔ | **B ✘ → should be A** |
| PRA | D ✔ | A ✔ | C ✔ | B ✔ |

> ⚠️ **MEC4 (see-saw):** 30 kg × 2 m = 60 and 20 kg × 3 m = 60, so the see-saw **stays balanced = A**. The doc's key says B. We will use **A** and flag it to the instrument author. A unit test pins this.

### 4.4 Part D: Work style (20 items, scored)

- Responses: Not like me = 0, A little = 1, Mostly = 2, Very like me = 3.
- **Reverse-scored (R) items:** D11, D12, D13, D14, D15 (`v → 3 − v`). The booklet does not mark them, and neither does the UI.
- Dimension items:

| Dimension | Items |
|---|---|
| Social | D1, D6, D11R, D16 |
| Initiative | D2, D7, D12R, D17 |
| Order | D3, D8, D13R, D18 |
| Curiosity | D4, D9, D14R, D19 |
| Steadiness | D5, D10, D15R, D20 |

### 4.5 Part E: What matters (unscored)

- Nine cards; the student picks **exactly 3** and ranks them 1, 2, 3. Card keys: `steady_income`, `earn_early`, `stay_close_home`, `help_community`, `own_boss`, `learn_grow`, `respect`, `creative_freedom`, `travel`.
- Stored as `[{ value, rank }]`. It is **not** part of the cluster index. It is shown on the counsellor sheet and kept for the later route-selection phase (e.g. quick-entry diploma vs long degree, government vs self-employment).

### 4.6 Missing-answer policy (the doc doesn't define one for the digital flow)

The booklet says *"you may skip anything"*. Defaults:
- **B and D:** an item can be skipped. A cluster or dimension with **≥ 3 of 4 answered** is prorated (`sum × 4/answered`, rounded). With fewer than 3 answered it is marked `insufficient` and shown as "not enough answers" instead of a score.
- **C:** unanswered = 0 (paper parity). Part C is complete once every item in the grade path has been **seen**: answered or skipped with "Skip for now".
- **Scoring is blocked** until B and D are each ≥ 90% answered and C is complete. The UI shows which items are left.

---

## 5. Scoring methodology (the doc's rules, computed by the app)

The doc designs these rules to be done by hand on one paper worksheet. **The app keeps the rules exactly as written. It only replaces who does the arithmetic.** That keeps our results comparable with the doc's paper version and with its pilot plan. How the app runs these rules is in §6, and what that gains over paper is in §7.

### 5.1 Interest score I (0–8 per cluster)
`I[k] = Σ Part B value of items {k, k+12, k+24, k+36}`, with each value in {0, 1, 2}.

### 5.2 Aptitude domain scores (0–4 per domain)
`apt[d] = number of correct answers in domain d`.
**Grades 9–10:** `apt[d] = correct(items 1–2) × 2`, so these students can only score 0, 2 or 4.

### 5.3 Work-style dimension points (0–2)
`raw[dim] = Σ 4 items (after reversing R items)`, which ranges 0–12. Convert to points: **0–4 → Low (0), 5–8 → Mid (1), 9–12 → High (2)**.

### 5.4 Cluster matrix → A (0–8) and S (0–4)

| Cluster | Key aptitudes → A = sum | Key work styles → S = sum of points |
|---|---|---|
| SCI | LOG + NUM | Curiosity + Steadiness |
| ENG | MEC + NUM | Curiosity + Order |
| DIG | LOG + PRA | Curiosity + Order |
| HLT | PRA + VER | Social + Steadiness |
| AGR | PRA + MEC | Steadiness + Initiative |
| BUS | NUM + PRA | Initiative + Social |
| EDU | VER + PRA | Social + Curiosity |
| GOV | VER + LOG | Initiative + Order |
| MED | VER + PRA | Curiosity + Social |
| ART | MEC + VER | Curiosity + Initiative |
| HOS | PRA + VER | Social + Order |
| CON | MEC + NUM | Order + Steadiness |

### 5.5 Cluster index (0–100)

```
index[k] = 6.25 × I[k]  +  3.75 × A[k]  +  5 × S[k]
           (max 50 = 50%)   (max 30 = 30%)   (max 20 = 20%)
```

The multipliers scale each signal to its weight: 8 × 6.25 = 50, 8 × 3.75 = 30 and 4 × 5 = 20. Indices are stored to 2 decimals (they can be fractional, e.g. 43.75) and **displayed rounded**.

**Worked example 1 (doc, Grade 11):** SCI has I = 7; LOG 3 + NUM 4 gives A = 7; Curiosity High (2) + Steadiness Mid (1) gives S = 3. Index = 43.75 + 26.25 + 15 = **85 → Strong signal**.

**Worked example 2 (Grade 9, DIG):**
- Part B: Yes, Yes, Maybe, Maybe gives I = 6.
- Part C: LOG 2/2 correct ×2 = 4 and PRA 1/2 ×2 = 2, so A = 6.
- Part D: Curiosity raw 10 → 2 and Order raw 7 → 1, so S = 3.
- Index = 37.5 + 22.5 + 15 = **75 → Strong**.

**Worked example 3 (flag):** ENG has I = 7, but MEC 1 + NUM 2 gives A = 3. That fires **"Interested, skills to build"** (I ≥ 6 and A ≤ 4).

### 5.6 Scoring config (versioned, because the pilot will revise it)

`CLUSTERFIT_SCORING_V1` holds:
- the weights (6.25 / 3.75 / 5)
- the work-style cut-offs (4 / 8)
- the band cut-offs (65 / 50)
- the max strong clusters (3)
- the flat-profile gap (10)
- the flag thresholds
- the cluster matrix
- the answer key

Every result row stores `scoring_version` and an `input_hash` (the existing `assessment_results` uses the same pattern). Raw responses are kept so all students can be **re-scored** after the pilot without retesting.

---

## 6. How the app scores it (replacing the paper worksheet)

### 6.1 Paper steps → app steps

| Paper worksheet step (doc) | Who does it on paper | What the app does instead |
|---|---|---|
| Hide the cluster and dimension codes and the answer key from students | Facilitator prints a separate booklet | The server never sends `clusterCode`, `dimension`, `isReverse` or the answer key to the browser. The item DTO has only `itemKey`, `text`, `options` |
| Give Grades 9–10 only items 1–2 of each Part C domain | Facilitator remembers which booklet pages to skip | `grade-path.ts` picks the item set from the canonical `grade` (POC `class_level`) when the session starts. The API rejects answers to items outside the student's grade path |
| Mark Yes/Maybe/No as 2/1/0 | Facilitator, per item | The answer is stored as its value when it is saved |
| Mark Part C right/wrong with the key | Facilitator, against the key | The scorer compares each answer with the server-side key |
| Reverse D11–D15 | Facilitator, per item | Applied by the scorer from item metadata. The stored answer stays as the student gave it |
| Sum into 12 interest, 5 aptitude and 5 style scores; convert style to Low/Mid/High | Facilitator, ~100 additions and lookups | Pure function `scoreClusterfit()` |
| Look up the cluster matrix to get A and S | Facilitator, 24 lookups | The matrix comes from the versioned config (§5.6) |
| Compute 12 indices (decimals) | Facilitator, 36 multiplications | Same function. Results are stored to 2 decimals |
| Apply bands, the max-3 rule and the fallback | Facilitator | `bands.ts` |
| Check the 4 flag rules | Facilitator, across all 12 clusters | `flags.ts` |
| Write the one-page report | Counsellor | The student and counsellor views render from `ClusterfitResult` straight away (§8.3) |

### 6.2 Scoring pipeline

```
Student answers an item
  → PUT /clusterfit/sessions/:id/responses   (validate item ∈ grade path, value ∈ allowed set)
  → upsert clusterfit.responses               (idempotent; last answer wins; autosave)
  → update part_status_json                   (answered / total per part)

Part E is submitted or skipped, and B, C and D meet the §4.6 completeness rule
  → service auto-calls scoreClusterfit()      (no "Score" button; POST /score stays for re-runs)
      until then the student can go back and change any B–D answer (decision §16.1)
      inputs : all responses + gradePath + canonical.medium + CLUSTERFIT_SCORING_V1
      output : ClusterfitResult (§8.3) + per-cluster breakdown
  → input_hash = hash(inputs + scoringVersion)
      same hash already stored → reuse the stored result (no duplicate rows)
  → insert clusterfit.results (result_json) + clusterfit.result_clusters (12 rows)
  → the student goes to /clusterfit/results; the counsellor sheet is ready at the same moment
```

- **Server-side only.** Scoring never runs in the browser, so neither the key nor the weights can be seen or changed by a student.
- **Pure and deterministic.** `scoreClusterfit()` does no I/O, so the same inputs always give the same output. It runs in under a millisecond: the whole instrument is about 100 numbers.
- **Per-cluster rows** (`result_clusters`: session_id, cluster_code, i, a, s, index, band, flags) make counsellor and pilot queries plain SQL. For example: "students with Strong HLT", or "how many hidden-strength flags per school".

### 6.3 Showing why a cluster scored what it did

The worksheet showed the counsellor how each score was reached. The app keeps that by storing a **breakdown** for each cluster:
- the 4 Part B answers
- the 2 key aptitude scores, with how many were attempted and how many correct
- the 2 key work-style dimensions, with raw score and level
- the arithmetic: 6.25×I + 3.75×A + 5×S

The counsellor sheet shows this when a cluster row is expanded.

### 6.4 Built-in safeguards that paper doesn't have

- **Config check at startup.** The config fails fast unless:
  - every cluster has 4 interest items, 2 aptitudes and 2 styles
  - all 48, 20 and 20 items map exactly once
  - the answer key has 20 entries
  - the weights × max scores add to exactly 100
  - the cut-offs are in order
- **Answer-key tests** work out each Part C answer from the arithmetic. The MEC4 error (§4.3) is exactly the kind of mistake that would quietly mis-score every paper booklet.
- **Answer-quality notes (counsellor-only; never affect the score).** The app flags:
  - the same answer on every Part B item (for example all Yes)
  - Part D answered impossibly fast; the existing `latency_ms` pattern from `assessment_responses` gives the timing
  - Part C with more than 50% left blank

  On paper, these patterns are only caught if the facilitator happens to notice.

### 6.5 Re-scoring and pilot calibration

- `pnpm clusterfit:rescore --version <v>` re-runs every finished session with a new config (new weights, cut-offs or matrix). It writes new `results` rows and keeps the old ones, so v1 and v2 can be compared side by side.
- **The doc's pilot analysis (§"Pilot and validation plan") is computed from the stored answers.** A script or SQL views export:
  - item difficulty (% correct, target 30–80%)
  - Cronbach's α per cluster, domain and dimension
  - the spread of index scores and band counts
  - item fairness across groups (DIF), split by gender, location and school type

  Fairness splits need those demographics. `user_profiles` has district and city but **no gender or school type**, so these must be added as optional fields if the pilot needs them (open issue §10.9).

### 6.6 Keeping the doc's paper-first, low-resource intent

The doc is deliberately built to work on paper with no internet. The app version adds a dependency on a device and a connection. Mitigations:
- **Offline-tolerant answering.** Answers queue in the browser when the connection drops and sync when it returns. Answers are idempotent, so a repeated send does no harm.
- **Typed fallback** for Part A when voice or bandwidth is poor (§4.1).
- **Read-aloud** for Parts B and D using browser text-to-speech, matching the doc's "read aloud for low literacy" administration note. Optional for the prototype.
- **Facilitator data-entry mode (post-prototype).** A facilitator types in the answers from a paper booklet, and the **same scorer** produces the same result. Paper administration stays valid, and only the scoring moves into the app.

---

## 7. Efficiency: paper vs application scoring

### 7.1 Manual work replaced, per student (counted from the doc's rules)

| Step | Manual operations (Grades 11–12) |
|---|---|
| Part B: read 48 marks, convert to 0/1/2, add into 12 clusters | ~48 conversions + 36 additions |
| Part C: check 20 answers against the key, add into 5 domains (Grades 9–10: 10 answers, ×2) | ~20 checks + 15 additions |
| Part D: read 20 marks, reverse 5, add into 5 dimensions, 5 band lookups | ~20 + 5 + 15 + 5 |
| Cluster matrix: 12 × (2 aptitude + 2 style lookups and additions) | ~48 |
| Index: 12 × (3 multiplications + 2 additions), with decimals | ~60 |
| Bands, max-3 rule, fallback, 4 flag rules × 12 clusters | ~40 comparisons |
| **Total** | **≈ 310 manual steps per student** (84 + 35 + 45 + 48 + 60 + 40) |

The app does all of these in **under 1 ms** on the server, and the result is ready the moment the student submits.

### 7.2 Side-by-side comparison

All time figures are **our estimates**, not measurements. The pilot should time a sample of hand-scored booklets to confirm them.

| Aspect | Paper and hand scoring | Application scoring |
|---|---|---|
| Scoring time per student | ~15–25 min for a trained facilitator (est.) | < 1 ms, automatic |
| Class of 40 | ~10–17 facilitator-hours (est.) | 0 facilitator-hours |
| Time to results | Days (collect → score → write report → meet) | Immediate. The counselling conversation can happen the same day |
| Arithmetic and clerical errors | Possible at each of the ~310 steps; varies by facilitator and fatigue | None once the unit tests pass. A systematic error (like MEC4) is fixed once for everyone |
| Consistency across facilitators | Depends on training (the doc requires a one-day orientation) | Identical for every student |
| Grade path, reversals, ×2 rule | Facilitator must remember them | Enforced by code |
| Skipped answers | Handled ad hoc | One documented rule (§4.6) |
| Answer key security | A printed key can leak | Server-side only |
| Re-scoring after the pilot changes weights or cut-offs | Re-score every booklet by hand | One command, minutes for thousands of students |
| Pilot data entry (600–1,000 students × ~110 answers) | ~66k–110k values typed by hand | Captured as students answer |
| Reliability, item difficulty and fairness analysis | Needs data entry first | Script or SQL over stored data |
| Explainability | The worksheet | Stored per-cluster breakdown (§6.3) |
| Answer-quality checks (patterns, speed) | Only if noticed | Automatic notes for the counsellor (§6.4) |
| Infrastructure needed | Pencil and booklet | Device and connection, offset by the §6.6 mitigations |

### 7.3 What doesn't change

- **Validity.** The app's results are only as valid as the instrument itself. Weights, cut-offs and the matrix are still a hypothesis, as the doc says, until the pilot calibrates them. Faster scoring doesn't make the bands more accurate. It makes **calibration** cheap and fast (§6.5).
- **Student time.** Answering still takes about 60 minutes, plus the Part A voice chat. The savings are in scoring, reporting and analysis, not in the student's time.
- **The counsellor's role.** The doc's caution that *"the student's own sense outranks the instrument"* still applies. The app adds a *"Does this sound like you?"* answer (Yes / Partly / No) on each shown cluster. It is stored and fed back into pilot validation, but it **does not change the index**.

---

## 8. Output: how clusters are suggested

### 8.1 Bands (provisional; to be set after the pilot)

| Band | Rule | Student sees | Counsellor sees |
|---|---|---|---|
| **Strong signal** | index ≥ 65, **max 3 shown** (highest first) | "Several things in your answers point here." | ✅ |
| **Worth exploring** | 50–64, plus any extra ≥ 65 clusters beyond the top 3 | "Try this out before deciding." Show 2–3 | ✅ |
| **Low signal for now** | < 50 | ❌ hidden | ✅ full list |
| **Fallback** | no cluster ≥ 65 | Top 3 shown as **"strongest signals so far"**, with "your profile is still open" | ✅ |

- **Never** a rank list, a percentage or a "your career is X". The student page shows band labels and cluster names, not numbers.
- **Tie-break** (equal indices): higher I, then higher A, then the cluster order k.

### 8.2 Counsellor flags (computed per cluster or per profile)

| Flag | Rule | Counsellor action |
|---|---|---|
| **Interested, skills to build** | per cluster: I ≥ 6 and A ≤ 4 | Treat it as a build path: name the skill gap, the practice that closes it and a bridge route. Don't discourage. |
| **Hidden strength** | per cluster: A ≥ 7 and I ≤ 3 | Arrange exposure (a visit, talk or small task) before concluding there's no interest |
| **Flat profile** | profile: top index − 5th index < 10 | Interests are not formed yet or exposure is thin. Widen exposure and retake next year |
| **Language caution** | profile: VER is the lowest aptitude domain (**ties count as lowest**; our reading of the doc, flagged in §10) and the canonical `medium` ≠ the test language (`english`). **The POC v2 fields don't collect medium, so this flag is `unknown` until a later schema version adds it** (§4.1) | Read VER as a test-language effect, not a verbal-ability weakness |

Flags are **counsellor-only**. The language-caution flag is the one hard dependency of scoring on Part A (`medium`), so when medium is missing (always, with the POC v2 fields) the flag is reported as `unknown`, not false.

### 8.3 Result payload (one object, two views)

```ts
ClusterfitResult {
  sessionId, scoringVersion, gradePath: "9_10" | "11_12", computedAt, inputHash,
  clusters: Array<{ code, name, I, A, S, index, band, flags[], insufficient?,
                    breakdown: { interestItems, aptitudes, styles } }>,  // all 12; breakdown per §6.3
  qualityNotes: string[],   // §6.4, counsellor only
  selfCheck?: Record<code, "yes" | "partly" | "no">,  // student's "Does this sound like you?"; not scored
  aptitude: Record<"NUM"|"VER"|"LOG"|"MEC"|"PRA", { correct, attempted, score }>,
  workStyle: Record<"social"|"initiative"|"order"|"curiosity"|"steadiness", { raw, level, points }>,
  profileFlags: { flatProfile: boolean, languageCaution: boolean | "unknown" },
  presentation: { strong: code[], explore: code[], fallbackUsed: boolean },
  situation: PartA,        // passthrough, counsellor view only
  values: [{ value, rank }] // passthrough, counsellor view only
}
```

- **Student view** (`/clusterfit/results`): up to 3 strong clusters plus 2–3 worth exploring, each with its example roles across levels (from the cluster table). It ends with *"Does this sound like you?"*, because the doc says the student's own sense outranks the instrument.
- **Counsellor view** (in `CounselorStudentReportPage`): all 12 indices with the I/A/S breakdown, the aptitude and work-style tables, flags with their action text, Part A answers (and the transcript if stored), Part E ranking, and the cautions from the doc (exposure vs family trade, no gender or caste steering, privacy, retake yearly).

---

## 9. Implementation shape (repo-specific)

> **Rev 3:** clusterfit connects to the app only through the extension points in **§17.2**, and the file layout is §17.3. The table below describes what each layer *contains*. Where it names a shared file (`router.tsx`, `CounselorStudentReportPage`, `create-runtime-app.ts`), read it as "through the matching §17.2 extension point".

Inside the package, follow the existing module pattern (`domain / application / infrastructure / http`, with real and fixture runtimes), wired by the plug-in's own `plugin.ts`.

| Layer | Location | Contents |
|---|---|---|
| Contracts | `packages/contracts/src/clusterfit.ts` | zod: Part A schema, item/response DTOs, `ClusterfitResult`, route request/response schemas (OpenAPI via the existing zod-to-openapi setup) |
| Content | `packages/clusterfit/src/content/v1/` | `clusters.ts`, `interest-items.ts` (B1–B48), `aptitude-items.ts` (C, key kept server-side), `work-style-items.ts`, `values-cards.ts`. Static, versioned TS: the code is the item bank for the prototype (no seed script needed) |
| Domain | `packages/clusterfit/src/domain/` | `scoring.ts` (pure `scoreClusterfit(responses, gradePath, situation, config)`), `bands.ts`, `flags.ts`, `quality-notes.ts`, `scoring-config.ts` (`CLUSTERFIT_SCORING_V1` + startup validator), `grade-path.ts`, `input-hash.ts` |
| Application | `packages/clusterfit/src/application/clusterfit-service.ts` | start/resume session, next items per part (grade-path filtered, no key or codes in the DTO), save response (validated, idempotent), save situation, save values, **auto-score on completion**, get result (student/counsellor projection), save self-check |
| Scripts | `packages/clusterfit/scripts/` | `rescore.ts` (`pnpm clusterfit:rescore --version <v>`), `pilot-analytics.ts` (CSV export: item p-values, Cronbach's α, index spread, band counts, DIF splits) |
| Infra | `packages/clusterfit/src/infrastructure/pg-clusterfit-repository.ts` | raw `pg`, matching `pg-assessment-repository.ts` |
| HTTP | `packages/clusterfit/src/http/clusterfit-routes.ts` | `POST /api/v1/clusterfit/sessions`, `GET …/sessions/:id` (progress), `GET …/sessions/:id/parts/:part/items`, `PUT …/responses`, `POST …/live-token`, `POST …/situation/coverage`, `POST …/situation/wellbeing`, `POST …/situation-captures`, `PUT …/situation`, `PUT …/values`, `POST …/score`, `GET …/result`, plus `POST /api/v1/clusterfit/dev/extract` (dev only). Part A routes are detailed in §14 |
| DB | `supabase/migrations/2026MMDDHHMMSS_clusterfit_prototype.sql` | new schema **`clusterfit`**, 8 tables. Full DDL in §9.1 |
| Part A mapping | `packages/clusterfit/src/situation/` | `mappers/conversation-context-v2.ts` (raw → canonical), mapper registry by `field_schema_version`, `situation-fields.ts` (labels for the counsellor view) |
| Web | `apps/web/src/features/clusterfit/` | `SituationChatPage` (ported Live client + confirm card), `InterestsPage`, `AptitudePage`, `WorkStylePage`, `ValuesPage`, `ClusterfitResultsPage`, an offline answer queue (`lib/clusterfit-answer-queue.ts`), plus `useClusterfit` hooks (TanStack Query) and routes in `apps/web/src/app/router.tsx`. `/home` points to `/clusterfit` when `CLUSTERFIT_ENABLED=true` **and** the student's segment is explorer or pathfinder (launcher keeps the old flow), skipping intake; with the flag off it behaves exactly as today. Explore Path is hidden for clusterfit students (§16.1) |
| Counsellor | `packages/clusterfit/src/http/counselor-routes.ts` + `apps/web/src/features/clusterfit` | separate routes `GET /api/v1/clusterfit/counselor/students/:id` and `GET /api/v1/clusterfit/counselor/stats` (counsellor-gated), rendered through the report-section and dashboard-card extension points (§17.2 X6–X7). The existing report and stats responses never change |

**Reuse:**
- Gemini env/config (`apps/api/src/config/env.ts`, the `AI_PROVIDER` pattern)
- the `x-yuvapath-user-id` auth flow
- the journey-session linkage where convenient
- the existing autosave/resume pattern (`getNext` with answered items, localStorage session id in `apps/web/src/lib/storage.ts`)
- the `input_hash`/version idea from `assessment_results`

**Not touched:**
- RIASEC tables and scoring
- `packages/recommendations` (cluster → career/stream mapping is the next phase)

Per project rules, the migration is applied manually, and there are no commits until the user does them at the end. The hosted migration history has drifted, so apply only clusterfit's single file in one transaction and record its history row; never use `db push --include-all`. The down script is in §17.3.

### 9.1 Database schema (`clusterfit`)

**8 tables in a new schema, matching the existing migration style:** uuid primary keys, `timestamptz` timestamps, check constraints on free-text columns, and a comment on every table. The migration only creates new objects.

| Table | One row per | Holds |
|---|---|---|
| `sessions` | Student attempt | Grade path, status, progress per part, content version |
| `situation_captures` | Each chat or form submission (append-only) | Part A **raw** fields exactly as extracted, plus their `field_schema_version` |
| `situations` | Session | The current Part A **canonical view** the app reads (§4.1a) |
| `responses` | Session × item | Part B/C/D answers exactly as given |
| `values_rankings` | Session | Part E top-3 ranking |
| `results` | Scoring run | Full result JSON, scoring version, input hash |
| `result_clusters` | Result × cluster (12) | I, A, S, index, band, flags (easy to query) |
| `self_checks` | Session × shown cluster | The student's "Does this sound like you?" answers |

The **questions and the answer key are not in the DB**. They live in versioned TypeScript (`packages/clusterfit/src/content/v1`), so the key can't leak through a query. Each session records its `content_version`.

```sql
create schema if not exists clusterfit;

-- 1. One attempt by one student
create table clusterfit.sessions (
  id                 uuid primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,
  journey_session_id uuid references assessment.journey_sessions (id) on delete set null,
  content_version    text not null,                                   -- 'v1'
  grade_path         text check (grade_path in ('9_10', '11_12')),    -- set from canonical grade
  status             text not null default 'in_progress'
                     check (status in ('in_progress', 'scored', 'abandoned')),
  part_status_json   jsonb not null default '{}',                     -- {"B":{"answered":42,"total":48}, ...}
  live_tokens_issued smallint not null default 0,                     -- rate limit, max 3 (Lambda is stateless)
  coverage_checks    smallint not null default 0,                     -- max 2, as in the POC
  attempt_number     smallint not null default 1,                     -- yearly retakes
  started_at         timestamptz not null default now(),
  last_answered_at   timestamptz,
  scored_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on clusterfit.sessions (user_id, created_at desc);

-- 2a. Part A raw captures: whatever the chat extracted, never edited (fields may change any time)
create table clusterfit.situation_captures (
  id                   uuid primary key,
  session_id           uuid not null references clusterfit.sessions (id) on delete cascade,
  source               text not null check (source in ('live', 'form')),
  field_schema_version text not null,                 -- 'conversation-context-v2', 'conversation-context-v3', 'form-v1'
  raw_fields_json      jsonb not null
                       check (jsonb_typeof(raw_fields_json) = 'object'),
  transcript_text      text,                           -- optional, counsellor-only
  idempotency_key      uuid unique,
  captured_at          timestamptz not null default now()
);
create index on clusterfit.situation_captures (session_id, captured_at desc);

-- 2b. Part A canonical view: the fixed field names the app reads (scoring uses only grade and medium)
create table clusterfit.situations (
  session_id          uuid primary key references clusterfit.sessions (id) on delete cascade,
  latest_capture_id   uuid references clusterfit.situation_captures (id) on delete set null,
  canonical_json      jsonb not null,                  -- {grade, medium, languages, knownJobs, ...}
  canonical_version   text not null,                   -- 'canonical-v1'; grows only by optional fields
  mapper_version      text,                            -- which mapper produced it, e.g. 'conversation-context-v2'
  missing_fields      text[] not null default '{}',    -- canonical fields still empty
  unmapped_fields     text[] not null default '{}',    -- raw keys the mapper couldn't read
  student_edited      boolean not null default false,  -- changed on the confirm card
  updated_at          timestamptz not null default now()
);

-- 3. Part B/C/D answers, stored raw (reversing and marking happen at scoring time)
create table clusterfit.responses (
  id              uuid primary key,
  session_id      uuid not null references clusterfit.sessions (id) on delete cascade,
  part            char(1) not null check (part in ('B', 'C', 'D')),
  item_key        text not null,                                    -- 'B4', 'MEC4', 'D11'
  value           smallint,                                         -- B: 0–2, D: 0–3 as ticked
  option_key      char(1) check (option_key in ('A', 'B', 'C', 'D')),  -- C; null = skipped
  latency_ms      integer,
  idempotency_key uuid unique,                                      -- AGENTS.md retry rule
  answered_at     timestamptz not null,
  received_at     timestamptz not null default now(),
  unique (session_id, item_key),
  check (
    (part = 'B' and value between 0 and 2 and option_key is null) or
    (part = 'D' and value between 0 and 3 and option_key is null) or
    (part = 'C' and value is null)
  )
);

-- 4. Part E (unscored)
create table clusterfit.values_rankings (
  session_id   uuid primary key references clusterfit.sessions (id) on delete cascade,
  ranking_json jsonb not null,                       -- [{"value":"steady_income","rank":1}, ...]
  updated_at   timestamptz not null default now()
);

-- 5. Scoring output: full payload, versioned and re-scorable
create table clusterfit.results (
  id              uuid primary key,
  session_id      uuid not null references clusterfit.sessions (id) on delete cascade,
  user_id         uuid not null,
  content_version text not null,
  scoring_version text not null,                     -- 'CLUSTERFIT_SCORING_V1'
  input_hash      text not null,
  result_json     jsonb not null,                    -- ClusterfitResult (§8.3)
  is_current      boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (session_id, input_hash)
);
create unique index on clusterfit.results (session_id) where is_current;  -- one live result per session

-- 6. One row per cluster per result, for counsellor views and pilot SQL
create table clusterfit.result_clusters (
  result_id      uuid not null references clusterfit.results (id) on delete cascade,
  cluster_code   text not null check (cluster_code in
                 ('SCI','ENG','DIG','HLT','AGR','BUS','EDU','GOV','MED','ART','HOS','CON')),
  interest_score smallint not null check (interest_score between 0 and 8),   -- I
  aptitude_fit   smallint not null check (aptitude_fit between 0 and 8),     -- A
  style_fit      smallint not null check (style_fit between 0 and 4),        -- S
  cluster_index  numeric(5,2) not null check (cluster_index between 0 and 100),
  band           text not null check (band in ('strong', 'explore', 'low')),
  shown_as       text check (shown_as in ('strong', 'explore', 'hidden')),   -- after max-3 / fallback
  flags          text[] not null default '{}',       -- 'skills_to_build', 'hidden_strength'
  primary key (result_id, cluster_code)
);
create index on clusterfit.result_clusters (cluster_code, band);

-- 7. The student's "Does this sound like you?" (never scored)
create table clusterfit.self_checks (
  session_id   uuid not null references clusterfit.sessions (id) on delete cascade,
  cluster_code text not null,
  answer       text not null check (answer in ('yes', 'partly', 'no')),
  answered_at  timestamptz not null default now(),
  primary key (session_id, cluster_code)
);
```

**Why it can't affect the existing system:**
- **Separate schema.** Nothing in `assessment`, `recommendation`, `knowledge` or `counselor` changes. The only links out are foreign keys to `auth.users` and `assessment.journey_sessions`, and they only read the existing rows.
- **Deletes keep working.** `on delete cascade` on `user_id` means existing user-deletion and wipe flows don't break. A user's clusterfit rows go with the user. Without the cascade, deleting a student who had taken clusterfit would fail. `journey_session_id` uses `set null` for the same reason.
- **Easy rollback.** `drop schema clusterfit cascade` removes everything and touches nothing else.
- **Your usual process.** It ships as one migration that you apply with `pnpm db:push`, followed by `pnpm db:types`.

**Design choices:**
- **Raw answers, not scores, in `responses`.** A key fix (MEC4) or new weights only needs a re-score, not a retest.
- **Raw and canonical Part A are kept separate** (§4.1a), so the chat's fields can change without a migration.
- **`results` and `result_clusters` hold the same data twice.** `results` keeps the full payload, and `result_clusters` makes "students with a strong HLT signal" plain SQL. A re-score adds rows and flips `is_current`.

---

## 10. Open issues and notes on the source doc

1. **MEC4 answer key is wrong** (B → A). This needs confirmation from the instrument author.
2. **"3-digit code"** means 3-letter cluster codes. There are no numeric codes, apart from the order k = 1…12.
3. **Grades 9–10 aptitude is coarse** (×2 gives only 0/2/4, so A ∈ {0,2,4,6,8}). This is expected per the doc; note it on the counsellor view.
4. **Skipped items** aren't covered by the doc for the digital flow. The §4.6 defaults need sign-off.
5. **More than 3 strong clusters:** the doc says "show at most 3". The extras are demoted to "Worth exploring" (our interpretation).
6. **Language caution** depends on medium of instruction, which the POC v2 fields don't collect (see 11).
7. **Item reliability:** the doc warns that 4-item clusters may be unreliable. Raw storage plus versioned config lets us move to 6 items or new weights after the pilot.
8. **Safety and privacy:** the Live chat involves minors. Results go to the student and counsellor only, with no ranking or comparison screens. Consider routing the transcript through `packages/safety` before storing it.
9. **Pilot demographics:** the doc's fairness analysis splits by gender, school type and medium. The app has no medium (until v3, see 11), gender or school type, so these need optional profile fields with consent if the pilot is run through the app.
10. **Efficiency figures (§7)** are estimates counted from the rules. Time a sample of hand-scored booklets in the pilot to replace them with measured numbers.
11. **Part A uses the POC fields, not the doc's A1–A8** (§4.1). The doc's A1 medium, A2 languages read, A3 jobs known and A8 decision helpers are not collected. As a result, the language-caution flag is `unknown` and the A3 exposure signal is missing. Add them in `conversation-context-v3` when refining (no migration).
12. **POC prompt mentions RIASEC** in its "Assessments" section (§14.4). It is kept verbatim for now; the first prompt refinement should change it to describe the clusterfit activity questions and puzzles.
13. **No "maths + biology" stream value in the POC schema.** `current_stream` has only `science_pcm` and `science_pcb`, but the POC prompt asks whether science includes "maths, biology or both". A "both" (PCMB, common in Tamil Nadu) student is likely extracted as `other`. This doesn't affect clusterfit scoring; worth adding `science_pcmb` when refining the schema.

---

## 11. Milestones (tracker)

> **Superseded by §18.5** (Rev 4 scope). Kept below for reference.

> The first build of M0–M7 (2026-10-18) was reverted. This tracker restarts for the Rev 3 plug-in build. M0 decisions still stand (§16.1).

- [x] **M0 – Spec freeze:** MEC4 fix, §4.6 missing-answer policy, POC v2 fields as Part A, decisions D1–D9 (§16.1)
- [ ] **M1 – Extension points (no clusterfit code):** X1–X8 from §17.2, the guard tests from §17.6; app and all existing tests unchanged
- [ ] **M2 – Contracts and content:** `packages/contracts/src/clusterfit.ts`; v1 content files (48 + 20 + 20 + 9 items, 12 clusters, matrix)
- [ ] **M3 – Scoring engine:** pure scorer, bands, flags, quality notes, input hash, versioned config with startup validator; unit tests incl. the doc example and the Kavya golden case (§12)
- [ ] **M4 – Database and API:** migration + down script, repositories, service (auto-score after Part E), routes, `plugin.ts` wiring and ports, fixture runtime; live check against the real DB
- [ ] **M5 – Part A Gemini Live chat:** see §14.8 (M5.1–M5.7)
- [ ] **M6 – Parts B–E pages and results page:** autosave/resume, offline queue, grade-dependent Part C, values ranking, results with self-check; registered through X4–X5
- [ ] **M7 – Counsellor section and dashboard cards:** separate counsellor routes; registered through X6–X7
- [ ] **M8 – Scripts:** `rescore`, `pilot-analytics`, `remap-situations`, `sync-prompt` as package scripts
- [ ] **M9 – Verification:** browser walkthrough (Grade 10 and 12, voice and typed, reload resume, results, counsellor view, flags off/on) **and both removal recipes (§17.5) dry-run on a scratch branch**
- [ ] *(Post-prototype)* facilitator data-entry mode for paper booklets; read-aloud; Tamil content

---

## 12. Verification

**Unit tests (Vitest, `packages/clusterfit/src/domain/*.test.ts`):**
- The doc's worked example gives SCI = **85**, and the two extra examples in §5.5 give 75 and the skills-to-build flag.
- Cluster k owns items k, k+12, k+24, k+36. Assert all 48 items map to exactly one cluster, with 4 per cluster.
- Reverse scoring of D11–D15, and the cut-offs at raw 4/5 and 8/9.
- Grades 9–10: domain ×2, only items 1–2 served and scored.
- Answer key: one test per item where the correct option is derived from the arithmetic (e.g. MEC4 = 60 vs 60 gives A).
- Band boundaries (49.99 / 50 / 64.99 / 65), max-3 strong with demotion, the fallback when none is ≥ 65, and tie-break order.
- Each flag at its boundary: I = 6/A = 4, A = 7/I = 3, gap 9.99 vs 10, VER tie-lowest, medium unknown → `unknown`.
- **The §13 Kavya example as a golden test:** all 12 indices, the HLT/AGR tie-break, SCI and DIG demoted, the BUS hidden-strength flag, and the language-caution flag. Two variants: medium set to `tamil` gives **yes**, and medium `null` (the POC v2 reality) gives **`unknown`**.
- Missing-answer prorating and `insufficient`.
- Part A mapping: unknown raw keys are kept and listed as `unmapped`; an unknown `field_schema_version` is still saved raw with an empty canonical view; scoring reads only `canonical.grade` and `canonical.medium`; a v1 capture still maps after a v2 mapper is added.
- Max-everything gives 100 for every cluster; all-zero gives 0.
- **Paper parity (golden tests):** 5 hand-scored response sets, worked through on the paper worksheet, cover a Grade 9–10 student, a Grade 11–12 student, a flat profile, a hidden-strength student and the language-caution case. The app's output must match all 12 indices, bands and flags exactly.
- Determinism: the same inputs give the same `input_hash` and an identical result. Changing the config version changes the hash.
- The config validator rejects a broken matrix, missing items, a 19-entry key and weights that don't add to 100.
- Quality notes fire on all-same Part B answers and on too-fast Part D answers, and never change an index.

**API:**
- Service tests with the fixture runtime: start → answer → auto-score → result.
- The answer key, cluster codes, dimension codes and reverse flags must not appear in any student-facing response.
- Answers to items outside the student's grade path are rejected.
- Re-sending the same answer is idempotent.
- `rescore` with a modified config writes new result rows and keeps the old ones.

**End to end (browser):**
- Sign in as a test student.
- Do Part A through the Live chat, and once through the typed fallback.
- Run B → E as a Grade 10 and as a Grade 12 (check 10 vs 20 aptitude items).
- Reload mid-part to confirm resume works.
- On the student results page, confirm the bands are correct and low signals are hidden.
- On the counsellor report, confirm all 12 indices, the flags and Parts A/E show.
- Check the values by hand against the paper worksheet for one full response set.

---

## 13. Parts B, C and D in the app: a practical walkthrough

This section follows one example student through Parts B, C and D: what she sees, what the app saves, and how her answers become cluster suggestions. All the numbers below were checked by recomputing them.

**Example student: Kavya.** Grade 11, Tamil-medium government school, rural. From Part A (Live chat): `class_level: class_11` → `grade: 11`. *Medium is Tamil. The POC v2 fields don't capture medium, so the language-caution result below shows how the flag behaves once a later schema version adds it. With v2 it is reported as `unknown`.* This puts her on the **11–12 path**, so she gets all 20 puzzles in Part C. Her session id is `ps_123`.

### 13.1 How the three parts behave in the app

| | Part B: Things I might enjoy | Part C: Puzzles about everyday life | Part D: How I like to work |
|---|---|---|---|
| Items | 48 | 20 (Grades 9–10: 10) | 20 |
| Per screen | 6 items (8 screens) | 1 puzzle per screen | 5 statements (4 screens) |
| Order | Fixed, printed order B1→B48 (the cycling order keeps similar items apart, so **no shuffling**) | Fixed, grouped by domain as in the booklet | Fixed, D1→D20 |
| Answer control | 3 buttons: **Yes · Maybe / never tried · No** | 4 option buttons A–D, plus **Skip for now** | 4 buttons: **Not like me · A little · Mostly · Very like me** |
| Saved as | `value` 2 / 1 / 0 | `option_key` "A"–"D", or null if skipped. **Not marked right or wrong when saved**: marking happens at scoring time, so a key fix only needs a re-score | `value` 0–3 **exactly as ticked**. Reversing happens at scoring time |
| Hidden from the student | Cluster code | Domain code, answer key, the ★ marker for 11–12 items | Dimension, (R) marker |
| Timer | None | None (a "rough work" notepad that isn't saved) | None |
| Going back | Yes, until the session is scored | Yes; skipped items are listed at the end of the part | Yes |
| Part done when | ≥ 90% answered (§4.6) | Every item answered or skipped. Skips score 0 | ≥ 90% answered |

### 13.2 What the screens look like

**Part B (screen 1 of 8)**
```
┌──────────────────────────────────────────────────────────┐
│ Things I might enjoy                       ▓▓▓░░░░░ 6/48  │
│ Imagine a free day. Would you enjoy…                     │
│                                                          │
│ 1. Finding out why something happens, such as why milk   │
│    curdles or why a plant wilts, by testing it yourself? │
│    [ Yes ]  [ Maybe / never tried ]  [ No ]               │
│ 2. Opening up a broken fan, radio or mobile and trying   │
│    to repair it?                                         │
│    [ Yes ]  [ Maybe / never tried ]  [ No ]               │
│ …4 more                                                  │
│                                   [ Back ]   [ Next → ]  │
└──────────────────────────────────────────────────────────┘
```

**Part C (puzzle 16 of 20)**
```
┌──────────────────────────────────────────────────────────┐
│ Puzzles with machines and shapes             16 / 20     │
│ A 30 kg child sits 2 m from the centre of a see-saw.     │
│ A 20 kg child sits 3 m from the centre on the other      │
│ side. What happens?                                      │
│  ( A ) It stays balanced     ( B ) The 30 kg side goes down│
│  ( C ) The 20 kg side goes down  ( D ) Cannot be told    │
│ ✎ Rough work (not saved)                                 │
│ No marks are lost for a wrong answer.                    │
│                 [ Back ]  [ Skip for now ]  [ Next → ]   │
└──────────────────────────────────────────────────────────┘
```

**Part D (screen 3 of 4)**
```
┌──────────────────────────────────────────────────────────┐
│ How I like to work                         ▓▓▓▓▓▓░░ 15/20 │
│ 11. I would rather work alone than in a team.            │
│   [Not like me] [A little ✓] [Mostly] [Very like me]     │
│ …                                                        │
└──────────────────────────────────────────────────────────┘
```

### 13.3 What happens on each tap

**1. The screen loads its items.** The response contains no codes and no key:
```http
GET /api/v1/clusterfit/sessions/ps_123/parts/B/items?offset=0&limit=6
→ 200 { "items": [ { "itemKey": "B1", "text": "Finding out why…", "options": ["yes","maybe","no"] }, … ],
        "answered": { "B1": "yes" }, "progress": { "answered": 1, "total": 48 } }
```

**2. Each tap saves immediately.** The save is idempotent, and while offline it queues in `clusterfit-answer-queue.ts`:
```http
PUT /api/v1/clusterfit/sessions/ps_123/responses
{ "itemKey": "B4", "answer": "yes", "latencyMs": 3100 }           → 200 { "part": "B", "answered": 4,  "total": 48 }
{ "itemKey": "MEC4", "answer": null, "latencyMs": 41000 }          → 200 { "part": "C", "answered": 15, "total": 20, "skipped": ["MEC4"] }
{ "itemKey": "D11", "answer": 1, "latencyMs": 2700 }               → 200 { "part": "D", "answered": 11, "total": 20 }
```

**3. The server checks the answer, then saves it.** It rejects:
- an item not in her grade path (for example, a Grade 9 student sending `NUM3`)
- an answer outside the allowed set
- any answer after the session has been scored

It then upserts one row in `clusterfit.responses`:

| session_id | part | item_key | value | option_key |
|---|---|---|---|---|
| ps_123 | B | B4 | 2 | – |
| ps_123 | C | NUM3 | – | B |
| ps_123 | C | MEC4 | – | *null* |
| ps_123 | D | D11 | 1 | – |

**4. Resume.** If Kavya closes the app on puzzle 12, the next `GET` returns her saved answers and the app reopens at the first unanswered item.

**5. Completion.** When she submits Part E, the service runs `scoreClusterfit()` by itself (§6.2) and she goes to `/clusterfit/results`.

### 13.4 Kavya's answers and how the scorer reads them

**Part B → interest I per cluster.** Cluster k owns items k, k+12, k+24 and k+36. Y = 2, M = 1, N = 0.

| Cluster | Items | Kavya's answers | I |
|---|---|---|---|
| SCI | B1, B13, B25, B37 | Y M Y N | **5** |
| ENG | B2, B14, B26, B38 | N M N N | **1** |
| DIG | B3, B15, B27, B39 | M Y N M | **4** |
| HLT | B4, B16, B28, B40 | Y Y M Y | **7** |
| AGR | B5, B17, B29, B41 | Y Y Y M | **7** |
| BUS | B6, B18, B30, B42 | M Y N N | **3** |
| EDU | B7, B19, B31, B43 | Y Y Y M | **7** |
| GOV | B8, B20, B32, B44 | N M Y M | **4** |
| MED | B9, B21, B33, B45 | M N M N | **2** |
| ART | B10, B22, B34, B46 | Y M M N | **4** |
| HOS | B11, B23, B35, B47 | Y M M N | **4** |
| CON | B12, B24, B36, B48 | N N M N | **1** |

**Part C → aptitude per domain.** Each answer is compared with the server-side key, with MEC4 corrected to A.

| Domain | Item 1 | Item 2 | Item 3 ★ | Item 4 ★ | Score (0–4) |
|---|---|---|---|---|---|
| NUM | A ✔ | C ✔ | B ✘ (key D) | A ✔ | **3** |
| VER | B ✔ | D ✔ | B ✘ (key C) | C ✘ (key A) | **2** |
| LOG | C ✔ | A ✔ | C ✔ | B ✘ (key D) | **3** |
| MEC | D ✔ | B ✔ | B ✘ (key A) | *skipped* = 0 | **2** |
| PRA | D ✔ | A ✔ | C ✔ | B ✔ | **4** |

**Part D → work-style level.** R items are reversed with `3 − ticked`.

| Dimension | Items (ticked → used) | Raw (0–12) | Level → points |
|---|---|---|---|
| Social | D1 2, D6 3, D11R 1→2, D16 1 | 8 | Mid → **1** |
| Initiative | D2 1, D7 2, D12R 1→2, D17 1 | 6 | Mid → **1** |
| Order | D3 3, D8 2, D13R 1→2, D18 2 | 9 | High → **2** |
| Curiosity | D4 2, D9 2, D14R 2→1, D19 2 | 7 | Mid → **1** |
| Steadiness | D5 2, D10 3, D15R 0→3, D20 2 | 10 | High → **2** |

### 13.5 Combining the three into cluster indices

Index = 6.25×I + 3.75×A + 5×S, where A and S come from the cluster matrix (§5.4).

| Cluster | I | A (key aptitudes) | S (key styles) | Index | Band (raw) | Shown to Kavya as |
|---|---|---|---|---|---|---|
| **HLT** | 7 | PRA 4 + VER 2 = 6 | Soc 1 + Ste 2 = 3 | **81.25** | Strong | ⭐ Strong (#1, wins the tie on k) |
| **AGR** | 7 | PRA 4 + MEC 2 = 6 | Ste 2 + Ini 1 = 3 | **81.25** | Strong | ⭐ Strong (#2) |
| **EDU** | 7 | VER 2 + PRA 4 = 6 | Soc 1 + Cur 1 = 2 | **76.25** | Strong | ⭐ Strong (#3) |
| SCI | 5 | LOG 3 + NUM 3 = 6 | Cur 1 + Ste 2 = 3 | 68.75 | Strong | Worth exploring (**demoted**: max 3 strong) |
| DIG | 4 | LOG 3 + PRA 4 = 7 | Cur 1 + Ord 2 = 3 | 66.25 | Strong | Worth exploring (**demoted**) |
| HOS | 4 | PRA 4 + VER 2 = 6 | Soc 1 + Ord 2 = 3 | 62.50 | Explore | Worth exploring |
| GOV | 4 | VER 2 + LOG 3 = 5 | Ini 1 + Ord 2 = 3 | 58.75 | Explore | Counsellor only (student sees the top 3 explore) |
| BUS | 3 | NUM 3 + PRA 4 = 7 | Ini 1 + Soc 1 = 2 | 55.00 | Explore | Counsellor only + 🔍 **Hidden strength** |
| ART | 4 | MEC 2 + VER 2 = 4 | Cur 1 + Ini 1 = 2 | 50.00 | Explore | Counsellor only |
| MED | 2 | VER 2 + PRA 4 = 6 | Cur 1 + Soc 1 = 2 | 45.00 | Low | Hidden from student |
| CON | 1 | MEC 2 + NUM 3 = 5 | Ord 2 + Ste 2 = 4 | 45.00 | Low | Hidden from student |
| ENG | 1 | MEC 2 + NUM 3 = 5 | Cur 1 + Ord 2 = 3 | 40.00 | Low | Hidden from student |

**Rules this example exercises:**
- **Tie-break:** HLT and AGR are both 81.25 with equal I and A, so cluster order k decides (HLT = 4 comes before AGR = 5).
- **Max 3 strong:** 5 clusters scored ≥ 65. SCI and DIG drop into "Worth exploring".
- **Hidden strength (BUS):** A = 7 ≥ 7 and I = 3 ≤ 3. The counsellor should arrange exposure (a shop visit or a small sales task) before ruling business out.
- **Skills to build:** none (no cluster has I ≥ 6 with A ≤ 4).
- **Flat profile:** no. The top score (81.25) minus the 5th (66.25) is 15, which is ≥ 10.
- **Language caution: yes.** VER = 2 is tied lowest with MEC, it is below the highest domain (PRA 4), and her medium (Tamil) ≠ the test language (English). The counsellor reads her VER 2 as a test-language effect. This also tempers how much weight HLT, EDU and HOS (which use VER) get from aptitude.

### 13.6 What each person sees

**Kavya (student page):**
> **Your strongest signals:** Health, Wellness and Sports · Agriculture, Environment and Natural Resources · Education and Social Impact. *"Several things in your answers point here."*
> **Also worth exploring:** Science and Research · Computing and Digital · Hospitality, Tourism and Personal Services.
> Each cluster shows example roles at skilled, diploma/degree and professional level, and ends with **"Does this sound like you?"** [Yes] [Partly] [No].
> No numbers, no ranking, no flags.

**Counsellor (report sheet):**
- All 12 rows from the §13.5 table with I, A, S and the index. Expanding a row shows the breakdown (e.g. HLT → B4 Y, B16 Y, B28 M, B40 Y; PRA 4/4, VER 2/4; Social Mid, Steadiness High).
- Flags with their action text: 🔍 BUS hidden strength, 🌐 language caution.
- Aptitude and work-style tables, her Part A answers (Tamil medium, rural, plus whatever she said about family support), her Part E top 3, and her self-check answers once she gives them.
- Quality notes: none (her answers were mixed and taken at a normal pace).

### 13.7 The same student on the Grade 9–10 path

If Kavya were in Grade 9, she would get only items 1–2 of each domain. She got all ten of those right, so every domain scores 2/2 × 2 = **4**, and A = 8 for every cluster.
- **Aptitude would no longer separate the clusters.** The ranking would rest on interest and work style alone.
- **Language caution:** VER is tied lowest with every domain. Under the doc's literal rule it would fire if medium were known (the all-equal exception was not approved, §16.1). With POC v2 fields it is `unknown`.

This is the coarseness noted in §10.3, and the counsellor view should label it ("aptitude based on 10 easier items").

---

## 14. Part A: integrating the Gemini Live chat (voice and text)

**Source:** `C:\Users\HP\Desktop\gemini-live-api-examples\gemini-live-genai-python-sdk`. This is Google's example repo with your YuvaPath changes on top (modified `main.py`, `gemini_live.py` and frontend; new `yuvapath.py` and `prompt*.md`).

**Decision for this iteration:** reuse the POC's **prompt, tools, extraction schema and post-processing unchanged** (`prompt.revised.v3.md`, `ConversationContext` v2). Only the plumbing changes, so the chat runs inside this repo's API and web app. Fields and wording are refined after the first implementation; §4.1a makes that migration-free.

### 14.1 What exists today in the POC repo

| File | What it does | Fate in this repo |
|---|---|---|
| `yuvapath.py` | Loads the prompts from one Markdown file by heading. Declares 3 Live tools (`end_discovery`, `check_coverage`, `flag_wellbeing_concern`). Runs a post-chat **extraction** (`gemini-flash-latest`, fallback `gemini-flash-lite-latest`, temperature 0, JSON-schema structured output) into `ConversationContext` v2. Then deterministic code: `marks_band`, `consistency_warnings`, `coverage`, `missing_topics`, `coverage_instruction` (max 2 checks), `intake_preview` | **Ported to TypeScript, same logic and constants** |
| `main.py` | FastAPI. `/ws` WebSocket **relays** browser audio/text ↔ Gemini Live, builds the transcript server-side, answers `check_coverage` by running the extraction on the transcript so far, and runs the final extraction on `end_discovery`. `/api/extract` (test with a pasted transcript). Twilio endpoints | Relay **replaced** (§14.3). `/api/extract` kept as a dev route. Twilio dropped |
| `gemini_live.py` | `GeminiLive`: audio out (voice "Puck"), input and output transcription, `TURN_INCLUDES_ONLY_ACTIVITY`, tool-call dispatch, **session resumption** (3 reconnects), sliding-window context compression | Same settings, moved into the **ephemeral-token constraints** and the browser client |
| `frontend/*.js` | Mic capture (16 kHz PCM worklet), playback, chat log, typed input, wellbeing banner, "extracting…" states, results panel | **Ported to React** under `apps/web/src/features/clusterfit/situation-chat/` |
| `prompt.revised.v3.md` | §1 Live prompt, §2 extraction prompt, §3 output schema, §4 data-mapping rules | **Copied unchanged** to `packages/clusterfit/prompts/conversation-context-v2.md` |
| `../gemini-live-ephemeral-tokens-websocket/` | Google's reference for **browser-direct** Live (`auth_tokens.create`, `BidiGenerateContentConstrained`) | **The model for our architecture** (§14.3) |

### 14.2 How it differs from the POC

| Aspect | POC (`gemini-live-api-examples`) | This repo (clusterfit) |
|---|---|---|
| **What is asked** | 10 topics, 18 fields (`ConversationContext` v2) | **Same**, unchanged |
| **Prompt** | `prompt.revised.v3.md`, re-read every session | Same text, copied into the repo and versioned. Loaded server-side and baked into the token at mint time |
| Runtime | Python FastAPI + uvicorn (Cloud Run-ready) | Node/Express module `packages/clusterfit` inside `apps/api`, running on AWS Lambda |
| **Gemini connection** | Server holds a WebSocket to Gemini and **relays** audio between browser and Gemini | **Browser connects directly** to Gemini Live with a single-use ephemeral token. Lambda can't hold WebSockets |
| API key | Server only | Server only. The token is single-use, short-lived, and **locks model + prompt + tools + voice** |
| Student context (`first_name`, `segment`, `state`, `city`, `already_answered`) | URL query params from the page (defaults like `first_name=Adarsh`) | **Read server-side** from `user_profiles` and intake answers for the signed-in student, so the browser can't change it |
| Transcript | Built on the server from transcription events | Built in the **browser** from the same events, sent to the API at `check_coverage` and `end_discovery` |
| `check_coverage` tool | Handled in-process on the server | Browser gets the tool call → `POST …/situation/coverage` → API runs the extraction → browser sends the returned instruction as the tool response |
| `end_discovery` → extraction | In-process; result pushed over the WebSocket | `POST …/situation-captures`; the API runs the extraction and returns the result |
| Extraction call | Python `google-genai` SDK, pydantic schema | Raw `fetch` (like `packages/counselor/.../gemini-ai-provider.ts`), zod schema → JSON Schema. **Same models, same fallback, temperature 0** |
| Validation and checks | pydantic + Python functions | zod + the same functions ported 1:1 (`marksBand`, `consistencyWarnings`, `coverage`, `missingTopics`, `coverageInstruction`, `intakePreview`) |
| **Result** | Shown in a results panel, **not saved** | **Saved:** raw capture + canonical view (§4.1a, §9.1), plus the confirm card for the student |
| `intake_preview` | Displayed as a proposal | Stored only. **Not** written to `assessment.intake_answers` (isolation) |
| Wellbeing flag | Banner only | Banner + safety-module handoff (§14.7); stored on the capture |
| Reconnect | Server-side resumption (3 tries) | Browser-side resumption with a fresh token (3 tries) |
| Auth and ownership | None (open demo page) | Student auth header + session-ownership check on every route |
| UI | Standalone vanilla-JS page | React step inside the clusterfit flow (Part A → B → C → D → E) |
| Twilio phone calls, camera/screen frames | Supported | Dropped |
| Tests | None | Unit tests for every ported function, plus **parity tests**: the same transcripts through the POC `/api/extract` and our `dev/extract` must give the same fields |

### 14.3 Architecture: from WebSocket relay to direct browser connection

Our API is Express on **AWS Lambda** (`apps/api/src/lambda.ts`, `serverless-http`). Lambda can't hold a long-lived WebSocket, so the POC's relay isn't portable. We use Google's ephemeral-token pattern instead:

```
Browser (React)                          Our API (Lambda)                        Google
---------------                          ----------------                        ------
1. POST /clusterfit/sessions/:id/live-token -> build the POC Live prompt with first_name,
                                            segment, state, city, already_answered (server data)
                                            mint ephemeral token, uses=1, ~30 min,
                                            liveConnectConstraints LOCK model +
                                            prompt + tools + voice  -------------> auth_tokens.create
                                     <----  { token, expiresAt }
2. open wss://...BidiGenerateContentConstrained?access_token=...  --------------> Gemini Live
   send kickoff text ("The student has just joined…"), as the POC does
   mic PCM 16 kHz <-> audio out; typed text; transcription events
   browser builds transcript [{speaker: "student"|"guide", text}]
3. tool call check_coverage  -> POST .../situation/coverage {transcript}
                                            POC extraction on the transcript so far
                                     <----  { instruction }   (coverage_instruction text)
   browser -> sendToolResponse(instruction)
4. tool call flag_wellbeing_concern -> show approved support info
                              -> POST .../situation/wellbeing -> safety module (14.7)
5. tool call end_discovery  -> POST .../situation-captures {source: "live", transcript}
                                            final extraction -> raw capture (conversation-context-v2)
                                            -> mapper -> canonical view (4.1a)
                                     <----  { canonical, missing_topics, warnings, unmapped }
6. confirm card ("Here's what I understood") -> PUT .../situation (edits) -> Part B
```

**Why this is safe:**
- The **API key never leaves the server**.
- The token is single-use and short-lived, and its **constraints lock the prompt and tools**, so the browser can't change what the guide is told.
- The student context and the extraction are server-side, so stored Part A fields come from our code, not from the browser.

**One trade-off:** the transcript is assembled in the browser. That is acceptable for the prototype, since Part A is unscored and the student confirms the result. Hardening later: also stream transcription chunks to the API as they arrive.

**Session resumption:** the browser keeps the latest resumption handle. On a drop it asks for a fresh token and resumes, up to 3 times (`GeminiLive.MAX_RECONNECTS`).

### 14.4 The prompt (reused from the POC)

`prompt.revised.v3.md` is copied unchanged to `packages/clusterfit/prompts/conversation-context-v2.md`. It keeps the POC's 3-heading layout, read by heading like `load_prompts()`, so the team still edits one Markdown file. The file's version is saved with every capture.

**What it covers** (POC §1, unchanged):
1. **What they want help with**
2. **Studies:** class, board, stream (11–12) or stream in mind (9–10), subjects enjoyed
3. **Interests and strengths**
4. **Growth and challenges** (one gentle question)
5. **Aspirations**
6. **Routes after school**
7. **Location** (study vs work)
8. **Practical considerations:** cost, distance, responsibilities; earning; aid. **Never family income**
9. **Marks** (11–12 only, ask at most once)
10. **Confidence**

The voice rules, language rules, respect and fairness, privacy and wellbeing sections, and the greeting → coverage check → summary → close flow, all stay word for word.

**One line to decide:** the prompt's "Assessments" section says *"YuvaPath measures interests and work values through formal assessments (RIASEC and work values)"*. In clusterfit, the next steps are the activity questions and puzzles, not RIASEC. Kept verbatim for now (fields-first rule). Changing that sentence is the first prompt refinement to make (open issue §10).

### 14.5 Extraction schema (POC v2, unchanged)

`ConversationContext` v2 is ported from pydantic to zod in `packages/contracts/src/clusterfit.ts`, with identical field names, enums and limits (the full list is in §4.1). It is converted to JSON Schema for Gemini's `responseJsonSchema`, with `$ref`s inlined as `_inline_refs` does.

**Ported 1:1 from `yuvapath.py`, with the same constants:**
- `SEGMENTS = explorer, pathfinder`
- `SEGMENT_CLASSES`, `EXPLORER_SUPPORT`, `PATHFINDER_SUPPORT`
- `MARKS_BANDS`, and `marksBand()` (whole range must fall inside one band)
- `ESSENTIAL_FIELDS`, `RECOMMENDATION_FIELDS`, `TOPICS`, `SKIPPED_TOPICS` (no marks for Classes 9–10)
- `MAX_COVERAGE_CHECKS = 2`
- `consistencyWarnings()`, `coverage()`, `missingTopics()`, `coverageInstruction()`, `intakePreview()`
- `KICKOFF_TEXT`

**The one clusterfit addition:** mapper `conversation-context-v2` → canonical view (§4.1a). `grade` comes from `class_level`; `medium` is `null`, so language caution is `unknown`; everything else passes through.

### 14.6 Port map (Python → this repo)

| From (POC repo) | To (career-counseling-chatbot) |
|---|---|
| `prompt.revised.v3.md` | `packages/clusterfit/prompts/conversation-context-v2.md` (unchanged copy) |
| `yuvapath.py` prompt loader + `LIVE_TOOLS` | `packages/clusterfit/src/situation/live-config.ts` |
| `yuvapath.py` schema | `packages/contracts/src/clusterfit.ts` (`ConversationContextV2Schema`) |
| `yuvapath.py` checks | `packages/clusterfit/src/situation/{marks-band,consistency,coverage,intake-preview}.ts` (pure, unit-tested) |
| `yuvapath.extract_context` | `packages/clusterfit/src/situation/extraction.ts` + `infrastructure/gemini-extraction-client.ts` (raw `fetch`, fallback on 5xx, timeout) |
| Ephemeral token (`auth_tokens.create`, from the ephemeral example) | `infrastructure/gemini-live-token-client.ts` → `POST /api/v1/clusterfit/sessions/:id/live-token` |
| `main.py` `check_coverage` / `run_extraction` | `POST …/situation/coverage`, `POST …/situation-captures` |
| `main.py` `/api/extract` | `POST /api/v1/clusterfit/dev/extract` (dev/fixture runtime only) |
| `gemini_live.py` `_build_config` | Token `liveConnectConstraints` + `apps/web/src/features/clusterfit/situation-chat/live-session.ts` |
| `frontend/media-handler.js`, `pcm-processor.js` | `situation-chat/audio/pcm-capture.worklet.ts`, `audio-playback.ts` |
| `frontend/main.js`, `gemini-client.js` | `useLiveSession` hook + `ChatLog`, `MicButton`, `TextComposer`, `WellbeingBanner`, `ConfirmCard` |
| `.env` `GEMINI_API_KEY`, `MODEL`, `EXTRACTION_MODEL` | Existing `GEMINI_API_KEY`, plus optional `GEMINI_LIVE_MODEL` (default `gemini-3.8-live`, as in the POC) and `CLUSTERFIT_EXTRACTION_MODELS` (default `gemini-flash-latest,gemini-flash-lite-latest`) in `apps/api/src/config/env.ts` |

### 14.7 Safety, privacy and limits

- **`flag_wellbeing_concern`:** the browser shows the approved support information, and the API records the event through the **safety module's port** (`packages/safety` has `/api/v1/internal/handoffs`; exact call to confirm in M4).
  - Clusterfit never writes to safety tables directly (AGENTS.md).
  - Per POC rule §4.D, the flag goes to the safety flow only, not into counsellor notes or scoring.
- **Transcript** is stored in `situation_captures.transcript_text`, visible to the counsellor only, never used in scoring.
- **POC data rules carried over** (§4.D of the prompt file):
  - `strengths` are self-described and never adjust Part C aptitude
  - `careers_mentioned` with `not_interested`, and `location`, are preferences, never hard filters
- **Rate limits:**
  - one live token per session per minute
  - at most 3 tokens per session (resumption)
  - at most 2 coverage calls per capture, as in the POC
- **Cost per student:** one Live session (POC target 12–18 student turns), plus up to 3 extraction calls (2 coverage + 1 final).

### 14.8 Steps (expands milestone M5)

- [ ] **M5.1** Copy `prompt.revised.v3.md` → `prompts/conversation-context-v2.md`; prompt loader with the 5 placeholders filled from `user_profiles` and intake answers
- [ ] **M5.2** Port the `ConversationContext` v2 schema to zod, plus all `yuvapath.py` functions and constants, with unit tests; add the mapper → canonical
- [ ] **M5.3** Gemini extraction client (fallback, timeout) + the `situation/coverage`, `situation-captures` and dev `extract` routes
- [ ] **M5.4** Ephemeral-token client + `live-token` route with locked constraints and rate limits. **Confirm first** that `gemini-3.8-live` supports constrained tokens
- [ ] **M5.5** React `situation-chat`: direct Live connection, kickoff, mic worklet, playback, transcript, tool handling, resumption, typed input
- [ ] **M5.6** Confirm card (grade required) + form-only fallback; wellbeing banner + safety port call
- [ ] **M5.7** Verification: **parity check**. The same 3 saved transcripts go through the POC's `/api/extract` and our `dev/extract`, and the fields and warnings must match. Then one live voice run and one typed-only run end to end

**Tests:**
- extraction output validates against the v2 schema
- every ported function gives the same result as the Python version on shared fixtures
- `coverageInstruction` stops after 2 checks
- the mapper gives the right grade for every `class_level` value and `medium = null`
- the token request carries the locked constraints
- no API key or prompt text appears in any browser response

---

## 15. Part A end to end: how the POC works vs how this repo will work

This section follows one chat from start to finish, first in the POC and then in this repo, so the two can be compared step by step. Both use the **same prompt, tools, fields and extraction**. What differs is **where each step runs** and **what is saved**.

### 15.1 Who is involved

| Part | POC (`gemini-live-api-examples`) | This repo |
|---|---|---|
| Student's browser | Vanilla-JS page served by the Python server | React page inside the clusterfit flow (`/clusterfit/situation`) |
| Our server | Python FastAPI (`main.py`), always running, holds WebSockets | Express API on AWS Lambda (`packages/clusterfit`), short request/response only |
| Gemini Live | Voice model `gemini-3.8-live`, reached **by the server** | Same model, reached **by the browser** with a locked token |
| Gemini extraction model | `gemini-flash-latest` (fallback `-lite`), called by the server | Same models, called by our API |
| Database | None (nothing is saved) | `clusterfit` schema: `situation_captures`, `situations` (§9.1) |

### 15.2 POC flow (today)

```
 STUDENT BROWSER                 PYTHON SERVER (main.py)                    GOOGLE
 ───────────────                 ───────────────────────                    ──────
 1. Open page, press Connect
    ws://server/ws?first_name=…&segment=…&state=…   ───▶ accept WebSocket
                                 build Live prompt from prompt.revised.v3.md
                                 (placeholders from the URL query)
                                 open Live session with API key  ─────────▶ Gemini Live
 2. send {"type":"start"}  ───▶  send KICKOFF_TEXT  ──────────────────────▶
                                                     ◀──── guide greets (audio + transcript)
    ◀──── audio bytes + transcript events (relayed)
 3. Student speaks
    mic PCM ─────────────────▶  relay audio  ─────────────────────────────▶
                                ◀──── transcription of student + guide reply
                                add both to transcript (server memory)
    ◀──── guide audio + text (relayed)
    … 12–18 student turns …
 4. Guide calls check_coverage  ◀──────────────────────────────── tool call
                                run extraction on transcript so far ────▶ gemini-flash
                                ◀──── fields → missing_topics → instruction
                                send tool response ───────────────────────▶
                                guide asks the missing topics
 5. Guide summarises, closes, calls end_discovery  ◀──────────── tool call
                                run final extraction ────────────────────▶ gemini-flash
                                ◀──── ConversationContext v2 + warnings, coverage,
                                      marks_band, intake_preview
    ◀──── {"type":"extraction", …} shown in the results panel
 6. Close the page → everything is gone (nothing saved)
```

**Key points:**
- The server sits **in the middle of every audio packet**.
- The transcript lives in server memory.
- The student context comes from the URL.
- The result is only shown, never stored.

### 15.3 This repo's flow (clusterfit)

```
 STUDENT BROWSER (React)          OUR API (Lambda, packages/clusterfit)        GOOGLE
 ───────────────────────          ─────────────────────────────────────        ──────
 0. Student signed in; clusterfit session exists (POST /clusterfit/sessions)
 1. POST /clusterfit/sessions/:id/live-token  ───▶ check the student owns the session
                                  read first_name, segment, state, city from user_profiles;
                                  already_answered from intake answers
                                  build Live prompt (conversation-context-v2.md)
                                  mint single-use token, LOCKED to model +
                                  prompt + tools + voice  ──────────────────────▶ auth_tokens.create
    ◀──── { token, expiresAt }    ◀──────────────────────────────────────────── token
 2. open Live WebSocket with token  ───────────────────────────────────────────▶ Gemini Live
    send KICKOFF_TEXT  ─────────────────────────────────────────────────────────▶
    ◀──── guide greets (audio + transcript), directly from Google
 3. Student speaks (or types)
    mic PCM / text ─────────────────────────────────────────────────────────────▶
    ◀──── transcription of student + guide reply
    add both to transcript (browser memory)
    … 12–18 student turns …
 4. Guide calls check_coverage  ◀──────────────────────────────────────────────── tool call
    POST …/situation/coverage {transcript} ───▶ run extraction ──────────────────▶ gemini-flash
                                  ◀──── fields → missing_topics → instruction
    ◀──── { instruction }
    send tool response ─────────────────────────────────────────────────────────▶
    guide asks the missing topics
 5. Guide summarises, closes, calls end_discovery  ◀───────────────────────────── tool call
    POST …/situation-captures {transcript, idempotencyKey} ───▶
                                  run final extraction ────────────────────────▶ gemini-flash
                                  ◀──── ConversationContext v2
                                  run POC checks (warnings, coverage, marks_band, intake_preview)
                                  SAVE raw → clusterfit.situation_captures
                                  map → canonical (grade from class_level, medium = null)
                                  SAVE → clusterfit.situations
    ◀──── { canonical, missing_topics, warnings }
 6. Confirm card: "Here's what I understood" → student fixes anything, grade required
    PUT …/situation (edits) ───▶ SAVE edits on the canonical view
 7. → Part B (grade path for Part C is now set)
```

**Key points:**
- Our server is **not** in the audio path; the browser streams to Google directly.
- Our API is called only **4 times**: token, coverage, final capture, confirm edits.
- Each call is short, which is why it fits Lambda.
- The student context comes from **our database**, not the URL.
- The result is **saved** and feeds the grade path.

### 15.4 Step by step, side by side

| # | Step | POC | This repo |
|---|---|---|---|
| 1 | Start | Browser opens a WebSocket to the Python server, with student details in the URL | Browser asks our API for a token; the API reads the student details from the DB |
| 2 | Prompt | Built by the server per connection | Built by our API and **locked into the token**. The browser never sees it |
| 3 | Connect to Gemini | Server connects with the API key | Browser connects with the single-use token |
| 4 | Kickoff | Browser sends `start`, server sends `KICKOFF_TEXT` | Browser sends `KICKOFF_TEXT` itself |
| 5 | Talking | Audio relayed through the server both ways | Audio goes browser ⇄ Google directly |
| 6 | Transcript | Kept on the server | Kept in the browser, sent to the API when needed |
| 7 | `check_coverage` | Server runs the extraction and answers the tool | Browser forwards the transcript to our API, gets the instruction and answers the tool |
| 8 | `flag_wellbeing_concern` | Banner shown | Banner shown + safety-module handoff |
| 9 | `end_discovery` | Server runs the final extraction and pushes the result | Browser posts the transcript; the API extracts, checks, **saves** and returns |
| 10 | Result | Results panel, then lost | Confirm card → saved raw + canonical → grade path for Part C |
| 11 | Dropped connection | Server resumes (3 tries) | Browser gets a fresh token and resumes (3 tries) |

### 15.5 One example turn through both

Student says: *"I'm in Class 11, science with biology."*

| Moment | POC | This repo |
|---|---|---|
| Audio leaves the mic | → Python server → Gemini | → Gemini directly |
| Transcription comes back | Server adds `{speaker:"student", text:"I'm in Class 11, science with biology."}` to its transcript | Browser adds the same entry to its transcript |
| Guide replies *"Nice! Is maths part of your group too, or just biology?"* (the POC prompt's science check), and the student says *"Just biology."* | Gemini → server → browser | Gemini → browser |
| At `end_discovery`, extraction returns | `class_level: {status:"known", value:"class_11", certainty:"firm", evidence:"I'm in Class 11"}`, `current_stream: {status:"known", value:"science_pcb", certainty:"firm", …}` | **Same output** (same prompt, schema and model) |
| What happens next | Shown in the results panel | Saved raw. Mapped `class_level: class_11` → `grade: 11` → `grade_path: "11_12"`, so the student gets all 20 Part C puzzles |

### 15.6 What stays identical, and what this means for testing

**Identical:**
- the Live prompt text
- the 3 tools and their result messages
- the kickoff text
- the 18 fields and their allowed values
- the extraction prompt, models, temperature and fallback
- every check in `yuvapath.py` (`marks_band`, warnings, coverage, the 2-check limit, `intake_preview`)

**So the same transcript must give the same fields in both.** That is the parity test in M5.7: replay saved transcripts through the POC's `/api/extract` and this repo's `dev/extract`, and compare.

**Different only in plumbing:**
- where audio flows
- where the transcript is kept
- where the student context comes from
- whether the result is saved

If behaviour differs between the two, the cause is in the plumbing (§15.4 rows 1, 4, 6, 7, 9), not in the prompt or schema.

---

## 16. Implementation decisions and pre-implementation fixes

These were settled after a review of the plan against `AGENTS.md`, the deploy setup and the existing modules. **Where an earlier section differs, this section wins.**

### 16.1 Decisions (answered by the user, 2026-10-18)

| # | Topic | Decision |
|---|---|---|
| D1 | Frontend scope vs `AGENTS.md` ("backend-only") | **Build the frontend** in `apps/web`. Add a short note to `AGENTS.md`: frontend work is in scope, and the two Pathfinder docs are the **source of truth for clusterfit only** (the PRD stays the source for everything else) |
| D2 | Rules not in the source doc | **Approved:** the tie-break (higher I → higher A → cluster order k) and max-3 demotion; the missing-answer policy (§4.6); the MEC4 key fix (B → A). **Not approved:** the language-caution exception for an all-equal profile, so the doc's literal rule applies ("VER is the lowest"; we treat ties as lowest and flag that reading). With POC v2 fields the flag is `unknown` anyway |
| D3 | Intake before the chat | **Skip intake.** `/home` → clusterfit chat. `already_answered` is empty, so the guide covers every topic |
| D4 | When scoring runs | **After Part E** is submitted or skipped. Until then the student can change any B–D answer |
| D5 | After the results page | **Results page is the end** for now. Explore Path is hidden for clusterfit students; the page closes with "your counsellor will talk you through these" |
| D6 | Wellbeing, if no real handoff write exists | **Banner + flag on the capture.** Show the approved message (`getApprovedSafetyMessage` from `packages/safety`) and store `wellbeing_flag`. Record the missing handoff as a known gap |
| D7 | Counsellor dashboard | **Add clusterfit counts** (in progress, completed) next to the existing RIASEC counts. Existing numbers don't change |
| D8 | If `gemini-3.8-live` can't use locked tokens | **Stop and ask** before choosing a fallback (relay service, or plain token) |
| D9 | Launcher (college/graduate) students | **Keep the old flow.** Clusterfit is offered only to segments explorer and pathfinder (default; matches the POC's `SEGMENTS` and the doc's Grades 9–12) |

### 16.2 Technical fixes the implementation must include

| # | Problem found | Fix |
|---|---|---|
| F1 | `build:lambda` bundles only TypeScript, so reading `prompts/conversation-context-v2.md` from disk fails on Lambda | Import the prompt as text at build time (tsup `--loader .md=text`, applied to both `build` and `build:lambda`), or generate a TS module from it. Prompt edits need a redeploy, unlike the POC's live re-read |
| F2 | Lambda timeout is 30 s (`infra/bootstrap-aws.sh`, function URL). Extraction with a fallback model could exceed it | One shared time budget for all attempts (27 s), with each non-final attempt leaving a ~6 s reserve for the next. **Default order flash-lite → flash** (measured: flash 23 s vs flash-lite 3.8 s on a full chat, same fields; §16.4), set through `CLUSTERFIT_EXTRACTION_MODELS`. On failure, `check_coverage` returns "everything is covered" (POC never-block rule) |
| F3 | Lambda is stateless, so in-memory rate limits reset on every request | `clusterfit.sessions.live_tokens_issued` (max 3) and `coverage_checks` (max 2), incremented atomically in SQL (§9.1 DDL updated) |
| F4 | `AGENTS.md`: modules talk through contracts/ports, not each other's repositories | Clusterfit defines its ports (student profile, counsellor check, approved safety copy) and its own `plugin.ts` implements them from the shared packages' **existing public exports**, so `packages/assessment` is not edited. The counsellor side uses clusterfit's own routes (§17.2 X6–X7), so the assessment module never reads clusterfit |
| F5 | `pnpm db:types` has a fixed schema list, and the repo is not `supabase link`ed | Not needed: the plug-in keeps its own row types with raw `pg`. If generated types are wanted later, add `clusterfit` to the list then |
| F6 | `AGENTS.md`: every retryable write takes an idempotency key | Keys on `POST /sessions`, `PUT …/responses`, `POST …/situation-captures`, `POST …/situation/wellbeing` and `POST …/score`. PUTs that replace a whole document (`situation`, `values`, self-checks) are naturally idempotent |
| F7 | `AGENTS.md`: every public endpoint goes into the OpenAPI registry | All clusterfit routes registered at `/docs`. The dev `extract` route is registered only in the dev/fixture runtime |
| F8 | Microphone access needs a secure context | The deployed web origin must be HTTPS (localhost is fine for dev). The typed fallback covers browsers that block the mic |
| F9 | The POC's `segment` comes from `self_stage`, not class, so it can disagree with what the student says | The prompt already confirms the class once (POC rule), and the grade path uses the confirmed `class_level`. The counsellor sheet shows the POC's class-mismatch warning |
| F10 | A token that locks *every* setup field also locks `sessionResumption`, so a dropped chat can't resume | Lock only the fields we set: send `fieldMask` = the SDK's `lock_additional_fields=[]` mask, and leave `sessionResumption` out of the locked setup so the browser can send its handle (verified, §16.4) |
| F11 | Invented safety copy is forbidden (`AGENTS.md`) | The wellbeing banner shows only the safety module's approved message; with no approved message it shows nothing extra (the guide's spoken reply comes from the POC prompt). The current approved copy is placeholder text, which is a known gap |
| F12 | Lint: the React Compiler rules reject setState in effects and impure calls (`Date.now`, `crypto.randomUUID`) during render | Derive state from query data; generate ids and timings inside helpers called from event handlers (the first build's fixes) |

### 16.3 Scope stop (user, 2026-10-18)

This iteration ends at the **cluster suggestion**: the Part A voice/text chat, Parts B–E, scoring and the banded cluster result. Anything after it (cluster → career, stream or college mapping, the report narrative) is decided later.

### 16.4 Verified during the first build (2026-10-18, reverted but still true)

| Fact | How it was checked |
|---|---|
| `gemini-3.8-live` accepts single-use constrained ephemeral tokens: a client-sent prompt is ignored, tool calls arrive, a second session with the same token is refused | POC Python SDK against the real API |
| Token REST shape: `POST v1alpha/auth_tokens` with `bidiGenerateContentSetup` (model as `models/…`) and `fieldMask`; the browser connects to `…v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=<token>` and sends only `setup.model` (+ `sessionResumption`) | Captured from the SDK; replayed from Node with a browser-style WebSocket |
| With the field-mask lock, a resumed session remembers the chat and still ignores a client prompt | Resume test against the real API |
| Extraction latency on a 26-turn chat: flash-latest 23.0 s, flash-lite-latest 3.8 s, same 15 known fields and values | Timed against the real API |
| The TS port of `yuvapath.py` gives identical outputs to the Python on 3 parity cases (one with 10 warnings), and identical Live/extraction prompts and payload formatting | Parity fixtures generated from the POC's own functions |
| All 12 Kavya indices, bands and flags reproduce on the real database; cleanup leaves zero rows | Live run against the hosted DB |

### 16.5 Still open (needs input later, not blocking the start)

- **Saved transcripts for the parity test (M5.7):** the POC doesn't save transcripts. The first test transcripts will come from typed chats run through the POC page, with its `/api/extract` output saved alongside each one.
- ~~**Gemini API key / token check**~~ **Resolved 2026-10-18:** this repo's `GEMINI_API_KEY` is the same key as the POC's, and the constrained-token check passed (§16.4).
- **Prompt refinements:** the RIASEC sentence (§14.4), a `science_pcmb` value (§10.13), and medium and the other uncovered doc fields (§10.11). These come after the first implementation, as a `conversation-context-v3`.

---

## 17. Plug-in architecture and removal recipes (Rev 3, 2026-10-20)

**Goal (user, 2026-10-20):** keep the existing architecture and build clusterfit as a **separate, removable flow**. Later the team may either **remove clusterfit** or **replace the current workflow with clusterfit**, and either should be a small, mechanical change.

**Why Rev 3:** the first build (2026-10-18) was parallel, but it put clusterfit code into **18 shared files**:
- the `ModuleDescriptor` enum and the health list
- `create-app.ts` and `create-runtime-app.ts`
- `env.ts` and `package.json`
- `AGENTS.md` and `eslint.config.js`
- a new file inside `packages/assessment`
- `HomePage`, `CounselorHomePage` and `CounselorStudentReportPage`

It was reverted on 2026-10-18. Rev 3 keeps every decision in §1–§16 and changes only *how clusterfit connects to the app*.

### 17.1 Principle

```
┌──────────────── Shared foundation (stays in every future) ───────────────┐
│ auth · user_profiles · guardian consent · journey sessions               │
│ counsellor auth · safety · contracts · database pool · OpenAPI registry  │
└──────────────┬──────────────────────────────────────┬────────────────────┘
               │                                      │
    ┌──────────▼───────────┐               ┌──────────▼───────────┐
    │ Current workflow     │               │ Clusterfit plug-in   │
    │ intake → RIASEC →    │               │ chat → B–E → score → │
    │ explore path         │               │ cluster suggestion   │
    └──────────────────────┘               └──────────────────────┘
         unchanged                    own package, schema, routes, pages
```

**Rules:**
1. **The two workflows never import each other.** Both use only the shared foundation.
2. **Clusterfit owns everything specific to it:**
   - its package and content
   - its schema and migrations
   - its routes and web feature
   - its browser-storage keys (`yuvapath.clusterfit.*`)
   - its env vars and scripts
3. **Shared code knows only generic extension points**, never the name "clusterfit". Each extension point is a list, and a plug-in adds **one entry**.
4. **Off by default.** With both flags off, the app behaves exactly as it does today, and no clusterfit route, OpenAPI path or page exists.
5. **Clusterfit reads core data only through ports wired in its own composition file**, never by querying `assessment.*` tables.

### 17.2 Extension points: the only shared code that changes

They are added once, in a **first change that contains no clusterfit code at all**. That change must leave the app and all existing tests unchanged.

| # | Extension point | Shared file(s) | What clusterfit adds |
|---|---|---|---|
| X1 | **API plug-in list.** Type `ApiPlugin = { name; isEnabled(env): boolean; register(app, registry, deps): void }`; `createApp` registers each enabled plug-in after the core routes | new `apps/api/src/app/plugins.ts`; 1 loop in `create-app.ts` | 1 line: `clusterfitApiPlugin` |
| X2 | **Plug-in env.** Each plug-in validates its own env vars with its own zod schema; the core `env.ts` is not edited | new `apps/api/src/app/plugin-env.ts` (reads `process.env`, passes it to each `isEnabled`/`register`) | `CLUSTERFIT_ENABLED`, `GEMINI_LIVE_MODEL`, `CLUSTERFIT_EXTRACTION_MODELS`, validated inside the plug-in |
| X3 | **Contracts.** Plug-in schemas live in their own file; the core schemas are untouched | `packages/contracts/src/index.ts` (+1 export line) | `packages/contracts/src/clusterfit.ts` |
| X4 | **Web route list.** `router.tsx` spreads `pluginRoutes` | new `apps/web/src/app/plugin-routes.tsx`; 1 spread in `router.tsx` | 1 line: `...clusterfitRoutes` |
| X5 | **Journey entry.** One function decides where "Explore" on `/home` goes. It ships returning today's logic unchanged, and plug-ins can claim the entry | new `apps/web/src/app/journey-entry.ts`; `HomePage` calls it instead of its inline choice | 1 entry: `/clusterfit` when `VITE_CLUSTERFIT_ENABLED=true` |
| X6 | **Counsellor report sections.** The report page renders any registered `{ id, Component }` after its own content | new `apps/web/src/features/counselor/report-sections.ts`; 1 render loop in `CounselorStudentReportPage` | 1 entry |
| X7 | **Counsellor dashboard cards.** Same idea for the stats row | new `apps/web/src/features/counselor/dashboard-cards.ts`; 1 render loop in `CounselorHomePage` | 1 entry |
| X8 | **`AGENTS.md`** gets one generic paragraph: plug-ins live in their own package, schema and web feature; each plug-in names its own source-of-truth docs in its package README | `AGENTS.md` | `packages/clusterfit/README.md` names the two Pathfinder docs |

**Changes from the first build, and what it did instead:**
- **Health list:** not touched (no `ModuleDescriptor` enum change). The plug-in serves `GET /api/v1/clusterfit/health`.
- **`packages/assessment`:** not touched. The student-profile adapter lives in the plug-in's composition and uses assessment's **existing** exports (`PgUserProfileRepository` / `UserProfileService`). Only if no export fits, add one export line.
- **`eslint.config.js`:** not touched. The audio worklet is built from a TypeScript source inside the plug-in, as an inline Blob URL, so there's no plain `.js` file outside the TS project.
- **`db:types`:** the plug-in keeps its own row types (raw `pg`, as today). If generated types are wanted later, add `clusterfit` to the schema list then.
- **Existing counsellor endpoints:** not touched. The clusterfit counsellor data comes from `/api/v1/clusterfit/counselor/*` (§17.4).

### 17.3 Where clusterfit's code lives

| Layer | Location |
|---|---|
| Package | `packages/clusterfit/`: `content/v1`, `domain` (scoring), `situation` (POC port, prompt, mapper), `application`, `infrastructure` (pg, Gemini clients), `http`, `plugin.ts` (the `ApiPlugin`, wiring and ports), `scripts/`, `README.md` |
| Contracts | `packages/contracts/src/clusterfit.ts` |
| Database | `supabase/migrations/<ts>_clusterfit_prototype.sql`, plus a ready-made **down script** `packages/clusterfit/sql/down.sql` (`drop schema clusterfit cascade;` + delete its `schema_migrations` row) |
| Web | `apps/web/src/features/clusterfit/`: pages, components, Live chat (`live/`), API calls, storage, `plugin.ts` (exports `clusterfitRoutes`, the journey entry, the report section and the dashboard card) |
| Scripts | `packages/clusterfit/package.json` scripts (`rescore`, `pilot-analytics`, `remap-situations`, `sync-prompt`), run with `pnpm --filter @yuvapath/clusterfit <script>`. The root `package.json` is not edited |
| Tests | Inside the plug-in (`packages/clusterfit/**/*.test.ts`, `apps/web/src/features/clusterfit/**/*.test.tsx`), plus 2 guard tests in `apps/api/tests/plugins.test.ts` (§17.6) |

### 17.4 How each layer stays isolated

- **Database:**
  - a separate `clusterfit` schema that only creates objects
  - foreign keys out: `auth.users` on delete cascade (so user deletion and wipes keep working), and `assessment.journey_sessions` on delete set null
  - no core table is altered
  - apply only that one file; the hosted history has drifted, so never use `--include-all` (memory note)
- **API:** routes register only when `CLUSTERFIT_ENABLED=true`. The ports needed (student profile, counsellor check, approved safety copy) are built in `plugin.ts` from the shared packages' public exports.
- **Counsellor:** separate routes and separate sections and cards. The existing report and stats JSON never change.
- **Web:** the plug-in's pages and widgets appear only through X4–X7, and only when `VITE_CLUSTERFIT_ENABLED=true`.

### 17.5 Removal recipes

**A. Remove clusterfit (keep the current workflow):**
1. Delete `packages/clusterfit/`, `apps/web/src/features/clusterfit/` and `packages/contracts/src/clusterfit.ts`.
2. Delete clusterfit's one-line entry from each list:
   - `apps/api/src/app/plugins.ts`
   - `packages/contracts/src/index.ts`
   - `apps/web/src/app/plugin-routes.tsx`
   - `journey-entry.ts`
   - `report-sections.ts`
   - `dashboard-cards.ts`
3. Remove the 3 `CLUSTERFIT_*`/`GEMINI_LIVE_MODEL` env vars and `VITE_CLUSTERFIT_ENABLED`.
4. Run `packages/clusterfit/sql/down.sql` on the database (before deleting the folder), then delete the migration file.
5. `pnpm install`, then the required checks.

The extension points can stay; they're empty lists.

**B. Replace the current workflow with clusterfit:**
1. Make clusterfit the default journey entry in `journey-entry.ts` and drop its flag.
2. Remove only the RIASEC-specific parts:
   - intake and RIASEC pages
   - assessment-run routes and scoring
   - the Explore Path pages
   - `packages/recommendations` (unless reused for cluster → career)
3. **Prerequisite (separate refactor first):** `packages/assessment` also holds the shared foundation (identity, profiles, consent, journey sessions, counsellor auth). Split that into a foundation module before deleting the RIASEC code, so B removes code without rewriting anything that remains.

Both recipes are **dry-run on a scratch branch in M9** to prove they work.

### 17.6 Guard tests (keep the core honest)

- **Plug-in off:** `createApp` with no plug-ins enabled gives the same health response and the same OpenAPI path list as before, and `/api/v1/clusterfit/*` returns 404.
- **No core → plug-in imports:** a test fails if any file outside `packages/clusterfit` and `apps/web/src/features/clusterfit` imports from them, except the six one-line entries in X1, X3–X7.
- **Existing test suite:** unchanged, and green with the flag off and on.

---

## 18. Final scope for this iteration (Rev 4, 2026-10-20) — overrides every earlier section

**The user's flow, and the only thing this iteration builds:**

```
Existing auth (sign-up / sign-in, guardian consent for minors)     ← unchanged
  → Gemini Live chat  = Part A (POC fields) + Part E (top 3 of the doc's 9 cards)
  → confirm card      = check class (required) and the top 3 values
  → Part B  48 interest items
  → Part C  10 or 20 puzzles (Classes 9–10 / 11–12, from the confirmed class)
  → Part D  20 work-style items  → "See my clusters" = submit → scored
  → Cluster recommendation page: strong + worth-exploring clusters with the doc's
    example roles and entry routes.   END
```

Everything after the cluster recommendation, and every extra listed in §18.4, is **decided later**.

### 18.1 Decisions (user, 2026-10-20)

| # | Decision |
|---|---|
| R1 | **Straight into the chat after auth.** All sign-in, sign-up and consent paths already land on `/home`. With `VITE_CLUSTERFIT_ENABLED=true`, `/home` redirects to `/clusterfit` through the journey-entry hook (X5), so no auth page is edited. College/graduate students (segment `launcher`) get a 403 from the API and go to today's `/intake-questions`; the browser remembers that (`yuvapath.clusterfit.notEligible`) so `/home` doesn't bounce them again |
| R2 | **Part E moves into the chat.** One topic is added to the POC prompt and one field to its schema; every other POC field and rule is unchanged. Schema label **`conversation-context-v3`** = POC v2 + `values_top3` |
| R3 | **Scoring runs when the student submits Part D** (replaces §16.1 D4). Before that they can go back to any B–D answer. Part E is unscored and never blocks scoring |
| R4 | **The cluster page is the end** (as §16.1 D5). No Explore Path, no self-check |
| R5 | **No counsellor view in this iteration** (replaces §16.1 D7). Flags are still computed and stored with the result, as the doc defines them, but nothing displays them yet |
| R6 | *(user, 2026-10-22)* **Every answer is required** (replaces the §4.6 missing-answer policy). No "Skip for now" on puzzles, no "Skip the chat"; the API rejects an empty puzzle answer and scoring needs 100% of Parts B, C and D. The confirm card needs the class and exactly 3 value cards. The chat guide may still let a student pass over a conversational question (POC prompt unchanged) |
| R8 | *(user, 2026-10-22)* **Sign-up shows "Current stage" fixed to Higher secondary while clusterfit is on**; the chat and confirm card learn the exact class. Generic hook `fixedSignupStage` on the journey entry (X5); with the flag off sign-up is unchanged. Only core addition: `PgUserProfileRepository.updateEducationStage`. The confirm card records Classes 9–10 as `school`, 11–12 as `higher_secondary` |
| R9 | *(user, 2026-10-22)* **The whole platform is for Classes 9–12 only.** College, graduate and working-adult ("launcher") logic is removed everywhere (segments, sign-up stages, intake set, goal-based tabs, 90-day career plan, counsellor welcome copy, clusterfit's not-eligible path and "I've finished school"). Migration `20261022000100_classes_9_12_only.sql` (applied 2026-10-22) deleted the 3 launcher accounts and their data, the launcher intake set and plan template, and the class options outside 9–12. The College recommendations tab stays for Classes 11–12 |
| R10 | *(user, 2026-10-22)* **Clusterfit is the only student flow; the old journey is removed.** Deleted: intake, RIASEC assessment, recommendations/Explore Path, the AI counsellor, the counsellor and regional-admin portals, and the recommendations, knowledge, counselor, evaluation and test-fixtures packages (state/city search moved into `packages/assessment`; `packages/safety` trimmed to the approved-copy reader). Clusterfit is now a core module (no `CLUSTERFIT_ENABLED` flag, no plug-in hooks); `/home` forwards to `/clusterfit`. Old-flow database tables and migrations stay untouched. Sign-up: "Current stage" fixed to *In school* (not editable), no minimum age (new `minor_under_12` age band), guardian consent for under-18s. The confirm card no longer shows the class when the chat caught it (asks only if missing). The results page no longer has the closing line |
| R11 | *(user, 2026-10-22, temporary)* **No confirm card, all puzzles for everyone.** The chat screen has **"Skip this"** (replacing "I'm done"); skipping, finishing or a failed chat all call `PUT /sessions/{id}/situation/complete`, which opens Part B. The confirm card (class + values) is switched off; what the chat captured is kept as is, and a class it caught is recorded as the profile stage. Every student gets all 20 puzzles (`puzzleGradePath()` returns `11_12`); the Classes 9–10 split comes back later. The last button reads **"See my results"** |
| R7 | *(user, 2026-10-22)* **The results page shows all 12 clusters**, best first in the doc's ranking order (§8.1 tie-break), as cards three to a row (two on tablets, one on phones), with the **top 3 highlighted** by a purple border. Each card is tagged "Strong match" / "Worth exploring" / "Less of a match for now" from its band; no numbers. This replaces the doc's "low signals hidden" rule for the student view. The doc's own presentation (max 3 strong + up to 3 explore) is still stored in the result for the later counsellor view |
| R12 | *(user, 2026-10-26)* **The student can retake the test from the results page** (amends R4). "Retake the test" asks for an inline confirm, then `POST /sessions/{id}/reattempt` (idempotent on the key, only for a scored session) marks that session `abandoned` and starts a new attempt (`attempt_number` + 1) at About you. The old attempt's chat, answers and results are **kept in the database, not deleted**, and never shown to the student again; `POST /sessions` resumes the new attempt, which is scored on its own answers. No migration (the `abandoned` status and `attempt_number` already existed) |

### 18.2 Part E inside the chat

**Prompt** (`prompts/conversation-context-v3.md`): the POC's `prompt.revised.v3.md` with two changes.

1. **New topic, asked after the POC topics and before the closing summary:**
   > **11. What matters most.** Ask the doc's Part E question in spoken form: "People choose work for different reasons. Which three of these matter most to you right now?" Read the nine options in small groups of three, never as one long list:
   > - a steady income and job security
   > - earning well as early as possible
   > - staying close to family and home place
   > - helping others or improving my community
   > - being my own boss
   > - learning and growing in my field
   > - respect and recognition from others
   > - freedom to be creative
   > - chances to travel or live in new places
   >
   > Then ask which matters most of the three. Accept "not sure" and move on.
2. **The "Assessments" sentence** no longer names RIASEC (open issue §10.12): *"After this conversation, YuvaPath will ask some activity questions and short everyday puzzles."*

**Extraction schema field** (added to `ConversationContext` v2 → v3):
```ts
values_top3: ContextField<{ value: "steady_income" | "earn_early" | "stay_close_home" | "help_community"
                                 | "own_boss" | "learn_grow" | "respect" | "creative_freedom" | "travel",
                            rank: 1 | 2 | 3 }[]>   // up to 3, ranks unique
```

**Checks added to the ported POC post-processing:**
- `TOPICS.values_top3` = "the three things that matter most to them in a job"
- `consistencyWarnings`: no duplicate values or ranks, at most 3 entries
- `missingTopics` covers it, so `check_coverage` reminds the guide

**Mapper `conversation-context-v3` → canonical:** adds `values: [{value, rank}] | null`, written to `clusterfit.values_rankings`.

**Confirm card:**
- shows the three choices and lets the student fix the order or pick them
- class stays required
- values can be left empty (Part E is unscored, doc §"Part E")

**Parity:** the POC parity tests (§12, §14.8 M5.7) still cover every v2 field and rule. The v3 additions get their own unit tests.

### 18.3 What is built (final layout)

**Extension points (added first, no clusterfit code):**
- **X1** API plug-in list
- **X2** plug-in env
- **X3** contracts export
- **X4** web plug-in routes
- **X5** journey entry (`/home` → plug-in landing)
- **X8** `AGENTS.md` note

X6 and X7 (counsellor sections and cards) are **not built**.

**`packages/clusterfit/`:**
- `content/v1`
- `domain` (scoring exactly per §5)
- `situation` (POC port + v3 additions, prompt, mapper)
- `application`, `infrastructure` (pg, Gemini clients), `http`
- `plugin.ts`, `sql/down.sql`, `README.md`
- `scripts/sync-prompt.mjs` only

**Database (6 tables)** in schema `clusterfit`:
- `sessions`
- `situation_captures`
- `situations`
- `responses`
- `values_rankings`
- `results`

`result_clusters` and `self_checks` are left out.

**API routes:**
- `POST /sessions`, `GET /sessions/:id`
- `GET /sessions/:id/parts/:part/items`
- `PUT /sessions/:id/responses`
- `POST /sessions/:id/live-token`
- `POST /sessions/:id/situation/coverage`
- `POST /sessions/:id/situation/wellbeing`
- `POST /sessions/:id/situation-captures`
- `GET`/`PUT /sessions/:id/situation` (confirm card: class + values)
- `POST /sessions/:id/score` (submit after Part D)
- `GET /sessions/:id/result`
- `GET /health`
- `POST /dev/extract` (dev only)

**`apps/web/src/features/clusterfit/`:**
- `ClusterfitPage` (chat → confirm → B → C → D → submit)
- `ClusterfitResultsPage`
- `live/` (Gemini Live chat)
- `SituationStep`, `ItemsStep`
- `api/`, `lib/` (storage, copy)
- `plugin.ts`

### 18.4 Left out of this iteration (decide later)

- counsellor report section and dashboard counts
- re-score, pilot-analytics and remap scripts
- "Does this sound like you?" self-check
- offline answer queue (autosave + resume after reload stays)
- separate Part E screen
- answer-quality notes display, flag display
- read-aloud, Tamil content, paper data-entry mode
- cluster → career, stream or college mapping

### 18.5 Milestones for this scope

These replace the §11 list.

- [x] **M0** Spec and decisions (§16.1, §18.1)
- [x] **M1** Extension points X1–X5, X8 + guard tests (§17.6); app and all existing tests unchanged
- [x] **M2** Contracts + content (B, C, D items, 12 clusters, matrix, answer key with MEC4 = A, the 9 value cards)
- [x] **M3** Scoring engine + tests (doc example SCI = 85, Kavya golden case, boundaries)
- [x] **M4** *(migration applied 2026-10-20; live DB check passed in the M7 walkthrough)* Database (6 tables) + down script + API + `plugin.ts`; live check on the real DB, then clean up
- [x] **M5** Gemini Live chat with Part A + Part E (prompt/schema v3, constrained token, resumption, extraction lite → flash, confirm card)
- [x] **M6** Parts B–D pages, submit → score, cluster recommendation page, `/home` redirect
- [~] **M7** Verification:
  - [x] typed walkthrough as a Class 11 student, 2026-10-20: sign-up → /clusterfit → Live chat (A + E, check_coverage, end_discovery) → confirm card → B 48 → C 20 → D 20 → results. The stored result matches the Kavya golden case (strong HLT, AGR, EDU; explore SCI, DIG, HOS; BUS hidden strength; language caution `unknown`)
  - [ ] still open: Class 10 path, a voice run, reload to resume, a college student, flags off, the §17.5 A dry-run
  - **Finding:** extraction took 22–49 s that day, over Lambda's 30 s. Locally `CLUSTERFIT_EXTRACTION_BUDGET_MS=90000` was used. This needs a decision before deploying
  - a browser walkthrough as a Class 10 and a Class 12 student, by voice and by typing
  - reload to resume
  - a college student sent to the old flow
  - flags off = today's app
  - the "remove clusterfit" recipe (§17.5 A) dry-run on a scratch branch
