import * as React from "react";
import { Card, CardContent, cn } from "@tmdb-see/ui";

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = "primary",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: "primary" | "sky" | "violet" | "amber" | "red";
  className?: string;
}) {
  const colors = {
    primary: "text-emerald-700 dark:text-emerald-300 bg-emerald-400/10 border-emerald-400/15",
    sky: "text-sky-700 dark:text-sky-300 bg-sky-400/10 border-sky-400/15",
    violet: "text-violet-700 dark:text-violet-300 bg-violet-400/10 border-violet-400/15",
    amber: "text-amber-700 dark:text-amber-300 bg-amber-400/10 border-amber-400/15",
    red: "text-red-700 dark:text-red-300 bg-red-400/10 border-red-400/15",
  } as const;
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {icon && (
          <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border [&_svg]:size-5", colors[accent])}>
            {icon}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
