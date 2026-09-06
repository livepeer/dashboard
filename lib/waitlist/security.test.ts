import { describe, expect, it } from "vitest";

import {
  VERIFICATION_TTL_MS,
  analyticsMemberId,
  hashToken,
  maskEmail,
  normalizeEmail,
  randomReferralCode,
  randomToken,
} from "./security";

describe("waitlist security helpers", () => {
  it("normalizes email without provider-specific rewriting", () => {
    expect(normalizeEmail("  Person+tag@Example.COM ")).toBe(
      "person+tag@example.com"
    );
  });

  it("masks public leaderboard identities", () => {
    expect(maskEmail("peace@example.com")).toBe("pe•••@example.com");
    expect(maskEmail("a@example.com")).toBe("a•••@example.com");
  });

  it("never returns the complete local part for short or unusual addresses", () => {
    expect(maskEmail("ab@example.com")).toBe("ab•••@example.com");
    expect(maskEmail("@example.com")).toBe("•••@example.com");
    expect(maskEmail("not-an-email")).toBe("Anonymous");
    expect(maskEmail("")).toBe("Anonymous");
  });

  it("uses the required fifteen-minute verification window", () => {
    expect(VERIFICATION_TTL_MS).toBe(15 * 60 * 1000);
  });

  it("creates opaque referral codes and tokens", () => {
    const codeA = randomReferralCode();
    const codeB = randomReferralCode();
    expect(codeA).not.toBe(codeB);
    expect(codeA).not.toContain("@");
    expect(randomToken()).not.toBe(randomToken());
  });

  it("hashes tokens deterministically without retaining the token", () => {
    const raw = "single-use-secret";
    expect(hashToken(raw)).toBe(hashToken(raw));
    expect(hashToken(raw)).not.toContain(raw);
  });

  it("derives a stable opaque analytics identity from the internal signup id", () => {
    const signupId = "00000000-0000-4000-8000-000000000001";
    expect(analyticsMemberId(signupId)).toBe(analyticsMemberId(signupId));
    expect(analyticsMemberId(signupId)).not.toContain(signupId);
    expect(analyticsMemberId(signupId)).not.toContain("@");
  });

  it("does not collide for adjacent verification tokens", () => {
    expect(hashToken("verification-token-1")).not.toBe(
      hashToken("verification-token-2")
    );
  });
});
