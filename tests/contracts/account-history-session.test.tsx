// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAccountRequests } from "@/lib/console/useAccountRequests";

vi.mock("@/lib/console/signed-ticket-activity", () => ({
  mapSignedTicketToActivityRow: (row: unknown) => row,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const page = (id: string, cursor: string | null = null) =>
  Response.json({
    items: [{ id }],
    nextCursor: cursor,
    openMeterConfigured: true,
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("never seeds another mounted account from a module-global history cache", async () => {
  const second = deferred<Response>();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(page("account-a-record"))
    .mockReturnValueOnce(second.promise);
  vi.stubGlobal("fetch", fetcher);
  const first = renderHook(() => useAccountRequests(true, "account-a"));
  await waitFor(() => expect(first.result.current.status).toBe("ready"));
  first.unmount();
  const next = renderHook(() => useAccountRequests(true, "account-b"));
  expect(JSON.stringify(next.result.current)).not.toContain("account-a-record");
  await act(async () => {
    second.resolve(page("account-b-record"));
  });
  await waitFor(() =>
    expect(JSON.stringify(next.result.current)).toContain("account-b-record")
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("ignores late responses after account scope changes without disconnecting", async () => {
  const first = deferred<Response>();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(page("account-b-record"))
  );
  const hook = renderHook(({ owner }) => useAccountRequests(true, owner), {
    initialProps: { owner: "account-a" },
  });
  hook.rerender({ owner: "account-b" });
  await waitFor(() =>
    expect(JSON.stringify(hook.result.current)).toContain("account-b-record")
  );
  await act(async () => {
    first.resolve(page("account-a-record"));
  });
  expect(JSON.stringify(hook.result.current)).not.toContain("account-a-record");
});

it("clears rows and cancels pending append results when disconnected", async () => {
  const append = deferred<Response>();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(page("account-a-record", "older"))
      .mockReturnValueOnce(append.promise)
  );
  const hook = renderHook(
    ({ enabled }) => useAccountRequests(enabled, "account-a"),
    { initialProps: { enabled: true } }
  );
  await waitFor(() => expect(hook.result.current.status).toBe("ready"));
  let pending: Promise<void>;
  act(() => {
    pending = hook.result.current.loadMore();
  });
  hook.rerender({ enabled: false });
  expect(hook.result.current.status).toBe("idle");
  await act(async () => {
    append.resolve(page("late-private-record"));
    await pending;
  });
  expect(hook.result.current.status).toBe("idle");
  expect(JSON.stringify(hook.result.current)).not.toContain("private-record");
});

it("retains already loaded rows when the independent usage continuation fails", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(page("old-record", "older-cursor"))
    .mockRejectedValueOnce(new Error("billing unavailable"));
  vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(() => useAccountRequests(true, "account-a"));
  await waitFor(() => expect(hook.result.current.status).toBe("ready"));
  await act(async () => {
    await hook.result.current.loadMore();
  });
  expect(hook.result.current).toMatchObject({
    status: "ready",
    rows: [{ id: "old-record" }],
    nextCursor: "older-cursor",
    loadMoreError: "billing unavailable",
  });
  expect(String(fetcher.mock.calls[1][0])).toContain("cursor=older-cursor");
});
