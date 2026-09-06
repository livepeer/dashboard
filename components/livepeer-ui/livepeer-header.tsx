"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { LivepeerLogo } from "@/components/brand";

export function LivepeerHeader({
  utility,
  onLogoClick,
  homeHref,
  transparent = false,
}: {
  utility: ReactNode;
  onLogoClick?: () => void;
  homeHref?: string;
  transparent?: boolean;
}) {
  const logoClassName = `relative z-10 flex shrink-0 items-center gap-3 text-current transition-colors ${transparent ? "duration-[900ms] ease-in-out" : "duration-100 ease-out"}`;

  return (
    <header
      className={`flex h-16 w-full items-center justify-between px-4 text-foreground transition-colors sm:px-6 lg:px-10 ${transparent ? "bg-transparent duration-[900ms] ease-in-out" : "bg-background duration-100"}`}
    >
      {homeHref ? (
        <Link
          href={homeHref}
          aria-label="Livepeer.org home"
          className={logoClassName}
        >
          <LivepeerLogo />
        </Link>
      ) : (
        <button
          type="button"
          onClick={onLogoClick}
          aria-label="Livepeer.org home"
          className={logoClassName}
        >
          <LivepeerLogo />
        </button>
      )}
      {utility}
    </header>
  );
}
