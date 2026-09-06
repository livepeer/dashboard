"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

export function ReferralCard({
  referralUrl,
  compact = false,
}: {
  referralUrl: string | null;
  compact?: boolean;
}) {
  async function copyReferralUrl() {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      toast("copied to clipboard");
    } catch {
      toast.error("Couldn’t copy the link. Please try again.");
    }
  }

  return (
    <button
      type="button"
      onClick={copyReferralUrl}
      disabled={!referralUrl}
      aria-label={
        referralUrl ? "Copy referral link" : "Referral link unavailable"
      }
      className={`group relative flex aspect-video ${compact ? "max-w-[280px]" : ""} w-full flex-col overflow-hidden rounded-sm border border-border bg-card p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-default`}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-black"
        aria-hidden="true"
      >
        <img
          src="/images/console/explore/nomic-embed.webp"
          alt=""
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.65),rgba(0,0,0,0.12)_42%,rgba(0,0,0,0.72))]" />
      </div>
      <p className="relative text-ui-caption font-medium text-white">
        Refer a friend
      </p>
      <div className="relative mt-auto flex min-w-0 w-full items-center gap-2 text-white">
        {referralUrl ? (
          <>
            <code
              title={referralUrl}
              dir="rtl"
              className="min-w-0 flex-1 truncate text-left font-sans text-[11.5px] leading-4"
            >
              {referralUrl}
            </code>
            <Copy className="h-3 w-3 shrink-0" aria-hidden="true" />
          </>
        ) : (
          <span className="text-xs leading-relaxed">
            Referral link temporarily unavailable.
          </span>
        )}
      </div>
    </button>
  );
}
