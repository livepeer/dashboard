// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnchorHTMLAttributes } from "react";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), summary: vi.fn() }));
vi.mock("@/lib/authentication/session", () => ({
  getAuthenticatedIdentity: vi.fn(async () => null),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
}));
vi.mock("next/link", () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));
vi.mock("@/lib/admin/auth", () => ({ getAdminPrincipal: mocks.admin }));
vi.mock("@/lib/waitlist/admin", () => ({
  getAdminWaitlistSummary: mocks.summary,
}));
vi.mock("@/components/admin/AccessManager", () => ({
  default: () => <section>Access management</section>,
}));
import { AuthProvider, useAuth } from "@/components/console/AuthContext";
import ConsoleSidebar from "@/components/console/ConsoleSidebar";
import AdminPage from "@/app/(app)/admin/page";

function ProfileProbe() {
  const { user } = useAuth();
  return (
    <output data-testid="profile">
      {user ? `${user.id}:${user.isAdmin}` : "loading"}
    </output>
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("Auth0-first Console administration presentation", () => {
  it.each([false, true])(
    "shows sidebar administration only for server isAdmin=%s",
    async (isAdmin) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({
            userId: "canonical-fixture",
            externalUserId: "preserved-external-account",
            name: "Member",
            email: "fixture@example.invalid",
            provider: "email",
            isAdmin,
          })
        )
      );
      render(
        <AuthProvider>
          <ConsoleSidebar />
          <ProfileProbe />
        </AuthProvider>
      );
      await waitFor(() =>
        expect(screen.getByTestId("profile").textContent).toBe(
          `preserved-external-account:${isAdmin}`
        )
      );
      if (isAdmin)
        expect(
          screen.getAllByRole("link", { name: "Admin" }).length
        ).toBeGreaterThan(0);
      else expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
    }
  );
  it("keeps the admin server check even when local design mock is enabled", async () => {
    vi.stubEnv("CONSOLE_DEV_MOCK", "1");
    mocks.admin.mockResolvedValue(null);
    await expect(AdminPage()).rejects.toThrow(
      "redirect:/login?returnTo=%2Fadmin"
    );
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.summary).not.toHaveBeenCalled();
  });
  it("renders administration inside Console page chrome after server authorization", async () => {
    mocks.admin.mockResolvedValue({
      adminGrantId: "admin",
      userId: "user",
      signupId: "signup",
    });
    mocks.summary.mockResolvedValue({
      totalSignups: 25,
      confirmedSignups: 20,
      totalVerifiedReferrals: 4,
      newsletterSubscribers: 3,
    });
    const html = renderToStaticMarkup(await AdminPage());
    expect(html).toContain('id="main-content"');
    expect(html).toContain("Administration sections");
    expect(html).toContain("admin-tab-history");
    expect(html).toContain("Access management");
    expect(html).not.toContain("/api/admin/signups.csv");
    expect(html).not.toContain("Livepeer Agent Early Access");
  });
});
