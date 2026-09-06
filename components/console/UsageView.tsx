"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ReferralCard } from "@/components/console/ReferralCard";
import CallsSection from "@/components/console/CallsSection";
import SectionHeader from "@/components/console/SectionHeader";
import Button from "@/components/design-system/Button";
import { useAuth, type ConsoleUser } from "@/components/console/AuthContext";
import { MCP_SERVER_URL } from "@/lib/constants";
import { microsToUsd } from "@/lib/console/usage-capability-display";
import { useWalletBillingState } from "@/lib/console/useOwnerWallet";
import {
  includedUsageSummary,
  type IncludedUsageSummary,
} from "@/lib/console/wallet-settlement-display";

/**
 * Usage is balance first, then history. The user-facing controls stay out of
 * the page so the account state and request log can be read directly.
 */

function fmtUsd(n: number): string {
  return n >= 1000
    ? `$${Math.round(n).toLocaleString("en-US")}`
    : `$${n.toFixed(2)}`;
}

function SkeletonBar({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-dark-card motion-reduce:animate-none ${className}`}
      aria-hidden="true"
    />
  );
}

function UsageLoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center rounded-md border border-hairline bg-dark-lighter px-5 py-16 text-center">
      <p className="text-sm text-fg-muted">Usage didn&apos;t load.</p>
      <p className="mt-2 max-w-md font-mono text-xs text-fg-faint">{message}</p>
      <Button className="mt-6" variant="secondary" size="xs" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function referralUrlFor(user: ConsoleUser): string {
  return `${new URL(MCP_SERVER_URL).origin}?ref=${encodeURIComponent(user.id)}`;
}

function HomePromoCards({
  user,
  className = "px-3 pt-3 md:px-7 md:pt-7",
  gridClassName = "grid w-full max-w-[760px] grid-cols-2 gap-3",
}: {
  user: ConsoleUser | null;
  className?: string;
  gridClassName?: string;
}) {
  const referralUrl = user ? referralUrlFor(user) : "";

  return (
    <section className={className} aria-label="Quick actions">
      <div className={gridClassName}>
        <Link
          href="/install"
          className="group relative flex aspect-video overflow-hidden rounded-sm border border-foreground/10 p-3 text-left transition-colors hover:border-foreground/16 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label="Install Livepeer"
        >
          <img
            src="/images/console/explore/img2img-sdxl.webp"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <span
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(35,156,215,0.82)_0%,rgba(35,156,215,0.42)_30%,rgba(35,156,215,0.16)_52%,rgba(35,156,215,0)_74%)]"
            aria-hidden="true"
          />
          <span className="relative text-ui-caption font-medium text-white">
            Install Livepeer
          </span>
        </Link>

        {user && <ReferralCard referralUrl={referralUrl} />}
      </div>
    </section>
  );
}

// ─── The instrument ─────────────────────────────────────────────────────────

type Runway = {
  /** Included allowance for the cycle. */
  includedTotal: number;
  /** Included already consumed. */
  consumed: number;
  /** Prepaid credit balance. */
  credits: number;
  /** Metered overage still available, or null when overage is not eligible. */
  overage: number | null;
};

/**
 * Balance figure for the account runway: included balance, prepaid credits,
 * then metered overage.
 */
function Instrument({
  loading,
  runway,
  className = "px-3 py-16 md:px-7",
}: {
  loading: boolean;
  runway: Runway | null;
  className?: string;
}) {
  const includedLeft = runway
    ? Math.max(0, runway.includedTotal - runway.consumed)
    : 0;
  const remaining = runway
    ? includedLeft + runway.credits + (runway.overage ?? 0)
    : 0;
  const issuedTotal = runway ? runway.consumed + remaining : 0;

  const heading = (
    <SectionHeader
      variant="default"
      className="mb-3 flex flex-wrap items-end justify-between gap-3"
      title="Balance"
    />
  );

  if (loading) {
    return (
      <section className={className} aria-busy="true">
        {heading}
        <SkeletonBar className="h-12 w-56" />
      </section>
    );
  }

  return (
    <section className={className} aria-label="Balance">
      {heading}
      <div
        className="flex items-baseline gap-x-2.5 whitespace-nowrap"
        aria-label={
          runway
            ? `${fmtUsd(remaining)} remaining of ${fmtUsd(issuedTotal)} total issued`
            : undefined
        }
      >
        <p className="text-[52px] font-normal leading-none text-fg">
          {runway ? fmtUsd(remaining) : "—"}
        </p>
        {runway && (
          <p className="text-[12px] font-normal text-fg-faint">
            / {fmtUsd(issuedTotal)} remaining
          </p>
        )}
      </div>
    </section>
  );
}

// ─── The view ───────────────────────────────────────────────────────────────

export default function UsageView() {
  const { isConnected, user } = useAuth();
  const [callsQuery, setCallsQuery] = useState("");

  const walletState = useWalletBillingState(isConnected);

  const included: IncludedUsageSummary | null =
    walletState.state.status === "ready"
      ? includedUsageSummary(walletState.state.wallet.billingState)
      : null;

  const runway: Runway | null = useMemo(() => {
    if (walletState.state.status !== "ready" || !included) return null;
    const funding = walletState.state.wallet.billingState.funding;
    const overage = funding.overage;
    return {
      includedTotal: microsToUsd(included.totalUsdMicros),
      consumed: microsToUsd(included.consumedUsdMicros),
      credits: microsToUsd(walletState.state.wallet.balance?.usdMicros ?? "0"),
      overage:
        overage.eligible && overage.remaining
          ? microsToUsd(overage.remaining.usdMicros)
          : null,
    };
  }, [walletState.state, included]);

  const loading =
    walletState.state.status === "loading" ||
    walletState.state.status === "idle";

  return (
    <div className="w-full pb-20">
      {/* Intrinsic balance width determines the wrap point, not a viewport
          breakpoint. Keep top padding constant when the cards move below. */}
      <div className="mb-8 flex flex-wrap items-start gap-x-3 gap-y-8 px-3 pt-7 md:px-7">
        <Instrument
          loading={loading}
          runway={runway}
          className="min-w-max grow basis-[calc((100%_-_0.75rem)/3)]"
        />
        <HomePromoCards
          user={user}
          className="min-w-0 grow-[2] basis-[calc((100%_-_0.75rem)*2/3)]"
          gridClassName="grid w-full grid-cols-2 gap-3"
        />
      </div>

      {walletState.state.status === "error" && (
        <div className="mt-4 px-3 md:px-7">
          <UsageLoadError
            message={walletState.state.message}
            onRetry={walletState.reload}
          />
        </div>
      )}

      <div className="scroll-mt-4">
        <CallsSection query={callsQuery} onQueryChange={setCallsQuery} />
      </div>
    </div>
  );
}
