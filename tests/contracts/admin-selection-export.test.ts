import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), rows: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ getAdminPrincipal: mocks.admin }));
vi.mock("@/lib/admin/access", () => ({ exportAccessSelection: mocks.rows }));
vi.mock("server-only", () => ({}));
import { POST } from "@/app/api/admin/access/export/route";
import { selectionCsv } from "@/lib/admin/selection-csv";
const id = "00000000-0000-4000-8000-000000000001";
function request(body: unknown, origin = "https://preview.example.com") {
  return new Request("https://preview.example.com/api/admin/access/export", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ adminGrantId: "fixture" });
  mocks.rows.mockResolvedValue([
    { email: "alex@example.com", joinedAt: "2026-09-04" },
  ]);
});
it("exports explicit IDs only for an authenticated same-origin administrator", async () => {
  const response = await POST(request({ signupIds: [id] }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.rows).toHaveBeenCalledWith([id]);
  expect((await response.json()).rows[0].email).toBe("alex@example.com");
});
it("rejects non-admin and cross-origin export requests", async () => {
  mocks.admin.mockResolvedValue(null);
  expect((await POST(request({ signupIds: [id] }))).status).toBe(403);
  mocks.admin.mockResolvedValue({ adminGrantId: "fixture" });
  expect(
    (await POST(request({ signupIds: [id] }, "https://other.example.com")))
      .status
  ).toBe(403);
  expect(mocks.rows).not.toHaveBeenCalled();
});
it.each([
  { signupIds: [] },
  { signupIds: ["invalid"] },
  { signupIds: Array(501).fill(id) },
  { signupIds: [id], actor: "admin" },
])("rejects invalid or oversized selection %j", async (body) => {
  expect((await POST(request(body))).status).toBe(400);
  expect(mocks.rows).not.toHaveBeenCalled();
});
it("quotes CSV values and neutralizes spreadsheet formulas", () => {
  expect(
    selectionCsv([{ email: '=HYPERLINK("bad")', joinedAt: "2026-09-04" }])
  ).toBe('\uFEFF"Email","Joined"\r\n"\'=HYPERLINK(""bad"")","2026-09-04"\r\n');
});
