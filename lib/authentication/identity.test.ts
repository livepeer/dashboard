import { describe, expect, it } from "vitest";
import { auth0IdentityFromUser } from "./identity";

describe("authenticated profile presentation", () => {
  it("passes an HTTPS avatar without changing subject or verification", () => {
    expect(
      auth0IdentityFromUser(
        {
          sub: "auth0|123",
          email: "person@example.com",
          email_verified: false,
          picture: "https://images.example.com/avatar.jpg",
        },
        "tenant.example.com"
      )
    ).toMatchObject({
      subject: "auth0|123",
      emailVerified: false,
      avatarUrl: "https://images.example.com/avatar.jpg",
    });
  });
  it.each([
    undefined,
    "javascript:alert(1)",
    "data:image/png;base64,test",
    "https://user:secret@example.com/avatar",
    "invalid",
    "http://example.com/avatar",
  ])("ignores unsafe/missing picture %s", (picture) => {
    expect(
      auth0IdentityFromUser({ sub: "auth0|123", picture }, "tenant.example.com")
    ).not.toHaveProperty("avatarUrl");
  });
});
