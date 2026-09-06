import { describe, expect, it, vi } from "vitest";

import { runBestEffortIdentitySync } from "./best-effort-sync";

describe("best-effort canonical identity synchronization", () => {
  it("does not block login when the database is unavailable", async () => {
    const onFailure = vi.fn();
    const result = await runBestEffortIdentitySync(async () => {
      throw new Error("database unavailable");
    }, onFailure);

    expect(result).toBeNull();
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it("can reconcile on a later authenticated request", async () => {
    let attempts = 0;
    const operation = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary database outage");
      return { userId: "canonical-user" };
    };

    expect(
      await runBestEffortIdentitySync(operation, () => undefined)
    ).toBeNull();
    expect(await runBestEffortIdentitySync(operation, () => undefined)).toEqual(
      {
        userId: "canonical-user",
      }
    );
    expect(attempts).toBe(2);
  });
});
