"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { LivepeerLockup } from "@/components/design-system/LivepeerLogo";

export function AuthCard({
  children,
  label,
  showBrand = true,
}: {
  children: ReactNode;
  label: string;
  showBrand?: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-[420px] overflow-hidden rounded-sm bg-background shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--foreground)_8%,transparent)]"
      aria-label={label}
    >
      <div className="px-5 py-6 sm:px-6 sm:py-7">
        {showBrand && (
          <div className="flex justify-center py-5">
            <LivepeerLockup className="h-auto w-[184px] text-foreground" />
          </div>
        )}
        {children}
      </div>
    </motion.section>
  );
}
