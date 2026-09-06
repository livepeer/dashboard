"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import SectionHeader from "@/components/console/SectionHeader";
import CallsTable from "@/components/console/CallsTable";
import CallDetailDrawer from "@/components/console/CallDetailDrawer";
import { useRunDetail, useRunHistory } from "@/lib/console/useRunHistory";
import { runToActivity } from "@/lib/console/run-activity";
import type { RunStatus } from "@/lib/runs/types";
import { useAuth } from "@/components/console/AuthContext";

const filters: { label: string; status?: RunStatus }[] = [
  { label: "All runs" },
  { label: "Completed", status: "succeeded" },
  { label: "Running", status: "running" },
  { label: "Queued", status: "queued" },
  { label: "Failed", status: "failed" },
  { label: "Unknown", status: "unknown" },
  { label: "Cancelled", status: "cancelled" },
];
export default function RunsPreview() {
  const { user, isConnected } = useAuth();
  const ownerKey = user
    ? `${user.canonicalUserId}:${user.id}:${user.isAdmin}`
    : undefined;
  const enabled = isConnected && user?.isAdmin === true;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<RunStatus>();
  const [selected, setSelected] = useState<string | null>(null);
  const history = useRunHistory(
    "/api/admin/runs",
    enabled,
    {
      search: query.trim(),
      status,
    },
    ownerKey
  );
  const detail = useRunDetail("/api/admin/runs", selected, ownerKey, enabled);
  const rows = useMemo(
    () => history.page?.items.map(runToActivity) ?? [],
    [history.page]
  );
  const counts = history.page?.counts;
  const summary = [
    { label: "Total runs", value: counts?.total },
    { label: "Completed", value: counts?.succeeded },
    {
      label: "In progress",
      value: counts ? counts.queued + counts.running : undefined,
    },
    { label: "Failed", value: counts?.failed },
  ];
  return (
    <section className="mt-8" aria-label="Platform history workspace">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-8 min-[480px]:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <div key={item.label}>
            <dt className="whitespace-nowrap text-xs text-fg-muted">
              {item.label}
            </dt>
            <dd className="mt-2 text-3xl font-light tabular-nums">
              {item.value ?? "—"}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-10">
        <SectionHeader
          variant="default"
          title="Platform History"
          className="mb-4 flex flex-wrap items-end justify-between gap-3"
          action={
            <label className="flex h-[26px] w-[240px] items-center gap-1.5 rounded-[4px] border border-hairline bg-dark px-2.5 focus-within:ring-1 focus-within:ring-green-bright/30">
              <Search
                className="h-3 w-3 shrink-0 text-fg-faint"
                aria-hidden="true"
              />
              <input
                aria-label="Search runs"
                placeholder="Search email, model or run…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelected(null);
                }}
                className="min-w-0 flex-1 bg-transparent text-[11.5px] text-fg-strong placeholder:text-fg-faint outline-none"
              />
            </label>
          }
        />
        <div
          role="group"
          aria-label="Filter runs by status"
          className="flex flex-wrap items-center gap-5 border-b border-hairline"
        >
          {filters.map((filter) => (
            <button
              type="button"
              key={filter.label}
              aria-pressed={status === filter.status}
              onClick={() => {
                setStatus(filter.status);
                setSelected(null);
              }}
              className={[
                "-mb-px inline-grid shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                status === filter.status
                  ? "border-foreground font-medium text-fg-strong"
                  : "border-transparent text-fg-faint hover:text-fg",
              ].join(" ")}
            >
              <span
                aria-hidden="true"
                className="invisible col-start-1 row-start-1 whitespace-nowrap font-medium"
              >
                {filter.label}
              </span>
              <span className="col-start-1 row-start-1 whitespace-nowrap">
                {filter.label}
              </span>
            </button>
          ))}
        </div>
        <section aria-label="Platform history" className="-mx-5 mt-4 sm:-mx-7">
          {history.loading && (
            <p role="status" className="px-7 py-8 text-sm text-fg-faint">
              Loading platform history…
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
            rows={rows}
            bordered={false}
            density="cozy"
            variant="requests"
            onSelectRow={(row) => setSelected(row.id)}
            rowContext={(row) => (
              <span className="ml-auto min-w-0 truncate text-[11.5px] font-normal text-fg-faint">
                {history.page?.items.find((run) => run.id === row.id)?.email ??
                  "No verified email"}
              </span>
            )}
          />
          {!history.loading && !history.error && !rows.length && (
            <p className="px-7 py-12 text-center text-sm text-fg-faint">
              No recorded runs match these filters.
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
      </div>
      <CallDetailDrawer
        row={rows.find((row) => row.id === selected) ?? null}
        rows={rows}
        open={!!selected}
        onClose={() => setSelected(null)}
        onSelectRow={(row) => setSelected(row.id)}
        detail={detail.detail}
        detailLoading={detail.loading}
        detailError={detail.error}
        onRetryDetail={detail.reload}
      />
    </section>
  );
}
