import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/ui/cn";

/**
 * One line in a sunscreen or exposure list. Looks like a table row, not a
 * chrome button: hairline, trailing disclosure, the whole row opens the
 * editor.
 */
export function ScheduleRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Edit ${label}`}
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm outline-none",
        "hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50",
      )}
    >
      <span className="min-w-0 flex-1">{label}</span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

/** Bleed to the card edges so hairlines read as a table. */
export const scheduleListClass = "-mx-4 divide-y divide-border";
