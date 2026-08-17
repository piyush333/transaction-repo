import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative" | "neutral";
  icon?: ReactNode;
}) {
  return (
    <Card className="group relative overflow-hidden p-4 transition-all duration-150 hover:border-accent/30">
      <div
        className={cn(
          "pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-[0.12] blur-2xl transition-opacity duration-150 group-hover:opacity-20",
          tone === "positive" && "bg-emerald-500",
          tone === "negative" && "bg-rose-500",
          tone === "neutral" && "bg-accent"
        )}
      />
      <div className="relative flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {icon && (
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md",
              tone === "positive" && "bg-emerald-500/12 text-emerald-500",
              tone === "negative" && "bg-rose-500/12 text-rose-500",
              tone === "neutral" && "bg-accent/12 text-accent"
            )}
          >
            {icon}
          </div>
        )}
      </div>
      <p
        className={cn(
          "relative mt-2 text-2xl font-semibold tabular-nums",
          tone === "positive" && "text-emerald-600 dark:text-emerald-400",
          tone === "negative" && "text-rose-600 dark:text-rose-400"
        )}
      >
        {value}
      </p>
      {sub && <p className="relative mt-1 text-xs text-muted">{sub}</p>}
    </Card>
  );
}
