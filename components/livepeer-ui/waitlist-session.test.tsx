// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({
  captureEvent: vi.fn(),
  identifyMember: vi.fn(),
  resetAnalyticsIdentity: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  ...analytics,
}));

import {
  useWaitlistSession,
  WaitlistSessionProvider,
} from "@/components/livepeer-ui/waitlist-session";
import type { WaitlistSessionResponse } from "@/lib/waitlist/contracts";

const memberSession: WaitlistSessionResponse = {
  member: {
    accountRole: "member",
    analyticsId: "opaque-member-id",
    displayName: "bu•••••@example.com",
    email: "builder@example.com",
    newsletterOptIn: false,
    points: 0,
    position: 1,
    referralCode: "server-code",
    referralUrl: "https://example.com/waitlist?ref=server-code",
    referrals: { pending: 0, verified: 0 },
  },
};

function Probe() {
  const { join, signOut, signOutError, state } = useWaitlistSession();
  return (
    <div>
      <output data-testid="state">{state.status}</output>
      {signOutError && (
        <output data-testid="sign-out-error">{signOutError}</output>
      )}
      <button
        onClick={() =>
          void join("builder@example.com", { newsletterOptIn: true })
        }
      >
        Join
      </button>
      <button
        onClick={() => void join("builder@example.com", { authOnly: true })}
      >
        Sign in
      </button>
      <button onClick={() => void signOut()}>Sign out</button>
    </div>
  );
}

function renderProvider(initialSession: WaitlistSessionResponse | null) {
  return render(
    <WaitlistSessionProvider initialSession={initialSession}>
      <Probe />
    </WaitlistSessionProvider>
  );
}

describe("WaitlistSessionProvider analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("identifies a hydrated member once using only the opaque id", async () => {
    renderProvider(memberSession);

    await waitFor(() => {
      expect(analytics.identifyMember).toHaveBeenCalledOnce();
    });
    expect(analytics.identifyMember).toHaveBeenCalledWith("opaque-member-id", {
      referral_code: "server-code",
      newsletter_opt_in: false,
    });
    expect(JSON.stringify(analytics.identifyMember.mock.calls)).not.toContain(
      "builder@example.com"
    );
  });

  it("captures one signup event but excludes auth-only sign-in requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/session") {
          return Response.json({ message: "Signed out" }, { status: 401 });
        }
        return Response.json({ message: "Sent" });
      })
    );
    renderProvider(null);

    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => {
      expect(analytics.captureEvent).toHaveBeenCalledOnce();
    });
    expect(analytics.captureEvent).toHaveBeenCalledWith(
      "waitlist_signup_submitted",
      expect.objectContaining({ newsletter_opt_in: true })
    );

    analytics.captureEvent.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toBe(
        "verification-pending"
      );
    });
    expect(analytics.captureEvent).not.toHaveBeenCalled();
  });

  it("resets analytics only after a successful sign-out", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ message: "no" }, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    renderProvider(memberSession);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => {
      expect(screen.getByTestId("sign-out-error").textContent).toContain(
        "Couldn’t sign out"
      );
    });
    expect(analytics.resetAnalyticsIdentity).not.toHaveBeenCalled();
    expect(screen.getByTestId("state").textContent).toBe("signed-in");

    fetchMock.mockResolvedValueOnce(Response.json({ message: "ok" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => {
      expect(analytics.resetAnalyticsIdentity).toHaveBeenCalledOnce();
    });
    expect(screen.getByTestId("state").textContent).toBe("signed-out");
  });
});
