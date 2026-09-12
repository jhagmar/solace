import { Clock, PenLine } from "lucide-react";
import { useState } from "react";
import type { MsSinceEpoch, TimeZone } from "@/shared/domain";
import {
  formatInstant,
  formatTimeInputValue,
  instantAtLocalMinutes,
  localMinutesAt,
} from "@/shared/time";
import { cn } from "@/shared/ui/cn";
import { messages } from "@/shared/ui/messages";

const chipClass = (selected: boolean) =>
  cn(
    "rounded-lg border px-3 py-1.5 text-sm font-medium transition-all outline-none cursor-pointer",
    "focus-visible:ring-3 focus-visible:ring-ring/50",
    "active:scale-[0.97]",
    selected
      ? "border-primary bg-primary text-primary-foreground"
      : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
  );

export function TimeChip({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(chipClass(selected), className)}
    >
      {children}
    </button>
  );
}

/**
 * Wall-clock picker on the location-local day of `now`. Used for sunscreen
 * stamps and outdoor pair ends — both are today-only.
 */
export function CustomTimeChip({
  atMs,
  selected,
  timeZone,
  now,
  onSelect,
  label = messages.time.custom,
  className,
}: {
  atMs: MsSinceEpoch | null;
  selected: boolean;
  timeZone: TimeZone;
  now: () => MsSinceEpoch;
  onSelect: (atMs: MsSinceEpoch) => void;
  label?: string;
  className?: string;
}) {
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  const showingTime = selected && atMs !== null;

  const openPicker = () => {
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  };

  return (
    <>
      <button
        type="button"
        aria-pressed={selected}
        onClick={openPicker}
        className={cn(chipClass(selected), "flex items-center justify-center gap-1.5", className)}
      >
        {showingTime ? formatInstant(timeZone, atMs) : label}
        {showingTime ? (
          <PenLine className="size-4" aria-hidden />
        ) : (
          <Clock className="size-4" aria-hidden />
        )}
      </button>
      <input
        ref={setInput}
        type="time"
        step={60}
        tabIndex={-1}
        aria-label={messages.time.customTime}
        value={atMs !== null ? formatTimeInputValue(localMinutesAt(timeZone, atMs)) : ""}
        onChange={(e) => {
          const [h, m] = e.target.value.split(":").map(Number);
          if (Number.isFinite(h) && Number.isFinite(m)) {
            onSelect(instantAtLocalMinutes(timeZone, h * 60 + m, now()));
          }
        }}
        className="sr-only"
      />
    </>
  );
}
