import { createOpenApiRegistry, generateOpenApiDocument } from "@yuvapath/contracts";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  AdminCatalogError,
  registerAdminCatalogRoutes,
  type AdminCatalogRepository,
  type AdminScope,
} from "../src/index.js";

const adminId = "00000000-0000-4000-8000-000000000a01";
const collegeId = "00000000-0000-4000-8000-000000000c01";
const idempotencyKey = "00000000-0000-4000-8000-000000000e01";
const scope: AdminScope = { adminId, state: "Tamil Nadu", displayName: "TN Admin" };

const detail = {
  id: collegeId,
  name: "Anna University",
  city: "Chennai",
  state: "Tamil Nadu",
  institutionType: "University",
  tier: 1,
  admissionRoute: null,
  feesBand: null,
  websiteUrl: null,
  verificationStatus: "unverified" as const,
  lastVerifiedAt: null,
  programCount: 0,
  programs: [],
};

const createApp = (overrides: Partial<AdminCatalogRepository> = {}) => {
  const createCollege = vi.fn().mockResolvedValue(detail);
  const repository = {
    createCollege,
    getCollege: vi.fn().mockResolvedValue(detail),
    deleteCollege: vi.fn().mockResolvedValue({ removedPrograms: 2 }),
    ...overrides,
  } as unknown as AdminCatalogRepository;
  const app = express();
  app.use(express.json());
  const registry = createOpenApiRegistry();
  registerAdminCatalogRoutes(app, registry, {
    repository,
    resolveAdminScope: (id) => Promise.resolve(id === adminId ? scope : null),
  });
  return { app, createCollege, registry };
};

const newCollege = {
  name: "Anna University",
  city: "Chennai",
  state: "Tamil Nadu",
  institutionType: "University",
  tier: "",
  admissionRoute: "",
  feesBand: "",
  websiteUrl: "",
  verificationStatus: "unverified",
};

describe("regional admin catalog routes", () => {
  it("rejects requests without an active regional admin id", async () => {
    const { app } = createApp();
    await request(app).get("/api/v1/admin/overview").expect(401);
    await request(app)
      .get(`/api/v1/admin/colleges/${collegeId}`)
      .set("x-yuvapath-admin-id", "00000000-0000-4000-8000-0000000000ff")
      .expect(401);
  });

  it("normalises blank optional fields to null and forwards the idempotency key", async () => {
    const { app, createCollege } = createApp();
    await request(app)
      .post("/api/v1/admin/colleges")
      .set("x-yuvapath-admin-id", adminId)
      .set("idempotency-key", idempotencyKey)
      .send(newCollege)
      .expect(201);
    expect(createCollege).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({ tier: null, admissionRoute: null, feesBand: null, websiteUrl: null }),
      idempotencyKey,
    );
  });

  it("requires an Idempotency-Key on create", async () => {
    const { app, createCollege } = createApp();
    await request(app)
      .post("/api/v1/admin/colleges")
      .set("x-yuvapath-admin-id", adminId)
      .send(newCollege)
      .expect(400);
    expect(createCollege).not.toHaveBeenCalled();
  });

  it("rejects an invalid body", async () => {
    const { app } = createApp();
    await request(app)
      .post("/api/v1/admin/colleges")
      .set("x-yuvapath-admin-id", adminId)
      .set("idempotency-key", idempotencyKey)
      .send({ ...newCollege, name: "", websiteUrl: "http://insecure.example" })
      .expect(400);
  });

  it("maps repository scope errors to their status code", async () => {
    const { app } = createApp({
      getCollege: vi
        .fn()
        .mockRejectedValue(new AdminCatalogError("out_of_scope", "This college is outside your region.", 403)),
    });
    const response = await request(app)
      .get(`/api/v1/admin/colleges/${collegeId}`)
      .set("x-yuvapath-admin-id", adminId)
      .expect(403);
    expect(response.body).toEqual({ code: "out_of_scope", message: "This college is outside your region." });
  });

  it("reports how many programs a college delete cascaded to", async () => {
    const { app } = createApp();
    const response = await request(app)
      .delete(`/api/v1/admin/colleges/${collegeId}`)
      .set("x-yuvapath-admin-id", adminId)
      .expect(200);
    expect(response.body).toEqual({ deleted: true, removedPrograms: 2 });
  });

  it("registers every admin endpoint in the OpenAPI document", () => {
    const { registry } = createApp();
    const paths = Object.keys(generateOpenApiDocument(registry).paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/api/v1/admin/overview",
        "/api/v1/admin/colleges",
        "/api/v1/admin/colleges/{id}",
        "/api/v1/admin/colleges/{id}/programs",
        "/api/v1/admin/colleges/{id}/programs/{programId}",
        "/api/v1/admin/disciplines",
        "/api/v1/admin/aid-schemes",
        "/api/v1/admin/aid-schemes/{id}",
        "/api/v1/admin/bulk-upload/validate",
        "/api/v1/admin/bulk-upload/publish",
      ]),
    );
  });
});
