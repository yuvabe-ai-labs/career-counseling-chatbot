import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APTITUDE_ANSWER_KEY, INTEREST_ITEMS, WORK_STYLE_ITEMS } from "../content/v1/index.js";
import { aptitudeItemsForGradePath } from "../domain/grade-path.js";
import { CLUSTERFIT_SCORING_V1 } from "../domain/scoring-config.js";
import { GeminiContextExtractor, GeminiLiveTokenIssuer } from "../infrastructure/gemini-clients.js";
import { InMemoryClusterfitRepository } from "../infrastructure/in-memory-clusterfit-repository.js";
import {
  ConversationContextV3Schema,
  coverageInstruction,
} from "../situation/conversation-context.js";
import { ClusterfitService } from "./clusterfit-service.js";
import type { ClusterfitStudentProfileReader, ContextExtractor } from "./ports.js";
import { MAX_LIVE_TOKENS_PER_SESSION, SituationService } from "./situation-service.js";

const STUDENT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const fixture = JSON.parse(
  readFileSync(new URL("../situation/__fixtures__/poc-parity.json", import.meta.url), "utf8"),
) as { cases: { context: Record<string, unknown> }[] };
const chatContext = ConversationContextV3Schema.parse({
  ...fixture.cases[0]!.context,
  schema_version: "3",
  values_top3: {
    status: "known",
    value: [
      { value: "learn_grow", rank: 1 },
      { value: "help_community", rank: 2 },
      { value: "steady_income", rank: 3 },
    ],
    certainty: "firm",
    evidence: "learning, helping people, a steady job",
  },
});

const profiles: ClusterfitStudentProfileReader = {
  getStudent: (userId) =>
    Promise.resolve(
      userId === OTHER
        ? { firstName: "Arun", segment: "explorer" as const, state: "Tamil Nadu", city: "Chennai" }
        : {
            firstName: "Meena",
            segment: "pathfinder" as const,
            state: "Tamil Nadu",
            city: "Salem",
          },
    ),
};

const fakeExtractor = (context = chatContext): ContextExtractor & { calls: number } => {
  const extractor = {
    calls: 0,
    extract() {
      extractor.calls += 1;
      return Promise.resolve({ model: "fake", context });
    },
  };
  return extractor;
};

const setup = (extractor?: ContextExtractor) => {
  const repository = new InMemoryClusterfitRepository();
  const prompts: string[] = [];
  const stagesSet: [string, string][] = [];
  const sessions = new ClusterfitService({
    repository,
    profiles,
    config: CLUSTERFIT_SCORING_V1,
    stages: {
      setStage: (userId, stage) => {
        stagesSet.push([userId, stage]);
        return Promise.resolve();
      },
    },
  });
  const chat = new SituationService({
    repository,
    profiles,
    ...(extractor ? { extractor } : {}),
    tokenIssuer: {
      issue: ({ systemInstruction }) => {
        prompts.push(systemInstruction);
        return Promise.resolve({
          token: "auth_tokens/test",
          expiresAt: new Date().toISOString(),
          model: "gemini-3.8-live",
        });
      },
    },
    wellbeingCopy: { getWellbeingCopy: () => Promise.resolve("Approved support text") },
  });
  return { repository, sessions, chat, prompts, stagesSet };
};

const start = async (service: ClusterfitService, userId = STUDENT) =>
  (await service.startSession({ userId, idempotencyKey: randomUUID() })).sessionId;

const answerAll = async (
  service: ClusterfitService,
  sessionId: string,
  gradePath: "9_10" | "11_12",
  leaveOut?: string,
) => {
  for (const item of INTEREST_ITEMS) {
    await service.saveResponse(STUDENT, sessionId, {
      itemKey: item.itemKey,
      answer: "yes",
      idempotencyKey: randomUUID(),
    });
  }
  for (const item of aptitudeItemsForGradePath(gradePath)) {
    await service.saveResponse(STUDENT, sessionId, {
      itemKey: item.itemKey,
      answer: APTITUDE_ANSWER_KEY[item.itemKey]!,
      idempotencyKey: randomUUID(),
    });
  }
  for (const item of WORK_STYLE_ITEMS) {
    if (item.itemKey === leaveOut) continue;
    await service.saveResponse(STUDENT, sessionId, {
      itemKey: item.itemKey,
      answer: item.reverse ? 0 : 3,
      idempotencyKey: randomUUID(),
    });
  }
};

describe("ClusterfitService", () => {
  it("starts idempotently and resumes the latest session", async () => {
    const { sessions } = setup();
    const key = randomUUID();
    const first = await sessions.startSession({ userId: STUDENT, idempotencyKey: key });
    expect(await sessions.startSession({ userId: STUDENT, idempotencyKey: key })).toEqual(first);
    expect(
      (await sessions.startSession({ userId: STUDENT, idempotencyKey: randomUUID() })).sessionId,
    ).toBe(first.sessionId);
    expect(first.progress).toEqual({
      B: { answered: 0, total: 48 },
      C: { answered: 0, total: 0 },
      D: { answered: 0, total: 20 },
    });
  });

  it("hides another student's session", async () => {
    const { sessions } = setup();
    const sessionId = await start(sessions);
    await expect(sessions.getSession(OTHER, sessionId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("never sends cluster codes, dimensions or the answer key to the student", async () => {
    const { sessions } = setup();
    const sessionId = await start(sessions);
    await sessions.saveSituationEdits(STUDENT, sessionId, { grade: 11 });
    for (const part of ["B", "C", "D"] as const) {
      const payload = JSON.stringify(await sessions.getPartItems(STUDENT, sessionId, part));
      expect(payload).not.toMatch(
        /clusterCode|dimension|reverse|gradesElevenTwelveOnly|"(SCI|HLT|CON)"/,
      );
    }
    expect((await sessions.getPartItems(STUDENT, sessionId, "C")).items).toHaveLength(20);
  });

  it("opens the puzzles once About you is complete, with all 20 for every student for now", async () => {
    const { sessions, stagesSet } = setup();
    const sessionId = await start(sessions);
    await expect(sessions.getPartItems(STUDENT, sessionId, "C")).rejects.toMatchObject({
      code: "clusterfit_grade_required",
    });
    // Skipped chat: no class known, so no stage is recorded.
    expect(await sessions.completeSituation(STUDENT, sessionId)).toEqual({ gradePath: "11_12" });
    expect(stagesSet).toEqual([]);
    expect((await sessions.getPartItems(STUDENT, sessionId, "C")).items).toHaveLength(20);
    // Safe to repeat.
    expect(await sessions.completeSituation(STUDENT, sessionId)).toEqual({ gradePath: "11_12" });
  });

  it("validates answer shapes and keeps the last answer", async () => {
    const { sessions } = setup();
    const sessionId = await start(sessions);
    await expect(
      sessions.saveResponse(STUDENT, sessionId, {
        itemKey: "B1",
        answer: 2,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "clusterfit_invalid_answer" });
    await sessions.saveResponse(STUDENT, sessionId, {
      itemKey: "B1",
      answer: "no",
      idempotencyKey: randomUUID(),
    });
    await sessions.saveResponse(STUDENT, sessionId, {
      itemKey: "B1",
      answer: "yes",
      idempotencyKey: randomUUID(),
    });
    const b = await sessions.getPartItems(STUDENT, sessionId, "B");
    expect([b.answers, b.progress]).toEqual([{ B1: "yes" }, { answered: 1, total: 48 }]);
  });

  it("saves the confirm card's values and rejects a repeated card", async () => {
    const { repository, sessions } = setup();
    const sessionId = await start(sessions);
    const saved = await sessions.saveSituationEdits(STUDENT, sessionId, {
      grade: 12,
      values: [
        { value: "travel", rank: 2 },
        { value: "respect", rank: 1 },
      ],
    });
    expect(saved.situation.canonical.values).toEqual([
      { value: "respect", rank: 1 },
      { value: "travel", rank: 2 },
    ]);
    expect(repository.values.get(sessionId)).toHaveLength(2);
    await expect(
      sessions.saveSituationEdits(STUDENT, sessionId, {
        grade: 12,
        values: [
          { value: "travel", rank: 1 },
          { value: "travel", rank: 2 },
        ],
      }),
    ).rejects.toMatchObject({ code: "clusterfit_invalid_answer" });
  });

  it("scores on submit after Part D, then locks the answers and shows only band names", async () => {
    const { repository, sessions } = setup();
    const sessionId = await start(sessions);
    await sessions.saveSituationEdits(STUDENT, sessionId, { grade: 12 });
    await expect(sessions.score(STUDENT, sessionId)).rejects.toMatchObject({
      code: "clusterfit_not_ready",
    });
    await answerAll(sessions, sessionId, "11_12");
    await sessions.score(STUDENT, sessionId);
    await sessions.score(STUDENT, sessionId);
    expect(repository.results.get(sessionId)).toHaveLength(1);
    expect((await sessions.getSession(STUDENT, sessionId)).status).toBe("scored");

    // All answers at the maximum: every index ties at 100, so the cluster order decides.
    const result = await sessions.getStudentResult(STUDENT, sessionId);
    expect(result.clusters).toHaveLength(12);
    expect(
      result.clusters
        .filter((cluster) => cluster.recommended)
        .map((cluster) => [cluster.code, cluster.signal]),
    ).toEqual([
      ["SCI", "strong"],
      ["ENG", "strong"],
      ["DIG", "strong"],
    ]);
    expect(result.clusters[0]).toHaveProperty("exampleRoles");
    expect(JSON.stringify(result)).not.toMatch(/"index"|"flags"|"interest"/);
    await expect(
      sessions.saveResponse(STUDENT, sessionId, {
        itemKey: "B1",
        answer: "no",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "clusterfit_session_scored" });
  });

  it("retakes a scored test as a new attempt and archives the old one", async () => {
    const { repository, sessions } = setup();
    const first = await start(sessions);
    await expect(sessions.reattempt(STUDENT, first, randomUUID())).rejects.toMatchObject({
      code: "clusterfit_reattempt_not_allowed",
    });
    await sessions.saveSituationEdits(STUDENT, first, { grade: 12 });
    await answerAll(sessions, first, "11_12");
    await sessions.score(STUDENT, first);
    await expect(sessions.reattempt(OTHER, first, randomUUID())).rejects.toMatchObject({
      code: "clusterfit_session_not_found",
    });

    const key = randomUUID();
    const retake = await sessions.reattempt(STUDENT, first, key);
    expect(await sessions.reattempt(STUDENT, first, key)).toEqual(retake);
    expect(repository.sessions.size).toBe(2);
    expect(retake.sessionId).not.toBe(first);
    expect(retake).toMatchObject({ status: "in_progress", gradePath: null });
    expect(retake.progress.B.answered).toBe(0);
    expect(repository.sessions.get(retake.sessionId)?.attemptNumber).toBe(2);

    // The old attempt is kept, only hidden: answers and result stay, the student resumes the new one.
    expect(repository.sessions.get(first)?.status).toBe("abandoned");
    expect(await repository.getCurrentResult(first)).not.toBeNull();
    expect(await sessions.startSession({ userId: STUDENT, idempotencyKey: randomUUID() })).toEqual(
      retake,
    );
    await expect(sessions.getStudentResult(STUDENT, retake.sessionId)).rejects.toMatchObject({
      code: "clusterfit_result_not_found",
    });

    await sessions.saveSituationEdits(STUDENT, retake.sessionId, { grade: 10 });
    await answerAll(sessions, retake.sessionId, "11_12");
    await sessions.score(STUDENT, retake.sessionId);
    expect((await sessions.getStudentResult(STUDENT, retake.sessionId)).clusters).toHaveLength(12);
    expect(repository.results.get(first)).toHaveLength(1);
  });
});

describe("SituationService (Part A + E chat)", () => {
  const transcript = [
    { speaker: "guide" as const, text: "Which class are you in?" },
    { speaker: "student" as const, text: "Class 11, biology." },
  ];

  it("issues tokens with the POC prompt filled from the profile, up to the per-session limit", async () => {
    const { sessions, chat, prompts } = setup();
    const sessionId = await start(sessions);
    const first = await chat.issueLiveToken(STUDENT, sessionId);
    expect(first.websocketUrl).toContain(
      "BidiGenerateContentConstrained?access_token=auth_tokens%2Ftest",
    );
    expect(Object.keys(first.toolResults)).toEqual(
      expect.arrayContaining(["end_discovery", "flag_wellbeing_concern"]),
    );
    expect(prompts[0]).toContain("first_name:        Meena");
    expect(prompts[0]).toContain("**11. What matters most.**");
    for (let index = 1; index < MAX_LIVE_TOKENS_PER_SESSION; index += 1)
      await chat.issueLiveToken(STUDENT, sessionId);
    await expect(chat.issueLiveToken(STUDENT, sessionId)).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  it("answers check_coverage with missing topics, then 'covered' after 2 checks, and never blocks", async () => {
    const partial = ConversationContextV3Schema.parse({
      ...chatContext,
      values_top3: { status: "unknown", value: null, certainty: null, evidence: null },
    });
    const extractor = fakeExtractor(partial);
    const { sessions, chat } = setup(extractor);
    const sessionId = await start(sessions);
    expect((await chat.coverageCheck(STUDENT, sessionId, transcript)).instruction).toMatch(
      /^Not covered yet: .*matter most/,
    );
    await chat.coverageCheck(STUDENT, sessionId, transcript);
    expect((await chat.coverageCheck(STUDENT, sessionId, transcript)).instruction).toBe(
      coverageInstruction([]),
    );
    expect(extractor.calls).toBe(2);

    const failing = setup({ extract: () => Promise.reject(new Error("boom")) });
    const other = await start(failing.sessions);
    expect((await failing.chat.coverageCheck(STUDENT, other, transcript)).instruction).toBe(
      coverageInstruction([]),
    );
  });

  it("captures the chat: raw fields stored, class and Part E values saved; idempotent", async () => {
    const extractor = fakeExtractor();
    const { repository, sessions, chat } = setup(extractor);
    const sessionId = await start(sessions);
    const key = randomUUID();
    const captured = await chat.captureSituation(STUDENT, sessionId, {
      transcript,
      idempotencyKey: key,
    });
    // The grade path is set when About you is completed, not by the capture.
    expect(captured.gradePath).toBeNull();
    expect(captured.situation?.canonical).toMatchObject({
      grade: 11,
      medium: null,
      values: [{ value: "learn_grow", rank: 1 }, {}, {}],
    });
    expect(repository.values.get(sessionId)).toHaveLength(3);
    expect(repository.captures[0]).toMatchObject({
      fieldSchemaVersion: "conversation-context-v3",
      source: "live",
      wellbeingFlag: false,
    });
    await chat.captureSituation(STUDENT, sessionId, { transcript, idempotencyKey: key });
    expect([repository.captures.length, extractor.calls]).toEqual([1, 1]);
  });

  it("stores a wellbeing flag on the capture and returns only approved copy", async () => {
    const { repository, sessions, chat } = setup(fakeExtractor());
    const sessionId = await start(sessions);
    await chat.captureSituation(STUDENT, sessionId, {
      transcript,
      idempotencyKey: randomUUID(),
      wellbeingFlagged: true,
    });
    expect(repository.captures[0]!.wellbeingFlag).toBe(true);
    expect(repository.situations.get(sessionId)?.canonical.context).not.toHaveProperty(
      "wellbeing_flag",
    );
    expect((await chat.wellbeingMessage(STUDENT, sessionId)).message).toBe("Approved support text");
  });

  it("rejects an empty transcript and reports the chat unavailable without a Gemini key", async () => {
    const { sessions, chat } = setup(fakeExtractor());
    const sessionId = await start(sessions);
    await expect(
      chat.captureSituation(STUDENT, sessionId, {
        transcript: [{ speaker: "guide", text: "Hi?" }],
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "clusterfit_empty_transcript" });
    const repository = new InMemoryClusterfitRepository();
    const noKey = new SituationService({ repository, profiles });
    const other = await new ClusterfitService({
      repository,
      profiles,
      config: CLUSTERFIT_SCORING_V1,
    }).startSession({
      userId: STUDENT,
      idempotencyKey: randomUUID(),
    });
    await expect(noKey.issueLiveToken(STUDENT, other.sessionId)).rejects.toMatchObject({
      statusCode: 503,
    });
  });
});

describe("Gemini clients", () => {
  const ok = () =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(chatContext) }] } }],
      }),
      { status: 200 },
    );
  const known = { segment: "pathfinder", state: "Tamil Nadu", city: "Salem", already_answered: "" };
  const transcript = [{ speaker: "student" as const, text: "Class 11" }];

  it("sends the POC extraction request: v3 schema, temperature 0, Python-style payload", async () => {
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const extractor = new GeminiContextExtractor({
      apiKey: "test-key",
      models: ["gemini-flash-lite-latest"],
      fetch: (url, init) => {
        requests.push({
          url: url as string,
          body: JSON.parse(init?.body as string) as Record<string, unknown>,
        });
        return Promise.resolve(ok());
      },
    });
    expect(
      (await extractor.extract({ knownContext: known, transcript })).context.values_top3.value,
    ).toHaveLength(3);
    expect(requests[0]!.url).toContain("/v1beta/models/gemini-flash-lite-latest:generateContent");
    const config = requests[0]!.body.generationConfig as {
      temperature: number;
      responseJsonSchema: { required: string[] };
    };
    expect(config.temperature).toBe(0);
    expect(config.responseJsonSchema.required).toContain("values_top3");
    const userText = (requests[0]!.body.contents as { parts: { text: string }[] }[])[0]!.parts[0]!
      .text;
    expect(userText.startsWith('{"known_context": {"segment": "pathfinder"')).toBe(true);
  });

  it("falls back to the next model on a 5xx", async () => {
    let calls = 0;
    const extractor = new GeminiContextExtractor({
      apiKey: "k",
      models: ["first", "second"],
      fetch: () => Promise.resolve(++calls === 1 ? new Response("busy", { status: 503 }) : ok()),
    });
    expect((await extractor.extract({ knownContext: known, transcript })).model).toBe("second");
  });

  it("mints a single-use token that locks prompt and tools but leaves resumption to the browser", async () => {
    let body: Record<string, unknown> = {};
    const issuer = new GeminiLiveTokenIssuer({
      apiKey: "k",
      model: "gemini-3.8-live",
      fetch: (_url, init) => {
        body = JSON.parse(init?.body as string) as Record<string, unknown>;
        return Promise.resolve(
          new Response(JSON.stringify({ name: "auth_tokens/abc" }), { status: 200 }),
        );
      },
    });
    expect((await issuer.issue({ systemInstruction: "PROMPT" })).token).toBe("auth_tokens/abc");
    expect(body).toMatchObject({
      uses: 1,
      bidiGenerateContentSetup: { model: "models/gemini-3.8-live" },
    });
    expect(String(body.fieldMask)).toContain("systemInstruction.parts");
    expect(String(body.fieldMask)).toContain("tools");
    expect(body.bidiGenerateContentSetup).not.toHaveProperty("sessionResumption");
  });

  it("needs every item answered: no puzzle skips, and no scoring with one statement left", async () => {
    const { sessions } = setup();
    const sessionId = await start(sessions);
    await sessions.saveSituationEdits(STUDENT, sessionId, { grade: 10 });
    await expect(
      sessions.saveResponse(STUDENT, sessionId, {
        itemKey: "NUM1",
        answer: null as never,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "clusterfit_invalid_answer" });

    await answerAll(sessions, sessionId, "11_12", "D20");
    await expect(sessions.score(STUDENT, sessionId)).rejects.toMatchObject({
      code: "clusterfit_not_ready",
    });
    await sessions.saveResponse(STUDENT, sessionId, {
      itemKey: "D20",
      answer: 2,
      idempotencyKey: randomUUID(),
    });
    await expect(sessions.score(STUDENT, sessionId)).resolves.toHaveProperty("clusters");
  });

  it("records the confirmed class as the profile stage", async () => {
    const { sessions, stagesSet } = setup();
    const first = await start(sessions);
    await sessions.saveSituationEdits(STUDENT, first, { grade: 10 });
    await sessions.saveSituationEdits(STUDENT, first, { grade: 12 });
    expect(stagesSet).toEqual([
      [STUDENT, "school"],
      [STUDENT, "higher_secondary"],
    ]);
  });

  it("records the chat's class as the profile stage when About you is completed", async () => {
    const { sessions, chat, stagesSet } = setup(fakeExtractor());
    const sessionId = await start(sessions);
    await chat.captureSituation(STUDENT, sessionId, { transcript, idempotencyKey: randomUUID() });
    await sessions.completeSituation(STUDENT, sessionId);
    expect(stagesSet).toEqual([[STUDENT, "higher_secondary"]]);
  });
});
