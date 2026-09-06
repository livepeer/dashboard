import {
  EmailProviderError,
  type EmailDelivery,
  type EmailProvider,
  type SendVerificationEmailInput,
} from "@/lib/email/provider";
import { renderVerificationEmail } from "@/lib/email/verification-email";
import { getEnv } from "@/lib/env";

type ResendProviderOptions = {
  apiKey: string;
  from: string;
  replyTo?: string;
  fetch?: typeof fetch;
};

export class ResendEmailProvider implements EmailProvider {
  private readonly request: typeof fetch;

  constructor(private readonly options: ResendProviderOptions) {
    this.request = options.fetch ?? fetch;
  }

  async sendApprovalEmail(input: {
    to: string;
    loginUrl: string;
    idempotencyKey: string;
  }): Promise<EmailDelivery> {
    const response = await this.request("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from: this.options.from,
        to: [input.to],
        reply_to: this.options.replyTo,
        subject: "Your Livepeer Console access is ready",
        text: `You have been approved for Livepeer Console early access. Sign in using the email address you joined with: ${input.loginUrl}\n\nThis access invitation does not change your newsletter preferences.`,
      }),
    });
    if (!response.ok)
      throw new EmailProviderError(
        "Approval delivery failed",
        response.status === 429 || response.status >= 500,
        `http_${response.status}`
      );
    const body = (await response.json()) as { id?: unknown };
    if (typeof body.id !== "string")
      throw new EmailProviderError(
        "Invalid delivery response",
        true,
        "invalid_response"
      );
    return { providerMessageId: body.id };
  }

  async sendVerificationEmail(
    input: SendVerificationEmailInput
  ): Promise<EmailDelivery> {
    const content = renderVerificationEmail(input);
    let response: Response;

    try {
      response = await this.request("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": input.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.options.from,
          to: [input.to],
          reply_to: this.options.replyTo,
          subject: content.subject,
          html: content.html,
          text: content.text,
        }),
      });
    } catch (error) {
      throw new EmailProviderError(
        "Resend request failed",
        true,
        "network_error",
        { cause: error }
      );
    }

    if (!response.ok) {
      throw new EmailProviderError(
        `Resend rejected the request with status ${response.status}`,
        response.status === 429 || response.status >= 500,
        `http_${response.status}`
      );
    }

    const body = (await response.json()) as { id?: unknown };
    if (typeof body.id !== "string" || !body.id) {
      throw new EmailProviderError(
        "Resend returned an invalid success response",
        true,
        "invalid_response"
      );
    }

    return { providerMessageId: body.id };
  }
}

export function getEmailProviderFromEnv(): EmailProvider {
  const env = getEnv();

  return new ResendEmailProvider({
    apiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM,
    replyTo: process.env.EMAIL_REPLY_TO,
  });
}
