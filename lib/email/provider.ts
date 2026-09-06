export type SendVerificationEmailInput = {
  to: string;
  verificationUrl: string;
  expiresAt: string;
  idempotencyKey: string;
};

export type EmailDelivery = {
  providerMessageId: string;
};

export interface EmailProvider {
  sendApprovalEmail?(input: {
    to: string;
    loginUrl: string;
    idempotencyKey: string;
  }): Promise<EmailDelivery>;
  sendVerificationEmail(
    input: SendVerificationEmailInput
  ): Promise<EmailDelivery>;
}

export class EmailProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly code = "provider_error",
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "EmailProviderError";
  }
}
