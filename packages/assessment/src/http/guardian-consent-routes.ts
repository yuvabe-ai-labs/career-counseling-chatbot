import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  ApiErrorSchema,
  DeclineGuardianConsentRequestSchema,
  GuardianConsentResponseSchema,
  GuardianConsentStatusResponseSchema,
  PendingGuardianConsentResponseSchema,
  RequestGuardianConsentRequestSchema,
  RequestPendingGuardianConsentRequestSchema,
  RequestPendingGuardianConsentResponseSchema,
  ResendPendingGuardianConsentRequestSchema,
  ResendPendingGuardianConsentResponseSchema,
  UuidSchema,
  VerifyGuardianConsentRequestSchema,
  VerifyPendingGuardianConsentRequestSchema,
} from "@yuvanext/contracts";
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { AssessmentApplicationError } from "../application/errors.js";
import type { GuardianConsentService } from "../application/guardian-consent-service.js";
import type { GuardianDeclineTokenStore } from "../application/guardian-decline-token-store.js";
import type { GuardianOtpStore } from "../application/guardian-otp-store.js";

const ActorHeaderSchema = z.object({ "x-yuvanext-user-id": UuidSchema });
const SessionParamsSchema = z.object({ sessionId: UuidSchema });
const ConsentDebugParamsSchema = z.object({ sessionId: UuidSchema, consentId: UuidSchema });
const ConsentIdParamsSchema = z.object({ consentId: UuidSchema });

const getActorUserId = (headers: unknown): string =>
  ActorHeaderSchema.parse(headers)["x-yuvanext-user-id"];

const sendError = (response: Parameters<RequestHandler>[1], error: unknown): void => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ code: "invalid_request", message: "Request validation failed." });
    return;
  }

  if (error instanceof AssessmentApplicationError) {
    response.status(error.statusCode).json({ code: error.code, message: error.message });
    return;
  }

  throw error;
};

export type RegisterGuardianConsentRoutesOptions = {
  otpStore: GuardianOtpStore;
  declineTokenStore: GuardianDeclineTokenStore;
  /** Never registered in the OpenAPI doc. Must be false in production regardless of EmailProvider. */
  enableOtpDebugRoute: boolean;
};

export const registerGuardianConsentRoutes = (
  app: Express,
  registry: OpenAPIRegistry,
  service: GuardianConsentService,
  debugOptions: RegisterGuardianConsentRoutesOptions,
): void => {
  registry.registerPath({
    method: "post",
    path: "/api/v1/journey-sessions/{sessionId}/guardian-consents",
    tags: ["Assessment"],
    summary: "Request guardian consent for a minor student profile",
    request: {
      headers: ActorHeaderSchema,
      params: SessionParamsSchema,
      body: {
        content: { "application/json": { schema: RequestGuardianConsentRequestSchema } },
      },
    },
    responses: {
      201: {
        description: "Guardian consent requested",
        content: { "application/json": { schema: GuardianConsentResponseSchema } },
      },
      400: {
        description: "Invalid request",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
      409: {
        description: "Guardian consent is not required",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.post(
    "/api/v1/journey-sessions/:sessionId/guardian-consents",
    async (request, response, next) => {
      try {
        const { sessionId } = SessionParamsSchema.parse(request.params);
        const userId = getActorUserId(request.headers);
        const body = RequestGuardianConsentRequestSchema.parse(request.body);
        const consent = await service.request({ sessionId, userId, consent: body });
        response.status(201).json({ consent });
      } catch (error) {
        try {
          sendError(response, error);
        } catch (unhandled) {
          next(unhandled);
        }
      }
    },
  );

  registry.registerPath({
    method: "post",
    path: "/api/v1/journey-sessions/{sessionId}/guardian-consents/verify",
    tags: ["Assessment"],
    summary: "Verify a pending guardian consent OTP",
    request: {
      headers: ActorHeaderSchema,
      params: SessionParamsSchema,
      body: {
        content: { "application/json": { schema: VerifyGuardianConsentRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "Guardian consent granted",
        content: { "application/json": { schema: GuardianConsentResponseSchema } },
      },
      400: {
        description: "Invalid or expired OTP",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.post(
    "/api/v1/journey-sessions/:sessionId/guardian-consents/verify",
    async (request, response, next) => {
      try {
        const { sessionId } = SessionParamsSchema.parse(request.params);
        const userId = getActorUserId(request.headers);
        const body = VerifyGuardianConsentRequestSchema.parse(request.body);
        const consent = await service.verify({ sessionId, userId, verification: body });
        response.status(200).json({ consent });
      } catch (error) {
        try {
          sendError(response, error);
        } catch (unhandled) {
          next(unhandled);
        }
      }
    },
  );

  registry.registerPath({
    method: "get",
    path: "/api/v1/journey-sessions/{sessionId}/guardian-consents/status",
    tags: ["Assessment"],
    summary: "Get guardian consent status for the authenticated student",
    request: {
      headers: ActorHeaderSchema,
      params: SessionParamsSchema,
    },
    responses: {
      200: {
        description: "Guardian consent status",
        content: { "application/json": { schema: GuardianConsentStatusResponseSchema } },
      },
      404: {
        description: "User profile not found",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.get(
    "/api/v1/journey-sessions/:sessionId/guardian-consents/status",
    async (request, response, next) => {
      try {
        const { sessionId } = SessionParamsSchema.parse(request.params);
        const userId = getActorUserId(request.headers);
        const body = await service.getStatus({ sessionId, userId });
        response.status(200).json(body);
      } catch (error) {
        try {
          sendError(response, error);
        } catch (unhandled) {
          next(unhandled);
        }
      }
    },
  );

  // Pre-identity path (minor signup): the guardian-consent equivalent of /auth/otp/request +
  // /auth/otp/verify — keyed by pendingSessionId, since there's no userId/journey session yet.
  // See SignUpWithPasswordRequestSchema (auth.ts) for the step that follows a granted consent.
  registry.registerPath({
    method: "post",
    path: "/api/v1/auth/guardian-consents",
    tags: ["Assessment"],
    summary: "Request guardian consent for a minor, before the student has an identity",
    request: {
      body: {
        content: { "application/json": { schema: RequestPendingGuardianConsentRequestSchema } },
      },
    },
    responses: {
      201: {
        description: "Guardian consent requested",
        content: { "application/json": { schema: RequestPendingGuardianConsentResponseSchema } },
      },
      400: {
        description: "Invalid request",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
      404: {
        description: "Anonymous session was not found or has expired",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
      409: {
        description: "Guardian consent is not required",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.post("/api/v1/auth/guardian-consents", async (request, response, next) => {
    try {
      const body = RequestPendingGuardianConsentRequestSchema.parse(request.body);
      const result = await service.requestForPendingSession(body);
      response.status(201).json(result);
    } catch (error) {
      try {
        sendError(response, error);
      } catch (unhandled) {
        next(unhandled);
      }
    }
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/auth/guardian-consents/resend",
    tags: ["Assessment"],
    summary: "Resend the guardian OTP, before the student has an identity",
    request: {
      body: {
        content: { "application/json": { schema: ResendPendingGuardianConsentRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "OTP resent",
        content: { "application/json": { schema: ResendPendingGuardianConsentResponseSchema } },
      },
      400: {
        description: "Invalid request",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
      404: {
        description: "Anonymous session or guardian consent was not found",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
      409: {
        description: "Resend attempts exhausted",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
      429: {
        description: "Resend requested before the waiting period elapsed",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.post("/api/v1/auth/guardian-consents/resend", async (request, response, next) => {
    try {
      const body = ResendPendingGuardianConsentRequestSchema.parse(request.body);
      const otpTiming = await service.resendForPendingSession(body);
      response.status(200).json({ otpTiming });
    } catch (error) {
      try {
        sendError(response, error);
      } catch (unhandled) {
        next(unhandled);
      }
    }
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/auth/guardian-consents/verify",
    tags: ["Assessment"],
    summary: "Verify a pending guardian consent OTP, before the student has an identity",
    request: {
      body: {
        content: { "application/json": { schema: VerifyPendingGuardianConsentRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "Guardian consent granted",
        content: { "application/json": { schema: PendingGuardianConsentResponseSchema } },
      },
      400: {
        description: "Invalid or expired OTP",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.post("/api/v1/auth/guardian-consents/verify", async (request, response, next) => {
    try {
      const body = VerifyPendingGuardianConsentRequestSchema.parse(request.body);
      const consent = await service.verifyForPendingSession(body);
      response.status(200).json({ consent });
    } catch (error) {
      try {
        sendError(response, error);
      } catch (unhandled) {
        next(unhandled);
      }
    }
  });

  // Guardian-initiated (Gap 6): intentionally NOT nested under /journey-sessions/{sessionId}/...
  // and carries no x-yuvanext-user-id — the guardian has no student session. The consentId in
  // the URL plus the opaque token (sent to the guardian's email alongside the OTP) is the only
  // authorization.
  registry.registerPath({
    method: "post",
    path: "/api/v1/guardian-consents/{consentId}/decline",
    tags: ["Assessment"],
    summary: "Guardian-initiated decline of a pending consent request",
    request: {
      params: ConsentIdParamsSchema,
      body: {
        content: { "application/json": { schema: DeclineGuardianConsentRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "Guardian consent declined",
        content: { "application/json": { schema: GuardianConsentResponseSchema } },
      },
      400: {
        description: "Decline link is invalid or has expired",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
      404: {
        description: "Guardian consent was not found",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
      409: {
        description: "Only pending guardian consent can be declined",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.post("/api/v1/guardian-consents/:consentId/decline", async (request, response, next) => {
    try {
      const { consentId } = ConsentIdParamsSchema.parse(request.params);
      const body = DeclineGuardianConsentRequestSchema.parse(request.body);
      const consent = await service.decline({ consentId, token: body.token });
      response.status(200).json({ consent });
    } catch (error) {
      try {
        sendError(response, error);
      } catch (unhandled) {
        next(unhandled);
      }
    }
  });

  // Dev/staging-only: reads a pending OTP challenge straight out of the in-process store, since
  // the configured EmailProvider (dev-echo, or a real SMTP account without a test inbox) may
  // otherwise make the code unrecoverable outside the server. Intentionally NOT registered in
  // the OpenAPI doc, and must be disabled in production regardless of which EmailProvider is active.
  if (debugOptions.enableOtpDebugRoute) {
    app.get(
      "/api/v1/journey-sessions/:sessionId/guardian-consents/:consentId/otp-debug",
      (request, response, next) => {
        try {
          const { consentId } = ConsentDebugParamsSchema.parse(request.params);
          const challenge = debugOptions.otpStore.get(consentId);
          if (!challenge) {
            response.status(404).json({
              code: "guardian_otp_not_found",
              message: "No pending OTP for this consent.",
            });
            return;
          }
          const declineChallenge = debugOptions.declineTokenStore.get(consentId);
          response.status(200).json({
            consentId: challenge.consentId,
            code: challenge.code,
            expiresAt: challenge.expiresAt,
            attempts: challenge.attempts,
            declineToken: declineChallenge?.token ?? null,
            declineTokenExpiresAt: declineChallenge?.expiresAt ?? null,
          });
        } catch (error) {
          try {
            sendError(response, error);
          } catch (unhandled) {
            next(unhandled);
          }
        }
      },
    );
  }
};
