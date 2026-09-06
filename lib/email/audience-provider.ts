export type UpdateAudienceContactInput = {
  email: string;
  subscribed: boolean;
  idempotencyKey: string;
  signal?: AbortSignal;
};

export interface AudienceProvider {
  updateContact(input: UpdateAudienceContactInput): Promise<void>;
}

export class AudienceProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly code = "audience_provider_error",
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "AudienceProviderError";
  }
}
