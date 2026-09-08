"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountUsagePayload } from "@/lib/console/account-usage";
import {
  errorMessageFromBody,
  isAccountUsagePayload,
} from "@/lib/console/account-usage-payload";
import { createClientCache } from "@/lib/console/client-cache";

/** Windows change once a day; a short TTL makes tab-switching free. */
const CACHE_TTL_MS = 60_000;

const usageCache = createClientCache<AccountUsagePayload>(CACHE_TTL_MS);

async function fetchUsageWindow(
  params: URLSearchParams
): Promise<AccountUsagePayload> {
  const response = await fetch(`/api/pymthouse/account-usage?${params}`, {
    cache: "no-store",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      errorMessageFromBody(body) ?? `Usage fetch failed (${response.status})`
    );
  }
  if (!isAccountUsagePayload(body)) {
    throw new Error("Usage response was malformed.");
  }
  return body;
}

type AccountUsageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: AccountUsagePayload }
  | { status: "error"; message: string };

type UseAccountUsageOptions = {
  periodDays?: number;
  window?: "rolling" | "mtd";
  includePrior?: boolean;
};

/** Session meters only need the live allowance, not the prior usage window. */
export const SESSION_USAGE_OPTIONS: UseAccountUsageOptions = {
  includePrior: false,
};

function normalizeOptions(
  periodDaysOrOptions: number | UseAccountUsageOptions = 30
): Required<
  Pick<UseAccountUsageOptions, "periodDays" | "window" | "includePrior">
> {
  if (typeof periodDaysOrOptions === "number") {
    return {
      periodDays: periodDaysOrOptions,
      window: "rolling",
      includePrior: true,
    };
  }
  return {
    periodDays: periodDaysOrOptions.periodDays ?? 30,
    window: periodDaysOrOptions.window ?? "rolling",
    includePrior: periodDaysOrOptions.includePrior !== false,
  };
}

export function useAccountUsage(
  enabled: boolean,
  periodDaysOrOptions: number | UseAccountUsageOptions = 30
) {
  const options = normalizeOptions(periodDaysOrOptions);
  const cacheKey = `${options.periodDays}|${options.window}|${options.includePrior}`;

  // Seed from the cache so a remount paints the last payload on its first
  // frame. Reading it in an effect instead left one `idle` beat, and the view
  // treats `idle` as loading — that beat was the skeleton flash on every
  // Home → Usage → Home round trip.
  const [state, setState] = useState<AccountUsageState>(() => {
    const cached = enabled ? usageCache.peek(cacheKey) : undefined;
    return cached ? { status: "ready", data: cached.data } : { status: "idle" };
  });

  // Per-window cache. Switching 30d → 7d → 30d used to fire three requests for
  // two distinct results, and blanked the page each time. A cached window
  // renders immediately and revalidates behind the current view.
  // Only the newest request may commit, so fast tab switching cannot land an
  // earlier response on top of a later one.
  const requestId = useRef(0);

  const load = useCallback(
    async (force = false) => {
      if (!enabled) {
        setState({
          status: "error",
          message: "Sign in to load usage for your account.",
        });
        return;
      }

      const id = ++requestId.current;
      const cached = usageCache.peek(cacheKey);

      if (cached) {
        setState({ status: "ready", data: cached.data });
        // Still warm — no request at all.
        if (usageCache.isFresh(cached) && !force) return;
      } else {
        setState({ status: "loading" });
      }

      if (force) usageCache.delete(cacheKey);

      try {
        const params = new URLSearchParams({
          days: String(options.periodDays),
          window: options.window,
          includePrior: options.includePrior ? "1" : "0",
        });
        const data = await usageCache.fetch(cacheKey, () =>
          fetchUsageWindow(params)
        );
        if (id !== requestId.current) return;
        setState({ status: "ready", data });
      } catch (error) {
        if (id !== requestId.current) return;
        // A failed revalidation should not throw away a good cached window.
        if (cached) return;
        setState({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to load usage",
        });
      }
    },
    [
      enabled,
      cacheKey,
      options.periodDays,
      options.window,
      options.includePrior,
    ]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(() => load(true), [load]);

  return { ...state, reload };
}
