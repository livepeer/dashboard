import { describe, expect, it } from "vitest";

import {
  authProviderFromSub,
  chooseCanonicalUserId,
  normalizeIdentityEmail,
  waitlistLinkDecision,
} from "./canonical-user-policy";

describe("canonical user policy", () => {
  it("keeps Auth0 providers and normalized email stable", () => {
    expect(authProviderFromSub("google-oauth2|123")).toBe("google-oauth2");
    expect(authProviderFromSub("custom-subject")).toBe("auth0");
    expect(normalizeIdentityEmail(" Builder@Example.COM ")).toBe(
      "builder@example.com"
    );
  });

  it("uses an existing identity but never an email match alone", () => {
    expect(
      chooseCanonicalUserId({
        identityUserId: "identity-user",
        verifiedEmailUserId: "email-user",
      })
    ).toBe("identity-user");
    expect(chooseCanonicalUserId({ verifiedEmailUserId: "email-user" })).toBe(
      null
    );
    expect(chooseCanonicalUserId({})).toBeNull();
  });

  it("creates only when neither the subject nor verified email is known", () => {
    expect(chooseCanonicalUserId({})).toBeNull();
    expect(chooseCanonicalUserId({ identityUserId: "existing-user" })).toBe(
      "existing-user"
    );
  });

  it("links only confirmed, verified, unclaimed waitlist entries", () => {
    const base = {
      emailVerified: true,
      emailConflict: false,
      userId: "user-1",
      waitlistExists: true,
    };
    expect(waitlistLinkDecision({ ...base, waitlistUserId: null })).toBe(
      "link"
    );
    expect(waitlistLinkDecision({ ...base, waitlistUserId: "user-1" })).toBe(
      "already-linked"
    );
    expect(waitlistLinkDecision({ ...base, waitlistUserId: "user-2" })).toBe(
      "conflict"
    );
    expect(
      waitlistLinkDecision({
        ...base,
        emailVerified: false,
        waitlistUserId: null,
      })
    ).toBe("skip");
    expect(
      waitlistLinkDecision({
        ...base,
        emailConflict: true,
        waitlistUserId: null,
      })
    ).toBe("skip");
    expect(
      waitlistLinkDecision({
        ...base,
        waitlistExists: false,
        waitlistUserId: null,
      })
    ).toBe("skip");
  });
});
