"use client";

import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

type InputProps = Omit<React.ComponentProps<"input">, "size"> & {
  size?: "default" | "xs";
};

function Input({
  className,
  type,
  size = "default",
  onPointerDown,
  onFocus,
  onBlur,
  ...props
}: InputProps) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-size={size}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (size === "xs" && !event.defaultPrevented) {
          event.currentTarget.style.fontSize = "1rem";
        }
      }}
      onFocus={(event) => {
        onFocus?.(event);
        if (size === "xs") {
          const input = event.currentTarget;
          window.requestAnimationFrame(() => {
            input.style.removeProperty("font-size");
          });
        }
      }}
      onBlur={(event) => {
        if (size === "xs") {
          event.currentTarget.style.removeProperty("font-size");
        }
        onBlur?.(event);
      }}
      className={cn(
        "w-full min-w-0 rounded-sm border border-transparent bg-input/50 py-1 transition-[color,box-shadow,background-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        size === "xs"
          ? "input-size-xs h-8 px-2.5 text-xs"
          : "h-9 px-3 text-base md:text-sm",
        className
      )}
      {...props}
    />
  );
}

export { Input, type InputProps };
