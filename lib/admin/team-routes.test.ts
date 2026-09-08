import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/auth", () => ({ getAdminPrincipal: vi.fn() }));
vi.mock("@/lib/admin/team", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/team")>()),
  listAdminTeam: vi.fn(),
  addAdmin: vi.fn(),
  revokeAdmin: vi.fn(),
}));

import { getAdminPrincipal } from "@/lib/admin/auth";
import { addAdmin, listAdminTeam, revokeAdmin } from "@/lib/admin/team";
import { DELETE, GET, POST } from "@/app/api/admin/team/route";

const actor = {
  adminGrantId: "00000000-0000-4000-8000-000000000001",
  signupId: "00000000-0000-4000-8000-000000000002",
  userId: "00000000-0000-4000-8000-000000000003",
};
const origin = "https://console.example.invalid";

function mutation(method: "POST" | "DELETE", body: unknown, from = origin) {
  return new Request(`${origin}/api/admin/team`, {
    method,
    headers: { origin: from, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin team route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getAdminPrincipal).mockResolvedValue(actor);
  });

  it("requires an administrator for the team list", async () => {
    vi.mocked(getAdminPrincipal).mockResolvedValue(null);
    expect((await GET()).status).toBe(403);
    expect(listAdminTeam).not.toHaveBeenCalled();
  });

  it("validates email and derives the adding actor from the session", async () => {
    expect(
      (await POST(mutation("POST", { email: "not-an-email" }))).status
    ).toBe(400);
    expect(addAdmin).not.toHaveBeenCalled();

    vi.mocked(addAdmin).mockResolvedValue({
      member: {
        grantId: "00000000-0000-4000-8000-000000000004",
        signupId: "00000000-0000-4000-8000-000000000005",
        email: "new@example.com",
        grantedAt: "2026-09-08T00:00:00.000Z",
        isCurrentUser: false,
      },
      outcome: "added",
    });
    const response = await POST(
      mutation("POST", { email: " new@example.com " })
    );
    expect(response.status).toBe(200);
    expect(addAdmin).toHaveBeenCalledWith(actor, { email: "new@example.com" });
  });

  it("rejects cross-site revocation and prevents body-supplied authority", async () => {
    const grantId = "00000000-0000-4000-8000-000000000004";
    expect(
      (await DELETE(mutation("DELETE", { grantId }, "https://evil.invalid")))
        .status
    ).toBe(403);
    expect(getAdminPrincipal).not.toHaveBeenCalled();

    expect(
      (await DELETE(mutation("DELETE", { grantId, actor: "body-admin" })))
        .status
    ).toBe(400);
    expect(revokeAdmin).not.toHaveBeenCalled();
  });
});
