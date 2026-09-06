"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, ArrowDownToLine } from "lucide-react";
import {
  selectionCsv,
  type SelectionExportRow,
} from "@/lib/admin/selection-csv";
import SectionHeader from "@/components/console/SectionHeader";
import SelectionCheckbox from "./SelectionCheckbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  AccessAction,
  AdminAccessList,
  BulkAccessOutcome,
  BulkAccessRequest,
} from "@/lib/platform/contracts";
import {
  freezeAccessRequests,
  normalizeOutcomes,
  retryableRequests,
  toggleSelection,
} from "./access-selection";

const control =
  "rounded-[4px] border border-hairline px-2.5 py-1 text-[11.5px] text-fg-muted transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40";
const FILTERS = [
  { value: "approved", label: "Approved" },
  { value: "waiting", label: "Waitlist" },
  { value: "subscribed", label: "Subscribed" },
  { value: "unverified", label: "Unverified" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

export default function AccessManager() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("waiting");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<AdminAccessList | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportLock = useRef(false);
  const [selectionScope, setSelectionScope] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [confirmation, setConfirmation] = useState<BulkAccessRequest[] | null>(
    null
  );
  const [batch, setBatch] = useState<BulkAccessRequest[] | null>(null);
  const [outcomes, setOutcomes] = useState<BulkAccessOutcome[]>([]);
  const [working, setWorking] = useState(false);
  const mutationLock = useRef(false);
  const selectionLock = useRef(false);
  const labels = useRef(new Map<string, string>());

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setList(null);
    setError("");
    const params = new URLSearchParams({
      search: query,
      state: filter,
      page: String(page),
      pageSize: "50",
    });
    void fetch(`/api/admin/access?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 401 || response.status === 403
              ? "Your administrator session is unavailable. Sign in to Console again."
              : "Could not load entries. Try refreshing the list."
          );
        const result = (await response.json()) as AdminAccessList;
        if (controller.signal.aborted) return;
        result.rows.forEach((row) => labels.current.set(row.id, row.email));
        setList(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Could not load entries."
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filter, page, query, reload]);

  async function selectMatching() {
    if (selectionLock.current || mutationLock.current) return;
    selectionLock.current = true;
    setSelecting(true);
    setError("");
    // Capture filters now. The returned IDs remain fixed as filters/pages change.
    const params = new URLSearchParams({ search: query, state: filter });
    try {
      const response = await fetch(`/api/admin/access/selection?${params}`, {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          "Could not freeze this selection. Nothing was changed."
        );
      const result = (await response.json()) as {
        signupIds: string[];
        total: number;
      };
      if (
        !Array.isArray(result.signupIds) ||
        result.signupIds.some((id) => typeof id !== "string") ||
        result.signupIds.length !== result.total
      )
        throw new Error(
          "The selection response was incomplete. Nothing was changed."
        );
      setSelected(new Set(result.signupIds));
      setSelectionScope(JSON.stringify([filter, query]));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Selection failed.");
    } finally {
      selectionLock.current = false;
      setSelecting(false);
    }
  }

  function propose(action: AccessAction) {
    if (selected.size && !mutationLock.current)
      setConfirmation(freezeAccessRequests(selected, action));
  }

  async function execute(
    requests: BulkAccessRequest[],
    previous: BulkAccessOutcome[] = []
  ) {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setWorking(true);
    setConfirmation(null);
    setBatch(requests);
    setError("");
    const merged = new Map(previous.map((item) => [item.signupId, item]));
    try {
      for (const request of retryableRequests(requests, previous)) {
        let next: BulkAccessOutcome[];
        try {
          const response = await fetch("/api/admin/access", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          });
          next = response.ok
            ? normalizeOutcomes(request, await response.json())
            : request.signupIds.map((signupId) => ({
                signupId,
                outcome: "failed",
                code: `http_${response.status}`,
              }));
        } catch {
          next = request.signupIds.map((signupId) => ({
            signupId,
            outcome: "failed",
            code: "network_error",
          }));
        }
        // A failed retry must not obscure a previously committed per-record success.
        for (const item of next) {
          const old = merged.get(item.signupId);
          if (!old || old.outcome === "failed" || item.outcome !== "failed")
            merged.set(item.signupId, item);
        }
        setOutcomes([...merged.values()]);
      }
    } finally {
      mutationLock.current = false;
      setWorking(false);
      setReload((value) => value + 1);
    }
  }

  async function exportSelected() {
    if (exportLock.current || !selected.size) return;
    exportLock.current = true;
    setExporting(true);
    setError("");
    const ids = [...selected];
    try {
      const rows: SelectionExportRow[] = [];
      for (let offset = 0; offset < ids.length; offset += 500) {
        const chunk = ids.slice(offset, offset + 500);
        const response = await fetch("/api/admin/access/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signupIds: chunk }),
        });
        if (!response.ok)
          throw new Error("Could not export the selection. Please try again.");
        const result = await response.json();
        if (
          !Array.isArray(result.rows) ||
          result.rows.length !== chunk.length ||
          result.rows.some(
            (row: SelectionExportRow) =>
              typeof row.email !== "string" || typeof row.joinedAt !== "string"
          )
        )
          throw new Error("The export was incomplete. Nothing was downloaded.");
        rows.push(...result.rows);
      }
      const url = URL.createObjectURL(
        new Blob([selectionCsv(rows)], { type: "text/csv;charset=utf-8" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "livepeer-selected-emails.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed.");
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  }

  const locked = working || selecting || exporting || !!batch || !!confirmation;
  const allMatchingSelected =
    selected.size > 0 && selectionScope === JSON.stringify([filter, query]);
  const failed = outcomes.filter((item) => item.outcome === "failed").length;
  const pages = Math.max(1, Math.ceil((list?.total ?? 0) / 50));

  return (
    <section className="mt-10" aria-label="Console access">
      <SectionHeader
        variant="default"
        title="Console access"
        className="mb-4 flex flex-wrap items-end justify-between gap-3"
        action={
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setQuery(search.trim());
              setPage(1);
            }}
          >
            <div className="flex h-[26px] w-[240px] max-w-full items-center gap-1.5 rounded-[4px] border border-hairline bg-dark px-2.5 focus-within:ring-1 focus-within:ring-green-bright/30">
              <Search
                className="h-3 w-3 shrink-0 text-fg-faint"
                aria-hidden="true"
              />
              <input
                aria-label="Search by email"
                placeholder="Search by email…"
                className="min-w-0 flex-1 bg-transparent text-[11.5px] text-fg-strong placeholder:text-fg-faint outline-none"
                value={search}
                disabled={working || selecting}
                onChange={(event) => setSearch(event.target.value)}
              />
              <button type="submit" className="sr-only">
                Search
              </button>
            </div>
          </form>
        }
      />
      <div
        className="flex flex-wrap items-center gap-5 border-b border-hairline"
        role="group"
        aria-label="Access status"
      >
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            disabled={locked}
            onClick={() => {
              if (filter === item.value) return;
              setFilter(item.value);
              setSelected(new Set());
              setSelectionScope(null);
              setPage(1);
            }}
            className={`-mb-px inline-grid shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40 ${filter === item.value ? "border-foreground font-medium text-fg-strong" : "border-transparent text-fg-faint hover:text-fg"}`}
          >
            {/* Reserve the selected weight's width without duplicating its accessible label. */}
            <span
              aria-hidden="true"
              className="invisible col-start-1 row-start-1 whitespace-nowrap font-medium"
            >
              {item.label}
            </span>
            <span className="col-start-1 row-start-1 whitespace-nowrap">
              {item.label}
            </span>
          </button>
        ))}
      </div>
      <div
        className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr] sm:gap-3"
        data-testid="selection-toolbar"
      >
        <div className="flex h-12 items-center gap-2">
          <label className="mr-2 flex items-center gap-2 text-[12px] text-fg-muted">
            <SelectionCheckbox
              checked={allMatchingSelected}
              indeterminate={selected.size > 0 && !allMatchingSelected}
              disabled={locked || loading || !list?.total}
              onChange={(event) => {
                if (event.target.checked) void selectMatching();
                else {
                  setSelected(new Set());
                  setSelectionScope(null);
                }
              }}
            />
            {selecting ? "Selecting…" : "Select all"}
          </label>
          <span className="sr-only" role="status">
            {selected.size} selected
          </span>
        </div>
        <div
          className="ml-auto flex h-12 items-center justify-end gap-2"
          role="group"
          aria-label="Selection actions"
        >
          {!!selected.size && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-[4px] border border-hairline px-1.5 py-0.5 text-[11.5px] text-fg-muted transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Clear selection"
              title="Clear selection"
              disabled={locked}
              onClick={() => {
                setSelected(new Set());
                setSelectionScope(null);
              }}
            >
              <span>{selected.size} selected</span>
              <X className="size-3" aria-hidden="true" />
            </button>
          )}
          {!!selected.size && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 rounded-sm px-4"
              aria-label={exporting ? "Exporting CSV" : "Export CSV"}
              disabled={locked}
              onClick={() => void exportSelected()}
            >
              <ArrowDownToLine className="size-4" aria-hidden="true" />
              {exporting ? "Exporting…" : ".csv"}
            </Button>
          )}
          {filter === "approved" && !!selected.size && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 rounded-sm px-4"
              disabled={locked || !selected.size}
              onClick={() => propose("revoke")}
            >
              Revoke selected
            </Button>
          )}
          {filter === "waiting" && !!selected.size && (
            <Button
              type="button"
              size="lg"
              className="h-12 rounded-sm px-4"
              disabled={locked || !selected.size}
              onClick={() => propose("approve")}
            >
              Allow
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p className="mt-4 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
      <div
        className="-mx-5 mt-4 overflow-x-auto sm:-mx-7"
        style={{ overscrollBehaviorY: "auto", overscrollBehaviorX: "contain" }}
        aria-busy={loading}
      >
        <table
          aria-label="Access entries"
          className="w-full min-w-[360px] text-left text-[12.5px]"
        >
          <colgroup>
            <col className="w-12" />
            <col />
            <col />
          </colgroup>
          <thead className="sr-only">
            <tr>
              <th scope="col">Selection</th>
              <th scope="col">Email</th>
              <th scope="col">Joined</th>
            </tr>
          </thead>
          <tbody>
            {list?.rows.map((row) => (
              <tr
                key={row.id}
                data-selected={selected.has(row.id)}
                className="transition-colors hover:bg-hover"
              >
                <td className="py-2.5 pl-5 pr-3 sm:pl-7">
                  <SelectionCheckbox
                    aria-label={`Select ${row.email}`}
                    checked={selected.has(row.id)}
                    disabled={locked}
                    onChange={(event) => {
                      setSelectionScope(null);
                      setSelected((old) =>
                        toggleSelection(old, [row.id], event.target.checked)
                      );
                    }}
                  />
                </td>
                <td className="px-3 py-2.5 font-medium text-fg-strong">
                  {row.email}
                </td>
                <td className="whitespace-nowrap py-2.5 pl-3 pr-5 text-right text-fg-faint tabular-nums sm:pr-7">
                  {new Date(row.joinedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {(!list || !list.rows.length) && (
              <tr>
                <td className="p-6 text-fg-muted" colSpan={3}>
                  {loading
                    ? "Loading entries…"
                    : error
                      ? "Entries unavailable."
                      : "No matching entries."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center gap-4 text-[11.5px] text-fg-muted">
        <button
          type="button"
          className={control}
          disabled={working || selecting || loading || page <= 1}
          onClick={() => setPage((value) => value - 1)}
        >
          Previous
        </button>
        <span>
          Page {page} of {pages} · {list?.total ?? 0} entries
        </span>
        <button
          type="button"
          className={control}
          disabled={working || selecting || loading || page >= pages}
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </button>
      </div>
      {batch && (
        <section
          className="mt-6 rounded border border-hairline p-4"
          aria-label="Bulk action results"
        >
          <p role="status">
            {working ? "Processing selection…" : "Selection processed."}{" "}
            {outcomes.length} of{" "}
            {batch.reduce(
              (total, request) => total + request.signupIds.length,
              0
            )}{" "}
            outcomes recorded; {failed} need retry.
          </p>
          <p className="mt-2 text-xs text-fg-muted">
            Retries reuse the original request IDs. Already completed approvals
            do not send another invitation.
          </p>
          <div className="my-3 flex gap-3">
            <button
              type="button"
              className={control}
              disabled={working || !failed}
              onClick={() => void execute(batch, outcomes)}
            >
              Retry failed records
            </button>
            <button
              type="button"
              className={control}
              disabled={working}
              onClick={() => {
                setBatch(null);
                setOutcomes([]);
                setSelected(new Set());
              }}
            >
              Start another selection
            </button>
          </div>
          <details>
            <summary className="cursor-pointer">
              Per-record outcomes and request IDs
            </summary>
            <ul className="mt-3 max-h-72 overflow-auto text-xs">
              {outcomes.map((item) => (
                <li className="py-1" key={item.signupId}>
                  {labels.current.get(item.signupId) ?? item.signupId}:{" "}
                  {item.outcome}
                  {item.code ? ` (${item.code})` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-3 break-all text-xs text-fg-faint">
              Requests: {batch.map((request) => request.requestId).join(", ")}
            </p>
          </details>
        </section>
      )}
      <Dialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-auto">
          <DialogTitle>
            {confirmation?.[0]?.action === "approve" ? "Approve" : "Revoke"}{" "}
            {confirmation?.reduce(
              (total, request) => total + request.signupIds.length,
              0
            )}{" "}
            selected entries?
          </DialogTitle>
          <DialogDescription>
            This is a frozen selection of record IDs, not a live filter.
            Approval invitations are transactional. Revocation blocks subsequent
            protected requests; it does not cancel running external jobs.
          </DialogDescription>
          <details>
            <summary className="cursor-pointer">
              Review exact selected records
            </summary>
            <ul className="mt-3 max-h-52 overflow-auto text-xs">
              {confirmation
                ?.flatMap((request) => request.signupIds)
                .map((id) => (
                  <li key={id} className="py-1 break-all">
                    {labels.current.get(id)
                      ? `${labels.current.get(id)} · `
                      : ""}
                    {id}
                  </li>
                ))}
            </ul>
          </details>
          <div className="flex gap-3">
            <button
              type="button"
              className={control}
              onClick={() => setConfirmation(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={control}
              onClick={() => {
                if (confirmation) void execute(confirmation);
              }}
            >
              Confirm {confirmation?.[0]?.action}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
