import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  ApiErrorSchema,
  CheckEmailAvailabilityRequestSchema,
  CheckEmailAvailabilityResponseSchema,
  RequestAnonymousSessionResponseSchema,
  RequestIdentityOtpRequestSchema,
  RequestIdentityOtpResponseSchema,
  SignInWithPasswordRequestSchema,
  SignInWithPasswordResponseSchema,
  SignUpWithPasswordRequestSchema,
  SignUpWithPasswordResponseSchema,
  VerifyIdentityOtpRequestSchema,
  VerifyIdentityOtpResponseSchema,
  UuidSchema,
} from "@yuvanext/contracts";
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { AssessmentApplicationError } from "../application/errors.js";
import type { IdentityOtpStore } from "../application/identity-otp-store.js";
import type { IdentityService } from "../application/identity-service.js";

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

export type RegisterIdentityRoutesOptions = {
  otpStore: IdentityOtpStore;
  /** Never registered in the OpenAPI doc. Must be false in production regardless of EmailProvider. */
  enableOtpDebugRoute: boolean;
};

/**
 * Identity-bootstrap routes (Module 1, Gap 1): none of these require x-yuvanext-user-id or a
 * bearer token, since their whole purpose is to produce one. Every other Module 1 route is
 * unchanged — the frontend uses VerifyIdentityOtpResponse.userId as x-yuvanext-user-id.
 */
export const registerIdentityRoutes = (
  app: Express,
  registry: OpenAPIRegistry,
  service: IdentityService,
  debugOptions: RegisterIdentityRoutesOptions,
): void => {
  registry.registerPath({
    method: "post",
    path: "/api/v1/sessions/anonymous",
    tags: ["Assessment"],
    summary: "Start a short-lived anonymous session ahead of email verification",
    responses: {
      201: {
        description: "Anonymous session created",
        content: { "application/json": { schema: RequestAnonymousSessionResponseSchema } },
      },
    },
  });

  app.post("/api/v1/sessions/anonymous", (_request, response) => {
    response.status(201).json(service.createAnonymousSession());
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/auth/check-email",
    tags: ["Assessment"],
    summary: "Check whether an email is already registered, before continuing registration",
    request: {
      body: {
        content: { "application/json": { schema: CheckEmailAvailabilityRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "Availability result",
        content: { "application/json": { schema: CheckEmailAvailabilityResponseSchema } },
      },
      400: {
        description: "Invalid request",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.post("/api/v1/auth/check-email", async (request, response, next) => {
    try {
      const body = CheckEmailAvailabilityRequestSchema.parse(request.body);
      const result = await service.checkEmailAvailability(body);
      response.status(200).json(result);
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
    path: "/api/v1/auth/otp/request",
    tags: ["Assessment"],
    summary: "Request an email verification code for a pending anonymous session",
    request: {
      body: {
        content: { "application/json": { schema: RequestIdentityOtpRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "Verification code sent",
        content: { "application/json": { schema: RequestIdentityOtpResponseSchema } },
      },
      400: {
        description: "Invalid request",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
      404: {
        description: "Anonymous session was not found or has expired",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.post("/api/v1/auth/otp/request", async (request, response, next) => {
    try {
      const body = RequestIdentityOtpRequestSchema.parse(request.body);
      await service.requestOtp(body);
      response.status(200).json({ sent: true });
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
    path: "/api/v1/auth/otp/verify",
    tags: ["Assessment"],
    summary: "Verify an email verification code and resolve/create the student's userId",
    request: {
      body: {
        content: { "application/json": { schema: VerifyIdentityOtpRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "Verification succeeded",
        content: { "application/json": { schema: VerifyIdentityOtpResponseSchema } },
      },
      400: {
        description: "Invalid or expired verification code",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.post("/api/v1/auth/otp/verify", async (request, response, next) => {
    try {
      const body = VerifyIdentityOtpRequestSchema.parse(request.body);
      const result = await service.verifyOtp(body);
      response.status(200).json(result);
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
    path: "/api/v1/auth/signup",
    tags: ["Assessment"],
    summary: "Create a password-based account for a minor, once guardian consent is granted",
    request: {
      body: {
        content: { "application/json": { schema: SignUpWithPasswordRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "Account created",
        content: { "application/json": { schema: SignUpWithPasswordResponseSchema } },
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
        description:
          "Guardian consent has not been granted for this session, or the email is already registered",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.post("/api/v1/auth/signup", async (request, response, next) => {
    try {
      const body = SignUpWithPasswordRequestSchema.parse(request.body);
      const result = await service.signUpWithPassword(body);
      response.status(200).json(result);
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
    path: "/api/v1/auth/signin",
    tags: ["Assessment"],
    summary: "Sign in to an existing password-based account",
    request: {
      body: {
        content: { "application/json": { schema: SignInWithPasswordRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "Sign-in succeeded",
        content: { "application/json": { schema: SignInWithPasswordResponseSchema } },
      },
      400: {
        description: "Invalid request",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
      401: {
        description: "Email or password is incorrect",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.post("/api/v1/auth/signin", async (request, response, next) => {
    try {
      const body = SignInWithPasswordRequestSchema.parse(request.body);
      const result = await service.signInWithPassword(body);
      response.status(200).json(result);
    } catch (error) {
      try {
        sendError(response, error);
      } catch (unhandled) {
        next(unhandled);
      }
    }
  });

  // Dev/staging-only, same rationale as guardian-consent-routes.ts's otp-debug route. Not
  // registered in the OpenAPI doc.
  if (debugOptions.enableOtpDebugRoute) {
    const DebugParamsSchema = z.object({ pendingSessionId: UuidSchema });
    app.get("/api/v1/auth/otp/debug/:pendingSessionId", (request, response, next) => {
      try {
        const { pendingSessionId } = DebugParamsSchema.parse(request.params);
        const challenge = debugOptions.otpStore.get(pendingSessionId);
        if (!challenge) {
          response
            .status(404)
            .json({ code: "identity_otp_not_found", message: "No pending OTP for this session." });
          return;
        }
        response.status(200).json({
          pendingSessionId: challenge.pendingSessionId,
          email: challenge.email,
          code: challenge.code,
          expiresAt: challenge.expiresAt,
          attempts: challenge.attempts,
        });
      } catch (error) {
        try {
          sendError(response, error);
        } catch (unhandled) {
          next(unhandled);
        }
      }
    });
  }
};
