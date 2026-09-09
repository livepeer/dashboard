import type { ReactNode } from "react";

export default function ModalityChip({
  children,
  appearance = "filled",
}: {
  children: ReactNode;
  appearance?: "filled" | "outlined";
}) {
  return (
    <span
      className={`inline-flex h-[18px] shrink-0 items-center rounded-[3px] px-1.5 font-mono text-[10.5px] text-fg-faint ${
        appearance === "filled" ? "bg-foreground/3" : "border border-hairline"
      }`}
    >
      {children}
    </span>
  );
}
