import type { ReactNode } from "react";

interface SectionHeaderProps {
  /** The section title (renders as h2). */
  title: string;
  /** Optional one-line description below the title. Only shown when `variant="default"`. */
  description?: string;
  /** Optional width or typography treatment for the description. */
  descriptionClassName?: string;
  /** Optional content rendered to the right of the title — typically a "View all →" link or a control. */
  action?: ReactNode;
  /** Optional count rendered as a mono pill next to the title (mono variant only). */
  count?: number | string;
  /** Visual treatment.
   *  - `mono` (default): mono uppercase 11px label with optional count chip.
   *  - `default`: 17px title + optional description above a card. The console's
   *    dominant section pattern.
   *  - `lg`: same, one step larger. */
  variant?: "mono" | "default" | "lg";
  /** Visual size for the `default` and `lg` variants. */
  size?: "default" | "lg";
  /** Optional className for the wrapper (margin, etc.). Default `mb-3` for mono, `mb-4` otherwise. */
  className?: string;
}

/**
 * Console SectionHeader — distinct from `components/ui/SectionHeader.tsx`
 * (which is for marketing hero typography).
 *
 * Default variant per the Livepeer Console design (Apr 2026): mono-uppercase
 * 11px label with an optional count chip on the right. Pairs with the dense
 * Linear-style content blocks beneath.
 */
export default function SectionHeader({
  title,
  description,
  descriptionClassName,
  action,
  count,
  variant = "mono",
  size,
  className,
}: SectionHeaderProps) {
  if (variant === "mono") {
    // className is additive — extends the default flex layout rather than
    // replacing it, so callers can tweak margins without losing the mono row.
    return (
      <div
        className={`flex items-baseline gap-2 pt-7 pb-2.5 ${className ?? ""}`}
      >
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-fg-faint">
          {title}
        </h2>
        {count !== undefined && (
          <span className="rounded-full border border-hairline bg-dark-card px-1.5 py-0 font-mono text-[10.5px] tabular-nums text-fg-faint">
            {count}
          </span>
        )}
        <span className="flex-1" />
        {action && <span className="text-[12px] text-fg-faint">{action}</span>}
      </div>
    );
  }

  // Title + description above a card, actions on the same line. This is the
  // console's dominant section pattern (every Settings section, and now the
  // data pages) — `SettingsHeader` re-exports it under its old name.
  const effectiveSize = size ?? (variant === "lg" ? "lg" : "default");
  const titleClass =
    effectiveSize === "lg"
      ? "text-xl font-medium leading-tight tracking-[-0.01em] text-fg"
      : "text-[17px] font-medium leading-tight tracking-[-0.01em] text-fg";

  return (
    <div
      className={
        className ?? "mt-7 mb-3 flex items-end justify-between gap-3 first:mt-0"
      }
    >
      <div className="min-w-0">
        <h2 className={titleClass}>{title}</h2>
        {description && (
          <p
            className={`mt-[3px] text-[12.5px] text-fg-faint ${descriptionClassName ?? ""}`}
          >
            {description}
          </p>
        )}
      </div>
      {action && (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      )}
    </div>
  );
}
