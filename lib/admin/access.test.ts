import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  bulkAccessSchema,
  canonicalBulkPayload,
  parseAccessFilters,
} from "./access";
import { requireSameOrigin } from "./http";
describe("bulk selection contracts", () => {
  it("hashes frozen explicit IDs independent of order and duplicates", () => {
    expect(
      canonicalBulkPayload({
        requestId: "request-1",
        action: "approve",
        signupIds: ["b", "a", "a"],
      })
    ).toEqual(
      canonicalBulkPayload({
        requestId: "request-2",
        action: "approve",
        signupIds: ["a", "b"],
      })
    );
    expect(
      canonicalBulkPayload({
        requestId: "request-1",
        action: "revoke",
        signupIds: ["a", "b"],
      }).hash
    ).not.toBe(
      canonicalBulkPayload({
        requestId: "request-1",
        action: "approve",
        signupIds: ["a", "b"],
      }).hash
    );
  });
  it("bounds chunks and disallows body-supplied admin authority", () => {
    const request = {
      requestId: "request-1",
      action: "approve",
      signupIds: ["deaae2e8-b1f9-44c8-82db-63d251dfe348"],
    };
    expect(bulkAccessSchema.safeParse(request).success).toBe(true);
    expect(
      bulkAccessSchema.safeParse({ ...request, actor: "admin" }).success
    ).toBe(false);
    expect(
      bulkAccessSchema.safeParse({
        ...request,
        signupIds: Array(101).fill(request.signupIds[0]),
      }).success
    ).toBe(false);
    expect(() =>
      parseAccessFilters(new URLSearchParams("pageSize=101"))
    ).toThrow();
  });
  it("requires exact same-origin, rejecting absent, null and forwarded origin", () => {
    for (const origin of [undefined, "null", "https://evil.invalid"]) {
      expect(() =>
        requireSameOrigin(
          new Request("https://preview.invalid/api/admin/access", {
            headers: {
              ...(origin ? { origin } : {}),
              "x-forwarded-host": "evil.invalid",
            },
          })
        )
      ).toThrow();
    }
    expect(() =>
      requireSameOrigin(
        new Request("https://preview.invalid/api/admin/access", {
          headers: { origin: "https://preview.invalid" },
        })
      )
    ).not.toThrow();
  });
});
