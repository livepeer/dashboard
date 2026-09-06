import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AudienceProviderError,
  type AudienceProvider,
} from "@/lib/email/audience-provider";
import { EmailProviderError, type EmailProvider } from "@/lib/email/provider";
import {
  dispatchOutboxEvent,
  dispatchPendingOutbox,
  MAX_OUTBOX_ATTEMPTS,
  NEWSLETTER_CONSENT_EVENT,
  type OutboxEvent,
  type OutboxStore,
  VERIFICATION_EMAIL_EVENT,
} from "@/lib/email/outbox";

function fixture(overrides?: Partial<OutboxEvent>): OutboxEvent {
  return {
    id: "event-id",
    eventType: VERIFICATION_EMAIL_EVENT,
    payload: {
      to: "person@example.com",
      verificationUrl: "https://example.com/verify?token=secret",
      expiresAt: "2026-07-27T18:00:00.000Z",
    },
    idempotencyKey: "verification:signup-id",
    attemptCount: 1,
    ...overrides,
  };
}

function dependencies(events: OutboxEvent[]) {
  const sendVerificationEmail = vi
    .fn<EmailProvider["sendVerificationEmail"]>()
    .mockResolvedValue({ providerMessageId: "message-id" });
  const updateContact = vi
    .fn<AudienceProvider["updateContact"]>()
    .mockResolvedValue(undefined);
  const store: OutboxStore = {
    claimDue: vi.fn().mockResolvedValue(events),
    claimById: vi.fn().mockResolvedValue(events[0] ?? null),
    markProcessed: vi.fn().mockResolvedValue(undefined),
    markRetry: vi.fn().mockResolvedValue(undefined),
    markTerminal: vi.fn().mockResolvedValue(undefined),
  };
  return {
    emailProvider: { sendVerificationEmail },
    audienceProvider: { updateContact },
    store,
    sendVerificationEmail,
    updateContact,
    newsletterSync: vi.fn(
      async ({
        email,
        provider,
      }: {
        email: string;
        provider: AudienceProvider;
      }) =>
        provider.updateContact({
          email,
          subscribed: false,
          idempotencyKey: "latest-consent",
        })
    ),
  };
}

describe("outbox dispatch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("captures preview email and consent without contacting either provider", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("EMAIL_DELIVERY_MODE", "capture");
    const deps = dependencies([
      fixture(),
      fixture({
        id: "consent",
        eventType: NEWSLETTER_CONSENT_EVENT,
        payload: {
          email: "fixture@example.invalid",
          subscribed: true,
          consentEventId: "34cdd9d3-a720-4a62-b2b1-e5996a1c3b82",
        },
      }),
      fixture({
        id: "approval",
        eventType: "access.approved",
        payload: {
          to: "fixture@example.invalid",
          loginUrl: "https://preview.example.invalid/login",
        },
      }),
    ]);
    expect(await dispatchPendingOutbox(deps)).toMatchObject({ delivered: 3 });
    expect(deps.sendVerificationEmail).not.toHaveBeenCalled();
    expect(deps.updateContact).not.toHaveBeenCalled();
  });

  it("refuses misconfigured preview delivery before calling providers", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("EMAIL_DELIVERY_MODE", "send");
    const deps = dependencies([fixture()]);
    expect(await dispatchPendingOutbox(deps)).toMatchObject({ terminal: 1 });
    expect(deps.sendVerificationEmail).not.toHaveBeenCalled();
    expect(deps.store.markTerminal).toHaveBeenCalledWith(
      "event-id",
      expect.any(Date),
      "preview_delivery_unconfigured"
    );
  });

  it("sends preview verification and approval mail but never syncs Contacts", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("EMAIL_DELIVERY_MODE", "send_transactional");
    const deps = dependencies([
      fixture(),
      fixture({
        id: "consent",
        eventType: NEWSLETTER_CONSENT_EVENT,
        payload: {
          email: "person@example.com",
          subscribed: false,
          consentEventId: "34cdd9d3-a720-4a62-b2b1-e5996a1c3b82",
        },
      }),
      fixture({
        id: "approval",
        eventType: "access.approved",
        payload: {
          to: "person@example.com",
          loginUrl: "https://preview.example.com/login",
        },
      }),
    ]);
    const sendApprovalEmail = vi
      .fn()
      .mockResolvedValue({ providerMessageId: "approval-id" });
    const now = new Date("2026-09-04T18:00:00.000Z");
    expect(
      await dispatchPendingOutbox({
        ...deps,
        now,
        emailProvider: { ...deps.emailProvider, sendApprovalEmail },
      })
    ).toMatchObject({ delivered: 3, failed: 0 });
    expect(deps.sendVerificationEmail).toHaveBeenCalledOnce();
    expect(sendApprovalEmail).toHaveBeenCalledOnce();
    expect(deps.updateContact).not.toHaveBeenCalled();
    expect(deps.newsletterSync).not.toHaveBeenCalled();
    expect(deps.store.markProcessed).toHaveBeenCalledWith(
      "event-id",
      now,
      false
    );
    expect(deps.store.markProcessed).toHaveBeenCalledWith(
      "approval",
      now,
      false
    );
    expect(deps.store.markProcessed).toHaveBeenCalledWith("consent", now, true);
  });
  it("captures seeded preview recipients even when real transactional mail is enabled", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("EMAIL_DELIVERY_MODE", "send_transactional");
    const to = "preview-001@preview.livepeer.invalid";
    const deps = dependencies([
      fixture({
        payload: {
          to,
          verificationUrl:
            "https://preview.example.invalid/verify?token=fixture",
          expiresAt: "2026-09-06T00:00:00.000Z",
        },
      }),
      fixture({
        id: "approval",
        eventType: "access.approved",
        payload: { to, loginUrl: "https://preview.example.invalid/login" },
      }),
    ]);
    const sendApprovalEmail = vi.fn();
    expect(
      await dispatchPendingOutbox({
        ...deps,
        emailProvider: { ...deps.emailProvider, sendApprovalEmail },
      })
    ).toMatchObject({ delivered: 2, failed: 0 });
    expect(deps.sendVerificationEmail).not.toHaveBeenCalled();
    expect(sendApprovalEmail).not.toHaveBeenCalled();
    expect(deps.store.markProcessed).toHaveBeenCalledWith(
      "approval",
      expect.any(Date),
      true
    );
  });

  it("delivers verification events and marks them processed", async () => {
    const deps = dependencies([fixture()]);
    const now = new Date("2026-07-27T18:00:00.000Z");

    await expect(dispatchPendingOutbox({ ...deps, now })).resolves.toEqual({
      selected: 1,
      delivered: 1,
      failed: 0,
      invalid: 0,
      terminal: 0,
    });
    expect(deps.sendVerificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "verification:signup-id" })
    );
    expect(deps.store.markProcessed).toHaveBeenCalledWith(
      "event-id",
      now,
      false
    );
  });

  it("projects consent through the audience provider", async () => {
    const deps = dependencies([
      fixture({
        eventType: NEWSLETTER_CONSENT_EVENT,
        payload: {
          email: "person@example.com",
          subscribed: false,
          consentEventId: "34cdd9d3-a720-4a62-b2b1-e5996a1c3b82",
        },
        idempotencyKey:
          "newsletter-consent:34cdd9d3-a720-4a62-b2b1-e5996a1c3b82",
      }),
    ]);

    await dispatchPendingOutbox(deps);

    expect(deps.updateContact).toHaveBeenCalledWith({
      email: "person@example.com",
      subscribed: false,
      idempotencyKey: "latest-consent",
    });
  });

  it("terminalizes malformed, non-web URL, and unsupported events", async () => {
    const deps = dependencies([
      fixture({
        id: "ftp",
        payload: {
          to: "person@example.com",
          verificationUrl: "ftp://example.com/token",
          expiresAt: "2026-07-27T18:00:00.000Z",
        },
      }),
      fixture({ id: "unknown", eventType: "unknown.event" }),
    ]);

    await expect(dispatchPendingOutbox(deps)).resolves.toMatchObject({
      selected: 2,
      invalid: 2,
    });
    expect(deps.store.markTerminal).toHaveBeenCalledTimes(2);
    expect(deps.store.markTerminal).toHaveBeenCalledWith(
      "ftp",
      expect.any(Date),
      "invalid_payload"
    );
    expect(deps.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("backs off retryable failures without retaining error text", async () => {
    const deps = dependencies([fixture({ attemptCount: 3 })]);
    const now = new Date("2026-07-27T18:00:00.000Z");
    deps.sendVerificationEmail.mockRejectedValue(
      new EmailProviderError("secret provider response", true, "http_429")
    );

    await expect(
      dispatchPendingOutbox({ ...deps, now })
    ).resolves.toMatchObject({ failed: 1 });
    expect(deps.store.markRetry).toHaveBeenCalledWith(
      "event-id",
      new Date(now.getTime() + 120_000),
      "http_429"
    );
  });

  it("terminalizes permanent and exhausted failures", async () => {
    const permanent = dependencies([fixture()]);
    permanent.sendVerificationEmail.mockRejectedValue(
      new EmailProviderError("invalid recipient", false, "http_422")
    );
    await expect(dispatchPendingOutbox(permanent)).resolves.toMatchObject({
      terminal: 1,
    });
    expect(permanent.store.markTerminal).toHaveBeenCalledWith(
      "event-id",
      expect.any(Date),
      "http_422"
    );

    const exhausted = dependencies([
      fixture({ attemptCount: MAX_OUTBOX_ATTEMPTS }),
    ]);
    exhausted.sendVerificationEmail.mockRejectedValue(new Error("network"));
    await dispatchPendingOutbox(exhausted);
    expect(exhausted.store.markTerminal).toHaveBeenCalledWith(
      "event-id",
      expect.any(Date),
      "attempts_exhausted"
    );
  });

  it("handles audience provider failures with the same policy", async () => {
    const deps = dependencies([
      fixture({
        eventType: NEWSLETTER_CONSENT_EVENT,
        payload: {
          email: "person@example.com",
          subscribed: true,
          consentEventId: "34cdd9d3-a720-4a62-b2b1-e5996a1c3b82",
        },
      }),
    ]);
    deps.updateContact.mockRejectedValue(
      new AudienceProviderError("bad contact", false, "http_400")
    );

    await expect(dispatchPendingOutbox(deps)).resolves.toMatchObject({
      terminal: 1,
    });
  });

  it("does not redispatch work the store cannot claim", async () => {
    const deps = dependencies([]);
    await expect(dispatchOutboxEvent("processed-event", deps)).resolves.toBe(
      "not_pending"
    );
    expect(deps.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("clamps hostile batch limits before claiming storage", async () => {
    const deps = dependencies([]);
    await dispatchPendingOutbox({
      ...deps,
      limit: Number.POSITIVE_INFINITY,
    });
    expect(deps.store.claimDue).toHaveBeenCalledWith(100, expect.any(Date));

    await dispatchPendingOutbox({ ...deps, limit: -50 });
    expect(deps.store.claimDue).toHaveBeenLastCalledWith(1, expect.any(Date));
  });

  it("logs only nonsensitive delivery metadata", async () => {
    const event = fixture();
    const deps = dependencies([event]);
    deps.sendVerificationEmail.mockRejectedValue(
      new Error("person@example.com token=secret")
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await dispatchPendingOutbox(deps);

    expect(consoleError).toHaveBeenCalledWith("email_outbox_delivery_failed", {
      eventId: event.id,
      eventType: event.eventType,
      retryable: true,
      attemptCount: 1,
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "person@example.com"
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "token=secret"
    );
  });
});
