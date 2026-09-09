"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccountRequestsPayload } from "@/lib/console/account-usage";
import { mapSignedTicketToActivityRow } from "@/lib/console/signed-ticket-activity";
import type { AccountActivityRow } from "@/lib/console/types";

type ReadyState = {
  status: "ready";
  rows: AccountActivityRow[];
  nextCursor: string | null;
  openMeterConfigured: boolean;
  loadMoreError: string | null;
};
type AccountRequestsState =
  | { status: "idle" }
  | { status: "loading" }
  | ReadyState
  | { status: "error"; message: string };

async function fetchRequestsPage(
  cursor: string | null,
  signal: AbortSignal,
  includeCorrelated = false
): Promise<ReadyState> {
  const params = new URLSearchParams({ limit: "50" });
  if (includeCorrelated) params.set("includeCorrelated", "1");
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/pymthouse/account-requests?${params}`, {
    cache: "no-store",
    signal,
  });
  const body = (await response.json()) as AccountRequestsPayload & {
    error?: string;
  };
  if (!response.ok)
    throw new Error(body.error ?? `Requests fetch failed (${response.status})`);
  return {
    status: "ready",
    rows: body.items.map(mapSignedTicketToActivityRow),
    nextCursor: body.nextCursor,
    openMeterConfigured: body.openMeterConfigured !== false,
    loadMoreError: null,
  };
}

/** Private history is instance-local, never a global cross-account cache.
 * ownerKey invalidates in-flight work even when both old/new accounts are enabled. */
export function useAccountRequests(
  enabled: boolean,
  ownerKey?: string,
  includeCorrelated = false
) {
  const scope = enabled
    ? JSON.stringify([ownerKey ?? "authenticated-instance", includeCorrelated])
    : "disabled";
  const [stored, setStored] = useState<{
    scope: string;
    state: AccountRequestsState;
  }>({ scope, state: { status: "idle" } });
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const appendBusy = useRef(false);
  const appendController = useRef<AbortController | null>(null);

  useEffect(() => {
    const id = ++generation.current;
    const controller = new AbortController();
    appendController.current?.abort();
    appendBusy.current = false;
    setStored({ scope, state: { status: enabled ? "loading" : "idle" } });
    if (enabled)
      void fetchRequestsPage(null, controller.signal, includeCorrelated)
        .then((page) => {
          if (generation.current === id) setStored({ scope, state: page });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted && generation.current === id)
            setStored({
              scope,
              state: {
                status: "error",
                message:
                  error instanceof Error
                    ? error.message
                    : "Failed to load requests",
              },
            });
        });
    return () => {
      generation.current = id + 1;
      controller.abort();
      appendController.current?.abort();
    };
  }, [scope, enabled, refresh, includeCorrelated]);

  const state = useMemo<AccountRequestsState>(
    () =>
      enabled && stored.scope === scope ? stored.state : { status: "idle" },
    [enabled, stored, scope]
  );
  const loadMore = useCallback(async () => {
    if (
      !enabled ||
      state.status !== "ready" ||
      !state.nextCursor ||
      appendBusy.current
    )
      return;
    const id = generation.current;
    const controller = new AbortController();
    appendController.current = controller;
    appendBusy.current = true;
    try {
      const page = await fetchRequestsPage(
        state.nextCursor,
        controller.signal,
        includeCorrelated
      );
      if (generation.current !== id) return;
      setStored((previous) => {
        if (previous.scope !== scope || previous.state.status !== "ready")
          return previous;
        return {
          scope,
          state: {
            ...page,
            rows: [
              ...new Map(
                [...previous.state.rows, ...page.rows].map((row) => [
                  row.id,
                  row,
                ])
              ).values(),
            ],
          },
        };
      });
    } catch (error) {
      if (controller.signal.aborted || generation.current !== id) return;
      setStored((previous) =>
        previous.scope === scope && previous.state.status === "ready"
          ? {
              scope,
              state: {
                ...previous.state,
                loadMoreError:
                  error instanceof Error
                    ? error.message
                    : "Failed to load requests",
              },
            }
          : previous
      );
    } finally {
      if (generation.current === id) appendBusy.current = false;
    }
  }, [enabled, state, scope, includeCorrelated]);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  return { ...state, reload, loadMore };
}
