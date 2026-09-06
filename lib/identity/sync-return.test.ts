import { describe, expect, it } from "vitest";

import { identitySyncPath, safeIdentityReturnTo } from "./sync-return";

describe("identity sync return routing", () => {
  it("wraps internal paths", () => {
    expect(identitySyncPath("/home?tab=usage")).toBe(
      "/api/identity/sync?returnTo=%2Fhome%3Ftab%3Dusage"
    );
  });

  it("rejects protocol-relative and external redirects", () => {
    expect(safeIdentityReturnTo("//evil.example")).toBe("/");
    expect(safeIdentityReturnTo("/\\evil.example/path")).toBe("/");
    expect(safeIdentityReturnTo("https://evil.example")).toBe("/");
    expect(identitySyncPath("https://evil.example")).toBe(
      "/api/identity/sync?returnTo=%2F"
    );
  });
});
