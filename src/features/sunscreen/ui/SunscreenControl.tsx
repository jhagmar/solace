import { CircleHelp, PenLine, ShowerHead, SprayCan } from "lucide-react";
import { useRef, useState } from "react";
import { sunscreen } from "@/app/compose/sunscreen";
import {
  type ApplicationDegree,
  resolveTimeDraft,
  type SunscreenApplication,
  type SunscreenRemoval,
  type TimeDraft,
} from "@/features/sunscreen/model";
import { useSunscreenStore } from "@/features/sunscreen/store";
import {
  createMinutes,
  createSpf,
  type MsSinceEpoch,
  type Spf,
  type TimeZone,
} from "@/shared/domain";
import { formatInstant, localDayNumber } from "@/shared/time";
import { ClearButton } from "@/shared/ui/clear-button";
import { cn } from "@/shared/ui/cn";
import { ControlCard } from "@/shared/ui/control-card";
import { formatMessage, messages } from "@/shared/ui/messages";
import { Button } from "@/shared/ui/primitives/button";
import {
  DialogBackdrop,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@/shared/ui/primitives/dialog";
import {
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverRoot,
  PopoverTrigger,
} from "@/shared/ui/primitives/popover";
import { ScheduleRow, scheduleListClass } from "@/shared/ui/schedule-row";
import { SheetActions } from "@/shared/ui/sheet-actions";
import { CustomTimeChip, TimeChip } from "@/shared/ui/time-chips";

const SPF_OPTIONS = [createSpf(15), createSpf(30), createSpf(50)] as const;
const DEFAULT_CUSTOM_SPF = 20;
const MIN_SPF = createSpf(1);
const MAX_SPF = createSpf(100);

const formatSpf = (spf: Spf): string => String(spf);

const RELATIVE_TIME_OPTIONS = [
  { label: messages.time.now, offset: createMinutes(0) },
  { label: messages.time.thirtyMinAgo, offset: createMinutes(30) },
  { label: messages.time.oneHourAgo, offset: createMinutes(60) },
] as const;

const DEGREE_OPTIONS: { value: ApplicationDegree; label: string; hint: string }[] = [
  { value: "light", label: messages.sunscreen.thinLayer, hint: messages.sunscreen.thinHint },
  {
    value: "typical",
    label: messages.sunscreen.typicalAmount,
    hint: messages.sunscreen.typicalHint,
  },
  {
    value: "recommended",
    label: messages.sunscreen.recommendedAmount,
    hint: messages.sunscreen.recommendedHint,
  },
];

function AmountHelp() {
  return (
    <PopoverRoot>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={messages.sunscreen.amountHelp}
            className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <CircleHelp className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverPositioner side="top" align="start" className="z-[60]">
          <PopoverPopup className="max-w-72 gap-3 text-sm leading-relaxed">
            <p>{messages.sunscreen.amountHelpP1}</p>
            <p>{messages.sunscreen.amountHelpP2}</p>
          </PopoverPopup>
        </PopoverPositioner>
      </PopoverPortal>
    </PopoverRoot>
  );
}

function amountPhrase(degree: ApplicationDegree): string {
  switch (degree) {
    case "light":
      return messages.sunscreen.amountThin;
    case "typical":
      return messages.sunscreen.amountTypical;
    case "recommended":
      return messages.sunscreen.amountRecommended;
  }
}

type StampKind = "applied" | "removed";

interface SheetDraft {
  kind: StampKind;
  spf: Spf;
  degree: ApplicationDegree;
  time: TimeDraft;
}

function emptyDraft(): SheetDraft {
  return {
    kind: "applied",
    spf: createSpf(30),
    degree: "typical",
    time: { kind: "relative", offset: createMinutes(0) },
  };
}

function draftFromApplication(application: SunscreenApplication): SheetDraft {
  return {
    kind: "applied",
    spf: application.settings.spf,
    degree: application.settings.degree,
    time: { kind: "absolute", atMs: application.settings.appliedAt },
  };
}

function draftFromRemoval(removal: SunscreenRemoval): SheetDraft {
  return {
    kind: "removed",
    spf: createSpf(30),
    degree: "typical",
    time: { kind: "absolute", atMs: removal.at },
  };
}

function formatStampTime(tz: TimeZone, atMs: MsSinceEpoch, now: MsSinceEpoch): string {
  const dayDiff = localDayNumber(tz, now) - localDayNumber(tz, atMs);
  if (dayDiff === 0) {
    return formatInstant(tz, atMs);
  }
  if (dayDiff === 1) {
    return `yesterday ${formatInstant(tz, atMs)}`;
  }
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(atMs));
}

const chipClass = (selected: boolean) =>
  cn(
    "cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-all outline-none",
    "focus-visible:ring-3 focus-visible:ring-ring/50",
    "active:scale-[0.97]",
    selected
      ? "border-primary bg-primary text-primary-foreground"
      : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
  );

function CustomSpfChip({
  spf,
  selected,
  onSelect,
  className,
}: {
  spf: Spf | null;
  selected: boolean;
  onSelect: (spf: Spf) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    if (Number.isFinite(parsed)) {
      onSelect(createSpf(Math.min(MAX_SPF, Math.max(MIN_SPF, parsed))));
    }
  };

  return (
    <PopoverRoot
      open={open}
      onOpenChange={(next, details) => {
        if (next) {
          setDraft(String(spf ?? DEFAULT_CUSTOM_SPF));
        } else if (details.reason !== "escape-key") {
          commit();
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-pressed={selected}
            className={cn(
              chipClass(selected),
              "flex items-center justify-center gap-1.5",
              className,
            )}
          />
        }
      >
        {selected ? `${messages.time.custom}: ${spf}` : messages.time.custom}
        <PenLine className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverPositioner>
          <PopoverPopup>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                commit();
                setOpen(false);
              }}
            >
              <input
                type="number"
                inputMode="numeric"
                min={MIN_SPF}
                max={MAX_SPF}
                aria-label={formatMessage(messages.sunscreen.customSpf, {
                  min: MIN_SPF,
                  max: MAX_SPF,
                })}
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-24 cursor-text rounded-lg border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </form>
          </PopoverPopup>
        </PopoverPositioner>
      </PopoverPortal>
    </PopoverRoot>
  );
}

function SunscreenSheet({
  draft,
  onDraftChange,
  onRemove,
  timeZone,
  now,
}: {
  draft: SheetDraft;
  onDraftChange: (patch: Partial<SheetDraft>) => void;
  onRemove: () => void;
  timeZone: TimeZone;
  now: () => MsSinceEpoch;
}) {
  const instant = now();
  const isCustomSpf = !(SPF_OPTIONS as readonly number[]).includes(draft.spf);
  const time = draft.time;
  const resolvedAt = resolveTimeDraft(time, instant);
  const applied = draft.kind === "applied";

  return (
    <DialogPopup className="gap-5 sm:max-w-md">
      <DialogTitle>{messages.sunscreen.sheetTitle}</DialogTitle>
      <DialogDescription className="sr-only">
        {applied
          ? formatMessage(messages.sunscreen.rowApplied, {
              spf: formatSpf(draft.spf),
              amount: amountPhrase(draft.degree),
              time: formatStampTime(timeZone, resolvedAt, instant),
            })
          : formatMessage(messages.sunscreen.rowWashed, {
              time: formatStampTime(timeZone, resolvedAt, instant),
            })}
      </DialogDescription>

      {applied && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {messages.sunscreen.spf}
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {SPF_OPTIONS.map((spf) => (
              <TimeChip
                key={spf}
                className="w-full px-2"
                selected={draft.spf === spf}
                onClick={() => onDraftChange({ spf })}
              >
                {formatSpf(spf)}
              </TimeChip>
            ))}
            <CustomSpfChip
              className="w-full px-2"
              spf={isCustomSpf ? draft.spf : null}
              selected={isCustomSpf}
              onSelect={(spf) => onDraftChange({ spf })}
            />
          </div>
        </div>
      )}

      {applied && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-0.5">
            <span className="text-sm font-medium text-muted-foreground" id="amount-label">
              {messages.sunscreen.amount}
            </span>
            <AmountHelp />
          </div>
          <div
            className="grid grid-cols-3 gap-1.5"
            role="radiogroup"
            aria-labelledby="amount-label"
            aria-describedby="amount-hint"
          >
            {DEGREE_OPTIONS.map((opt) => {
              const selected = draft.degree === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onDraftChange({ degree: opt.value })}
                  className={cn(
                    chipClass(selected),
                    "h-auto min-h-9 w-full px-1.5 py-2 text-center leading-tight",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p id="amount-hint" className="text-xs text-muted-foreground">
            {DEGREE_OPTIONS.find((opt) => opt.value === draft.degree)?.hint}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          {applied ? messages.sunscreen.applied : messages.sunscreen.washedOff}
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          {RELATIVE_TIME_OPTIONS.map((opt) => (
            <TimeChip
              key={opt.label}
              className="w-full"
              selected={time.kind === "relative" && time.offset === opt.offset}
              onClick={() => onDraftChange({ time: { kind: "relative", offset: opt.offset } })}
            >
              {opt.label}
            </TimeChip>
          ))}
          <CustomTimeChip
            className="w-full"
            atMs={time.kind === "absolute" ? time.atMs : null}
            selected={time.kind === "absolute"}
            timeZone={timeZone}
            now={now}
            onSelect={(atMs) => onDraftChange({ time: { kind: "absolute", atMs } })}
          />
        </div>
      </div>

      <SheetActions onRemove={onRemove} />
    </DialogPopup>
  );
}

type StampRow =
  | { kind: "applied"; id: string; at: MsSinceEpoch; label: string }
  | { kind: "removed"; id: string; at: MsSinceEpoch; label: string };

/**
 * Time-ordered apply and wash-off stamps. + Sunscreen opens a sheet; tapping
 * a row edits that stamp. The lane ticks are the spatial editor.
 */
export function SunscreenControl({
  timeZone,
  now,
}: {
  timeZone: TimeZone;
  now: () => MsSinceEpoch;
}) {
  const applications = useSunscreenStore((state) => state.sunscreenState.applications ?? []);
  const removals = useSunscreenStore((state) => state.sunscreenState.removals ?? []);
  const instant = now();

  const rows: StampRow[] = [
    ...applications.map((entry) => ({
      kind: "applied" as const,
      id: entry.id,
      at: entry.settings.appliedAt,
      label: formatMessage(messages.sunscreen.rowApplied, {
        spf: formatSpf(entry.settings.spf),
        amount: amountPhrase(entry.settings.degree),
        time: formatStampTime(timeZone, entry.settings.appliedAt, instant),
      }),
    })),
    ...removals.map((entry) => ({
      kind: "removed" as const,
      id: entry.id,
      at: entry.at,
      label: formatMessage(messages.sunscreen.rowWashed, {
        time: formatStampTime(timeZone, entry.at, instant),
      }),
    })),
  ].sort((a, b) => a.at - b.at);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SheetDraft>(emptyDraft);
  const skipCommitRef = useRef(false);

  const commitDraft = (d: SheetDraft, id: string | null): string => {
    if (id) {
      const wasApplied = applications.some((entry) => entry.id === id);
      if (d.kind === "applied" && wasApplied) {
        sunscreen.update(id, { spf: d.spf, degree: d.degree, time: d.time });
        return id;
      }
      if (d.kind === "removed" && !wasApplied) {
        sunscreen.updateRemoval(id, d.time);
        return id;
      }
      return id;
    }
    if (d.kind === "removed") {
      return sunscreen.washOff(d.time);
    }
    return sunscreen.apply({ spf: d.spf, degree: d.degree, time: d.time });
  };

  const openNew = (kind: StampKind) => {
    skipCommitRef.current = false;
    setEditingId(null);
    setDraft({ ...emptyDraft(), kind });
    setOpen(true);
  };

  const openRow = (row: StampRow) => {
    skipCommitRef.current = false;
    setEditingId(row.id);
    if (row.kind === "applied") {
      const application = applications.find((entry) => entry.id === row.id);
      setDraft(application ? draftFromApplication(application) : emptyDraft());
    } else {
      const removal = removals.find((entry) => entry.id === row.id);
      setDraft(removal ? draftFromRemoval(removal) : emptyDraft());
    }
    setOpen(true);
  };

  return (
    <ControlCard
      label={messages.sunscreen.label}
      aside={
        <ClearButton
          label={messages.sunscreen.clear}
          disabled={rows.length === 0}
          onClick={() => sunscreen.clear()}
        />
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{messages.sunscreen.empty}</p>
      ) : (
        <ul className={scheduleListClass}>
          {rows.map((row) => (
            <li key={row.id}>
              <ScheduleRow label={row.label} onClick={() => openRow(row)} />
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full gap-2"
          onClick={() => openNew("applied")}
        >
          <SprayCan aria-hidden />
          {messages.sunscreen.apply}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full gap-2"
          onClick={() => openNew("removed")}
        >
          <ShowerHead aria-hidden />
          {messages.sunscreen.washOff}
        </Button>
      </div>

      <DialogRoot
        open={open}
        onOpenChange={(next, details) => {
          if (next) {
            skipCommitRef.current = false;
            setOpen(true);
            return;
          }
          if (!skipCommitRef.current && details.reason !== "escape-key") {
            commitDraft(draft, editingId);
          }
          skipCommitRef.current = false;
          setOpen(false);
        }}
      >
        <DialogPortal>
          <DialogBackdrop />
          <SunscreenSheet
            draft={draft}
            onDraftChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            onRemove={() => {
              skipCommitRef.current = true;
              if (editingId) {
                sunscreen.remove(editingId);
              }
              setOpen(false);
            }}
            timeZone={timeZone}
            now={now}
          />
        </DialogPortal>
      </DialogRoot>
    </ControlCard>
  );
}
