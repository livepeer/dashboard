"use client";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import SectionHeader from "@/components/console/SectionHeader";
import CallsTable from "@/components/console/CallsTable";
import CallDetailDrawer from "@/components/console/CallDetailDrawer";
import { useAuth } from "@/components/console/AuthContext";
import { useAccountRequests } from "@/lib/console/useAccountRequests";
import { useRunDetail, useRunHistory } from "@/lib/console/useRunHistory";
import { runToActivity } from "@/lib/console/run-activity";
import type { AccountActivityRow } from "@/lib/console/types";

export default function CallsSection({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (next: string) => void;
}) {
  const { isConnected, user } = useAuth();
  const ownerKey = user ? `${user.canonicalUserId}:${user.id}` : undefined;
  const history = useRunHistory(
    "/api/console/runs",
    isConnected,
    {
      search: query.trim(),
    },
    ownerKey
  );
  const usage = useAccountRequests(isConnected, ownerKey);
  const router = useRouter();
  const requestId = useSearchParams().get("request");
  const recorded = useMemo(
    () => history.page?.items.map(runToActivity) ?? [],
    [history.page]
  );
  const legacy =
    usage.status === "ready"
      ? usage.rows.filter(
          (row) =>
            !query.trim() ||
            [
              row.id,
              row.gatewayRequestId,
              row.model,
              row.pipeline,
              row.modality,
            ]
              .join(" ")
              .toLowerCase()
              .includes(query.trim().toLowerCase())
        )
      : [];
  const rows = [...recorded, ...legacy];
  const found = rows.find(
    (row) => row.id === requestId || row.gatewayRequestId === requestId
  );
  const detail = useRunDetail(
    "/api/console/runs",
    requestId &&
      found?.recordKind !== "usage" &&
      !requestId.startsWith("usage:")
      ? requestId
      : null,
    ownerKey,
    isConnected
  );
  const openRow =
    found ?? (detail.detail ? runToActivity(detail.detail) : null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const select = (row: AccountActivityRow) =>
    router.push("/home?request=" + encodeURIComponent(row.id), {
      scroll: false,
    });
  const loadUsage = async () => {
    if (loadingUsage) return;
    setLoadingUsage(true);
    try {
      await usage.loadMore();
    } finally {
      setLoadingUsage(false);
    }
  };
  return (
    <>
      <SectionHeader
        variant="default"
        title="History"
        className="mb-3 flex flex-wrap items-end justify-between gap-3 px-3 md:px-7"
        action={
          <div className="flex h-[26px] w-[240px] items-center gap-1.5 rounded-[4px] border border-hairline bg-dark px-2.5 focus-within:ring-1 focus-within:ring-green-bright/30">
            <Search
              className="h-3 w-3 shrink-0 text-fg-faint"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search model or modality…"
              aria-label="Search history"
              className="min-w-0 flex-1 bg-transparent text-[11.5px] text-fg-strong placeholder:text-fg-faint outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                aria-label="Clear search"
                className="-mr-1 shrink-0 p-0.5 text-fg-faint"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        }
      />
      <section aria-label="Recorded runs">
        {history.loading && (
          <p role="status" className="px-7 py-8 text-sm text-fg-faint">
            Loading runs…
          </p>
        )}
        {history.error && (
          <p role="alert" className="px-7 py-4 text-sm text-fg-faint">
            {history.error}{" "}
            <button
              type="button"
              className="underline"
              onClick={history.page ? history.loadMore : history.reload}
            >
              Retry
            </button>
          </p>
        )}
        <CallsTable
          rows={recorded}
          bordered={false}
          density="cozy"
          variant="requests"
          onSelectRow={select}
        />
        {!history.loading && !history.error && !recorded.length && (
          <p className="px-7 py-8 text-sm text-fg-faint">
            {query
              ? "No recorded runs match this search."
              : "No recorded runs yet."}
          </p>
        )}
        {history.page?.nextCursor && (
          <div className="flex justify-center py-3">
            <button
              type="button"
              onClick={history.loadMore}
              disabled={history.loadingMore}
              className="text-xs text-fg-muted"
            >
              {history.loadingMore ? "Loading…" : "Load older runs"}
            </button>
          </div>
        )}
      </section>
      <section aria-label="Usage-only history" className="mt-4">
        <h3 className="px-3 py-3 text-xs font-medium text-fg-muted md:px-7">
          Usage-only history
        </h3>
        {(usage.status === "loading" || usage.status === "idle") && (
          <p role="status" className="px-7 py-5 text-sm text-fg-faint">
            Loading usage…
          </p>
        )}
        {usage.status === "error" && (
          <p role="alert" className="px-7 py-4 text-sm text-fg-faint">
            Could not load usage history.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => void usage.reload()}
            >
              Retry
            </button>
          </p>
        )}
        {usage.status === "ready" && (
          <>
            <CallsTable
              rows={legacy}
              bordered={false}
              density="cozy"
              variant="requests"
              onSelectRow={select}
            />
            {!legacy.length && (
              <p className="px-7 py-5 text-sm text-fg-faint">
                {query
                  ? "No loaded usage matches this search."
                  : "No additional usage records."}
              </p>
            )}
            {usage.loadMoreError && (
              <p role="alert" className="px-7 py-2 text-xs text-fg-muted">
                Could not load more usage.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => void loadUsage()}
                >
                  Retry
                </button>
              </p>
            )}
            {usage.nextCursor && (
              <div className="flex justify-center py-3">
                <button
                  type="button"
                  disabled={loadingUsage}
                  onClick={() => void loadUsage()}
                  className="text-xs text-fg-muted"
                >
                  {loadingUsage
                    ? "Loading…"
                    : query
                      ? "Search older history"
                      : "Load older usage"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
      {requestId && !openRow && detail.error && (
        <p role="alert" className="px-7 text-sm text-fg-muted">
          {detail.error}{" "}
          <button type="button" onClick={detail.reload} className="underline">
            Retry
          </button>
        </p>
      )}
      <CallDetailDrawer
        row={openRow}
        rows={rows}
        open={!!openRow}
        onClose={() => router.push("/home", { scroll: false })}
        onSelectRow={select}
        detail={detail.detail}
        detailLoading={detail.loading}
        detailError={detail.error}
        onRetryDetail={detail.reload}
      />
    </>
  );
}
