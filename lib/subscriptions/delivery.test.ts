import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { getDb } from "@/lib/db";
import {
  NEWSLETTER_DELIVERY_TIMEOUT_MS,
  synchronizeNewsletterConsent,
} from "./delivery";
import { newsletterLockKey } from "./locking";
const execute = vi.fn().mockResolvedValue(undefined);
const limit = vi.fn();
const transaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) =>
  fn({
    execute,
    select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
  })
);
describe("authoritative newsletter synchronization", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue({ transaction } as unknown as ReturnType<
      typeof getDb
    >);
    limit.mockResolvedValue([
      {
        id: "subscription-id",
        status: "unsubscribed",
        updatedAt: new Date(5000),
      },
    ]);
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });
  it("reads the current state under the same address lock used by writers", async () => {
    const updateContact = vi.fn().mockResolvedValue(undefined);
    await synchronizeNewsletterConsent({
      email: " TEST@EXAMPLE.INVALID ",
      provider: { updateContact },
    });
    expect(newsletterLockKey(" TEST@EXAMPLE.INVALID ")).toBe(
      "subscription:test@example.invalid:product_marketing"
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(updateContact).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "test@example.invalid",
        subscribed: false,
        idempotencyKey: "newsletter-state:subscription-id:5000:false",
      })
    );
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(
      limit.mock.invocationCallOrder[0]
    );
    expect(limit.mock.invocationCallOrder[0]).toBeLessThan(
      updateContact.mock.invocationCallOrder[0]
    );
  });
  it("bounds provider time and aborts its transport without changing consent", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const updateContact = vi.fn(async (input) => {
      signal = input.signal;
      await new Promise(() => {});
    });
    const pending = synchronizeNewsletterConsent({
      email: "test@example.invalid",
      provider: { updateContact },
    });
    const assertion = expect(pending).rejects.toMatchObject({
      code: "delivery_timeout",
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(NEWSLETTER_DELIVERY_TIMEOUT_MS);
    await assertion;
    expect(signal?.aborted).toBe(true);
  });
});
