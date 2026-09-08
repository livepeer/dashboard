"use client";

import Link from "next/link";
import { useAuth } from "@/components/console/AuthContext";
import {
  SESSION_USAGE_OPTIONS,
  useAccountUsage,
} from "@/lib/console/useAccountUsage";
import { microsToUsd } from "@/lib/console/usage-capability-display";
import { includedUsageSummaryFromBalance } from "@/lib/console/wallet-settlement-display";

/**
 * Sidebar balance meter. It shows the remaining balance against the amount
 * issued for the current plan period.
 */
export default function SidebarUsageCard() {
  const { isConnected } = useAuth();
  const usage = useAccountUsage(isConnected, SESSION_USAGE_OPTIONS);
  const included =
    usage.status === "ready"
      ? includedUsageSummaryFromBalance(usage.data.balance)
      : null;

  if (!isConnected) return null;

  if (usage.status === "loading" || usage.status === "idle") {
    return (
      <div
        className="mx-1 mt-2 block animate-pulse rounded-md border border-subtle bg-sidebar-card-bg px-2.5 py-2"
        aria-hidden="true"
      >
        <div className="h-3 w-24 rounded bg-tint" />
        <div className="mt-2 h-3 w-28 rounded bg-tint" />
        <div className="mt-2 h-1 rounded bg-tint" />
      </div>
    );
  }

  if (usage.status === "error") {
    return (
      <Link
        href="/home"
        title="Open usage details"
        className="mx-1 mt-2 block rounded-md border border-subtle bg-sidebar-card-bg px-2.5 py-2 transition-colors hover:bg-sidebar-card-bg-hover"
      >
        <span className="font-mono text-[10.5px] text-fg-faint">
          Balance unavailable
        </span>
      </Link>
    );
  }

  if (usage.status !== "ready") return null;

  const remainingUsd = included
    ? microsToUsd(included.remainingUsdMicros)
    : microsToUsd(usage.data.balance?.balanceUsdMicros ?? "0");
  const issuedUsd = included
    ? microsToUsd(included.totalUsdMicros)
    : Math.max(
        remainingUsd,
        microsToUsd(usage.data.balance?.lifetimeGrantedUsdMicros ?? "0")
      );

  const pct =
    issuedUsd > 0 ? Math.min(100, (remainingUsd / issuedUsd) * 100) : 0;
  const canSpend = usage.data.balance?.hasAccess ?? remainingUsd > 0;

  return (
    <Link
      href="/home"
      title="Open usage details"
      aria-label={`Balance: $${remainingUsd.toFixed(2)} remaining of $${issuedUsd.toFixed(2)} issued`}
      className="mx-1 mt-2 block rounded-md border border-subtle bg-sidebar-card-bg px-2.5 py-2.5 transition-colors hover:bg-sidebar-card-bg-hover"
    >
      <p className="text-[16px] font-medium leading-none text-fg">
        ${issuedUsd.toFixed(2)}{" "}
        <span className="text-[12.5px] font-normal text-fg-faint">
          / ${remainingUsd.toFixed(2)} remaining
        </span>
      </p>
      <div
        className="mt-2.5 h-1 overflow-hidden rounded-[2px] bg-tint"
        aria-hidden="true"
      >
        <div
          className={`h-full rounded-[2px] ${
            canSpend ? "bg-gradient-to-r from-green to-green-bright" : "bg-warm"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  );
}
