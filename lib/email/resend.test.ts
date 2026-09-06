import { describe, expect, it, vi } from "vitest";

import { EmailProviderError } from "@/lib/email/provider";
import { ResendEmailProvider } from "@/lib/email/resend";

const input = {
  to: "person@example.com",
  verificationUrl: "https://example.com/verify?token=secret",
  expiresAt: "2026-07-27T18:00:00.000Z",
  idempotencyKey: "verification:signup-id",
};

describe("ResendEmailProvider", () => {
  it("sends an idempotent verification request", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "email-id" }));
    const provider = new ResendEmailProvider({
      apiKey: "api-key",
      from: "Livepeer <waitlist@example.com>",
      fetch: request,
    });

    await expect(provider.sendVerificationEmail(input)).resolves.toEqual({
      providerMessageId: "email-id",
    });

    const [, init] = request.mock.calls[0];
    expect(new Headers(init?.headers).get("idempotency-key")).toBe(
      input.idempotencyKey
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      from: "Livepeer <waitlist@example.com>",
      to: ["person@example.com"],
    });
  });

  it("classifies rate limits as retryable without exposing response data", async () => {
    const provider = new ResendEmailProvider({
      apiKey: "api-key",
      from: "waitlist@example.com",
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("provider detail", { status: 429 })),
    });

    const error = await provider
      .sendVerificationEmail(input)
      .catch((value) => value);
    expect(error).toBeInstanceOf(EmailProviderError);
    expect(error.retryable).toBe(true);
    expect(error.message).not.toContain("provider detail");
  });
});
