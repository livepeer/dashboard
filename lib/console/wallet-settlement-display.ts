import type { BillingState, BillingStatus } from "@pymthouse/builder-sdk";
import type { AccountUsageBalance } from "./account-usage";
import { microsToUsd } from "./usage-capability-display";

type IncludedUsageFunding = {
  total: { usdMicros: string; usd: string };
  remaining: { usdMicros: string; usd: string };
  consumed: { usdMicros: string; usd: string };
  resetsAt?: string;
  sourcePlan?: {
    id: string | null;
    name: string | null;
    type: string | null;
  } | null;
};

/** Wallet payloads include this; builder-sdk 0.6.x types omit it. */
export type BillingStateWithIncluded = BillingState & {
  funding: BillingState["funding"] & {
    includedUsage?: IncludedUsageFunding;
  };
};

function asIncludedState(state: BillingState): BillingStateWithIncluded {
  return state as BillingStateWithIncluded;
}

/** Wallet strip amounts: always two decimals (matches prepaid `$0.00`). */
export function formatWalletUsd(micros: string | null | undefined): string {
  if (!micros?.trim()) return "0.00";
  return microsToUsd(micros).toFixed(2);
}

function parseUsdMicros(raw: string | null | undefined): bigint {
  const trimmed = raw?.trim();
  if (!trimmed || !/^-?\d+$/.test(trimmed)) return BigInt(0);
  try {
    return BigInt(trimmed);
  } catch {
    return BigInt(0);
  }
}

/** Signed wallet dollars with an explicit minus (`-$1.25` / `$0.00`). */
export function formatSignedWalletUsd(micros: bigint): string {
  const negative = micros < BigInt(0);
  const abs = negative ? -micros : micros;
  const formatted = formatWalletUsd(abs.toString());
  return negative ? `-$${formatted}` : `$${formatted}`;
}

export type SpendPostureTone = "ok" | "info" | "warn" | "danger";

/**
 * Short badge for the spend posture. The long-form copy comes from
 * `billingState.explain`, which the API owns so every surface says the same
 * thing; the dashboard only picks the label and the colour.
 */
export function spendPostureBadge(status: BillingStatus): {
  label: string;
  tone: SpendPostureTone;
} {
  switch (status) {
    case "active":
      return { label: "Credits", tone: "ok" };
    case "overage":
      return { label: "Pay as you go", tone: "info" };
    case "at_risk":
      return { label: "Collecting payment", tone: "warn" };
    case "blocked":
      return { label: "Paused", tone: "danger" };
  }
}

export type AvailableRunway = {
  usdMicros: string;
  /** Display with `$` / `-$`. */
  usd: string;
  tone: SpendPostureTone;
  /** Breakdown under the big number, or null when both sides are zero. */
  detail: string | null;
};

/**
 * Signed runway for the Available figure.
 *
 * While prepaid/included remain, runway is spendable — gathering invoice
 * totals can still list prepaid-covered usage under credit_then_invoice and
 * must not be subtracted again. Once spendable is exhausted, runway is the
 * negative of unbilled overage debt.
 */
export function availableRunway(state: BillingState): AvailableRunway {
  const funding = asIncludedState(state).funding;
  const included = parseUsdMicros(
    funding.includedUsage?.remaining.usdMicros ?? funding.included.usdMicros,
  );
  const prepaid = parseUsdMicros(state.funding.prepaid.usdMicros);
  const spendable = parseUsdMicros(state.funding.spendable.usdMicros);
  const debt = parseUsdMicros(state.funding.overage.unbilledDebt?.usdMicros);
  const available = spendable > BigInt(0) ? spendable : -debt;

  let tone: SpendPostureTone = "ok";
  if (available < BigInt(0)) {
    if (state.status === "blocked") tone = "danger";
    else if (state.status === "at_risk") tone = "warn";
    else tone = "info";
  }

  let detail: string | null = null;
  if (available < BigInt(0)) {
    detail = `Unbilled $${formatWalletUsd(debt.toString())}`;
  } else {
    const parts: string[] = [];
    if (included > BigInt(0)) {
      const planName = funding.includedUsage?.sourcePlan?.name?.trim();
      parts.push(
        planName
          ? `${planName} included $${formatWalletUsd(included.toString())}`
          : `Included $${formatWalletUsd(included.toString())}`,
      );
    }
    if (prepaid > BigInt(0)) {
      parts.push(`Credits $${formatWalletUsd(prepaid.toString())}`);
    }
    detail = parts.length > 0 ? parts.join(" · ") : null;
  }

  return {
    usdMicros: available.toString(),
    usd: formatSignedWalletUsd(available),
    tone,
    detail,
  };
}

/**
 * Small footnote for the soft overage ceiling. Null when unlimited (ceiling 0).
 */
export function overageLimitNote(state: BillingState): string | null {
  const ceiling = state.funding.overage.ceiling;
  if (!ceiling?.usdMicros || ceiling.usdMicros === "0") return null;
  if (state.status === "blocked") return "Overage limit reached";
  const remaining = state.funding.overage.remaining;
  if (remaining && remaining.usdMicros !== "0") {
    return `Overage limit $${ceiling.usd} · $${remaining.usd} left`;
  }
  return `Overage limit $${ceiling.usd}`;
}

export type IncludedUsageSummary = {
  remainingUsdMicros: string;
  totalUsdMicros: string;
  consumedUsdMicros: string;
  remainingUsd: string;
  totalUsd: string;
  consumedUsd: string;
  planId: string | null;
  planName: string | null;
  resetsAt: string | null;
};

/**
 * Remaining included-usage discount for the live plan period.
 * Null when the live plan has no usage allowance (prepaid / invoice only).
 */
export function includedUsageSummary(
  state: BillingState | null | undefined,
): IncludedUsageSummary | null {
  if (!state) return null;
  const funding = asIncludedState(state).funding;
  const included = funding.includedUsage;
  const remainingUsdMicros =
    included?.remaining.usdMicros ?? funding.included.usdMicros;
  const totalUsdMicros = included?.total.usdMicros ?? remainingUsdMicros;
  const consumedUsdMicros = included?.consumed.usdMicros ?? "0";
  if (parseUsdMicros(totalUsdMicros) <= BigInt(0)) return null;

  const planName = included?.sourcePlan?.name?.trim() || null;
  const planId = included?.sourcePlan?.id?.trim() || null;
  const resetsAt = included?.resetsAt?.trim() || null;

  return {
    remainingUsdMicros,
    totalUsdMicros,
    consumedUsdMicros,
    remainingUsd: formatWalletUsd(remainingUsdMicros),
    totalUsd: formatWalletUsd(totalUsdMicros),
    consumedUsd: formatWalletUsd(consumedUsdMicros),
    planId,
    planName,
    resetsAt,
  };
}

/**
 * Session-user included allowance from `me/usage/balance`.
 * Null when the user has no granted cycle (prepaid / invoice only).
 */
export function includedUsageSummaryFromBalance(
  balance: AccountUsageBalance | null | undefined,
  sourcePlan?: { id?: string | null; name?: string | null },
): IncludedUsageSummary | null {
  if (!balance) return null;
  const remainingUsdMicros = balance.balanceUsdMicros;
  const grantedUsdMicros = balance.lifetimeGrantedUsdMicros;
  const consumedUsdMicros = balance.consumedUsdMicros;
  const totalUsdMicros =
    parseUsdMicros(grantedUsdMicros) > BigInt(0)
      ? grantedUsdMicros
      : remainingUsdMicros;
  if (parseUsdMicros(totalUsdMicros) <= BigInt(0)) return null;

  return {
    remainingUsdMicros,
    totalUsdMicros,
    consumedUsdMicros,
    remainingUsd: formatWalletUsd(remainingUsdMicros),
    totalUsd: formatWalletUsd(totalUsdMicros),
    consumedUsd: formatWalletUsd(consumedUsdMicros),
    planId: sourcePlan?.id?.trim() || null,
    planName: sourcePlan?.name?.trim() || null,
    resetsAt: null,
  };
}

export function includedUsageRemainingLabel(
  summary: IncludedUsageSummary,
): string {
  const plan = summary.planName ?? "Plan";
  return `${plan} · $${summary.remainingUsd} of $${summary.totalUsd} included left`;
}

/** When the next invoice goes out, in the customer's terms. */
export function collectionSchedule(state: BillingState): string {
  const lead = state.collection.leadThreshold;
  if (lead.usdMicros === "0") {
    return `Usage is invoiced every ${state.collection.collectionInterval.toLowerCase()}.`;
  }
  return (
    `Usage is invoiced automatically once $${lead.usd} of it has built up, ` +
    `and at least once a ${state.collection.collectionInterval.toLowerCase()}.`
  );
}
