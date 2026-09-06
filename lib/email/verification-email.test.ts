import { describe, expect, it } from "vitest";

import { renderVerificationEmail } from "@/lib/email/verification-email";

describe("renderVerificationEmail", () => {
  it("renders text and escapes the URL in HTML", () => {
    const result = renderVerificationEmail({
      verificationUrl: "https://example.com/verify?token=a&next=%22x%22",
      expiresAt: "2026-07-27T18:00:00.000Z",
    });

    expect(result.subject).toContain("Verify your email");
    expect(result.text).toContain(
      "https://example.com/verify?token=a&next=%22x%22"
    );
    expect(result.html).toContain("token=a&amp;next=%22x%22");
    expect(result.html).not.toContain(
      'href="https://example.com/verify?token=a&next='
    );
  });
});
