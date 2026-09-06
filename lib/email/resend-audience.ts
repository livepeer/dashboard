import {
  AudienceProviderError,
  type AudienceProvider,
  type UpdateAudienceContactInput,
} from "@/lib/email/audience-provider";
import { getEnv } from "@/lib/env";

type ResendAudienceProviderOptions = {
  apiKey: string;
  segmentId?: string;
  fetch?: typeof fetch;
};

export class ResendAudienceProvider implements AudienceProvider {
  private readonly request: typeof fetch;

  constructor(private readonly options: ResendAudienceProviderOptions) {
    this.request = options.fetch ?? fetch;
  }

  async updateContact(input: UpdateAudienceContactInput): Promise<void> {
    let response: Response;
    try {
      response = await this.request("https://api.resend.com/contacts", {
        method: "POST",
        signal: input.signal,
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": input.idempotencyKey,
        },
        body: JSON.stringify({
          email: input.email,
          unsubscribed: !input.subscribed,
          segments: this.options.segmentId
            ? [{ id: this.options.segmentId }]
            : undefined,
        }),
      });
    } catch (error) {
      throw new AudienceProviderError(
        "Resend Contacts request failed",
        true,
        "network_error",
        { cause: error }
      );
    }

    if (!response.ok) {
      throw new AudienceProviderError(
        `Resend Contacts rejected the request with status ${response.status}`,
        response.status === 429 || response.status >= 500,
        `http_${response.status}`
      );
    }
  }
}

export function getAudienceProviderFromEnv(): AudienceProvider {
  const env = getEnv();

  return new ResendAudienceProvider({
    apiKey: env.RESEND_API_KEY,
    segmentId: process.env.RESEND_NEWSLETTER_SEGMENT_ID,
  });
}
