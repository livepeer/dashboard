"use client";

import type { InputHTMLAttributes } from "react";
import { Check, Minus } from "lucide-react";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "className"
> & {
  indeterminate?: boolean;
};

/** Native checkbox semantics with a stable, explicit checkmark color. */
export default function SelectionCheckbox({
  checked,
  indeterminate = false,
  disabled,
  ...props
}: Props) {
  const Mark = indeterminate ? Minus : Check;
  return (
    <span
      className={`relative inline-flex size-3.5 shrink-0 align-middle ${disabled ? "opacity-40" : ""}`}
    >
      <input
        {...props}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        ref={(node) => {
          if (node) node.indeterminate = indeterminate;
        }}
        className="m-0 size-3.5 cursor-pointer appearance-none rounded-[3px] border border-black/40 bg-white checked:border-black checked:bg-black indeterminate:border-black indeterminate:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed"
      />
      {(checked || indeterminate) && (
        <Mark
          aria-hidden="true"
          strokeWidth={3}
          className="pointer-events-none absolute inset-0 m-auto size-3 text-white"
        />
      )}
    </span>
  );
}
