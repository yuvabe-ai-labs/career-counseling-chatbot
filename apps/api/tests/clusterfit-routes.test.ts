import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app/create-app.js";

const STUDENT = "11111111-1111-4111-8111-111111111111";
const body = <T>(response: { body: unknown }): T => response.body as T;

// No database: the clusterfit module keeps its data in memory, with a demo student profile.
describe("clusterfit routes", () => {
  const app = (geminiApiKey?: string | null) =>
    createApp({
      logging: false,
      database: false,
      databaseRequired: false,
      ...(geminiApiKey === undefined ? {} : { geminiApiKey }),
    });

  it("run chat-confirm → B → C → D → submit → cluster recommendation", async () => {
    const server = app();
    const headers = { "x-yuvapath-user-id": STUDENT };
    const started = await request(server)
      .post("/api/v1/clusterfit/sessions")
      .set(headers)
      .send({ idempotencyKey: randomUUID() });
    expect(started.status).toBe(201);
    const base = `/api/v1/clusterfit/sessions/${body<{ session: { sessionId: string } }>(started).session.sessionId}`;

    expect(
      body<{ code: string }>(await request(server).get(`${base}/parts/C/items`).set(headers)).code,
    ).toBe("clusterfit_grade_required");
    // About you finished (chat ended or skipped): every student gets all 20 puzzles for now.
    const completed = await request(server).put(`${base}/situation/complete`).set(headers);
    expect(body<{ gradePath: string }>(completed).gradePath).toBe("11_12");

    for (const part of ["B", "C", "D"] as const) {
      const items = body<{ items: { itemKey: string }[] }>(
        await request(server).get(`${base}/parts/${part}/items`).set(headers),
      ).items;
      if (part === "C") expect(items).toHaveLength(20);
      for (const item of items) {
        const answer = part === "B" ? "maybe" : part === "C" ? "A" : 2;
        const saved = await request(server)
          .put(`${base}/responses`)
          .set(headers)
          .send({ itemKey: item.itemKey, answer, idempotencyKey: randomUUID() });
        expect(saved.status).toBe(200);
      }
    }

    expect(
      (
        await request(server)
          .post(`${base}/score`)
          .set(headers)
          .send({ idempotencyKey: randomUUID() })
      ).status,
    ).toBe(200);
    const result = await request(server).get(`${base}/result`).set(headers);
    const { clusters } = body<{ result: { clusters: { recommended: boolean }[] } }>(result).result;
    expect(clusters).toHaveLength(12);
    expect(clusters.filter((cluster) => cluster.recommended)).toHaveLength(3);
    expect(JSON.stringify(result.body)).not.toMatch(/"index"|"flags"/);
  });

  it("serve health, need a student header, and appear in the OpenAPI document", async () => {
    const server = app();
    expect(
      body<{ status: string }>(await request(server).get("/api/v1/clusterfit/health")).status,
    ).toBe("ok");
    expect(
      (
        await request(server)
          .post("/api/v1/clusterfit/sessions")
          .send({ idempotencyKey: randomUUID() })
      ).status,
    ).toBe(400);
    const paths = Object.keys(
      body<{ paths: Record<string, unknown> }>(await request(server).get("/openapi.json")).paths,
    );
    expect(paths).toEqual(
      expect.arrayContaining([
        "/api/v1/clusterfit/sessions",
        "/api/v1/clusterfit/sessions/{sessionId}/live-token",
        "/api/v1/clusterfit/sessions/{sessionId}/situation-captures",
        "/api/v1/clusterfit/sessions/{sessionId}/result",
      ]),
    );
  });

  it("report the voice chat unavailable without a Gemini key, so the form path is used", async () => {
    {
      const server = app(null);
      const headers = { "x-yuvapath-user-id": STUDENT };
      const started = await request(server)
        .post("/api/v1/clusterfit/sessions")
        .set(headers)
        .send({ idempotencyKey: randomUUID() });
      const sessionId = body<{ session: { sessionId: string } }>(started).session.sessionId;
      expect(
        (
          await request(server)
            .post(`/api/v1/clusterfit/sessions/${sessionId}/live-token`)
            .set(headers)
        ).status,
      ).toBe(503);
    }
  });
});
