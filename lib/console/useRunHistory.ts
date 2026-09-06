"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RunPage, RunDetail, RunListQuery } from "@/lib/runs/types";

type HistoryState = {
  key: string;
  page: RunPage | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
};

/** Instance-local private data; identity is part of visibility and request scope. */
export function useRunHistory(
  base: string,
  enabled: boolean,
  query: RunListQuery = {},
  ownerKey?: string
) {
  const params = new URLSearchParams({ limit: "50" });
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  const url = `${base}?${params}`;
  const key = JSON.stringify([url, enabled, ownerKey ?? null]);
  const [state, setState] = useState<HistoryState>({
    key,
    page: null,
    loading: enabled,
    loadingMore: false,
    error: null,
  });
  const generation = useRef(0);
  const busy = useRef(false);
  const appendController = useRef<AbortController | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const id = ++generation.current;
    const controller = new AbortController();
    appendController.current?.abort();
    busy.current = false;
    setState({
      key,
      page: null,
      loading: enabled,
      loadingMore: false,
      error: null,
    });
    if (enabled)
      void fetch(url, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw Error("Could not load run history.");
          return response.json() as Promise<RunPage>;
        })
        .then((page) => {
          if (generation.current === id)
            setState({
              key,
              page,
              loading: false,
              loadingMore: false,
              error: null,
            });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted && generation.current === id)
            setState({
              key,
              page: null,
              loading: false,
              loadingMore: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Could not load run history.",
            });
        });
    return () => {
      controller.abort();
      appendController.current?.abort();
      generation.current = id + 1;
    };
  }, [key, url, enabled, refresh]);

  const loadMore = useCallback(async () => {
    if (
      !enabled ||
      state.key !== key ||
      !state.page?.nextCursor ||
      busy.current
    )
      return;
    const id = generation.current;
    const controller = new AbortController();
    appendController.current = controller;
    busy.current = true;
    setState((old) => ({ ...old, loadingMore: true, error: null }));
    try {
      const response = await fetch(
        `${url}&cursor=${encodeURIComponent(state.page.nextCursor)}`,
        { cache: "no-store", signal: controller.signal }
      );
      if (!response.ok) throw Error("Could not load more runs.");
      const page: RunPage = await response.json();
      if (generation.current === id)
        setState((old) => ({
          ...old,
          loadingMore: false,
          page: {
            ...page,
            items: [
              ...new Map(
                [...(old.page?.items ?? []), ...page.items].map((item) => [
                  item.id,
                  item,
                ])
              ).values(),
            ],
          },
        }));
    } catch (error) {
      if (!controller.signal.aborted && generation.current === id)
        setState((old) => ({
          ...old,
          loadingMore: false,
          error:
            error instanceof Error
              ? error.message
              : "Could not load more runs.",
        }));
    } finally {
      if (generation.current === id) busy.current = false;
    }
  }, [state, key, url, enabled]);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  return {
    ...(enabled && state.key === key
      ? state
      : { page: null, loading: enabled, loadingMore: false, error: null }),
    loadMore,
    reload,
  };
}

export function useRunDetail(
  base: string,
  id: string | null,
  ownerKey?: string,
  enabled = true
) {
  const key = JSON.stringify([base, id, ownerKey ?? null, enabled]);
  const [state, setState] = useState<{
    key: string;
    detail: RunDetail | null;
    loading: boolean;
    error: string | null;
  }>({ key, detail: null, loading: false, error: null });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, detail: null, loading: enabled && !!id, error: null });
    if (enabled && id)
      void fetch(`${base}/${encodeURIComponent(id)}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw Error("Could not load run details.");
          return response.json() as Promise<RunDetail>;
        })
        .then((detail) => {
          if (!controller.signal.aborted)
            setState({ key, detail, loading: false, error: null });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setState({
              key,
              detail: null,
              loading: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Could not load run details.",
            });
        });
    return () => controller.abort();
  }, [key, base, id, enabled, refresh]);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  return {
    ...(enabled && state.key === key
      ? state
      : { detail: null, loading: enabled && !!id, error: null }),
    reload,
  };
}
