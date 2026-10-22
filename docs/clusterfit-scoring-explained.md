# How Clusterfit scores a student and recommends clusters

This document explains how the clusterfit prototype turns a student's answers into the clusters shown on the results page. It covers:

- **interest** (Part B)
- **aptitude** (Part C)
- **work style** (Part D)
- **what matters** (Part E: work values)

and how the three scored parts are combined, ranked and shown.

It describes the code as it is now (scoring version `CLUSTERFIT_SCORING_V1`, content version `v1`). The rules come from `docs/Pathfinder Career Exploration Questionnaire (Grades 9–12).docx`. Where the app had to decide something the doc doesn't say, this document says so and points to the decision in [clusterfit-prototype-plan.md](clusterfit-prototype-plan.md) §16.1.

| What                                                                      | Where in the code                                                                                                                       |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Scoring rules, as one pure function                                       | [packages/clusterfit/src/domain/scoring.ts](../packages/clusterfit/src/domain/scoring.ts)                                               |
| Every number the pilot may change (weights, cut-offs, matrix, answer key) | [packages/clusterfit/src/domain/scoring-config.ts](../packages/clusterfit/src/domain/scoring-config.ts)                                 |
| Which puzzles each grade gets                                             | [packages/clusterfit/src/domain/grade-path.ts](../packages/clusterfit/src/domain/grade-path.ts)                                         |
| Items, clusters, the cluster matrix, the answer key, the value cards      | [packages/clusterfit/src/content/v1/](../packages/clusterfit/src/content/v1/)                                                           |
| When scoring is allowed, saving the result, what the student is sent      | [packages/clusterfit/src/application/clusterfit-service.ts](../packages/clusterfit/src/application/clusterfit-service.ts)               |
| Results page                                                              | [apps/web/src/features/clusterfit/pages/ClusterfitResultsPage.tsx](../apps/web/src/features/clusterfit/pages/ClusterfitResultsPage.tsx) |

---

## 1. The big picture

The instrument does not suggest a single career. It suggests **career clusters**, which are broad fields of work such as "Health, Wellness and Sports". Every cluster has roles at several education levels (ITI or diploma up to degree or professional), so no student is told there is only one way in.

Three separate signals are measured, and each cluster gets one **cluster index** from 0 to 100:

```
                Part B: Interest           Part C: Aptitude          Part D: Work style
                48 Yes/Maybe/No items      10 or 20 puzzles          20 "like me" statements
                        │                          │                          │
                        ▼                          ▼                          ▼
              I per cluster (0–8)        score per domain (0–4)      level per dimension
                        │                 NUM VER LOG MEC PRA         (Low 0 / Mid 1 / High 2)
                        │                          │                          │
                        │            cluster matrix: each cluster picks 2 domains and 2 dimensions
                        │                          ▼                          ▼
                        │                  A per cluster (0–8)        S per cluster (0–4)
                        └─────────────┬────────────┴──────────────────────────┘
                                      ▼
                index = 6.25 × I + 3.75 × A + 5 × S          (0–100, one per cluster)
                                      ▼
                bands → ranking → at most 3 "strong" + up to 3 "worth exploring" shown
```

**Part E (what matters most) is not part of the index.** The student picks and ranks their top 3 of 9 work values during the chat. They are stored for the counselling conversation and for later route planning (§6).

**Weighting:** interest carries **50%**, aptitude **30%** and work style **20%**. The multipliers scale each part to its share of 100:

| Signal           | Range per cluster | Multiplier | Maximum contribution |
| ---------------- | ----------------- | ---------- | -------------------- |
| Interest I       | 0–8               | 6.25       | 8 × 6.25 = **50**    |
| Aptitude fit A   | 0–8               | 3.75       | 8 × 3.75 = **30**    |
| Work-style fit S | 0–4               | 5          | 4 × 5 = **20**       |
| **Total**        |                   |            | **100**              |

---

## 2. The 12 clusters

Each cluster has a 3-letter code and a fixed number k from 1 to 12. The order matters for two things: which Part B items belong to the cluster (§3), and the last tie-break (§7.2). Codes are never shown to students.

| k   | Code | Cluster                                        | Key aptitudes (for A) | Key work styles (for S) |
| --- | ---- | ---------------------------------------------- | --------------------- | ----------------------- |
| 1   | SCI  | Science and Research                           | LOG + NUM             | Curiosity + Steadiness  |
| 2   | ENG  | Engineering and Manufacturing                  | MEC + NUM             | Curiosity + Order       |
| 3   | DIG  | Computing and Digital                          | LOG + PRA             | Curiosity + Order       |
| 4   | HLT  | Health, Wellness and Sports                    | PRA + VER             | Social + Steadiness     |
| 5   | AGR  | Agriculture, Environment and Natural Resources | PRA + MEC             | Steadiness + Initiative |
| 6   | BUS  | Business, Finance and Enterprise               | NUM + PRA             | Initiative + Social     |
| 7   | EDU  | Education and Social Impact                    | VER + PRA             | Social + Curiosity      |
| 8   | GOV  | Law, Governance and Public Service             | VER + LOG             | Initiative + Order      |
| 9   | MED  | Media, Communication and Languages             | VER + PRA             | Curiosity + Social      |
| 10  | ART  | Arts, Design and Crafts                        | MEC + VER             | Curiosity + Initiative  |
| 11  | HOS  | Hospitality, Tourism and Personal Services     | PRA + VER             | Social + Order          |
| 12  | CON  | Construction, Infrastructure and Transport     | MEC + NUM             | Order + Steadiness      |

The last two columns are the doc's **cluster matrix**. The doc calls it "a starting hypothesis… revise after the pilot", so it lives in the versioned config, not in the scoring code.

---

## 3. Interest score I (Part B)

### What the student does

48 short activities, each asking whether they'd enjoy it on a free day, for example _"Opening up a broken fan, radio or mobile and trying to repair it?"_. There are three answers:

| Answer              | Value | Why                                                                                                                                                                                      |
| ------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yes                 | 2     | Clear interest                                                                                                                                                                           |
| Maybe / never tried | 1     | **Never tried counts as curiosity, not dislike.** Many students in the target group have never had the chance to try an activity, and the doc doesn't want that read as "not interested" |
| No                  | 0     | Not interested                                                                                                                                                                           |

### Which items belong to which cluster

The items cycle through the 12 clusters four times, so similar activities are never next to each other. **Cluster k owns items k, k + 12, k + 24 and k + 36.**

| Cluster | Items             |     | Cluster | Items              |
| ------- | ----------------- | --- | ------- | ------------------ |
| SCI     | B1, B13, B25, B37 |     | EDU     | B7, B19, B31, B43  |
| ENG     | B2, B14, B26, B38 |     | GOV     | B8, B20, B32, B44  |
| DIG     | B3, B15, B27, B39 |     | MED     | B9, B21, B33, B45  |
| HLT     | B4, B16, B28, B40 |     | ART     | B10, B22, B34, B46 |
| AGR     | B5, B17, B29, B41 |     | HOS     | B11, B23, B35, B47 |
| BUS     | B6, B18, B30, B42 |     | CON     | B12, B24, B36, B48 |

The app doesn't calculate this from the position. Each item stores its own cluster code, and a startup check fails if any cluster doesn't own exactly 4 items.

### The calculation

```
I[cluster] = sum of the values of its 4 items          range 0–8
```

**Example:** HLT answers are B4 Yes, B16 Yes, B28 Maybe, B40 Yes, so I = 2 + 2 + 1 + 2 = **7**.

### Every item must be answered

The booklet lets students skip items, but the app does not (product decision, 2026-10-22). There is no skip button, the server rejects an empty answer, and scoring needs all 48 items answered (§8). "Maybe / never tried" is the honest answer for an activity the student isn't sure about.

The scorer still contains the earlier rule for groups with a missing answer (3 of 4 answered is scaled up, fewer is "insufficient"). With every item required, that rule never applies to new sessions.

----------------------- | --------------------------------------------------------------------------------------------------------------- |
| 4 | Plain sum |
| 3 | **Prorated:** sum × 4 ÷ 3, rounded to a whole number. Example: Yes, Yes, Maybe gives 5 × 4 / 3 = 6.67, so **7** |
| 0–2 | **Insufficient.** The cluster gets no index and is not ranked or shown (§7.4) |

---

## 4. Aptitude score A (Part C)

### What the student does

Everyday puzzles with four options and one right answer. There is no timer and no penalty, and the student never sees whether an answer was right. There are five **domains**:

| Domain | Kind of puzzle (from the actual items)                                                                             | Example                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| NUM    | Everyday arithmetic: profit and loss, proportion, comparing prices                                                 | Diesel needed to plough 7 acres if 2 acres take 5 litres |
| VER    | Reading a short passage, word analogies, choosing the right word, what must be true                                | "Seed is to Plant as Egg is to …?"                       |
| LOG    | Queue order, number and letter sequences, "all / some" reasoning                                                   | Next number in 2, 6, 12, 20, 30, ?                       |
| MEC    | Gears, levers, balance, folding and punching paper                                                                 | Which way the second gear turns                          |
| PRA    | Practical problems: checking a wall is upright, reading rainfall data, planning jobs against times, bus timetables | The latest bus that still reaches an interview by noon   |

Each domain has 4 items. Items 1–2 are easier; items 3–4 are harder.

### Which items each grade gets (the grade path)

> **For now every student takes all 20 puzzles** (product decision 2026-10-22, plan §18.1 R11), so every session uses the `11_12` path and there is no ×2 doubling. The doc's split below comes back later by changing one function (`puzzleGradePath` in `packages/clusterfit/src/domain/grade-path.ts`).

The doc's split, by the class the chat learns (`class_level`):

| Grade                   | Items                      | Count |
| ----------------------- | -------------------------- | ----- |
| Classes 9–10 (`9_10`)   | Items 1–2 of each domain   | 10    |
| Classes 11–12 (`11_12`) | All 4 items of each domain | 20    |

The server rejects an answer to a puzzle outside the student's grade path.

### Marking

Answers are stored exactly as given (the option letter, or empty for "Skip for now"). **They are marked only at scoring time**, against an answer key that exists only on the server and is never sent to the browser. A correction to the key therefore needs only a re-score, not a re-test.

> **One correction to the doc:** the doc's key says MEC4 (see-saw) is B. A 30 kg child at 2 m (30 × 2 = 60) balances a 20 kg child at 3 m (20 × 3 = 60), so the right answer is **A, "stays balanced"**. The app uses A (plan §16.1 D2), and a unit test pins it. This needs confirmation from the instrument's author.

### Domain score (0–4)

```
Classes 11–12:  domain score = number correct out of 4                       → 0, 1, 2, 3 or 4
Classes 9–10:   domain score = number correct out of 2 × 2  (doc's ×2 rule)  → 0, 2 or 4
```

Doubling for Classes 9–10 puts both grades on the same 0–4 scale. The cost is that the younger grades' scores are coarse (only 0, 2 or 4).

**Every puzzle must be answered**: there is no skip, and a wrong answer simply scores 0, with no penalty. The screen tells the student to make their best guess.

### Aptitude fit A for a cluster (0–8)

Each cluster adds up its **two key domains** from the matrix (§2):

```
A[cluster] = score of key domain 1 + score of key domain 2          range 0–8
```

**Example:** HLT uses PRA + VER. With PRA 4 and VER 2, A = **6**.

---

## 5. Work-style score S (Part D)

### What the student does

20 statements about how they like to work, each answered on a 4-point scale:

| Answer       | Value |
| ------------ | ----- |
| Not like me  | 0     |
| A little     | 1     |
| Mostly       | 2     |
| Very like me | 3     |

### The five dimensions

Each dimension has 4 statements. One of the four is worded the opposite way and is **reverse-scored**.

| Dimension  | Items                     | Example statement                                              |
| ---------- | ------------------------- | -------------------------------------------------------------- |
| Social     | D1, D6, **D11 (R)**, D16  | "I feel energised after spending time with a group of people." |
| Initiative | D2, D7, **D12 (R)**, D17  | "When no one takes charge, I step up."                         |
| Order      | D3, D8, **D13 (R)**, D18  | "I keep my things and my work neat and in order."              |
| Curiosity  | D4, D9, **D14 (R)**, D19  | "I ask 'why' or 'how' a lot, even outside class."              |
| Steadiness | D5, D10, **D15 (R)**, D20 | "I stay calm when things go wrong."                            |

**Reverse-scored items (R):** D11 to D15 are worded the opposite way. For example, D11 _"I would rather work alone than in a team"_ counts **against** Social. At scoring time the value becomes `3 − answer`:

| Ticked           | Value used |
| ---------------- | ---------- |
| Not like me (0)  | 3          |
| A little (1)     | 2          |
| Mostly (2)       | 1          |
| Very like me (3) | 0          |

The stored answer stays exactly as ticked; reversing happens only in the scorer. Students don't see which items are reversed.

### From raw score to points

```
raw[dimension] = sum of its 4 items after reversing        range 0–12
```

| Raw  | Level | Points |
| ---- | ----- | ------ |
| 0–4  | Low   | 0      |
| 5–8  | Mid   | 1      |
| 9–12 | High  | 2      |

As in Part B, every statement must be answered.

### Work-style fit S for a cluster (0–4)

Each cluster adds up the points of its **two key dimensions** from the matrix (§2):

```
S[cluster] = points of key dimension 1 + points of key dimension 2       range 0–4
```

**Example:** HLT uses Social + Steadiness. With Social Mid (1) and Steadiness High (2), S = **3**.

If either key dimension has no level, the cluster's S is missing and the cluster is **insufficient** (§7.4).

---

## 6. Work values (Part E): collected, not scored

During the Gemini Live chat the guide shows the student 9 value cards and asks which 3 matter most and in what order. Whatever the chat captured is saved as it is (the confirm card that let the student change it is switched off for now, plan §18.1 R11).

| Key                | Card                                      |
| ------------------ | ----------------------------------------- |
| `steady_income`    | A steady income and job security          |
| `earn_early`       | Earning well as early as possible         |
| `stay_close_home`  | Staying close to my family and home place |
| `help_community`   | Helping others or improving my community  |
| `own_boss`         | Being my own boss                         |
| `learn_grow`       | Learning and growing in my field          |
| `respect`          | Respect and recognition from others       |
| `creative_freedom` | Freedom to be creative                    |
| `travel`           | Chances to travel or live in new places   |

They're stored as `[{ value, rank }]` in `clusterfit.values_rankings`.

**Why they don't change the index:** the doc uses values to guide the conversation, not to rank clusters. They decide which **route into** a cluster suits the student, not which cluster fits. For example, `earn_early` points towards an ITI or a diploma with an apprenticeship, while `learn_grow` points towards a longer degree. Route selection is the next phase, so in this prototype values are stored and not used for scoring or shown on the results page.

---

## 7. From numbers to recommendations

### 7.1 The cluster index

```
index[cluster] = 6.25 × I  +  3.75 × A  +  5 × S          stored to 2 decimals, never shown to students
```

### 7.2 Bands and ranking

Each cluster gets a band from its index. The cut-offs are provisional; the doc sets them after the pilot.

| Band               | Rule                                   |
| ------------------ | -------------------------------------- |
| Strong signal      | index ≥ 65                             |
| Worth exploring    | 50 ≤ index < 65                        |
| Low signal for now | index < 50                             |
| Insufficient       | Not enough answers to calculate (§7.4) |

All clusters that have an index are sorted using these rules in order. The rules after the first are the approved tie-breaks (plan §16.1 D2), because the doc doesn't define any:

1. higher index
2. higher interest I (the student's own liking counts first)
3. higher aptitude fit A
4. lower cluster number k (SCI first, CON last)

### 7.3 What the student is shown

The results page shows **all 12 clusters**, best first in the ranking order of §7.2, as cards three to a row (two on tablets, one on phones). The **top 3 are highlighted** with a purple border and a filled icon (product decision, 2026-10-22). Each card also has a tag that names its band in plain words instead of a number:

| Band (§7.2)     | Tag on the card           |
| --------------- | ------------------------- |
| Strong (≥ 65)   | "Strong match"            |
| Explore (50–64) | "Worth exploring"         |
| Low (below 50)  | "Less of a match for now" |

The heading is "Your career clusters", with a line saying all 12 are shown and the top 3 are highlighted. If none of the 12 reaches 65, that line also says no field stands out strongly yet and the profile is still open.

Each card has the cluster's name, an icon, example jobs at every level, and ways in. **The student never sees** an index, a percentage, cluster codes or counsellor flags. Showing all 12 replaces the doc's rule of hiding low clusters from the student. The page ends with a note that interests change between classes 9 and 12, so the student should do this again next year.

The scorer still stores the doc's own presentation (up to 3 "strong", then up to 3 "worth exploring") in the result, for the counsellor view planned later.

### 7.4 Insufficient clusters

A cluster is **insufficient** when its interest I is missing (fewer than 3 of its 4 Part B items answered) or when one of its two key work-style dimensions has no level (fewer than 3 of 4 Part D items answered). It gets no index, isn't ranked and isn't shown. Since every item must now be answered (§8), this can't happen in new sessions.

### 7.5 Counsellor flags (calculated and stored, not shown yet)

These follow the doc's rules. They're saved in the result, but this prototype has no counsellor view yet.

| Flag                                          | Rule                                                                                                      | What it means for the counsellor                                                                                                                                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Interested, skills to build** (per cluster) | I ≥ 6 and A ≤ 4                                                                                           | Real interest but low aptitude so far. Treat it as a path to build, not a "no"                                                                                                                                          |
| **Hidden strength** (per cluster)             | A ≥ 7 and I ≤ 3                                                                                           | Strong aptitude but little interest, often because the student hasn't been exposed to the field. Arrange a visit or a small task before ruling it out                                                                   |
| **Flat profile** (whole student)              | Top index − 5th index < 10                                                                                | Interests aren't formed yet, or exposure is thin. Widen exposure and retake next year. Only checked when at least 5 clusters have an index                                                                              |
| **Language caution** (whole student)          | VER is the lowest domain (ties count as lowest) **and** the student's medium of instruction isn't English | A low VER score may reflect the test language, not verbal ability. **Currently always `unknown`:** the chat doesn't ask for medium of instruction yet, and the app reports `unknown`, never false, when it doesn't know |

---

## 8. When scoring happens

Scoring runs when the student presses **"See my results"** after Part D, and only if:

| Part         | Requirement                                                 |
| ------------ | ----------------------------------------------------------- |
| A + E (chat) | "About you" finished: the chat ended, failed or was skipped |
| B            | All 48 answered                                             |
| C            | All 20 puzzles answered (for now every student gets all 20) |
| D            | All 20 answered                                             |

If anything is missing, the API refuses and lists what's left. The button stays disabled while answers are still being saved.

**Other properties:**

- **Server-side only:** scoring never runs in the browser, so the weights and the answer key can't be seen or changed by a student.
- **Deterministic:** the scorer is a pure function with no AI involved. The same answers always give the same result.
- **No duplicates:** every result stores an `input_hash` of the answers, grade path, content version and scoring version. Scoring the same answers again returns the stored result instead of adding a new row.
- **Re-scorable:** raw answers are kept, so when the pilot changes weights, cut-offs, the matrix or the answer key, a new config version can re-score every student without a re-test.
- **Checked at startup:** the API won't start if the content or config is broken. It checks that each cluster has 4 interest items and 2 + 2 matrix entries, that there are 20 key entries and 4 items per domain and dimension, that the weights add up to exactly 100, and that the cut-offs are in order.

---

## 9. Worked example: Kavya, Class 11

This is the golden test case in [scoring.test.ts](../packages/clusterfit/src/domain/scoring.test.ts). These were also the answers given in the browser walkthrough on 2026-10-20, and the stored result matched exactly.

### Part B → I

| Cluster | Answers (Y = 2, M = 1, N = 0) | I   |
| ------- | ----------------------------- | --- |
| SCI     | Y M Y N                       | 5   |
| ENG     | N M N N                       | 1   |
| DIG     | M Y N M                       | 4   |
| HLT     | Y Y M Y                       | 7   |
| AGR     | Y Y Y M                       | 7   |
| BUS     | M Y N N                       | 3   |
| EDU     | Y Y Y M                       | 7   |
| GOV     | N M Y M                       | 4   |
| MED     | M N M N                       | 2   |
| ART     | Y M M N                       | 4   |
| HOS     | Y M M N                       | 4   |
| CON     | N N M N                       | 1   |

### Part C → domain scores (all 20 puzzles, Class 11)

| Domain | Item 1 | Item 2 | Item 3 | Item 4 | Score |
| ------ | ------ | ------ | ------ | ------ | ----- |
| NUM    | ✔      | ✔      | ✘      | ✔      | 3     |
| VER    | ✔      | ✔      | ✘      | ✘      | 2     |
| LOG    | ✔      | ✔      | ✔      | ✘      | 3     |
| MEC    | ✔      | ✔      | ✘      | ✘      | 2     |
| PRA    | ✔      | ✔      | ✔      | ✔      | 4     |

### Part D → levels (R items reversed)

| Dimension  | Values used             | Raw | Level → points |
| ---------- | ----------------------- | --- | -------------- |
| Social     | 2, 3, (ticked 1 → 2), 1 | 8   | Mid → 1        |
| Initiative | 1, 2, (1 → 2), 1        | 6   | Mid → 1        |
| Order      | 3, 2, (1 → 2), 2        | 9   | High → 2       |
| Curiosity  | 2, 2, (2 → 1), 2        | 7   | Mid → 1        |
| Steadiness | 2, 3, (0 → 3), 2        | 10  | High → 2       |

### Combined

| Rank | Cluster | I   | A (key domains)   | S (key styles)    | Index                         | Band    | Tag on Kavya's results page                                    |
| ---- | ------- | --- | ----------------- | ----------------- | ----------------------------- | ------- | -------------------------------------------------------------- |
| 1    | HLT     | 7   | PRA 4 + VER 2 = 6 | Soc 1 + Ste 2 = 3 | 43.75 + 22.5 + 15 = **81.25** | Strong  | Highlighted · "Strong match"                                   |
| 2    | AGR     | 7   | PRA 4 + MEC 2 = 6 | Ste 2 + Ini 1 = 3 | **81.25**                     | Strong  | Highlighted · "Strong match"                                   |
| 3    | EDU     | 7   | VER 2 + PRA 4 = 6 | Soc 1 + Cur 1 = 2 | **76.25**                     | Strong  | Highlighted · "Strong match"                                   |
| 4    | SCI     | 5   | LOG 3 + NUM 3 = 6 | Cur 1 + Ste 2 = 3 | **68.75**                     | Strong  | "Strong match"                                                 |
| 5    | DIG     | 4   | LOG 3 + PRA 4 = 7 | Cur 1 + Ord 2 = 3 | **66.25**                     | Strong  | "Strong match"                                                 |
| 6    | HOS     | 4   | PRA 4 + VER 2 = 6 | Soc 1 + Ord 2 = 3 | **62.50**                     | Explore | "Worth exploring"                                              |
| 7    | GOV     | 4   | VER 2 + LOG 3 = 5 | Ini 1 + Ord 2 = 3 | **58.75**                     | Explore | "Worth exploring"                                              |
| 8    | BUS     | 3   | NUM 3 + PRA 4 = 7 | Ini 1 + Soc 1 = 2 | **55.00**                     | Explore | "Worth exploring" · **hidden strength** flag (counsellor only) |
| 9    | ART     | 4   | MEC 2 + VER 2 = 4 | Cur 1 + Ini 1 = 2 | **50.00**                     | Explore | "Worth exploring"                                              |
| 10   | MED     | 2   | VER 2 + PRA 4 = 6 | Cur 1 + Soc 1 = 2 | **45.00**                     | Low     | "Less of a match for now"                                      |
| 11   | CON     | 1   | MEC 2 + NUM 3 = 5 | Ord 2 + Ste 2 = 4 | **45.00**                     | Low     | "Less of a match for now"                                      |
| 12   | ENG     | 1   | MEC 2 + NUM 3 = 5 | Cur 1 + Ord 2 = 3 | **40.00**                     | Low     | "Less of a match for now"                                      |

**Rules this example shows:**

- **Tie-break:** HLT and AGR tie on index (81.25), on I (7) and on A (6), so the cluster number decides: HLT (k = 4) comes before AGR (k = 5). MED and CON also tie on 45; MED has the higher I, so it ranks first.
- **Top 3 highlighted:** five clusters reached 65 or more. All 12 are shown, and HLT, AGR and EDU are highlighted.
- **Hidden strength (BUS):** A = 7 (at least 7) and I = 3 (at most 3). A counsellor should give her some exposure to business before ruling it out.
- **Skills to build:** none, because no cluster has I ≥ 6 with A ≤ 4.
- **Flat profile:** no. 81.25 − 66.25 = 15, which is at least 10.
- **Language caution:** VER (2) is tied lowest with MEC. Medium isn't collected, so the flag is `unknown`. If she were known to be Tamil-medium, it would be `true`.

**What Kavya sees:**

> **Your career clusters:** all 12 cards in the order of the table above. Health, Wellness and Sports · Agriculture, Environment and Natural Resources · Education and Social Impact are highlighted
>
> Each cluster shows its example jobs and ways in, with no numbers.

---

## 10. Worked example: a Class 9 student (DIG)

Class 9 students get 10 puzzles (items 1–2 of each domain), and their domain score is doubled.

| Part                        | Answers                | Calculation                                                      |
| --------------------------- | ---------------------- | ---------------------------------------------------------------- |
| B (DIG = B3, B15, B27, B39) | Yes, Yes, Maybe, Maybe | I = 2 + 2 + 1 + 1 = **6**                                        |
| C, LOG                      | 2 of 2 correct         | 2 × 2 = 4                                                        |
| C, PRA                      | 1 of 2 correct         | 1 × 2 = 2 → A = 4 + 2 = **6**                                    |
| D, Curiosity                | Raw 10                 | High → 2                                                         |
| D, Order                    | Raw 7                  | Mid → 1 → S = 2 + 1 = **3**                                      |
| **Index**                   |                        | 6.25 × 6 + 3.75 × 6 + 5 × 3 = 37.5 + 22.5 + 15 = **75 → Strong** |

**What the grade path changes:** if a Class 9 student gets all ten puzzles right, every domain scores 4 and **A = 8 for every cluster**. Aptitude then no longer separates the clusters, and the ranking rests on interest and work style alone. This is expected from the doc's design (10 easier puzzles, doubled), not a bug, but it's worth keeping in mind when reading a Class 9–10 result.

---

## 11. What is provisional

The doc presents the weights, cut-offs and matrix as a starting point to be calibrated in a pilot. Everything listed below lives in `CLUSTERFIT_SCORING_V1` and can change in a new version without touching the scoring code or re-testing students:

| Setting                          | Current value                                                                     | Source                                                     |
| -------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Weights                          | 6.25 / 3.75 / 5 (50% / 30% / 20%)                                                 | Doc                                                        |
| Work-style cut-offs              | 0–4 Low, 5–8 Mid, 9–12 High                                                       | Doc                                                        |
| Band cut-offs                    | Strong ≥ 65, explore ≥ 50                                                         | Doc                                                        |
| Clusters shown to the student    | All 12, top 3 highlighted                                                         | **Product decision** (2026-10-22)                          |
| Classes 9–10 aptitude multiplier | × 2                                                                               | Doc                                                        |
| Flag thresholds                  | Skills to build I ≥ 6 & A ≤ 4; hidden strength A ≥ 7 & I ≤ 3; flat profile gap 10 | Doc                                                        |
| Missing answers                  | None allowed: every item must be answered                                         | **Product decision** (2026-10-22)                          |
| Tie-break                        | Index → I → A → cluster number                                                    | **App decision** (plan §16.1 D2)                           |
| MEC4 answer                      | A (the doc says B)                                                                | **Correction** (plan §16.1 D2), to confirm with the author |
| Language caution tie             | VER tied lowest counts as lowest                                                  | **App reading** of the doc (plan §16.1 D2)                 |
