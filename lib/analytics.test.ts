import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  __loaded: true,
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("posthog-js/dist/module.slim", () => ({ default: posthog }));

import {
  captureEvent,
  identifyMember,
  resetAnalyticsIdentity,
} from "@/lib/analytics";

describe("analytics helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    posthog.__loaded = true;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("captures, identifies, and resets through PostHog when initialized", () => {
    captureEvent("waitlist_signup_submitted", { utm_source: "qa" });
    identifyMember("opaque-member-id", { referral_code: "server-code" });
    resetAnalyticsIdentity();

    expect(posthog.capture).toHaveBeenCalledWith("waitlist_signup_submitted", {
      utm_source: "qa",
    });
    expect(posthog.identify).toHaveBeenCalledWith("opaque-member-id", {
      referral_code: "server-code",
    });
    expect(posthog.reset).toHaveBeenCalledOnce();
  });

  it("does nothing during server rendering", () => {
    Reflect.deleteProperty(globalThis, "window");

    captureEvent("waitlist_signup_submitted");
    identifyMember("builder@example.com");
    resetAnalyticsIdentity();

    expect(posthog.capture).not.toHaveBeenCalled();
    expect(posthog.identify).not.toHaveBeenCalled();
    expect(posthog.reset).not.toHaveBeenCalled();
  });
});
