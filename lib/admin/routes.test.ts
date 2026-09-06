import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/auth", () => ({ getAdminPrincipal: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/admin/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/access")>()),
  mutateAccessSelection: vi.fn(),
  listAccessEntries: vi.fn(),
  freezeAccessSelection: vi.fn(),
}));
import { getAdminPrincipal } from "./auth";
import { mutateAccessSelection, listAccessEntries } from "./access";
import { GET, POST } from "@/app/api/admin/access/route";
import { GET as capturedEmails } from "@/app/api/admin/emails/route";
const body = {
  requestId: "test-request",
  action: "approve",
  signupIds: ["deaae2e8-b1f9-44c8-82db-63d251dfe348"],
};
const request = (origin = "https://preview.example.invalid", payload = body) =>
  new Request("https://preview.example.invalid/api/admin/access", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
describe("admin mutation boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });
  it("denies unauthorized list, mutation and captured email requests", async () => {
    vi.mocked(getAdminPrincipal).mockResolvedValue(null);
    expect(
      (
        await GET(
          new Request("https://preview.example.invalid/api/admin/access")
        )
      ).status
    ).toBe(403);
    expect((await POST(request())).status).toBe(403);
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("EMAIL_DELIVERY_MODE", "capture");
    expect((await capturedEmails()).status).toBe(403);
    expect(mutateAccessSelection).not.toHaveBeenCalled();
  });
  it("rejects cross-site requests before invoking authority or mutation", async () => {
    expect((await POST(request("https://evil.invalid"))).status).toBe(403);
    expect(getAdminPrincipal).not.toHaveBeenCalled();
    expect(mutateAccessSelection).not.toHaveBeenCalled();
  });
  it("uses server-derived actor and returns explicit per-record outcomes", async () => {
    const actor = { adminGrantId: "admin-grant", signupId: "admin-signup" };
    vi.mocked(getAdminPrincipal).mockResolvedValue(actor);
    vi.mocked(mutateAccessSelection).mockResolvedValue({
      requestId: body.requestId,
      outcomes: [{ signupId: body.signupIds[0], outcome: "approved" }],
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mutateAccessSelection).toHaveBeenCalledWith(actor, body);
  });
  it("returns503 on permission-storage failures, not an allowlist fallback", async () => {
    vi.mocked(getAdminPrincipal).mockRejectedValue(
      new Error("storage unavailable")
    );
    expect(
      (
        await GET(
          new Request("https://preview.example.invalid/api/admin/access")
        )
      ).status
    ).toBe(503);
    expect(listAccessEntries).not.toHaveBeenCalled();
  });
  it("does not expose captured login links outside protected preview", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await capturedEmails()).status).toBe(404);
    expect(getAdminPrincipal).not.toHaveBeenCalled();
  });
});
