// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRunDetail, useRunHistory } from "@/lib/console/useRunHistory";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const page = (id: string, cursor: string | null = null) =>
  Response.json({
    items: [{ id }],
    nextCursor: cursor,
    counts: {
      total: 1,
      queued: 0,
      running: 0,
      succeeded: 1,
      failed: 0,
      cancelled: 0,
      unknown: 0,
    },
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("invalidates run list data when the enabled account changes", async () => {
  const next = deferred<Response>();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(page("account-a-run"))
      .mockReturnValueOnce(next.promise)
  );
  const hook = renderHook(
    ({ owner }) => useRunHistory("/api/console/runs", true, {}, owner),
    { initialProps: { owner: "account-a" } }
  );
  await waitFor(() =>
    expect(hook.result.current.page?.items[0].id).toBe("account-a-run")
  );
  hook.rerender({ owner: "account-b" });
  expect(hook.result.current.page).toBeNull();
  await act(async () => {
    next.resolve(page("account-b-run"));
  });
  await waitFor(() =>
    expect(hook.result.current.page?.items[0].id).toBe("account-b-run")
  );
});

it("ignores a late run page from an old account and hides data when disabled", async () => {
  const first = deferred<Response>();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(page("account-b-run"))
  );
  const hook = renderHook(
    ({ owner, enabled }) =>
      useRunHistory("/api/console/runs", enabled, {}, owner),
    { initialProps: { owner: "account-a", enabled: true } }
  );
  hook.rerender({ owner: "account-b", enabled: true });
  await waitFor(() =>
    expect(hook.result.current.page?.items[0].id).toBe("account-b-run")
  );
  await act(async () => {
    first.resolve(page("account-a-run"));
  });
  expect(hook.result.current.page?.items[0].id).toBe("account-b-run");
  hook.rerender({ owner: "account-b", enabled: false });
  expect(hook.result.current.page).toBeNull();
  expect(hook.result.current.loading).toBe(false);
});

it("does not append another account's delayed continuation to the current run list", async () => {
  const more = deferred<Response>();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(page("account-a-run", "older-a"))
      .mockReturnValueOnce(more.promise)
      .mockResolvedValueOnce(page("account-b-run"))
  );
  const hook = renderHook(
    ({ owner }) => useRunHistory("/api/console/runs", true, {}, owner),
    { initialProps: { owner: "account-a" } }
  );
  await waitFor(() => expect(hook.result.current.page).not.toBeNull());
  let pending: Promise<void>;
  act(() => {
    pending = hook.result.current.loadMore();
  });
  hook.rerender({ owner: "account-b" });
  await waitFor(() =>
    expect(hook.result.current.page?.items[0].id).toBe("account-b-run")
  );
  await act(async () => {
    more.resolve(page("account-a-private-run"));
    await pending;
  });
  expect(hook.result.current.page?.items.map((row) => row.id)).toEqual([
    "account-b-run",
  ]);
});

it("scopes run details by owner and authorization even if the selected ID stays the same", async () => {
  const second = deferred<Response>();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        id: "same-run",
        submittedArguments: { prompt: "account-a-private" },
      })
    )
    .mockReturnValueOnce(second.promise);
  vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(
    ({ owner, enabled }) =>
      useRunDetail("/api/admin/runs", "same-run", owner, enabled),
    { initialProps: { owner: "admin-a", enabled: true } }
  );
  await waitFor(() =>
    expect(hook.result.current.detail?.submittedArguments).toEqual({
      prompt: "account-a-private",
    })
  );
  hook.rerender({ owner: "admin-b", enabled: true });
  expect(hook.result.current.detail).toBeNull();
  hook.rerender({ owner: "admin-b", enabled: false });
  await act(async () => {
    second.resolve(
      Response.json({
        id: "same-run",
        submittedArguments: { prompt: "late-private" },
      })
    );
  });
  expect(hook.result.current.detail).toBeNull();
  expect(hook.result.current.loading).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
