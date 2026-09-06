"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { formatCallMetric } from "@/lib/console/utils";
import Tooltip from "@/components/design-system/Tooltip";
import {
  mediaSpecForRow,
  STATUS_LABEL,
  type MediaSpec,
} from "@/lib/console/activity-media";
import type { AccountActivityRow } from "@/lib/console/types";
import { mediaRetentionNotice } from "@/lib/console/media-retention";
import type { RunDetail } from "@/lib/runs/types";
import { requestFeeDisplay } from "@/lib/console/request-fee-display";

function safeMediaUrl(value: string | undefined): string | undefined {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-4 border-b border-hairline py-3 text-sm">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-fg">{children}</dd>
    </div>
  );
}

function CapabilityChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-[5px] bg-foreground/5 px-2 py-0.5 text-sm text-fg">
      <span className="truncate">{children}</span>
    </span>
  );
}

function EmptyOutput() {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-fg-muted">
      No output stored for this job
    </div>
  );
}

function PreviewLoader() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      aria-busy="true"
      aria-label="Loading preview"
    >
      <span
        className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70 motion-reduce:animate-none"
        aria-hidden="true"
      />
    </div>
  );
}

function ImagePreview({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-fg-muted">
        Preview unavailable
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {!loaded && <PreviewLoader />}
      <img
        src={src}
        alt={title}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`h-full w-full object-contain object-top lg:object-center ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

function VideoPreview({ src }: { src?: string }) {
  if (!src) return <EmptyOutput />;
  return (
    <video
      src={src}
      controls
      playsInline
      className="h-full w-full bg-background object-contain"
    />
  );
}

function AudioPreview({ src }: { src?: string }) {
  if (!src) return <EmptyOutput />;
  return (
    <div className="flex w-full max-w-3xl flex-col gap-5 rounded-[6px] bg-black/20 px-8 py-7">
      <audio src={src} controls className="w-full" />
    </div>
  );
}

function TextPreview({ text }: { text: string }) {
  return (
    <pre className="max-h-full w-full max-w-3xl overflow-auto whitespace-pre-wrap rounded-[6px] bg-foreground/3 p-6 text-left text-sm leading-6 text-fg">
      {text}
    </pre>
  );
}

function JsonPreview({ value }: { value: unknown }) {
  return (
    <pre className="max-h-full w-full max-w-3xl overflow-auto whitespace-pre-wrap rounded-[6px] bg-foreground/3 p-6 text-left font-mono text-xs leading-6 text-fg">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function MediaStage({ media }: { media: MediaSpec }) {
  const retentionNotice = mediaRetentionNotice(
    media.imageUrl ?? media.videoUrl ?? media.audioUrl
  );
  return (
    <div className="relative flex aspect-video w-full min-h-0 min-w-0 items-start justify-center overflow-auto bg-background lg:aspect-auto lg:h-full lg:items-center">
      {media.kind === "image" &&
        (media.imageUrl ? (
          <ImagePreview src={media.imageUrl} title={media.title} />
        ) : (
          <EmptyOutput />
        ))}
      {media.kind === "video" && <VideoPreview src={media.videoUrl} />}
      {media.kind === "audio" && <AudioPreview src={media.audioUrl} />}
      {media.kind === "text" &&
        (media.text ? <TextPreview text={media.text} /> : <EmptyOutput />)}
      {media.kind === "json" && <JsonPreview value={media.json} />}
      {retentionNotice && (
        <p className="absolute bottom-3 left-3 right-3 rounded-md bg-background/90 px-3 py-2 text-center text-xs text-muted-foreground">
          {retentionNotice}
        </p>
      )}
    </div>
  );
}

function canScrollWithin(target: EventTarget, deltaY: number): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const scrollTarget = target.closest<HTMLElement>("[data-detail-scroll]");
  if (!scrollTarget) return false;
  if (scrollTarget.scrollHeight <= scrollTarget.clientHeight) return false;

  if (deltaY > 0) {
    return (
      scrollTarget.scrollTop + scrollTarget.clientHeight <
      scrollTarget.scrollHeight - 1
    );
  }

  return scrollTarget.scrollTop > 0;
}

function HistoryEntryRail({
  rows,
  activeId,
  onSelect,
}: {
  rows: AccountActivityRow[];
  activeId: string;
  onSelect?: (row: AccountActivityRow) => void;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeId, rows.length]);

  if (!onSelect || rows.length <= 1) return null;

  return (
    <aside
      className="hidden h-full w-10 shrink-0 overflow-y-auto py-1 lg:block"
      aria-label="History entries"
    >
      <div className="flex min-h-full flex-col items-end gap-px">
        {rows.map((entry, index) => {
          const active = entry.id === activeId;
          return (
            <button
              key={entry.id}
              ref={active ? activeRef : undefined}
              type="button"
              onClick={() => onSelect(entry)}
              aria-label={`Open history entry ${index + 1}`}
              aria-current={active ? "true" : undefined}
              title={`${entry.model} ${entry.costDisplay}`}
              className="group grid h-3 w-9 shrink-0 place-items-center justify-items-end rounded-[3px] focus:outline-none"
            >
              <span
                className={`h-0.5 rounded-full transition-all ${
                  active
                    ? "w-7 bg-white"
                    : "w-5 bg-white/40 group-hover:w-6 group-hover:bg-white/70"
                }`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export default function CallDetailDrawer({
  row,
  rows = [],
  open,
  onClose,
  onSelectRow,
  detail,
  detailLoading = false,
  detailError,
  onRetryDetail,
}: {
  row: AccountActivityRow | null;
  rows?: AccountActivityRow[];
  open: boolean;
  onClose: () => void;
  onSelectRow?: (row: AccountActivityRow) => void;
  detail?: RunDetail | null;
  detailLoading?: boolean;
  detailError?: string | null;
  onRetryDetail?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const wheelDeltaRef = useRef(0);
  const lastWheelNavigationRef = useRef(0);
  const [selectedAsset, setSelectedAsset] = useState<{
    runId: string;
    id: string;
  } | null>(null);
  const activeDetail = detail?.id === row?.id ? detail : null;
  const asset =
    activeDetail?.assets.find(
      (item) =>
        selectedAsset &&
        selectedAsset.runId === row?.id &&
        item.id === selectedAsset.id
    ) ?? activeDetail?.assets[0];
  let media = row
    ? mediaSpecForRow({
        ...row,
        status: asset ? "unknown" : row.status,
        outputUrl: safeMediaUrl(asset?.url ?? row.outputUrl),
      })
    : null;
  if (row && activeDetail && !asset) {
    media = {
      kind: "json",
      title: `${row.model} result`,
      label: "Result",
      format: "JSON",
      metricLabel: "Output",
      metricValue: activeDetail.result ? "Recorded" : "Not available",
      source: row.signerLabel,
      json:
        activeDetail.result ??
        (activeDetail.errorCode
          ? {
              error: activeDetail.errorCode,
              message: activeDetail.errorMessage,
            }
          : { status: activeDetail.status, result: null }),
    };
  }

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      previousActiveRef.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() =>
        panelRef.current?.focus({ preventScroll: true })
      );
    } else if (previousActiveRef.current) {
      previousActiveRef.current.focus?.({ preventScroll: true });
      previousActiveRef.current = null;
    }
  }, [open]);

  const selectAdjacentRow = useCallback(
    (offset: number) => {
      if (!row || !onSelectRow || rows.length <= 1) return;
      const currentIndex = rows.findIndex((entry) => entry.id === row.id);
      if (currentIndex === -1) return;

      const nextIndex = Math.max(
        0,
        Math.min(rows.length - 1, currentIndex + offset)
      );
      if (nextIndex === currentIndex) return;

      const nextRow = rows[nextIndex];
      if (nextRow) onSelectRow(nextRow);
    },
    [onSelectRow, row, rows]
  );

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (
      !onSelectRow ||
      rows.length <= 1 ||
      window.matchMedia("(max-width: 1023px)").matches ||
      canScrollWithin(event.target, event.deltaY)
    ) {
      return;
    }

    event.preventDefault();
    wheelDeltaRef.current += event.deltaY;
    if (Math.abs(wheelDeltaRef.current) < 28) return;

    const now = performance.now();
    if (now - lastWheelNavigationRef.current < 90) return;

    lastWheelNavigationRef.current = now;
    selectAdjacentRow(wheelDeltaRef.current > 0 ? 1 : -1);
    wheelDeltaRef.current = 0;
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black p-3 pt-14 transition-opacity duration-200 sm:p-6 sm:pt-16 ${
        open ? "visible opacity-100" : "invisible opacity-0"
      }`}
      aria-hidden={!open}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close detail"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-transparent"
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute left-1/2 top-3 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 text-sm font-medium text-white transition-colors hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:top-4"
      >
        <span aria-hidden="true">&larr;</span>
        Return to dashboard
      </button>

      {row && media && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${row.model} detail`}
          tabIndex={-1}
          onWheel={handleWheel}
          className={`relative z-10 flex max-h-[calc(100dvh-68px)] w-[min(1240px,calc(100vw-32px))] items-stretch gap-3 overflow-y-auto outline-none transition-[opacity,transform] duration-200 ease-out sm:max-h-[calc(100dvh-96px)] lg:h-[calc(100dvh-96px)] lg:max-h-[760px] lg:overflow-visible ${
            open ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"
          }`}
        >
          <div className="grid h-auto min-w-0 flex-1 grid-rows-[auto_auto] overflow-hidden rounded-sm bg-background shadow-2xl shadow-black/55 lg:h-full lg:grid-cols-[minmax(0,1fr)_350px] lg:grid-rows-none">
            <MediaStage key={row.id} media={media} />

            <aside className="flex min-h-0 flex-col border-t border-hairline bg-background lg:border-l lg:border-t-0">
              <dl
                className="min-h-0 overflow-y-auto px-5 py-5"
                data-detail-scroll
              >
                <DetailRow label="Capability">
                  <CapabilityChip>{row.model}</CapabilityChip>
                </DetailRow>
                <DetailRow label="Modality">
                  <CapabilityChip>{row.modality}</CapabilityChip>
                </DetailRow>
                <DetailRow label="Job">
                  <span className="font-mono text-[13px] tabular-nums">
                    {row.gatewayRequestId ?? row.id}
                  </span>
                </DetailRow>
                {row.providerRequestId ? (
                  <DetailRow label="Request">
                    <span className="font-mono text-[13px] tabular-nums">
                      {row.providerRequestId}
                    </span>
                  </DetailRow>
                ) : null}
                <DetailRow label="Format">{media.format}</DetailRow>
                <DetailRow label={media.metricLabel}>
                  {media.metricValue}
                </DetailRow>
                <DetailRow label="Source">{media.source}</DetailRow>
                <DetailRow label="Status">{STATUS_LABEL[row.status]}</DetailRow>
                <DetailRow label={row.kind === "live" ? "Duration" : "Latency"}>
                  {formatCallMetric(row)}
                </DetailRow>
                <DetailRow label="Cost">
                  {row.costExact && row.costExact !== row.costDisplay ? (
                    <Tooltip
                      content={
                        <span className="font-mono tabular-nums">
                          {row.costExact}
                        </span>
                      }
                      side="left"
                    >
                      <span className="cursor-help font-mono tabular-nums">
                        {row.costDisplay}
                      </span>
                    </Tooltip>
                  ) : (
                    row.costDisplay
                  )}
                </DetailRow>
                <DetailRow label="Time">
                  {formatTimestamp(row.timestamp)}
                </DetailRow>
                {row.recordKind === "usage" && (
                  <p className="mt-4 text-xs text-fg-muted">
                    Usage-only record. Execution outcome and submitted arguments
                    were not captured.
                  </p>
                )}
                {detailLoading && (
                  <p role="status" className="mt-4 text-xs text-fg-muted">
                    Loading run details…
                  </p>
                )}
                {detailError && (
                  <p role="alert" className="mt-4 text-xs text-fg-muted">
                    {detailError}{" "}
                    <button
                      type="button"
                      onClick={onRetryDetail}
                      className="underline"
                    >
                      Retry
                    </button>
                  </p>
                )}
                {activeDetail && (
                  <>
                    <DetailRow label="Run">
                      <span className="break-all font-mono text-xs">
                        {activeDetail.id}
                      </span>
                    </DetailRow>
                    {activeDetail.assets.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs text-fg-muted">Assets</p>
                        {activeDetail.assets.map((item, index) => (
                          <div
                            key={item.id}
                            className="flex flex-wrap items-center gap-2 text-xs"
                          >
                            <button
                              type="button"
                              aria-pressed={asset?.id === item.id}
                              onClick={() =>
                                setSelectedAsset({
                                  runId: activeDetail.id,
                                  id: item.id,
                                })
                              }
                              className="rounded bg-foreground/3 px-2 py-1"
                            >
                              Output {index + 1}
                            </button>
                            {safeMediaUrl(item.url) && (
                              <a
                                href={safeMediaUrl(item.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline"
                              >
                                Open media
                              </a>
                            )}
                            {item.hiddenAt && (
                              <span className="text-fg-muted">
                                Hidden from library
                              </span>
                            )}
                          </div>
                        ))}
                        {asset?.expiresAt && (
                          <p className="text-xs text-fg-muted">
                            Provider expiry: {formatTimestamp(asset.expiresAt)}
                          </p>
                        )}
                        {asset?.unavailableAt && (
                          <p className="text-xs text-fg-muted">
                            Media unavailable; reference retained.
                          </p>
                        )}
                      </div>
                    )}
                    {activeDetail.events.some(
                      (event) => event.metadata.kind === "billing_usage"
                    ) && (
                      <details className="mt-5 text-xs" open>
                        <summary className="cursor-pointer font-medium">
                          Observed usage
                        </summary>
                        <p className="mt-2 text-fg-muted">
                          Billing receipts matched by gateway ID, not additional
                          executions. These may not represent the final total.
                        </p>
                        <ul className="mt-2 space-y-2">
                          {activeDetail.events
                            .filter(
                              (event) => event.metadata.kind === "billing_usage"
                            )
                            .map((event) => (
                              <li key={event.id} className="break-all">
                                {typeof event.metadata.networkFeeUsdMicros ===
                                "string"
                                  ? requestFeeDisplay({
                                      networkFeeUsdMicros:
                                        event.metadata.networkFeeUsdMicros,
                                      feeWei:
                                        typeof event.metadata.feeWei ===
                                        "string"
                                          ? event.metadata.feeWei
                                          : undefined,
                                      ethUsdPrice:
                                        typeof event.metadata.ethUsdPrice ===
                                        "string"
                                          ? event.metadata.ethUsdPrice
                                          : undefined,
                                    }).exact
                                  : "Amount unavailable"}{" "}
                                · {formatTimestamp(event.createdAt)}
                              </li>
                            ))}
                        </ul>
                      </details>
                    )}
                    <details className="mt-5 text-xs" open>
                      <summary className="cursor-pointer font-medium">
                        Submitted JSON
                      </summary>
                      <JsonPreview
                        value={
                          activeDetail.submittedArguments ?? {
                            capture: "not_available",
                          }
                        }
                      />
                    </details>
                    {activeDetail.captureRedactedPaths.length > 0 && (
                      <p className="mt-2 break-words text-xs text-fg-muted">
                        Redacted or omitted:{" "}
                        {activeDetail.captureRedactedPaths.join(", ")}
                      </p>
                    )}
                    <details className="mt-5 text-xs">
                      <summary className="cursor-pointer font-medium">
                        Returned JSON
                      </summary>
                      <JsonPreview
                        value={
                          activeDetail.result ?? { capture: "not_available" }
                        }
                      />
                    </details>
                    {activeDetail.errorCode && (
                      <p className="mt-4 break-words text-xs text-fg-muted">
                        {activeDetail.errorCode}
                        {activeDetail.errorMessage
                          ? `: ${activeDetail.errorMessage}`
                          : ""}
                      </p>
                    )}
                    <details className="mt-5 text-xs">
                      <summary className="cursor-pointer font-medium">
                        Run timeline
                      </summary>
                      <ol className="mt-2 space-y-2">
                        {activeDetail.events.map((event) => (
                          <li key={event.id}>
                            {event.metadata.kind === "billing_usage"
                              ? "Usage receipt recorded"
                              : event.status}{" "}
                            · {formatTimestamp(event.createdAt)}
                          </li>
                        ))}
                      </ol>
                    </details>
                  </>
                )}
              </dl>
            </aside>
          </div>
          <HistoryEntryRail
            rows={rows}
            activeId={row.id}
            onSelect={onSelectRow}
          />
        </div>
      )}
    </div>,
    document.body
  );
}
