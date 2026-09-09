import type { AccountUsagePipelineRow } from "@/lib/console/account-usage";

/**
 * Seven validated categorical slots (see the `--color-series-*` tokens in
 * globals.css), assigned in fixed order by cost rank. Colour follows the
 * capability, never its row number, and it never cycles: the 8th capability
 * and beyond wear the neutral "other" step — past seven, another hue is
 * indistinguishable under colour-vision deficiency, so the tail is context.
 */
const CAPABILITY_COLORS = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
  "var(--color-series-4)",
  "var(--color-series-5)",
  "var(--color-series-6)",
  "var(--color-series-7)",
];
export const CAPABILITY_COLOR_OTHER = "var(--color-series-other)";

export type UsageCapabilityRow = AccountUsagePipelineRow & {
  id: string;
  name: string;
  color: string;
  spendUsd: number;
  data: number[];
  priorSum: number;
  delta: number;
};

export function humanizePipelineModel(
  pipeline: string,
  modelId: string
): string {
  const normalizedModel =
    modelId && modelId !== "*" && modelId.toLowerCase() !== "unknown"
      ? modelId
      : "";
  const segment = normalizedModel || pipeline;
  const raw = segment.includes(":")
    ? segment.split(":").slice(-1)[0]!
    : segment;
  const parts = raw.split(/[-_./|:]+/).filter(Boolean);

  // Catalog and provider namespaces are useful in canonical capability IDs,
  // but add no meaning to the model name shown to people.
  if (
    parts[0]?.toLowerCase() === "livepeer" &&
    parts[1]?.toLowerCase() === "example"
  ) {
    parts.splice(0, 2);
  }
  if (parts[0]?.toLowerCase() === "fal") {
    parts.shift();
    if (parts[0]?.toLowerCase() === "ai") parts.shift();
  }

  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function microsToUsd(micros: string): number {
  try {
    return Number(BigInt(micros)) / 1_000_000;
  } catch {
    return 0;
  }
}

/** UTC calendar dates (YYYY-MM-DD) from period start through end inclusive. */
export function utcDateKeysForPeriod(
  startIso: string,
  endIso: string
): string[] {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }
  const keys: string[] = [];
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  );
  const endDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  );
  while (cursor <= endDay) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

export function dailyRequestSeriesForPipeline(input: {
  pipeline: string;
  modelId: string;
  dayKeys: string[];
  dailyByPipeline: Array<{
    pipeline: string;
    modelId: string;
    date: string;
    requestCount: number;
  }>;
}): number[] {
  const countsByDay = new Map<string, number>();
  const key = `${input.pipeline}|${input.modelId}`;
  for (const row of input.dailyByPipeline) {
    if (`${row.pipeline}|${row.modelId}` !== key) continue;
    countsByDay.set(
      row.date,
      (countsByDay.get(row.date) ?? 0) + row.requestCount
    );
  }
  return input.dayKeys.map((day) => countsByDay.get(day) ?? 0);
}

export function buildUsageCapabilityRows(input: {
  current: AccountUsagePipelineRow[];
  prior: AccountUsagePipelineRow[];
  period: { start: string; end: string };
  dailyByPipeline?: Array<{
    pipeline: string;
    modelId: string;
    date: string;
    requestCount: number;
  }>;
}): UsageCapabilityRow[] {
  const priorByKey = new Map(
    input.prior.map((row) => [`${row.pipeline}|${row.modelId}`, row])
  );
  const dayKeys = utcDateKeysForPeriod(input.period.start, input.period.end);

  // Colour follows the capability, not its row. Slots are assigned over the
  // sorted union of this period's and the prior period's capabilities, so
  // "Daydream Video is blue" survives a 7d → 30d switch and a change in cost
  // rank. It was assigned by server order, which repainted survivors
  // whenever the set changed. Residual limit: a capability's slot can still
  // shift if a lexically earlier one appears for the first time.
  const slotByKey = new Map(
    [
      ...new Set(
        [...input.current, ...input.prior].map(
          (row) => `${row.pipeline}|${row.modelId}`
        )
      ),
    ]
      .sort()
      .map((key, slot) => [key, slot] as const)
  );

  return input.current
    .map((row) => {
      const key = `${row.pipeline}|${row.modelId}`;
      const priorRow = priorByKey.get(key);
      const priorSum = priorRow?.requestCount ?? 0;
      const delta =
        priorSum > 0
          ? ((row.requestCount - priorSum) / priorSum) * 100
          : row.requestCount > 0
            ? 100
            : 0;
      const spendUsd = microsToUsd(
        row.endUserBillableUsdMicros || row.networkFeeUsdMicros
      );
      const seriesSum = row.dailyRequests.reduce((a, b) => a + b, 0);
      const data =
        row.dailyRequests.length > 0 && seriesSum > 0
          ? row.dailyRequests
          : input.dailyByPipeline?.length && dayKeys.length > 0
            ? dailyRequestSeriesForPipeline({
                pipeline: row.pipeline,
                modelId: row.modelId,
                dayKeys,
                dailyByPipeline: input.dailyByPipeline,
              })
            : row.dailyRequests;
      return {
        ...row,
        id: key,
        name: humanizePipelineModel(row.pipeline, row.modelId),
        color:
          CAPABILITY_COLORS[slotByKey.get(key) ?? -1] ?? CAPABILITY_COLOR_OTHER,
        spendUsd,
        data,
        priorSum,
        delta,
      };
    })
    .sort((a, b) => b.requestCount - a.requestCount);
}

export function formatPeriodResetLabel(periodEndIso: string): string {
  try {
    const end = new Date(periodEndIso);
    const next = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1, 0, 0, 0, 0)
    );
    return next.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "next period";
  }
}
