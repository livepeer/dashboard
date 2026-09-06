import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  owner: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  admin: vi.fn(),
  adminList: vi.fn(),
  adminDetail: vi.fn(),
}));
vi.mock("@/lib/console/session-user", () => ({
  requireConsoleSession: mocks.session,
}));
vi.mock("@/lib/admin/auth", () => ({ getAdminPrincipal: mocks.admin }));
vi.mock("@/lib/runs/store", () => ({
  resolveRunOwner: mocks.owner,
  listOwnRuns: mocks.list,
  getOwnRun: mocks.detail,
  listAdminRuns: mocks.adminList,
  getAdminRun: mocks.adminDetail,
}));
import { GET as list } from "@/app/api/console/runs/route";
import { GET as detail } from "@/app/api/console/runs/[id]/route";
import { GET as adminList } from "@/app/api/admin/runs/route";
import { GET as adminDetail } from "@/app/api/admin/runs/[id]/route";
const owner = {
  userId: "canonical",
  principalId: "external",
  externalAccountId: "binding",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({
    canonicalUserId: owner.userId,
    externalUserId: owner.principalId,
  });
  mocks.owner.mockResolvedValue(owner);
  mocks.list.mockResolvedValue({ items: [], nextCursor: null });
});
it("derives ownership from session and ignores submitted identity", async () => {
  const response = await list(
    new Request(
      "https://console.invalid/api/console/runs?userId=other&limit=2&status=unknown"
    )
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.owner).toHaveBeenCalledWith("external");
  expect(mocks.list).toHaveBeenCalledWith(owner, {
    limit: 2,
    status: "unknown",
    cursor: undefined,
    search: undefined,
  });
});
it("fails closed for mismatched canonical identity and invalid filters", async () => {
  mocks.owner.mockResolvedValue({ ...owner, userId: "other" });
  expect(
    (await list(new Request("https://console.invalid/api/console/runs"))).status
  ).toBe(403);
  expect(mocks.list).not.toHaveBeenCalled();
  mocks.owner.mockResolvedValue(owner);
  expect(
    (
      await list(
        new Request("https://console.invalid/api/console/runs?status=success")
      )
    ).status
  ).toBe(400);
  expect(mocks.list).not.toHaveBeenCalled();
});
it("does not expose foreign or missing runs and masks driver failures", async () => {
  mocks.detail.mockResolvedValue(null);
  expect(
    (
      await detail(new Request("https://console.invalid"), {
        params: Promise.resolve({ id: "foreign" }),
      })
    ).status
  ).toBe(404);
  mocks.list.mockRejectedValue(Error("private query payload"));
  const response = await list(new Request("https://console.invalid"));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private");
});
it("requires admin authority and routes list/detail through audited stores", async () => {
  mocks.admin.mockResolvedValue(null);
  expect((await adminList(new Request("https://console.invalid"))).status).toBe(
    403
  );
  expect(mocks.adminList).not.toHaveBeenCalled();
  const actor = { userId: "admin", adminGrantId: "grant", signupId: "signup" };
  mocks.admin.mockResolvedValue(actor);
  mocks.adminList.mockResolvedValue({ items: [], nextCursor: null });
  expect(
    (
      await adminList(
        new Request("https://console.invalid?search=person%40example.com")
      )
    ).status
  ).toBe(200);
  expect(mocks.adminList).toHaveBeenCalledWith(
    actor,
    expect.objectContaining({ search: "person@example.com" })
  );
  mocks.adminDetail.mockResolvedValue(null);
  expect(
    (
      await adminDetail(new Request("https://console.invalid"), {
        params: Promise.resolve({ id: "missing" }),
      })
    ).status
  ).toBe(404);
  expect(mocks.adminDetail).toHaveBeenCalledWith(actor, "missing");
});
