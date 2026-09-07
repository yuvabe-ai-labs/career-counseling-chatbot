# Explore Screen: What Each Segment Sees

This is a reference for the guidance/"Explore" screen — six map tabs (Careers, Streams,
Pathways, Colleges, Scholarships & Aid, Plan) across the app's three student segments
(Explorer, Pathfinder, Launcher). Every claim below has been checked against the PRD
(`docs/reference/yuvanext-prd-tamil.md`) and, where the PRD is silent or ambiguous, against
the actual scoring code in `packages/recommendations/src/domain/`. Sourcing is marked on
every row:

- **PRD** — stated directly in the PRD user stories.
- **Code** — the PRD doesn't say, so this is read off the actual scoring/matching logic.
- **Inferred** — neither says it directly; this is a reasonable fill of a gap, flagged so it
  can be confirmed with product before anyone builds against it.

> Status check: none of this is live in the app yet. Only the assessment result screen
> (`RiasecResultsPage.tsx`) is built. Everything below is the target design pulled from the
> spec, not a description of running screens.

---

## 1. Who is in each segment (correction from last pass)

I previously gave age ranges I hadn't verified. Checking the PRD's opening section against
the code that actually assigns a segment turned up a real mismatch:

| Segment | PRD says (Section 1) | Code actually does (`user-profile.ts`) |
|---|---|---|
| **Explorer** | Age 12–16 | Age ≤ 15 (or self-described stage = "school") |
| **Pathfinder** | Age 17–18 | Age 16–18 (or self-described stage = "higher secondary") |
| **Launcher** | Graduate / generally 19+ | Age 19+ (or stage = college / graduate / working) |

The one-year boundary difference (16 vs. 15) rarely matters in practice, because a student's
**self-described education stage overrides age whenever it's given** — age is only the
fallback when someone selects "other" for their stage. The PRD document itself says the
original English PRD file (not this Tamil translation) is the authoritative source if the
two ever disagree, so treat the code's boundary as correct until that's confirmed.

**Launcher isn't really an age group — it's a "how far along" group.** The primary signal
is the stage someone tells the app they're at: *college student, graduate,* or *working*
puts them in Launcher regardless of age — a 17-year-old already in their first year of
college counts. Age 19+ is only a fallback, used when someone doesn't specify a stage at
all. That distinction is why Launcher's tabs look different from Explorer/Pathfinder's, not
just "older students get more detail" — see §3.5 below.

---

## 2. Overview — is the tab shown at all?

| Map tab | Explorer | Pathfinder | Launcher | Source |
|---|---|---|---|---|
| **Careers** | Yes — no match % shown | Yes — match % shown | Yes — main tab, match % + full detail | PRD (US-32 only makes sense if Explorer sees this screen too — see note below) |
| **Streams** | Yes — main tab | Yes — feeds Pathways | **No** — their stream was chosen years ago, in school | PRD (US-15); Launcher exclusion is a decision, see §3.5 |
| **Pathways** | No | Yes — main tab | **No** — their degree route is already fixed | PRD for Explorer/Pathfinder; Launcher exclusion is a decision, see §3.5 |
| **Colleges** | No | Yes | Yes, same depth as Pathfinder | PRD names Pathfinder; Launcher filled in from code (see §3.5) |
| **Scholarships & Aid** | No | No | Yes, only if the student asked for aid help | PRD (US-15, US-36) |
| **Plan** | Yes — 3 missions | Yes — route/backup comparison | Yes — 90-day plan | PRD (Module 2 "Segment plans") |

A Launcher's screen, in short, really has **four live tabs, not six**: Careers (main) →
Colleges → Scholarships & Aid (if requested) → Plan. Streams and Pathways are switched off
for them on purpose, not left ambiguous — both represent a decision (school stream, degree
route) that someone already in college, graduated, or working has, by definition, already
made in real life. Showing those tabs again would just be noise.

### The Careers/Explorer reconciliation

US-15's one-line summary of Explorer's screen only says "streams + 3 missions" — Careers
isn't named. But US-32 (career rings) separately states: *"Don't show fit percentage to
Explorer; Pathfinder and Launcher can see it."* That instruction is meaningless unless
Explorer also sees the careers screen — you can't hide a percentage on a screen someone
never opens. Read together, the PRD does support "Careers is shown to everyone, only the
percentage and depth changes" — it's just spread across two different user stories instead
of stated once.

---

## 3. Per-tab detail: what's visible at each depth

### Careers

| Depth | Explorer | Pathfinder | Launcher |
|---|---|---|---|
| **At a glance** | Career name + which ring (closest match / related / further out). No percentage — the number is still calculated, just not displayed. *(PRD, US-32)* | Same, plus a visible match percentage. *(PRD, US-32)* | Same as Pathfinder. *(PRD, US-32)* |
| **Tap in** | One plain-language sentence on why it's listed. Nothing else. *(Inferred — PRD doesn't spell out Explorer's detail view; kept minimal to match the "no pressure" tone US-15 sets for this segment)* | The match reason broken into parts (interest fit, and values fit if measured), plus which stream leads there. *(Code — `career-matching.ts` explanation fields)* | Full profile card: photo, entry salary range with a "varies by city/year" caveat and last-checked date, 3–5 real skills, typical next role after ~3 years, a plan button. *(PRD, US-34)* |

Every career list is built from up to 18 candidates split into three rings — the 3–4
strongest matches, 5–6 related ones, and 5–6 further out (always including at least one
hands-on/skill-trade career and one unexpected pick) — the same rule for all three segments.
*(PRD, US-32)*

### Streams

| Depth | Explorer | Pathfinder | Launcher |
|---|---|---|---|
| **At a glance** | Main tab. Streams ranked by fit, described in words, no percentage. *(PRD, US-15 + Inferred no-% rule — see note)* | Same list, now with a percentage; feeds directly into Pathways. *(Code — stream catalog entries carry a `recommendedSegments` field including pathfinder)* | **Not shown.** *(Decision — see §3.5)* |
| **Tap in** | Which subjects the stream actually contains, tied to their own answers. *(Inferred)* | Subjects included, plus which pathways/clusters this stream unlocks. *(Code)* | — |

Note: the PRD only states the "hide the percentage" rule for Careers (US-32). Applying the
same rule to Streams for Explorer is an assumption for consistency, not a written rule —
worth confirming with product before building it that way.

### Pathways

| Depth | Explorer | Pathfinder | Launcher |
|---|---|---|---|
| **At a glance** | Not shown — a pathway assumes a stream has already been picked, which is a step ahead of Explorer. *(PRD, US-15 — Explorer's inventory doesn't include this)* | Main tab. 3–5 route clusters, each showing the connected career and stream, a realism/reachability indicator, and a clear "has a backup route" flag. *(PRD, US-15)* | **Not shown** — same reasoning as Explorer, just from the other end: a Launcher's degree route is already fixed, so there's nothing left to compare. *(Decision — see §3.5; the Launcher demo plan template also targets a career directly, not a pathway, which supports this)* |
| **Tap in** | — | The specific degree, the entrance exam, and the backup route written out in full. *(PRD, US-15 + Code)* | — |

### 3.5 Why Streams and Pathways switch off for Launcher

Explorer doesn't get Pathways because they haven't chosen a stream *yet* — they're one step
**before** it exists. Launcher doesn't get Streams or Pathways because they've already
**passed** that step — whether through this app or, more often, in real life years earlier
(their school stream is fixed; if they're in college, graduated, or working, their degree
route is fixed too). Both segments are missing the same two tabs, for opposite reasons: one
is too early, the other is already past it. What's actually left open for a Launcher isn't
"which stream/route" — it's "which specific career, which specific college, and how do I
get moving in the next 90 days." That's why their screen narrows to Careers → Colleges →
(Scholarships, if requested) → Plan.

### Colleges

| Depth | Explorer | Pathfinder | Launcher |
|---|---|---|---|
| **At a glance** | Not shown — no chosen subject area yet to filter colleges against. *(PRD, US-15 — not in Explorer's inventory)* | Main tab. Ringed by state: 3–4 best in home/selected state, 5–6 nearby-state options, then other states plus at least one skill-based route (ITI/polytechnic/vocational) and one open university. *(PRD, US-15 + US-35)* | Same ring structure as Pathfinder. **The PRD's Launcher line (US-15) doesn't mention colleges at all** — this is filled in because `college-recommendations.ts` has no segment field anywhere in its scoring, so nothing in the system actually blocks it, and a student about to apply needing no college list would be a strange gap. *(Code + Inferred)* |
| **Tap in** | — | City, college type, disciplines offered, how to get in, fee range, last-checked date. *(PRD, US-35)* | Same as Pathfinder. *(Inferred)* |

### Scholarships & Aid

| Depth | Explorer | Pathfinder | Launcher |
|---|---|---|---|
| **At a glance** | Not shown. *(PRD)* | Not shown — this tab waits until a student is closer to actually applying. *(PRD, US-15 — Pathfinder's inventory doesn't include aid)* | Shown **only if the student has said they want aid help** (`wants_aid = true`). Each scheme is labeled "likely," "worth checking the conditions," or "worth exploring" — never "guaranteed." *(PRD, US-15 + US-36, matches `aid-recommendations.ts` exactly)* |
| **Tap in** | — | — | Provider, amount, application window, official application link, minimum eligibility, last-verified date, a note that terms can change yearly. *(PRD, US-36)* |

### Plan

| Depth | Explorer | Pathfinder | Launcher |
|---|---|---|---|
| **What it is** | "Explorer Safe Missions" — three light weekly activities: compare two subjects tied to a stream of interest, talk to one trusted adult about it, go see one real-world example nearby. No dates, no pressure. *(PRD, Module 2 "Segment plans" + `plan-generation.ts` template)* | "Pathfinder Route Plan" — two steps: compare the different ways into the chosen route, and write down its backup routes. *(PRD + Code)* | "Launcher 90-Day Plan" — three stages with real dates: Days 1–30 shortlist entry requirements, Days 31–60 complete one portfolio/practice task, Days 61–90 recheck backups and note application dates. *(PRD + Code)* |

---

## 4. Open questions to confirm with product

These are the spots where the PRD text doesn't actually say what happens, so the entries
above are a best reading rather than a written rule:

1. **Does Launcher see Colleges?** Not named in US-15's Launcher line, but the scoring
   logic doesn't gate it by segment, and it seems like an odd thing to withhold from the
   segment closest to actually applying — resolved above as "yes," but worth a product
   sign-off since it's not written down anywhere.
2. **Should Streams hide the match percentage from Explorer, like Careers does?** The PRD
   only writes that rule for Careers (US-32); extending it to Streams is an assumption for
   consistency.
3. **Exact age cutoff for Explorer→Pathfinder** — 15/16 (code) vs. 16/17 (PRD text) — low
   impact since self-described stage overrides age in practice, but worth reconciling in the
   source PRD file.

---

## 5. Dummy data — one worked example per segment

**Fictional students, fictional numbers.** These are made up to show what the fields in
every tab above would actually be filled with — nobody's real data. One student per
segment, carried through all six tabs.

### Explorer — "Priya", 14, Chennai, Tamil Nadu, stage: school

Top interests (from her assessment): **Artistic, Social, Investigative**

**Careers** (name + ring only, no percentage)

| Ring | Career | Why it's listed (tap-in) |
|---|---|---|
| Inner | Graphic Designer | "This fits because you enjoy creating original work and design." |
| Inner | Animator | "This fits because you enjoy open-ended, creative tasks." |
| Middle | Community Health Worker | "This fits because you enjoy helping and supporting people." |
| Middle | Teacher | "This fits because you enjoy guiding others." |
| Outer | Civil Drafting Technician *(vocational pick)* | "A hands-on option worth a look, even though it's less obvious for you." |
| Outer | Public Policy Associate *(unexpected pairing)* | "A different angle on helping people, worth exploring." |

**Streams** (main tab, no percentage)

| Stream | Why it fits |
|---|---|
| Arts and Design | "You enjoy creating original work — this stream includes design, language, and fine arts subjects." |
| Vocational Health Sciences | "You enjoy helping people — this stream includes health-support and caregiving subjects." |
| Science with Computer Science | "This stream leans toward numbers and lab work — a lighter match for your answers." |

**Pathways:** not shown. **Colleges:** not shown. **Scholarships & Aid:** not shown.

**Plan — "Explorer Safe Missions"** (target: Arts and Design stream)

| Step | Timing | Action |
|---|---|---|
| 1 | Week 1 | Compare two subjects connected to Arts and Design. |
| 2 | Week 2 | Talk to one trusted adult about stream choices. |
| 3 | Week 3 | Observe one local example of this path in Tamil Nadu. |

---

### Pathfinder — "Arjun", 17, Bengaluru, Karnataka, stage: higher secondary, marks band: high

Top interests: **Investigative, Realistic, Conventional**

**Careers** (name + ring + match %)

| Ring | Career | Match | Tap-in detail |
|---|---|---|---|
| Inner | Data Scientist | 88% | Interest fit 0.86 · values fit 0.81 · route reachability medium (0.65) · leads via "Science with Computer Science" |
| Inner | Cybersecurity Analyst | 91% | Interest fit 0.90 · values fit 0.84 · route reachability high (1.0) |
| Middle | Robotics Technician | 74% | Interest fit 0.71 · feasibility high · vocational route |
| Middle | Environmental Scientist | 69% | Interest fit 0.68 · feasibility medium |
| Outer | Civil Drafting Technician *(vocational)* | 55% | Lower interest overlap, kept for a hands-on alternative |
| Outer | Public Policy Associate *(unexpected)* | 47% | Cross-domain discovery pick |

**Streams** (with %)

| Stream | Match |
|---|---|
| Science with Computer Science | 92% |
| Commerce with Applied Mathematics | 68% |
| Vocational Health Sciences | 40% |

**Pathways** (main tab)

| Pathway | Reachability | Backup route? | Tap-in detail |
|---|---|---|---|
| BSc Computer Science | High (1.0) | Yes | Degree: B.Sc Computer Science (3 yrs) · Exam: state CET / institution entrance test · Backup: Diploma in Computer Applications (2 yrs) at a polytechnic |
| BCom Business Analytics | High (1.0) | Yes | Degree: B.Com Business Analytics (3 yrs) · Exam: merit-based · Backup: Certificate in Data Entry & Analytics |
| Diploma in Renewable Energy | Medium (0.65) | Yes | Degree: Diploma in Renewable Energy (2 yrs) · Exam: polytechnic entrance · Backup: ITI Electrician trade |

**Colleges** (ringed on Karnataka as home state)

| Ring | College | Tap-in detail |
|---|---|---|
| Inner (home state) | Bengaluru Design College | City: Bengaluru · Type: Regular · Disciplines: Computer Science, Design · Admission: merit + entrance · Fees: ₹90,000–1,30,000/yr · Verified: Jul 2026 |
| Inner (home state) | Karnataka Open University | City: Mysuru · Type: Open university · Disciplines: Computer Science · Admission: open entry · Fees: ₹15,000–25,000/yr · Verified: Jul 2026 |
| Middle (nearby state) | Chennai Science College | City: Chennai, Tamil Nadu · Type: Regular · Disciplines: Computer Science · Admission: state entrance + merit · Fees: ₹80,000–1,20,000/yr · Verified: Jul 2026 |
| Middle (nearby state) | Coimbatore Polytechnic Institute | City: Coimbatore, Tamil Nadu · Type: Polytechnic · Disciplines: Applied Sciences · Fees: ₹30,000–45,000/yr |
| Outer (other state + access route) | Andhra Rural ITI *(vocational)* | City: Anantapur, Andhra Pradesh · Type: ITI · Fees: ₹8,000–12,000/yr |
| Outer (open route) | Telangana Open Learning Centre | City: Hyderabad, Telangana · Type: Open university · Fees: ₹18,000/yr |

**Scholarships & Aid:** not shown (Pathfinder segment).

**Plan — "Pathfinder Route Plan"** (target: BSc Computer Science pathway)

| Step | Timing | Action |
|---|---|---|
| 1 | Week 1 | Compare entry routes for BSc Computer Science. |
| 2 | Week 2 | List backup routes for this pathway. |

---

### Launcher — "Divya", 20, Kochi, Kerala, stage: graduate, marks band: high, wants aid: yes

Divya is a Launcher because her stage is "graduate" — her school stream and her degree are
already behind her, so her screen only has four live tabs: Careers, Colleges, Scholarships
& Aid, and Plan.

Top interests: **Enterprising, Conventional, Investigative**

**Careers** (name + ring + match % + full profile card)

| Ring | Career | Match | Tap-in — full profile card |
|---|---|---|---|
| Inner | Sales Operations Analyst | 89% | Entry salary: ₹3.5–4.8 LPA *(varies by city/company/year, last checked Jul 2026)* · Skills: CRM tools, data analysis, negotiation, reporting, stakeholder communication · Next role (~3 yrs): Regional Sales Manager · **[Build my plan]** |
| Inner | Accountant | 85% | Entry salary: ₹3.0–4.2 LPA *(last checked Jul 2026)* · Skills: bookkeeping, GST filing, financial reporting, spreadsheets, audit basics · Next role (~3 yrs): Senior Accountant · **[Build my plan]** |
| Middle | Entrepreneurship Associate | 77% | Entry salary: ₹3.2–5.0 LPA · Skills: pitching, market research, budgeting, networking · Next role: Venture Associate |
| Middle | Public Policy Associate | 66% | Entry salary: ₹3.0–4.5 LPA · Skills: research writing, stakeholder mapping, data analysis |
| Outer | Civil Drafting Technician *(vocational)* | 52% | Entry salary: ₹2.2–3.0 LPA · Skills: CAD tools, site measurement |
| Outer | Community Health Worker *(unexpected)* | 44% | Entry salary: ₹2.0–2.8 LPA · Skills: patient communication, record-keeping |

**Streams:** not shown — Divya already completed her Commerce stream and her degree; there's
nothing left to compare.

**Pathways:** not shown — same reason; her route (graduate → career) is already fixed.

**Colleges** (same depth as Pathfinder, ringed on Kerala as home state)

| Ring | College | Tap-in detail |
|---|---|---|
| Inner | Kochi Commerce College | City: Kochi · Type: Regular · Disciplines: Business Analytics, Commerce · Admission: merit-based · Fees: ₹60,000–90,000/yr · Verified: Jul 2026 |
| Middle | Mysuru Commerce College | City: Mysuru, Karnataka · Type: Regular · Disciplines: Commerce · Fees: ₹55,000–80,000/yr |
| Outer (open route) | Telangana Open Learning Centre | City: Hyderabad, Telangana · Type: Open university · Fees: ₹18,000/yr |
| Outer (vocational) | Andhra Rural ITI | City: Anantapur, Andhra Pradesh · Type: ITI · Fees: ₹8,000–12,000/yr |

**Scholarships & Aid** (shown — Divya asked for aid help)

| Label | Scheme | Tap-in detail |
|---|---|---|
| **Likely** | Central Post-Matric Aid | Provider: Govt. of India, Ministry of Social Justice · Amount: tuition + maintenance allowance · Window: Aug–Oct · Apply: `example.org/central-post-matric` · Minimum eligibility: SC/ST/OBC category, marks medium or above · Verified: Jul 2026 · Note: amounts revised yearly |
| **Check conditions** | CSR STEM Access Grant | Provider: private CSR trust · Amount: ₹25,000 one-time · Window: rolling · Minimum eligibility: STEM stream interest (not yet confirmed for Divya) + Tamil Nadu/Karnataka/Kerala residency (matched) |
| **Worth exploring** | State Merit Scholarship | Only open to Tamil Nadu residents — Divya is in Kerala, so this doesn't match; kept visible in case she relocates, but pushed to the bottom |

**Plan — "Launcher 90-Day Plan"** (target: Sales Operations Analyst career)

| Step | Timing | Action |
|---|---|---|
| 1 | Days 1–30 | Shortlist entry requirements for Sales Operations Analyst. |
| 2 | Days 31–60 | Complete one portfolio/practice task — e.g. a mock sales-analytics case study. |
| 3 | Days 61–90 | Review backup routes and note real application dates. |

---

## 6. Checking a proposed implementation plan against the PRD and the code

A flow was proposed for what each segment should show. Each part is checked below against
the PRD (`docs/reference/yuvanext-prd-tamil.md`) and the actual scoring code, and marked:

- ✅ **Correct** — matches the PRD and/or code directly.
- 🧩 **Apt** — not written down anywhere explicitly, but a reasonable, defensible read.
- ❌ **Wrong** — contradicts what the PRD or code actually says.

### Explorer

> *Proposed: Career, Stream, Plan — not Pathways, not Colleges.*

| Tab | Proposed | PRD says | Code says | Verdict |
|---|---|---|---|---|
| Career | Shown | Not named in US-15's one-line Explorer summary, **but** US-32 says "don't show the fit % to Explorer" — a rule that only makes sense if Explorer sees the careers screen at all | `career-matching.ts` has no segment check; scores any segment equally | 🧩 **Apt** — right conclusion, just reached by combining two different user stories, not one explicit line |
| Stream | Shown | Explicitly named: *"Explorer: streams + 3 missions"* | `stream-recommendations.ts` scores regardless of segment | ✅ **Correct** |
| Plan | Shown | Explicitly named: *"3 missions"* | `plan-generation.ts` → explorer maps to `"exploration"` type → the "Explorer Safe Missions" template | ✅ **Correct** |
| Pathway | Excluded | Not named for Explorer | — | ✅ **Correct to exclude** |
| College | Excluded | Not named for Explorer | — | ✅ **Correct to exclude** |

**Verdict: correct.** Career + Stream + Plan, nothing else, is the right set for Explorer.

### Pathfinder

> *Proposed: Career (with %), Stream, College, Pathway, Plan, Scholarship — and that
> Pathway is calculated from Career + Stream + College.*

| Tab | Proposed | PRD says | Code says | Verdict |
|---|---|---|---|---|
| Career (%) | Shown with % | US-32: *"...Pathfinder/Launcher can see it"* | `career-matching.ts` computes the same `fitScore` for everyone; only the display layer hides/shows it | ✅ **Correct** |
| Stream | Shown | Not named in US-15's one-liner, but a pathway's score needs a ranked stream list as an input, and the stream catalog explicitly tags entries for `"pathfinder"` | `pathway-recommendations.ts` takes `rankedStreamIds` as a required input | 🧩 **Apt** — logically necessary even though not spelled out |
| College | Shown | Explicitly named: *"state-filtered colleges"* | `college-recommendations.ts` | ✅ **Correct** |
| Pathway | Shown | Explicitly named: *"3–5 clusters, degrees, exams... backup routes"* | `pathway-recommendations.ts` | ✅ **Correct** |
| Plan | Shown | Module 2 doc: *"Pathfinder: 3–5 pathway clusters with degree/exam/college and backup-route references"* | `plan-generation.ts` → pathfinder maps to `"pathway"` type → "Pathfinder Route Plan" | ✅ **Correct** |
| Scholarship | Shown | **US-15 ties aid strictly to Launcher**, gated by `wants_aid=true` — Pathfinder's line has no aid mention at all | `aid-recommendations.ts` has no segment check, so it *could* technically run for anyone — but nothing says it should for Pathfinder | ❌ **Wrong** — remove this; it belongs to Launcher (see below) |

**On "Pathway is found using fields of Career, Stream, and College":** checked directly
against `pathway-recommendations.ts` — this is half right.

- The **pathway's actual score** (`fitScore`) is built from exactly two ranked lists:
  `rankedCareerIds` and `rankedStreamIds`. **College is not an input to the pathway formula
  at all** — the `PathwayCatalogRecord` type doesn't even have a college field.
- What *is* true: the PRD describes a pathway cluster's **detail view** as showing a degree,
  an exam, and (per US-15) college context alongside it — so if the intent was "a pathway
  card displays career + stream + college info together," that's an accurate description of
  the **display**, just not of the **scoring math**. Colleges are computed completely
  separately (by discipline + state), and a pathway's chosen discipline is what would feed
  *into* the college search — not the other way around, and not part of ranking the pathway
  itself.

**Verdict: mostly correct**, with two fixes — drop Scholarship, and correct the mental model
of Pathway to "Career + Stream → Pathway score" (College is downstream of it, not an
ingredient in it).

### Launcher

> *Proposed: Career, Stream, College, Pathway, Plan (no Scholarship) — shown dynamically
> using the intake answers current_goal, highest education level, and current_status
> ("what are you doing right now").*

| Tab | Proposed | PRD says | Code says | Verdict |
|---|---|---|---|---|
| Career | Shown | Explicitly named: *"ranked careers"* | `career-matching.ts` | ✅ **Correct** |
| Stream | Shown | **Not named for Launcher** in US-15 | The stream catalog schema *can* tag a stream as launcher-relevant (seen in the demo fixture), so it's not code-impossible | ⚠️ **Not supported, not forbidden either** — recommend leaving off (a Launcher's stream was already chosen years earlier), but it's a product call rather than a hard rule |
| Pathway | Shown | **Not named for Launcher** in US-15 | The Launcher demo plan template targets a *career* directly, never a pathway | ❌ **Not supported** — recommend leaving off |
| College | Shown | **Not named for Launcher** in US-15 (a real gap in the one-liner) | No segment check in `college-recommendations.ts` at all | 🧩 **Apt** — reasonable fill of a PRD gap; a student about to apply needs a college list |
| Plan | Shown | Explicitly named: *"90-day plan"* | `plan-generation.ts` → launcher maps to `"career_90_day"` | ✅ **Correct** |
| Scholarship | **Excluded** | ❌ **This is backwards.** US-15 explicitly gives Launcher an aid section when `wants_aid=true` | `aid-recommendations.ts` + the `wantsAid: boolean` field on `ProfileSnapshot` exist for exactly this | ❌ **Wrong — should be included, not excluded** |

**On "shown dynamically using current_goal / highest education level / current_status":**
checked directly against every file in `packages/recommendations/src/domain/` — none of
these three field names appear anywhere in the matching, ranking, or explanation code.
`ProfileSnapshotForRecommendations` (the actual input type every recommender reads) has
only five fields: `segment`, `state`, `marksBand`, `riasec`, `workValues`. These three
intake answers are asked and stored, but **nothing today reads them back into a
recommendation.** This is a reasonable idea for how Launcher *should* work, but it isn't
built — the same gap noted for `field_of_study` and `location_preference` earlier in this
document.

**Verdict: needs correction on two fronts.** Career and Plan are right. College is a
defensible inclusion. Stream and Pathway should come out (or be treated as unconfirmed).
Scholarship needs to go back **in** — it was dropped from the exact segment the PRD
actually assigns it to. And the "dynamic from intake" claim describes an intent, not
something the code does today.

### If implementing: the corrected target matrix

| Tab | Explorer | Pathfinder | Launcher |
|---|:---:|:---:|:---:|
| Career | ✅ no % | ✅ with % | ✅ with % + full profile card |
| Stream | ✅ main tab | ✅ | ❌ |
| Pathway | ❌ | ✅ main tab (built from Career + Stream, not College) | ❌ |
| College | ❌ | ✅ | ✅ *(PRD gap, filled by code reasoning)* |
| Scholarship | ❌ | ❌ | ✅ only if `wants_aid = true` |
| Plan | ✅ 3 missions | ✅ route plan | ✅ 90-day plan |

And separately from the tab matrix: **none of the intake questions beyond `marks_band`
have a coded path into any recommendation today** — if "dynamic from intake" is the goal for
Launcher (or any segment), that mapping function (intake answer → `ProfileSnapshotForRecommendations`
field, or → `storedFacts` for aid) is the actual piece of work still needed, not a tab-visibility change.
