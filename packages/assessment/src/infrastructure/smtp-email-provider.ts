import nodemailer from "nodemailer";
import type {
  EmailContext,
  EmailProvider,
  SendEmailInput,
  SendEmailResult,
} from "../application/email-provider.js";

const SUBJECTS: Record<EmailContext, string> = {
  identity_otp: "Your YuvaNext verification code",
  guardian_otp: "YuvaNext: approve your child's account",
};

const renderBody = (context: EmailContext, templateVars: Record<string, string>): string => {
  switch (context) {
    case "identity_otp":
      return [
        `Your YuvaNext verification code is ${templateVars.OTP ?? ""}.`,
        "It expires in 5 minutes.",
        "",
        "If you didn't request this, you can safely ignore this email.",
      ].join("\n");
    // No decline content here — decline isn't offered at this stage (planned separately, later,
    // with its own mechanism), so both the initial request and every resend get this same
    // OTP-only body.
    case "guardian_otp":
      return [
        "Your child has started a YuvaNext career-exploration account and needs your approval to continue.",
        `Your verification code is ${templateVars.OTP ?? ""}. It expires in 5 minutes.`,
        "",
        "To approve, enter this code where your child is signing up.",
        "",
        "If you weren't expecting this, you can safely ignore this email.",
      ].join("\n");
  }
};

export type SmtpEmailProviderOptions = {
  host: string;
  port: number;
  user: string;
  password: string;
  /** "YuvaNext <no-reply@yuvanext.com>" style From header. */
  from: string;
  /** Defaults to true for port 465 (implicit TLS), false otherwise (STARTTLS on 587/25). */
  secure?: boolean;
};

/**
 * The one nodemailer capability this provider actually needs, kept narrow and local instead
 * of depending on @types/nodemailer's public surface — its `Transporter`/`SentMessageInfo`
 * types default their generic to `any`, which just pushes the "unsafe" problem onto every
 * caller. Asserting `createTransport(...)`'s result to this shape at the one construction
 * site keeps the rest of the class fully typed.
 */
interface NodemailerTransport {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<{ messageId: string }>;
}

/**
 * EmailProvider backed by a plain SMTP account (via nodemailer) — no third-party API, just
 * host/port/credentials. We own OTP generation, storage, and verification ourselves
 * (identity-service.ts); this class only ever delivers the message.
 */
export class SmtpEmailProvider implements EmailProvider {
  private readonly transporter: NodemailerTransport;
  private readonly from: string;

  constructor(options: SmtpEmailProviderOptions) {
    this.from = options.from;
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure ?? options.port === 465,
      auth: { user: options.user, pass: options.password },
    });
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const info = await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: SUBJECTS[input.context],
      text: renderBody(input.context, input.templateVars),
    });
    return { providerMessageId: info.messageId };
  }
}
