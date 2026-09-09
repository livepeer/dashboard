"use client";
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import SectionHeader from "@/components/console/SectionHeader";
import CallsTable from "@/components/console/CallsTable";
import CallDetailDrawer from "@/components/console/CallDetailDrawer";
import { useAuth } from "@/components/console/AuthContext";
import { takeGatewayRequestIds } from "@/lib/console/gateway-request-ids";
import { matchRunTicketFees } from "@/lib/console/activity-output-match";
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
  const requestId = useSearchParams().get("request");
  const detail = useRunDetail(
    "/api/console/runs",
    requestId,
    ownerKey,
    isConnected
  );
  const gatewayRequestIds = useMemo(
    () =>
      takeGatewayRequestIds(
        (history.page?.items ?? []).map((run) => run.gatewayRequestId),
        detail.detail?.gatewayRequestId
      ),
    [history.page, detail.detail]
  );
  // Cost is the PymtHouse signed-ticket fee for this gateway id. Do not wait
  // for the full history page — deep links need the open run's id immediately.
  const billing = useAccountRequests(
    isConnected && gatewayRequestIds.length > 0,
    ownerKey,
    true,
    gatewayRequestIds
  );
  const billingRows = billing.status === "ready" ? billing.rows : null;
  const feeByGateway = useMemo(() => {
    if (!billingRows) return new Map();
    const tickets = billingRows.flatMap((row) =>
      row.gatewayRequestId && row.costDisplay !== "—"
        ? [
            {
              gatewayRequestId: row.gatewayRequestId,
              modelId: row.capabilityId ?? "",
              time: row.timestamp,
              costDisplay: row.costDisplay,
              ...(row.costExact ? { costExact: row.costExact } : {}),
            },
          ]
        : []
    );
    const runs = [
      ...(history.page?.items ?? []).map((run) => ({
        gatewayRequestId: run.gatewayRequestId,
        capability: run.modelId ?? run.capability,
        createdAt: run.createdAt,
      })),
      ...(detail.detail
        ? [
            {
              gatewayRequestId: detail.detail.gatewayRequestId,
              capability: detail.detail.modelId ?? detail.detail.capability,
              createdAt: detail.detail.createdAt,
            },
          ]
        : []),
    ];
    return matchRunTicketFees(runs, tickets);
  }, [billingRows, history.page, detail.detail]);
  const router = useRouter();
  const recorded = useMemo(
    () =>
      history.page?.items.map((run) =>
        runToActivity(run, feeByGateway.get(run.gatewayRequestId))
      ) ?? [],
    [history.page, feeByGateway]
  );
  const rows = recorded;
  const found = rows.find(
    (row) => row.id === requestId || row.gatewayRequestId === requestId
  );
  const openRow =
    detail.detail &&
    (detail.detail.id === requestId ||
      detail.detail.gatewayRequestId === requestId)
      ? runToActivity(
          detail.detail,
          feeByGateway.get(detail.detail.gatewayRequestId)
        )
      : (found ?? null);
  const select = (row: AccountActivityRow) =>
    router.push("/home?request=" + encodeURIComponent(row.id), {
      scroll: false,
    });
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
      <section aria-label="History records">
        {history.loading && (
          <p role="status" className="px-7 py-8 text-sm text-fg-faint">
            Loading history…
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
            {query ? "No history matches this search." : "No history yet."}
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
              {history.loadingMore ? "Loading…" : "Load older history"}
            </button>
          </div>
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
