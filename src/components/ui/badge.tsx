import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

const TONES = {
  positive: "bg-emerald-500/12 text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400",
  negative: "bg-rose-500/12 text-rose-600 ring-1 ring-inset ring-rose-500/20 dark:text-rose-400",
  warning: "bg-amber-500/12 text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400",
  neutral: "bg-foreground/[0.06] text-muted ring-1 ring-inset ring-border",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof TONES }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONES[tone],
        className
      )}
      {...props}
    />
  );
}
