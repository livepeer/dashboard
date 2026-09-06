import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { getIdentityReferralUrl } from "./identity-referral";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => ({ select: mocks.select }) }));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ NEXT_PUBLIC_SITE_URL: "https://preview.example.com" }),
}));
const identity = {
  authority: "auth0",
  issuer: "https://tenant.example.com/",
  subject: "user-123",
  email: "user@example.com",
  emailVerified: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: mocks.where,
    limit: mocks.limit,
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  mocks.select.mockReturnValue(chain);
  mocks.where.mockReturnValue(chain);
  mocks.limit.mockResolvedValue([{ referralCode: "real+code" }]);
});
describe("trusted pending referral read", () => {
  it("requires verified identity and scopes the lookup by authority, issuer and subject", async () => {
    expect(await getIdentityReferralUrl(identity)).toBe(
      "https://preview.example.com/waitlist?ref=real%2Bcode"
    );
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.params).toEqual([
      identity.authority,
      identity.issuer,
      identity.subject,
      "active",
      "confirmed",
    ]);
    expect(query.sql).toContain('"confirmed_at" is not null');
  });
  it.each([
    { ...identity, emailVerified: false },
    { ...identity, email: undefined },
  ])("never looks up an unverified/missing email", async (unverified) => {
    expect(await getIdentityReferralUrl(unverified)).toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("does not invent a code for missing enrollment", async () => {
    mocks.limit.mockResolvedValue([]);
    expect(await getIdentityReferralUrl(identity)).toBeNull();
  });
});
