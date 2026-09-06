import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  identity: vi.fn(),
  referral: vi.fn(),
}));
vi.mock("@/lib/waitlist/identity-referral", () => ({
  getIdentityReferralUrl: mocks.referral,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
}));
vi.mock("@/lib/console/session-user", () => ({
  requireConsoleSession: mocks.session,
}));
vi.mock("@/lib/authentication/session", () => ({
  getAuthenticatedIdentity: mocks.identity,
}));

import { requireConsolePage } from "@/lib/access/page";
import AccessPendingPage from "@/app/access-pending/page";
import { WaitingContent, waitingCopy } from "@/app/access-pending/content";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("CONSOLE_DEV_MOCK", "0");
  mocks.session.mockReset();
  mocks.identity.mockReset();
  mocks.referral.mockReset();
});

describe("server page admission", () => {
  it("uses the shared backend approval gate", async () => {
    mocks.session.mockResolvedValue({ externalUserId: "persisted" });
    await expect(requireConsolePage("/keys")).resolves.toEqual({
      externalUserId: "persisted",
    });
    expect(mocks.session).toHaveBeenCalledOnce();
  });
  it("redirects unauthenticated requests to sign-in with a safe return path", async () => {
    mocks.session.mockRejectedValue({ status: 401 });
    await expect(requireConsolePage("/keys")).rejects.toThrow(
      "redirect:/login?returnTo=%2Fkeys"
    );
  });
  it.each([403, 503])(
    "uses waiting UI without bypass for status %i",
    async (status) => {
      mocks.session.mockRejectedValue({ status });
      await expect(requireConsolePage("/device?iss=example")).rejects.toThrow(
        "redirect:/access-pending?returnTo=%2Fdevice%3Fiss%3Dexample"
      );
    }
  );
  it("never enables local dev bypass in a production build", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CONSOLE_DEV_MOCK", "1");
    mocks.session.mockRejectedValue({ status: 403 });
    await expect(requireConsolePage()).rejects.toThrow(
      "redirect:/access-pending"
    );
  });
});

describe("waiting states", () => {
  it("approved users continue, untrusted absolute return URLs do not", async () => {
    mocks.session.mockResolvedValue({ externalUserId: "persisted" });
    await expect(
      AccessPendingPage({
        searchParams: Promise.resolve({ returnTo: "https://evil.example" }),
      })
    ).rejects.toThrow("redirect:/home");
  });
  it("does not loop when the requested return path is the waiting page", async () => {
    mocks.session.mockResolvedValue({});
    await expect(
      AccessPendingPage({
        searchParams: Promise.resolve({
          returnTo: "/access-pending?state=approved",
        }),
      })
    ).rejects.toThrow("redirect:/home");
  });
  it.each([
    ["access_pending", true, "pending"],
    ["access_pending", false, "verify-email"],
    ["access_revoked", true, "revoked"],
    ["access_disabled", true, "disabled"],
    ["access_unavailable", true, "unavailable"],
    ["enrollment_attention_required", true, "enrollment-attention"],
  ] as const)(
    "renders authoritative %s state with verified email %s",
    async (code, verified, expectedState) => {
      mocks.session.mockRejectedValue({
        status: code === "access_unavailable" ? 503 : 403,
        code,
      });
      mocks.identity.mockResolvedValue({
        email: "test@example.invalid",
        emailVerified: verified,
      });
      const result = await AccessPendingPage({
        searchParams: Promise.resolve({}),
      });
      expect(result.props.state).toBe(expectedState);
      const html = renderToStaticMarkup(result);
      expect(html).toContain(waitingCopy[expectedState].title);
      expect(html).toContain('href="/auth/logout"');
      expect(html).toContain("test@example.invalid");
    }
  );
  it("keeps the outage status and only the sign-out action", () => {
    const html = renderToStaticMarkup(
      createElement(WaitingContent, {
        state: "unavailable",
      })
    );
    expect(html).toContain(waitingCopy.unavailable.title);
    expect(html).toContain("Sign out");
    expect(html).not.toContain("Check access again");
  });
  it("places the real referral card below centered pending copy", async () => {
    mocks.session.mockRejectedValue({ status: 403, code: "access_pending" });
    mocks.identity.mockResolvedValue({
      email: "test@example.invalid",
      emailVerified: true,
      avatarUrl: "https://images.example.com/avatar.png",
    });
    mocks.referral.mockResolvedValue(
      "https://preview.example.com/waitlist?ref=actual-code"
    );
    const result = await AccessPendingPage({
      searchParams: Promise.resolve({}),
    });
    expect(result.props.referralUrl).toBe(
      "https://preview.example.com/waitlist?ref=actual-code"
    );
    expect(result.props.email).toBe("test@example.invalid");
    expect(result.props.avatarUrl).toBe(
      "https://images.example.com/avatar.png"
    );
    const html = renderToStaticMarkup(result);
    expect(html.indexOf("You’re on the waitlist.")).toBeLessThan(
      html.indexOf("Refer a friend")
    );
    expect(html).toContain("text-center");
    expect(html).toContain("Copy referral link");
    expect(html).toContain("aspect-video");
    expect(html).toContain("max-w-[280px]");
    expect(html).not.toContain("We’re welcoming people");
    expect(html).not.toContain("Manage waitlist");
    expect(html).not.toContain("Check access again");
  });
  it("keeps pending admission intact if the optional referral lookup fails", async () => {
    mocks.session.mockRejectedValue({ status: 403, code: "access_pending" });
    mocks.identity.mockResolvedValue({
      email: "test@example.invalid",
      emailVerified: true,
    });
    mocks.referral.mockRejectedValue(new Error("offline"));
    const result = await AccessPendingPage({
      searchParams: Promise.resolve({}),
    });
    expect(result.props.state).toBe("pending");
    expect(result.props.referralUrl).toBeNull();
  });
  it.each([
    "verify-email",
    "revoked",
    "disabled",
    "enrollment-attention",
    "unavailable",
  ] as const)("does not offer referrals for %s", (state) => {
    const html = renderToStaticMarkup(
      createElement(WaitingContent, {
        state,
        referralUrl: "https://preview.example.com/waitlist?ref=code",
      })
    );
    expect(html).not.toContain("Copy referral link");
  });
});
