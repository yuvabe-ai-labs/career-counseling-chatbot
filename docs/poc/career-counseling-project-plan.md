# YuvaNext Career Counseling Platform — Project Plan

> Summarized from [`module-1-assessment-validation.md`](./module-1-assessment-validation.md), the full technical validation of Modules 1–5. This document translates those findings into module-level project status and next steps for planning purposes — see the validation doc for endpoint-level detail.

## At a Glance

| Module | Status | In one line |
|---|---|---|
| 1 — Assessment | 🟡 Works, but blocked for real use | Solid for adults; no real student login yet, and minor consent can't be finished |
| 2 — Recommendations | 🟡 Strong engine, quiet bugs | All 6 recommendation types work well; two silent data bugs reduce accuracy |
| 3 — Knowledge | 🟢 Ready | The most complete module; only the import tooling needs a config key |
| 4 — Counselor | 🟢 Working | Chat, reports, and safety screening all confirmed working end-to-end |
| 5 — Safety, Staff, Privacy & Evaluation | 🟢 Mostly ready | Staff/privacy/evaluation solid, safety pipeline confirmed working; two safety endpoints still need a fix and access control |

## Module 1 — Assessment

**Status** 🟡 Core mechanics complete and working well for adults. Blocked from real-world use by an unresolved identity question and one unfinished piece of the guardian-consent flow.

**Completed**

- The full adult journey works end-to-end: profile → intake questions → interest and work-values assessments → deterministic scoring → a saved, versioned profile result.
- Guardian-consent requests, status checks, and the rule blocking a minor's answers until consent is granted all work correctly.
- A way to re-fetch a saved profile result later was added since the module was first checked.

**Pending / Gaps**

- No way for a frontend to create or verify a student's identity — everything else assumes a student ID that already exists.
- A guardian's approval code is generated but can't be retrieved by anyone, so the minor-consent journey can't be completed today — only shown correctly blocking until it is.
- The saved profile's structure doesn't match the original spec, which matters for the modules that consume it.
- Big Five, Aptitude, and the photo-based quiz are all planned but can't currently be started.
- Two different login methods now exist side by side instead of one.

**Next Steps**

- Decide the identity strategy (the originally planned approach, or formally commit to the newer method already in partial use) and move the whole module onto one approach.
- Make the guardian's approval code retrievable in test/demo environments.
- Align the saved-profile structure with what Recommendations and Counselor expect.
- Confirm whether Big Five / Aptitude / photo-quiz are needed for this milestone.

## Module 2 — Recommendations

**Status** 🟡 The engine itself is in strong shape and produces accurate, explainable results once a profile exists. Two quiet data bugs are affecting quality, and access control is only half-fixed.

**Completed**

- All six recommendation types — careers, streams, pathways, colleges, financial aid, 90-day plan — generate correctly and match the "closest fit / related / discover" map design.
- Results are reproducible: same inputs always produce the same recommendation.
- Viewing a saved recommendation now requires login and only returns the owner's data (fixed since first checked).

**Pending / Gaps**

- A student's marks band never actually reaches the matching logic (a storage/read mismatch) — silently, no error shown.
- Whether a student wants financial-aid guidance is dropped before it reaches aid recommendations.
- Generating or replaying a recommendation still needs no login — only viewing a saved one was locked down.
- The same field comes back under different names depending on which action produced it.
- All recommendation types currently share one set of scoring weights.

**Next Steps**

- Fix the two data bugs (marks band, aid preference) — small, well-understood, high-impact.
- Extend the login requirement to generating and replaying recommendations too.
- Standardize field naming across responses.
- Confirm with the team whether shared scoring weights are intentional for now.

## Module 3 — Knowledge

**Status** 🟢 Solid and effectively ready as-is — the most complete of the five modules.

**Completed**

- Every catalog capability a frontend needs (careers, colleges, streams, financial-aid schemes, published data sources) works and returns real, substantial data — including official government and labor-market sources, a big step up from the earlier demo dataset.

**Pending / Gaps**

- The two data-import endpoints are unusable because a required setup key isn't configured — a config gap, not a code problem.
- One catalog lookup (streams for a specific interest/segment combination) came back empty; unclear if that's a real data gap or expected.

**Next Steps**

- Configure the missing internal access key wherever imports need to run (CI/ops).
- Check stream-mapping data covers all realistic combinations.

## Module 4 — Counselor

**Status** 🟢 Fully working, including the chat feature itself. Everything supporting the AI counselor was already built; the piece that was blocked — actually sending a message — is now fixed.

**Completed**

- Starting a conversation, viewing past messages, tracking exploration, and journey progress all work correctly.
- Generating a full summary report, a downloadable PDF, and a shareable card — using real cloud storage — all work end-to-end. A notably complete piece of the product.
- An AI provider is connected and confirmed working (a conversation reports full AI mode).
- Sending a message now works end-to-end: a normal message gets a real AI reply; a message matching a safety concern is caught before it reaches the AI and gets a pre-approved safety response instead, while the conversation is paused and a staff review is automatically queued. This was a design issue rather than a missing setting — the safety check was routed through an unnecessary network call back to the app's own address; it now happens directly, in the same process. Fixed and verified live, including confirming in the database that a flagged message correctly pauses the conversation and creates a real staff handoff.

**Pending / Gaps**

- Minor inconsistency: starting a conversation validates the request before checking login, unlike the rest of the module.

**Next Steps**

- Bring conversation-start in line with the rest of the module: check login before validating the request.

## Module 5 — Safety, Staff, Privacy & Evaluation

**Status** 🟢 Staff, Privacy, and Evaluation all work correctly and are properly access-controlled, and the full safety pipeline is now confirmed working end-to-end. The two safety-detection endpoints still have a real bug and a real security gap worth fixing before they're relied on in production.

**Completed**

- The staff dashboard (sessions, student packets, handoff queue, taking action on a queue item) fully tested with a real staff account — correctly blocks anyone without staff access.
- Students can request data export/deletion and check job status.
- Running and retrieving a system evaluation/health-check works.
- The full real-world safety path now works and was demonstrated start to finish: a concerning chat message is caught, the conversation pauses, and a real staff handoff is queued with the flagged excerpt and recent conversation — ready for a staff member to act on through the dashboard. (Fixed since first checked — see Module 4.)

**Pending / Gaps**

- The two endpoints that check a message for safety concerns and create a staff handoff fail with a generic server error instead of a clear "not found" when given a reference that doesn't exist — the cause is known, it's just not surfaced correctly.
- Neither of those two endpoints has any access control at all — inconsistent with every other internal-only endpoint.
- The evaluation/health-check results currently look like a fixed, canned output rather than a real check.

**Next Steps**

- Fix error handling on the two safety endpoints: a bad reference should return "not found," not a generic failure.
- Add the same access-control pattern used elsewhere to those two endpoints.
- Confirm with the team whether the evaluation/health-check is intentionally a placeholder right now.

## Overall Next Steps

Recommended order of work, based on what's actually blocking progress today rather than a fixed schedule:

1. **Settle Module 1's identity approach.** The single biggest open decision left in the whole platform — consent, assessment, recommendations, and chat all assume a logged-in student already exists. (Module 4's chat and Module 5's safety flow are no longer blocked — both are confirmed working end-to-end. Module 3's import tools are still waiting on a config key, low effort.)
2. **Fix Module 2's two data bugs** (marks band, aid preference) — small changes, immediate effect on recommendation accuracy.
3. **Close the remaining access-control gaps** — require login on Module 2's generate/replay actions, and add access control to Module 5's two safety endpoints.
4. **Align the remaining data-shape mismatches** (Module 1's saved-profile structure, Module 2's field naming) so frontend work is built against the real, final shapes.
5. **Make the guardian-approval code retrievable** so the full minor-consent journey can be demonstrated, not just its rules.
6. **Move into frontend integration, module by module** — Modules 2, 3, 4, and 5 are ready today; Module 1 is ready for the adult path now and for the full journey once its identity approach is settled (step 1).
7. **Run one complete end-to-end pass** — identity → consent → assessment → recommendations → counselor chat → safety/staff handoff — once everything above is resolved, as the final readiness check before launch.

## Expected Outcome

A student should be able to sign up and verify who they are through one consistent method; complete their assessment — including as a minor, with a real and demonstrable parental-consent step; receive career, education, and financial-aid recommendations that correctly reflect everything they shared; have a conversation with the AI counselor that is actually screened for safety as it happens; generate and share a report of their results; and, if something concerning comes up, be routed through a secure, working staff review process. Reaching that point — with every step behind consistent logins, clear error handling, and data shapes that match what the frontend expects — is what "ready" looks like for this platform.

---
*Updated 2026-08-27: an AI provider (Gemini) was connected and confirmed working, and a startup bug where a blank-but-present optional setting could crash the server was fixed.*

*Updated 2026-08-27 (later same day): the safety-screening block on Module 4's chat turned out to be a design issue, not a missing setting — the app was calling out to its own address over the network for something it could do directly. That's fixed now. Module 4's chat and Module 5's safety-to-handoff flow are both confirmed working end-to-end, so both moved from 🟡 to 🟢 in the At a Glance table above, and are no longer part of "Overall Next Steps."*
