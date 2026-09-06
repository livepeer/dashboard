import { describe, expect, it, vi } from "vitest";

import { AudienceProviderError } from "@/lib/email/audience-provider";
import { ResendAudienceProvider } from "@/lib/email/resend-audience";

describe("ResendAudienceProvider", () => {
  it("creates or updates a contact with inverse unsubscribe state", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "contact-id" }), { status: 200 })
      );
    const provider = new ResendAudienceProvider({
      apiKey: "re_test",
      segmentId: "segment-id",
      fetch: request,
    });

    await provider.updateContact({
      email: "person@example.com",
      subscribed: true,
      idempotencyKey: "consent:event-id",
    });

    expect(request).toHaveBeenCalledWith(
      "https://api.resend.com/contacts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "idempotency-key": "consent:event-id",
        }),
        body: JSON.stringify({
          email: "person@example.com",
          unsubscribed: false,
          segments: [{ id: "segment-id" }],
        }),
      })
    );
  });

  it("classifies client rejection as permanent", async () => {
    const provider = new ResendAudienceProvider({
      apiKey: "re_test",
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("invalid", { status: 422 })),
    });

    const error = await provider
      .updateContact({
        email: "person@example.com",
        subscribed: false,
        idempotencyKey: "consent:event-id",
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AudienceProviderError);
    expect(error).toMatchObject({ retryable: false, code: "http_422" });
  });
});
