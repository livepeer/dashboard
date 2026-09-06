import { describe, expect, it } from "vitest";
import {
  auth0IdentityFromUser,
  normalizeIssuer,
  validateProviderIdentity,
} from "@/lib/authentication/identity";
import {
  normalizeAccountScope,
  selectExternalAccount,
} from "@/lib/external-accounts/policy";

describe("provider-independent identity adapter", () => {
  it("maps trusted Auth0 claims without deriving product identifiers", () => {
    expect(
      auth0IdentityFromUser(
        {
          sub: " github|123 ",
          email: " Person@example.invalid ",
          email_verified: true,
        },
        "TENANT.auth0.com/"
      )
    ).toEqual({
      authority: "auth0",
      issuer: "https://tenant.auth0.com",
      subject: "github|123",
      strategy: "github",
      email: "Person@example.invalid",
      emailVerified: true,
    });
  });
  it("does not treat truthy unverified strings as verified claims", () => {
    expect(
      auth0IdentityFromUser(
        { sub: "auth0|1", email_verified: "true" },
        "https://tenant.example"
      )?.emailVerified
    ).toBe(false);
    expect(auth0IdentityFromUser({}, "https://tenant.example")).toBeNull();
  });
  it("requires configured issuer and authority", () => {
    expect(() => auth0IdentityFromUser({ sub: "auth0|1" }, "")).toThrow();
    expect(() =>
      validateProviderIdentity({
        authority: " ",
        issuer: "https://tenant.example",
        subject: "1",
        emailVerified: false,
      })
    ).toThrow();
    for (const issuer of [
      "https://user:password@example.invalid",
      "https://issuer.invalid?tenant=other",
      "javascript:alert(1)",
    ]) {
      expect(() => normalizeIssuer(issuer)).toThrow();
    }
  });
  it("preserves tenant paths and normalizes only URL spelling", () => {
    expect(normalizeIssuer("https://EXAMPLE.invalid/Tenant/")).toBe(
      "https://example.invalid/Tenant"
    );
  });
});

describe("external account selection", () => {
  const accounts = [
    { id: "old-a", externalUserId: "eu_legacy_a" },
    { id: "old-b", externalUserId: "eu_legacy_b" },
  ];
  it("preserves per-identity choice for users with multiple historical accounts", () => {
    expect(selectExternalAccount(accounts, ["old-b"])).toEqual(accounts[1]);
  });
  it("never chooses among unbound or multiply bound accounts", () => {
    expect(() => selectExternalAccount(accounts, [])).toThrow(
      "external_account_ambiguous"
    );
    expect(() => selectExternalAccount(accounts, ["old-a", "old-b"])).toThrow(
      "external_account_ambiguous"
    );
  });
  it("reuses a sole account and allocates only for empty account sets", () => {
    expect(selectExternalAccount([accounts[0]], [])).toEqual(accounts[0]);
    expect(selectExternalAccount([], [])).toBeNull();
  });
  it("requires app-scoped configuration", () => {
    expect(
      normalizeAccountScope({
        service: "pymthouse",
        issuer: "https://ISSUER.invalid/",
        appId: " app_test ",
      })
    ).toEqual({
      service: "pymthouse",
      issuer: "https://issuer.invalid",
      appId: "app_test",
    });
    expect(() =>
      normalizeAccountScope({
        service: "pymthouse",
        issuer: "https://issuer.invalid",
        appId: " ",
      })
    ).toThrow();
  });
});
