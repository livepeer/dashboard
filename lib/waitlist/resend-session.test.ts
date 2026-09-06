import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  cookie: vi.fn(),
  signup: vi.fn(),
  member: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookie }),
}));
vi.mock("@/lib/waitlist/queries", () => ({
  getSignupForSession: mocks.signup,
  getMember: mocks.member,
}));
vi.mock("@/lib/authentication/session", () => ({
  getAuthenticatedIdentity: () => {
    throw new Error("Waitlist must not call Auth0");
  },
}));
import { getCurrentWaitlistSession } from "./current-session";
import { SESSION_COOKIE } from "./security";
import { GET as join } from "@/app/api/waitlist/join/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookie.mockReturnValue({ value: "synthetic-session" });
});
describe("Resend waitlist sessions independent of Auth0", () => {
  it("reads a verified email-link session without provider authentication", async () => {
    const signup = { id: "signup" };
    mocks.signup.mockResolvedValue({ signup });
    mocks.member.mockResolvedValue({ email: "fixture@example.invalid" });
    expect(await getCurrentWaitlistSession()).toEqual({
      member: { email: "fixture@example.invalid" },
    });
    expect(mocks.cookie).toHaveBeenCalledWith(SESSION_COOKIE);
    expect(mocks.signup).toHaveBeenCalledWith("synthetic-session");
  });
  it("rejects absent or expired waitlist sessions", async () => {
    mocks.signup.mockResolvedValue(null);
    expect(await getCurrentWaitlistSession()).toBeNull();
    expect(mocks.member).not.toHaveBeenCalled();
  });
  it("returns old join bookmarks to the email form, not Auth0", () => {
    const response = join(
      new Request(
        "https://preview.invalid/api/waitlist/join?ref=friend&utm_source=test&email=private&returnTo=https://evil.invalid"
      )
    );
    expect(response.headers.get("location")).toBe(
      "https://preview.invalid/waitlist?ref=friend&utm_source=test"
    );
  });
});
