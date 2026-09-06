import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => ({ insert: mocks.insert }) }));
import { consumeAuthorizationCode } from "@/lib/mcp/code-redemption";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({
    onConflictDoNothing: () => ({ returning: mocks.returning }),
  });
  mocks.returning.mockResolvedValue([{ codeHash: "digest" }]);
});
describe("durable authorization-code receipt", () => {
  it("stores a digest, never a bearer code", async () => {
    expect(
      await consumeAuthorizationCode("private-code", Date.now() + 60_000)
    ).toBe(true);
    expect(mocks.values).toHaveBeenCalledWith({
      codeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      expiresAt: expect.any(Date),
    });
    expect(JSON.stringify(mocks.values.mock.calls)).not.toContain(
      "private-code"
    );
  });
  it("rejects conflicts and expired codes", async () => {
    mocks.returning.mockResolvedValue([]);
    expect(await consumeAuthorizationCode("used", Date.now() + 60_000)).toBe(
      false
    );
    mocks.insert.mockClear();
    expect(await consumeAuthorizationCode("expired", 1)).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("fails closed without leaking driver messages", async () => {
    mocks.returning.mockRejectedValue(new Error("private driver text"));
    await expect(
      consumeAuthorizationCode("code", Date.now() + 60_000)
    ).rejects.toMatchObject({
      status: 503,
      code: "code_redemption_unavailable",
    });
  });
  it("canonicalizes code whitespace to the same digest", async () => {
    await consumeAuthorizationCode("code", Date.now() + 60_000);
    await consumeAuthorizationCode(" code\n", Date.now() + 60_000);
    expect(mocks.values.mock.calls[0][0].codeHash).toBe(
      mocks.values.mock.calls[1][0].codeHash
    );
  });
});
