import { afterEach, describe, expect, it } from "vitest";

import { isAuthorizedOutboxRequest } from "@/lib/email/internal-auth";
import { resetEnvCacheForTests } from "@/lib/env";

describe("isAuthorizedOutboxRequest", () => {
  const originalSecret = process.env.INTERNAL_OUTBOX_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.INTERNAL_OUTBOX_SECRET;
    else process.env.INTERNAL_OUTBOX_SECRET = originalSecret;
    resetEnvCacheForTests();
  });

  it("requires a matching bearer secret", () => {
    const secret = "long-random-secret-that-is-at-least-32-bytes";
    process.env.INTERNAL_OUTBOX_SECRET = secret;
    resetEnvCacheForTests();
    expect(
      isAuthorizedOutboxRequest(
        new Request("https://example.com", {
          headers: { authorization: `Bearer ${secret}` },
        })
      )
    ).toBe(true);
    expect(
      isAuthorizedOutboxRequest(
        new Request("https://example.com", {
          headers: { authorization: "Bearer wrong" },
        })
      )
    ).toBe(false);
  });
});
