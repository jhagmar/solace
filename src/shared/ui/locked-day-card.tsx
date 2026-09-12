import type { ReactNode } from "react";
import { cn } from "@/shared/ui/cn";

/**
 * Dashed empty shell used when the day is locked (no location). Same
 * language as the chart empty state: a heading and the next step, no
 * dummy controls.
 */
export function LockedDayCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      className={cn(
        "flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center",
      )}
    >
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      <p className="text-sm text-muted-foreground">{children}</p>
    </section>
  );
}
