import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  capture: vi.fn(),
  constructor: vi.fn(),
  shutdown: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(apiKey: string, options: unknown) {
      posthog.constructor(apiKey, options);
    }

    capture = posthog.capture;
    shutdown = posthog.shutdown;
  },
}));

import { captureEmailVerified } from "@/lib/analytics-server";

describe("server analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  });

  it("does nothing when the PostHog project key is absent", async () => {
    await captureEmailVerified({
      analyticsId: "opaque-member-id",
      verificationId: "00000000-0000-4000-8000-000000000001",
    });

    expect(posthog.constructor).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("captures an idempotent authoritative verification event", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    const verificationId = "00000000-0000-4000-8000-000000000001";

    await captureEmailVerified({
      analyticsId: "opaque-member-id",
      verificationId,
    });

    expect(posthog.capture).toHaveBeenCalledOnce();
    expect(posthog.capture).toHaveBeenCalledWith({
      distinctId: "opaque-member-id",
      event: "waitlist_email_verified",
      uuid: verificationId,
      disableGeoip: true,
    });
    expect(posthog.shutdown).toHaveBeenCalledOnce();
  });
});
