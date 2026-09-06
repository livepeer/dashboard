import { describe, it, expect } from "vitest";
import {
  assertPreviewSeedTarget,
  previewContactPlan,
} from "@/scripts/early-access/seed-preview";
describe("preview fixture safety", () => {
  it("requires an explicit approved preview URL and branch, never DATABASE_URL", () => {
    expect(() =>
      assertPreviewSeedTarget({
        DATABASE_URL: "postgres://user:fake@production/db",
      })
    ).toThrow();
    expect(() =>
      assertPreviewSeedTarget({
        PREVIEW_SEED_DATABASE_URL: "postgres://user:fake@production/db",
        PREVIEW_SEED_BRANCH_ID: "br-holy-sound-auugm104",
      })
    ).toThrow();
    expect(() =>
      assertPreviewSeedTarget({
        PREVIEW_SEED_DATABASE_URL:
          "postgres://user:fake@ep-dry-smoke-au7l7dzw-pooler.c-10.us-east-1.aws.neon.tech/db",
        PREVIEW_SEED_BRANCH_ID: "production",
      })
    ).toThrow();
  });
  it("plans 150 distinct reserved contacts with representative access states", () => {
    const plan = previewContactPlan();
    expect(plan).toHaveLength(150);
    expect(new Set(plan.map((r) => r.email)).size).toBe(150);
    expect(
      plan.every((r) => r.email.endsWith("@preview.livepeer.invalid"))
    ).toBe(true);
    expect(plan.filter((r) => r.access === "waiting")).toHaveLength(90);
    expect(plan.filter((r) => r.access === "approved")).toHaveLength(30);
    expect(plan.filter((r) => r.access === "revoked")).toHaveLength(15);
    expect(plan.filter((r) => !r.verified)).toHaveLength(15);
    expect(plan.filter((r) => r.subscribed)).toHaveLength(50);
    expect(plan.filter((r) => r.referral)).toHaveLength(30);
  });
});
