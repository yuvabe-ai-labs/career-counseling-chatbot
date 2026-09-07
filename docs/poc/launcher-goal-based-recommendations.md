# The Explore Screen, Final Picture — All 3 Segments, Every Case

What every segment sees on the Explore screen, in every possible combination of answers —
nothing collapsed or skipped. Start with the two tables in Part 1 to see every case at a
glance; everything after it explains and illustrates those same rows in more depth.

> **Status:** this is the corrected target design, checked against the PRD
> (`docs/reference/yuvanext-prd-tamil.md`) and the code in `packages/recommendations/`. None
> of it is built into the app's screens yet. See the companion doc,
> `docs/poc/segment-explore-screen-map.md`, for the full PRD/code citation trail this was
> derived from.

---

## Part 1 — Every case, in two tables

Explorer and Pathfinder don't have a "goal" question at all — only Launcher's intake form
asks that. So they get their own small table first; Launcher, which actually branches on
two separate answers, gets a second table built around those two axes.

✅ = tab shown · ❌ = tab hidden

### Explorer & Pathfinder (no goal branching — only Pathfinder's aid answer changes anything)

| # | Segment | Asked for aid? | Career | Stream | Pathway | College | Scholarship | Plan |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | **Explorer** | *(not asked)* | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 2 | **Pathfinder** | No | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 3 | **Pathfinder** | Yes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Launcher (branches on both their goal *and* their aid answer)

Six goal answers exist, but they split into **three** real buckets, not two — College and
Stream/Pathway don't share the same trigger, because "do I need a college list" and "do I
need to reopen my field/degree choice" aren't the same question:

| Bucket | Goals in it | Reopens Stream + Pathway? | Shows College? |
|---|---|:---:|:---:|
| Not enrolling anywhere | `job`, `career_switch`, `business` | ❌ | ❌ |
| Enrolling short-term | `skill_building` | ❌ | ✅ — narrowed to vocational/polytechnic/ITI/open-university options |
| Enrolling in a full degree | `higher_studies`, `not_sure` | ✅ | ✅ — full ringed shortlist |

Crossed with the aid answer, that's six Launcher rows:

| # | Their goal | Asked for aid? | Career | Stream | Pathway | College | Scholarship | Plan |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 4 | job **/** career_switch **/** business | No | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 5 | job **/** career_switch **/** business | Yes | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| 6 | skill_building | No | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| 7 | skill_building | Yes | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| 8 | higher_studies **/** not_sure | No | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 9 | higher_studies **/** not_sure | Yes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

That's 9 rows total covering every answer the intake form can actually produce. Part 4 gives
each row a full, worked example, in the same order as the numbering above.

---

## Part 2 — How each shown tab is displayed in the UI

Every tab has two layers: what you see in the list ("at a glance") and what you see after
tapping an item ("tap in"). This is identical for every segment that has the tab turned on —
only whether a tab appears changes, never how it behaves once it's there.

| Tab | At a glance | Tap in |
|---|---|---|
| **Career** | Name + which ring (closest match / related / further out). Match % hidden only for Explorer. | Explorer: one-line reason. Pathfinder/Launcher: fit breakdown + which stream leads there, or (Launcher only) the full card — photo, salary band, skills, next role, "Build my plan" button. |
| **Stream** | Ranked list, in words for Explorer, with % for Pathfinder/qualifying Launchers. | Which subjects it contains, tied to the student's own answers. |
| **Pathway** | 3–5 route clusters: connected career + stream, a reachability indicator, a "has backup route" flag. | The specific degree, the entrance exam, and the backup route written out in full. |
| **College** | Ringed by state — home state first, then nearby, then everywhere else (always including one low-cost/easy-entry option). | City, college type, disciplines offered, how to get in, fee range, last-checked date. |
| **Scholarship & Aid** | Each scheme labeled **likely** / **worth checking the conditions** / **worth exploring** — never "guaranteed." | Provider, amount, application window, official link, minimum eligibility, last-verified date, a yearly-change caveat. |
| **Plan** | The plan's name and how many steps it has. | Every step, with its timing and its action, in order. |

---

## Part 3 — The three rules that generate the whole table above

### Rule A — Stream + Pathway (Launcher only; always on for Pathfinder, always off for Explorer)

| Their goal | Opens Stream + Pathway? | Why |
|---|---|---|
| `higher_studies` | ✅ Yes | Same decision shape as a Pathfinder — choosing a field and a further degree/route. |
| `not_sure` | ✅ Yes | Unclear signal — show more exploration tools, not fewer, same instinct already used for Explorer/Pathfinder. |
| `job` | ❌ No | Looking for work, not a field/degree decision. |
| `career_switch` | ❌ No | Changing direction through the job market — Career re-ranking already covers this. |
| `skill_building` | ❌ No | A short course/certificate isn't a field/degree decision — there's no route to compare, so Pathway stays off (College, below, is a separate question). |
| `business` | ❌ No | Starting something, not studying further. |

### Rule A2 — College (Launcher only; always on for Pathfinder, always off for Explorer)

College isn't the same question as "do I need to reopen my field/degree choice" — it's "do
I need to enroll anywhere at all," and one goal answers that differently than Rule A alone
would suggest:

| Their goal | Shows College? | Why |
|---|---|---|
| `higher_studies`, `not_sure` | ✅ Yes — full ringed shortlist | Same as Rule A: a real degree needs a real place to study it. |
| `skill_building` | ✅ Yes — but narrowed to vocational/polytechnic/ITI/open-university options | Not a full degree, but this goal typically *does* mean enrolling somewhere short-term — exactly what those college types are for. |
| `job`, `career_switch`, `business` | ❌ No | None of these involve enrolling in an institution at all — a college list has nothing to offer here. |

**Where the discipline filter comes from, since there's no Pathway to supply one:**
`college-recommendations.ts` doesn't infer a field on its own — it needs an explicit
`targetDisciplineIds` list, and for Pathfinder / `higher_studies` that list comes from the
Pathway the student is comparing (each pathway is already tied to a discipline). For
`skill_building` there's no Pathway to read that from, so the substitute source is **the
student's own top-ranked Career match** — always available, since Career is shown for every
goal. Practically: take the highest-fit career in the inner ring, and filter the college
search to whatever discipline that career belongs to (e.g. Civil Drafting Technician →
civil/drafting-related colleges), rather than showing every vocational college regardless of
field.

*Caveat worth flagging rather than glossing over: a confirmed "this career maps to this
discipline" link doesn't clearly exist in the schema yet either — `CareerCatalogRecord`
carries `routeIds`, `CollegeCatalogRecord` carries `disciplineIds`, and nothing checked so
far confirms those are the same ID space. So this is the right design answer, but it depends
on a second piece of wiring (career → discipline) that isn't built, the same category as
everything else this document has flagged as "not wired yet."*

### Rule B — Scholarship & Aid (Pathfinder and Launcher; never Explorer)

Turns on if their answer to "what should we help with first?" is **`aid_options`**, off
otherwise. Completely independent of Rule A — a Launcher planning `job` can still want aid
help for a short course, and one planning `higher_studies` might not need aid at all.

---

## Part 4 — Every distinct screen, fully worked with dummy data

Everything below is a fictional profile made up to show what the fields actually look like
— not a real user. Each heading names exactly which rows from Part 1's table it covers.

### 4.1 — Explorer *(covers row 1)*

**"Priya", 14, Chennai, Tamil Nadu.** Top interests: Artistic, Social, Investigative.

**Careers** (no %)

| Ring | Career | Why (tap-in) |
|---|---|---|
| Inner | Graphic Designer | "This fits because you enjoy creating original work and design." |
| Inner | Animator | "This fits because you enjoy open-ended, creative tasks." |
| Middle | Community Health Worker | "This fits because you enjoy helping and supporting people." |
| Outer | Civil Drafting Technician *(vocational)* | "A hands-on option worth a look." |
| Outer | Public Policy Associate *(unexpected pairing)* | "A different angle on helping people." |

**Streams** (no %) — top: Arts and Design — *"You enjoy creating original work — this
stream includes design, language, and fine arts subjects."*

**Plan — "Explorer Safe Missions"** (target: Arts and Design)

| Step | Timing | Action |
|---|---|---|
| 1 | Week 1 | Compare two subjects connected to Arts and Design. |
| 2 | Week 2 | Talk to one trusted adult about stream choices. |
| 3 | Week 3 | Observe one local example of this path in Tamil Nadu. |

---

### 4.2 — Pathfinder, no aid requested *(covers row 2)*

**"Arjun", 17, Bengaluru, Karnataka, marks band: high.** Top interests: Investigative,
Realistic, Conventional.

**Careers** (with %)

| Ring | Career | Match |
|---|---|---|
| Inner | Cybersecurity Analyst | 91% |
| Inner | Data Scientist | 88% |
| Middle | Robotics Technician | 74% |
| Outer | Civil Drafting Technician *(vocational)* | 55% |

**Streams** (with %): Science with Computer Science 92% · Commerce with Applied Mathematics
68% · Vocational Health Sciences 40%

**Pathways**

| Pathway | Reachability | Backup route? |
|---|---|---|
| BSc Computer Science | High (1.0) | Yes — Diploma in Computer Applications |
| BCom Business Analytics | High (1.0) | Yes — Certificate in Data Entry & Analytics |
| Diploma in Renewable Energy | Medium (0.65) | Yes — ITI Electrician trade |

**Colleges** (ringed on Karnataka): Bengaluru Design College (inner) · Karnataka Open
University (inner) · Chennai Science College (middle) · Andhra Rural ITI *(outer,
vocational)*

**Plan — "Pathfinder Route Plan"** (target: BSc Computer Science)

| Step | Timing | Action |
|---|---|---|
| 1 | Week 1 | Compare entry routes for BSc Computer Science. |
| 2 | Week 2 | List backup routes for this pathway. |

---

### 4.3 — Pathfinder, aid requested *(covers row 3)*

**"Meera", 16, Madurai, Tamil Nadu, marks band: medium.** Top interests: Social, Artistic,
Conventional.

**Careers** (with %)

| Ring | Career | Match |
|---|---|---|
| Inner | Teacher | 81% |
| Inner | Community Health Worker | 74% |
| Middle | Accountant | 65% |

**Streams** (with %): Arts and Design 70% · Vocational Health Sciences 66% · Commerce with
Applied Mathematics 50%

**Pathways**

| Pathway | Reachability | Backup route? |
|---|---|---|
| Design Diploma | High (0.75) | Yes — Certificate in Visual Arts |
| Diploma in Community Health | Medium (0.65) | Yes — ITI Health Assistant trade |

**Colleges** (ringed on Tamil Nadu): Madurai Arts & Design College (inner) · Coimbatore
Polytechnic Institute *(middle, vocational)* · Kerala Community Health Institute (outer)

**Scholarships & Aid**

| Label | Scheme | Tap-in |
|---|---|---|
| **Check conditions** | Central Post-Matric Aid | Category not yet confirmed for Meera; marks band (medium) matched |
| **Worth exploring** | State Merit Scholarship | Requires marks band "high" — Meera's is "medium," doesn't match |

**Plan — "Pathfinder Route Plan"** (target: Design Diploma)

| Step | Timing | Action |
|---|---|---|
| 1 | Week 1 | Compare entry routes for Design Diploma. |
| 2 | Week 2 | List backup routes for this pathway. |

---

### 4.4 — Launcher, not enrolling anywhere, no aid *(row 4 — job, career_switch, or business)*

**"Karthik", 22, Coimbatore, Tamil Nadu, working, goal: job.** Top interests: Enterprising,
Conventional. The minimal Launcher view — just **Career** and **Plan**. No field/degree
decision to reopen, and no reason to see a college list either, since his goal doesn't
involve enrolling anywhere. No aid requested.

**Careers** (with % + full profile card)

| Ring | Career | Match | Tap-in |
|---|---|---|---|
| Inner | Sales Operations Analyst | 89% | Entry salary ₹3.5–4.8 LPA *(varies by city/company/year, checked Jul 2026)* · Skills: CRM tools, data analysis, negotiation · Next role (~3 yrs): Regional Sales Manager · **[Build my plan]** |
| Inner | Accountant | 85% | Entry salary ₹3.0–4.2 LPA · Skills: bookkeeping, GST filing, audit basics · Next role: Senior Accountant |
| Middle | Entrepreneurship Associate | 77% | Entry salary ₹3.2–5.0 LPA · Skills: pitching, budgeting, networking |

**Plan — "Launcher 90-Day Plan"** (target: Sales Operations Analyst)

| Step | Timing | Action |
|---|---|---|
| 1 | Days 1–30 | Shortlist entry requirements for Sales Operations Analyst. |
| 2 | Days 31–60 | Complete one portfolio/practice task — e.g. a mock sales-analytics case study. |
| 3 | Days 61–90 | Review backup routes and note real application dates. |

---

### 4.5 — Launcher, not enrolling anywhere, aid requested *(row 5 — job, career_switch, or business)*

**"Farhan", 23, Hyderabad, Telangana, working, goal: career_switch.** Top interests:
Investigative, Enterprising. Same shape as Karthik's screen — no College tab, since his goal
still doesn't involve enrolling anywhere — plus a Scholarships tab because he asked for aid
help.

**Careers** (with % + full profile card)

| Ring | Career | Match | Tap-in |
|---|---|---|---|
| Inner | Cybersecurity Analyst | 84% | Entry salary ₹4.0–5.5 LPA *(checked Jul 2026)* · Skills: threat analysis, network security, scripting · Next role (~3 yrs): Security Team Lead · **[Build my plan]** |
| Middle | Public Policy Associate | 68% | Entry salary ₹3.0–4.5 LPA · Skills: research writing, stakeholder mapping |
| Middle | Sales Operations Analyst | 61% | Entry salary ₹3.5–4.8 LPA · Skills: CRM tools, reporting |

**Scholarships & Aid**

| Label | Scheme | Tap-in |
|---|---|---|
| **Likely** | CSR STEM Access Grant | Provider: private CSR trust · Amount: ₹25,000 one-time · Technology stream-interest and Telangana residency both confirmed and matched |
| **Check conditions** | Institution Fee Waiver | Income band not yet confirmed for Farhan; "first-generation learner" matched |
| **Worth exploring** | State Merit Scholarship | Requires Tamil Nadu residency — Farhan is in Telangana, doesn't match |

**Plan — "Launcher 90-Day Plan"** (target: Cybersecurity Analyst)

| Step | Timing | Action |
|---|---|---|
| 1 | Days 1–30 | Shortlist entry requirements for Cybersecurity Analyst. |
| 2 | Days 31–60 | Complete one portfolio/practice task — e.g. a mock incident-response writeup. |
| 3 | Days 61–90 | Review backup routes and note real application dates. |

---

### 4.6 — Launcher, enrolling short-term (skill_building), no aid *(row 6)*

**"Aisha", 21, Kochi, Kerala, job searching, goal: skill_building, marks band: medium.**
Top interests: Realistic, Conventional. Career and Plan as usual, plus College — but
narrowed to short-entry, hands-on institution types only, since a full degree isn't what
she's after.

**Careers** (with % + full profile card)

| Ring | Career | Match | Tap-in |
|---|---|---|---|
| Inner | Civil Drafting Technician | 76% | Entry salary ₹2.2–3.0 LPA *(checked Jul 2026)* · Skills: CAD tools, site measurement, technical drawing · Next role (~3 yrs): Senior Draftsperson · **[Build my plan]** |
| Middle | Robotics Technician | 68% | Entry salary ₹2.6–3.6 LPA · Skills: assembly, basic programming, equipment maintenance |
| Middle | Sales Operations Analyst | 60% | Entry salary ₹3.5–4.8 LPA · Skills: CRM tools, reporting |

**Colleges** *(discipline filter set from Aisha's top career match, Civil Drafting
Technician → civil/drafting-related disciplines only; further narrowed to
vocational/polytechnic/ITI/open-university institution types — no regular-tier or
unrelated-discipline colleges included)*: Coimbatore Polytechnic Institute, Tamil Nadu
*(inner — offers a Civil Engineering/Drafting diploma)* · Andhra Rural ITI, Andhra Pradesh
*(offers a Draftsman/Civil trade certificate)* · Telangana Open Learning Centre, Telangana
*(open university, general technical certificates)*

**Plan — "Launcher 90-Day Plan"** (target: Civil Drafting Technician)

| Step | Timing | Action |
|---|---|---|
| 1 | Days 1–30 | Shortlist entry requirements for a CAD/drafting certificate course. |
| 2 | Days 31–60 | Complete one practice task — e.g. a mock drafting project. |
| 3 | Days 61–90 | Review backup routes and note the next course intake date. |

---

### 4.7 — Launcher, enrolling short-term (skill_building), aid requested *(row 7)*

**"Ravi", 20, Madurai, Tamil Nadu, gap year, goal: skill_building, marks band: low.** Top
interests: Realistic, Investigative. Same shape as Aisha's screen, plus a Scholarships tab
because he asked for aid help.

**Careers** (with % + full profile card)

| Ring | Career | Match | Tap-in |
|---|---|---|---|
| Inner | Robotics Technician | 71% | Entry salary ₹2.6–3.6 LPA *(checked Jul 2026)* · Skills: assembly, basic programming, equipment maintenance · Next role (~3 yrs): Lead Technician · **[Build my plan]** |
| Middle | Civil Drafting Technician | 65% | Entry salary ₹2.2–3.0 LPA · Skills: CAD tools, site measurement |

**Colleges** *(discipline filter set from Ravi's top career match, Robotics Technician →
robotics/mechatronics-related disciplines only; further narrowed to
vocational/polytechnic/ITI/open-university institution types)*: Coimbatore Polytechnic
Institute, Tamil Nadu *(inner — home state, offers a Mechatronics diploma)* · Andhra Rural
ITI, Andhra Pradesh *(outer, offers an Electronics/Robotics trade certificate)*

**Scholarships & Aid**

| Label | Scheme | Tap-in |
|---|---|---|
| **Likely** | Income Support Scheme | Provider: State Government · Tamil Nadu residency and low income band both confirmed and matched |
| **Check conditions** | Institution Fee Waiver | "First-generation learner" not yet confirmed for Ravi; income band matched |
| **Worth exploring** | State Merit Scholarship | Requires marks band "high" — Ravi's is "low," doesn't match |

**Plan — "Launcher 90-Day Plan"** (target: Robotics Technician)

| Step | Timing | Action |
|---|---|---|
| 1 | Days 1–30 | Shortlist entry requirements for a robotics/technician certificate course. |
| 2 | Days 31–60 | Complete one practice task — e.g. a basic assembly project. |
| 3 | Days 61–90 | Review backup routes and note the next course intake date. |

---

### 4.8 — Launcher, open goal, no aid *(row 8 — higher_studies or not_sure)*

**"Naveen", 19, Chennai, Tamil Nadu, gap year, goal: not_sure.** Top interests: Realistic,
Investigative, Conventional. Because his goal is unclear, Stream and Pathway both open up —
more exploration tools, not fewer.

**Streams** (with %): Science with Computer Science 88% · Commerce with Applied Mathematics
55%

**Careers** (with %)

| Ring | Career | Match |
|---|---|---|
| Inner | Robotics Technician | 79% |
| Middle | Cybersecurity Analyst | 70% |
| Outer | Civil Drafting Technician *(vocational)* | 66% |

**Pathways**

| Pathway | Reachability | Backup route? |
|---|---|---|
| BSc Computer Science | High (1.0) | Yes — Diploma in Computer Applications |
| Diploma in Renewable Energy | Medium (0.65) | Yes — ITI Electrician trade |

**Colleges** (ringed on Tamil Nadu): Chennai Science College (inner) · Coimbatore
Polytechnic Institute *(middle, vocational)* · Andhra Rural ITI *(outer, vocational)*

**Plan — "Launcher 90-Day Plan"** (target: BSc Computer Science pathway)

| Step | Timing | Action |
|---|---|---|
| 1 | Days 1–30 | Shortlist entry requirements for the BSc Computer Science program. |
| 2 | Days 31–60 | Complete one portfolio/practice task — e.g. a small coding project. |
| 3 | Days 61–90 | Review backup routes and note real application/entrance-exam dates. |

---

### 4.9 — Launcher, open goal, aid requested *(row 9 — higher_studies or not_sure)*

**"Divya", 20, Kochi, Kerala, graduate, goal: higher_studies.** Top interests:
Enterprising, Conventional, Investigative. The full 6-tab Launcher experience.

**Streams** (with %): Commerce with Applied Mathematics 81% · Science with Computer Science
54%

**Careers** (with % + full profile card) — ranked toward management/analytics roles a
further degree would unlock: Entrepreneurship Associate 82%, Public Policy Associate 71%.

**Pathways**

| Pathway | Reachability | Backup route? | Tap-in |
|---|---|---|---|
| MBA — Business Analytics | High (1.0) | Yes — PG Diploma in Business Analytics | Degree: 2-yr MBA · Exam: state/institution entrance test · Backup: 1-yr PG diploma |
| MA — Public Policy | Medium (0.65) | Yes — Certificate in Public Administration | Degree: 2-yr MA · Exam: merit + interview · Backup: 6-month certificate |

**Colleges** (ringed on Kerala): Kochi Commerce College (inner) · Mysuru Commerce College
(middle) · Telangana Open Learning Centre *(outer, open university)*

**Scholarships & Aid**

| Label | Scheme | Tap-in |
|---|---|---|
| **Likely** | Central Post-Matric Aid | Provider: Govt. of India · Amount: tuition + maintenance · Window: Aug–Oct · Minimum eligibility: SC/ST/OBC category + marks medium or above · Verified: Jul 2026 |
| **Check conditions** | CSR STEM Access Grant | STEM stream interest not yet confirmed; state matched |
| **Worth exploring** | State Merit Scholarship | Requires Tamil Nadu residency — Divya is in Kerala, doesn't match |

**Plan — "Launcher 90-Day Plan"** (target: MBA — Business Analytics pathway)

| Step | Timing | Action |
|---|---|---|
| 1 | Days 1–30 | Shortlist entry requirements for the MBA program. |
| 2 | Days 31–60 | Complete one portfolio/practice task — e.g. a mock case-study submission. |
| 3 | Days 61–90 | Review backup routes and note real application/entrance-exam dates. |

---

## Part 5 — What this actually takes to build

Nothing in Parts 1–4 changes any of the six scoring files in
`packages/recommendations/src/domain/` — `career-matching.ts`, `pathway-recommendations.ts`,
etc. all stay exactly as they are. What's needed is a small gating step in front of them,
run once per visit:

```ts
function tabsToShow(segment: Segment, intake: {
  current_goal?: string;
  support_needed: string;
}) {
  const wantsAid = intake.support_needed === "aid_options";

  if (segment === "explorer") {
    return { career: true, stream: true, plan: true };
  }

  if (segment === "pathfinder") {
    return {
      career: true, stream: true, pathway: true, college: true, plan: true,
      scholarship: wantsAid,
    };
  }

  // launcher
  const fullDegree =
    intake.current_goal === "higher_studies" || intake.current_goal === "not_sure";
  const shortEnrollment = intake.current_goal === "skill_building";

  return {
    career: true,
    plan: true,
    stream: fullDegree,
    pathway: fullDegree,
    college: fullDegree || shortEnrollment,       // college and stream/pathway are NOT the
                                                   // same condition — see Part 3, Rule A2
    scholarship: wantsAid,
  };
}
```

Only the tabs marked `true` get their `recommendationService.recommendX(...)` call made —
and when `college` is true because of `shortEnrollment` rather than `fullDegree`, the call
needs two extra adjustments the `fullDegree` case gets from its Pathway automatically:
1. Filter to `collegeType` in `["vocational", "polytechnic", "iti", "open_university"]`,
   not the normal unrestricted ring.
2. Set `targetDisciplineIds` from the student's top-ranked Career match, since there's no
   Pathway to read a discipline from (see Part 3, Rule A2) — this assumes a career→discipline
   lookup that isn't confirmed to exist in the schema yet, and is real work on its own.

This is the exact function that produces every one of the 9 rows in Part 1 — same pattern
throughout, nothing segment-specific beyond this one gate.
