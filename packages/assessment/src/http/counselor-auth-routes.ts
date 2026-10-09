import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  ApiErrorSchema,
  CounselorSignInRequestSchema,
  CounselorSignInResponseSchema,
  RequestCounselorPasswordResetOtpRequestSchema,
  RequestCounselorPasswordResetOtpResponseSchema,
  SetCounselorPasswordRequestSchema,
  SetCounselorPasswordResponseSchema,
  VerifyCounselorPasswordResetOtpRequestSchema,
  VerifyCounselorPasswordResetOtpResponseSchema,
} from "@yuvapath/contracts";
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { AssessmentApplicationError } from "../application/errors.js";
import type { CounselorAuthService } from "../application/counselor-auth-service.js";

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

/**
 * Counselor (staff) auth routes — a separate route group from identity-routes.ts's student
 * flow, under its own /api/v1/counselor/auth/* prefix so it's never reachable via the student
 * paths and vice versa. See docs/architecture/counselor-auth-landing-page-plan.md.
 */
export type CounselorAuthRoutesOptions = {
  /** Defaults to the counselor prefix; the regional admin reuses these routes under its own. */
  basePath?: string;
  /** Noun used in OpenAPI summaries, e.g. "counselor" or "regional admin". */
  label?: string;
};

export const registerCounselorAuthRoutes = (
  app: Express,
  registry: OpenAPIRegistry,
  service: CounselorAuthService,
  options: CounselorAuthRoutesOptions = {},
): void => {
  const basePath = options.basePath ?? "/api/v1/counselor/auth";
  const label = options.label ?? "counselor";
  registry.registerPath({
    method: "post",
    path: `${basePath}/signin`,
    tags: ["Assessment"],
    summary: `Sign in to a ${label} (staff) account`,
    request: {
      body: { content: { "application/json": { schema: CounselorSignInRequestSchema } } },
    },
    responses: {
      200: {
        description: "Sign-in succeeded",
        content: { "application/json": { schema: CounselorSignInResponseSchema } },
      },
      400: { description: "Invalid request", content: { "application/json": { schema: ApiErrorSchema } } },
      401: {
        description: "Email or password is incorrect, or the account is not an active counselor",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.post(`${basePath}/signin`, async (request, response, next) => {
    try {
      const body = CounselorSignInRequestSchema.parse(request.body);
      const result = await service.signIn(body);
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
    path: `${basePath}/forgot-password/request-otp`,
    tags: ["Assessment"],
    summary: `Request (or resend) a ${label} password-reset OTP by email`,
    request: {
      body: {
        content: { "application/json": { schema: RequestCounselorPasswordResetOtpRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "Always succeeds — never reveals whether the email belongs to a counselor",
        content: { "application/json": { schema: RequestCounselorPasswordResetOtpResponseSchema } },
      },
      400: { description: "Invalid request", content: { "application/json": { schema: ApiErrorSchema } } },
      429: {
        description: "A code was already sent recently; wait before requesting another",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.post(`${basePath}/forgot-password/request-otp`, async (request, response, next) => {
    try {
      const body = RequestCounselorPasswordResetOtpRequestSchema.parse(request.body);
      const result = await service.requestPasswordResetOtp(body);
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
    path: `${basePath}/forgot-password/verify-otp`,
    tags: ["Assessment"],
    summary: `Verify a ${label} password-reset OTP and receive a short-lived reset token`,
    request: {
      body: {
        content: { "application/json": { schema: VerifyCounselorPasswordResetOtpRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "Verification succeeded",
        content: { "application/json": { schema: VerifyCounselorPasswordResetOtpResponseSchema } },
      },
      400: {
        description: "Invalid or expired verification code",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.post(`${basePath}/forgot-password/verify-otp`, async (request, response, next) => {
    try {
      const body = VerifyCounselorPasswordResetOtpRequestSchema.parse(request.body);
      const result = await service.verifyPasswordResetOtp(body);
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
    path: `${basePath}/forgot-password/set-password`,
    tags: ["Assessment"],
    summary: `Set a new ${label} password using a verified reset token`,
    request: {
      body: { content: { "application/json": { schema: SetCounselorPasswordRequestSchema } } },
    },
    responses: {
      200: {
        description: "Password updated",
        content: { "application/json": { schema: SetCounselorPasswordResponseSchema } },
      },
      400: {
        description: "Invalid, expired, or already-used reset token",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  });

  app.post(`${basePath}/forgot-password/set-password`, async (request, response, next) => {
    try {
      const body = SetCounselorPasswordRequestSchema.parse(request.body);
      const result = await service.setNewPassword(body);
      response.status(200).json(result);
    } catch (error) {
      try {
        sendError(response, error);
      } catch (unhandled) {
        next(unhandled);
      }
    }
  });
};
