import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ identity: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/authentication/session", () => ({
  getAuthenticatedIdentity: mocks.identity,
}));
vi.mock("@/components/console/LoginPage", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
import LoginRoute from "@/app/(auth)/login/page";
import SignupRoute from "@/app/(auth)/signup/page";
import RootPage from "@/app/(app)/page";

beforeEach(() => mocks.identity.mockResolvedValue({ subject: "synthetic" }));
it("signed-in login and signup delegate landing to canonical admission", async () => {
  for (const page of [LoginRoute, SignupRoute])
    await expect(page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "redirect:/api/identity/sync?returnTo=%2Fhome"
    );
});
it("preserves MCP and explicit device return paths through synchronization", async () => {
  await expect(
    LoginRoute({ searchParams: Promise.resolve({ mcp_oauth: "1" }) })
  ).rejects.toThrow(
    "redirect:/api/identity/sync?returnTo=%2Fapi%2Fmcp%2Foauth%2Fcallback"
  );
  await expect(
    LoginRoute({
      searchParams: Promise.resolve({ returnTo: "/device?code=fixture" }),
    })
  ).rejects.toThrow(
    "redirect:/api/identity/sync?returnTo=%2Fdevice%3Fcode%3Dfixture"
  );
});
it("root delegates landing and preserves legacy referral links", async () => {
  await expect(RootPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
    "redirect:/api/identity/sync?returnTo=%2Fhome"
  );
  await expect(
    RootPage({ searchParams: Promise.resolve({ ref: "abc_123" }) })
  ).rejects.toThrow("redirect:/waitlist?ref=abc_123");
});
