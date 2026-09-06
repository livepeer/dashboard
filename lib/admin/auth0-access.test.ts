import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/admin/permissions", () => ({
  getAdminPrincipalForUser: vi.fn(),
}));
vi.mock("@/lib/authentication/session", () => ({
  getAuthenticatedIdentity: vi.fn(),
}));
vi.mock("@/lib/identity/provider-user", () => ({
  resolveProviderIdentity: vi.fn(),
}));
vi.mock("@/lib/access/enrollment", () => ({
  enrollAuthenticatedUser: vi.fn(),
}));
import { getDb } from "@/lib/db";
import { getAccessDecision } from "@/lib/access/service";
import { getAdminPrincipalForUser } from "./permissions";
import { getAdminPrincipal } from "./auth";
import { getAuthenticatedIdentity } from "@/lib/authentication/session";
const limit = vi.fn();
describe("one shared administrator/access authority", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getDb).mockReturnValue({
      select: () => ({
        from: () => ({ leftJoin: () => ({ where: () => ({ limit }) }) }),
      }),
    } as unknown as ReturnType<typeof getDb>);
    limit.mockResolvedValue([
      {
        status: "active",
        grantId: null,
        grantStatus: null,
        revokedGrantId: null,
      },
    ]);
    vi.mocked(getAdminPrincipalForUser).mockResolvedValue({
      adminGrantId: "admin",
      signupId: "signup",
      userId: "user",
    });
  });
  it("admits canonical administrators through the shared decision without a product grant", async () => {
    expect(await getAccessDecision("user")).toEqual({
      state: "approved",
      userId: "user",
    });
  });
  it.each(["disabled", "revoked"] as const)(
    "denies %s even for an administrator",
    async (state) => {
      limit.mockResolvedValue([
        {
          status: state === "disabled" ? "disabled" : "active",
          grantStatus: state === "revoked" ? "revoked" : null,
          grantId: null,
          revokedGrantId: null,
        },
      ]);
      expect(await getAccessDecision("user")).toMatchObject({ state });
      expect(getAdminPrincipalForUser).not.toHaveBeenCalled();
    }
  );
  it("honors an explicit linked-signup revocation before admin or ordinary approval", async () => {
    limit.mockResolvedValue([
      {
        status: "active",
        grantStatus: "approved",
        grantId: "old",
        revokedGrantId: "revocation",
      },
    ]);
    expect(await getAccessDecision("user")).toEqual({
      state: "revoked",
      userId: "user",
      grantId: "revocation",
    });
  });
  it("ignores legacy cookies when no Auth0 identity exists", async () => {
    vi.mocked(getAuthenticatedIdentity).mockResolvedValue(null);
    expect(await getAdminPrincipal()).toBeNull();
    expect(getAdminPrincipalForUser).not.toHaveBeenCalled();
  });
});
