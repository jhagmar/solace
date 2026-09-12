import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { exposure } from "@/app/compose/exposure";
import { type OutdoorWindow, windowsOnLocalDay } from "@/features/exposure/model";
import { useExposureStore } from "@/features/exposure/store";
import { useEffectiveLocation } from "@/features/location";
import { createMinutes, type MsSinceEpoch, type TimeZone } from "@/shared/domain";
import {
  deviceTimeZone,
  formatInstant,
  lastLightOfLocalDay,
  resolveTimeDraft,
  type TimeDraft,
} from "@/shared/time";
import { ClearButton } from "@/shared/ui/clear-button";
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
import { ScheduleRow, scheduleListClass } from "@/shared/ui/schedule-row";
import { SheetActions } from "@/shared/ui/sheet-actions";
import { CustomTimeChip, TimeChip } from "@/shared/ui/time-chips";

const RELATIVE_START = [
  { label: messages.time.now, offset: createMinutes(0) },
  { label: messages.time.thirtyMinAgo, offset: createMinutes(30) },
  { label: messages.time.oneHourAgo, offset: createMinutes(60) },
] as const;

const HOUR_MS = 60 * 60 * 1000;

interface WindowDraft {
  start: TimeDraft;
  end: TimeDraft;
}

/**
 * Today's outdoor pairs. **1 hour** and **2 hours** plant from now (or the
 * next free slot of that length). **Rest of day** is one pair from now
 * through the last second of the local day, extending a live pair.
 * Tapping a row edits that window.
 */
export function ExposureControl({
  timeZone,
  now,
  lastLightHourly,
}: {
  timeZone: TimeZone;
  now: () => MsSinceEpoch;
  lastLightHourly: readonly { time: number; uvIndex: number }[];
}) {
  const windows = useExposureStore((state) => state.exposureState.windows ?? []);
  const location = useEffectiveLocation();
  const instant = now();
  const todayWindows = windowsOnLocalDay(windows, timeZone, instant);
  const lastLight = lastLightOfLocalDay(timeZone, instant, lastLightHourly);

  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<{ window: OutdoorWindow; draft: WindowDraft } | null>(null);
  const skipCommitRef = useRef(false);

  const openWindowEditor = (window: OutdoorWindow) => {
    skipCommitRef.current = false;
    setEditor({
      window,
      draft: {
        start: { kind: "absolute", atMs: window.start },
        end: { kind: "absolute", atMs: window.end },
      },
    });
    setOpen(true);
  };

  const commitEditor = () => {
    if (!editor) {
      return;
    }
    exposure.updateWindow(
      editor.window.id,
      resolveTimeDraft(editor.draft.start, now()),
      resolveTimeDraft(editor.draft.end, now()),
    );
  };

  const addHours = (hours: 1 | 2) => {
    if (!location) {
      return;
    }
    exposure.addDurationFromNow(hours * HOUR_MS);
  };

  const addRestOfDay = () => {
    if (!location) {
      return;
    }
    exposure.coverRestOfDay();
  };

  return (
    <ControlCard
      label={messages.exposure.label}
      aside={
        <ClearButton
          label={messages.exposure.clear}
          disabled={todayWindows.length === 0}
          onClick={() => exposure.clearWindows()}
        />
      }
    >
      {todayWindows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{messages.exposure.empty}</p>
      ) : (
        <ul className={scheduleListClass}>
          {todayWindows.map((window) => {
            const zone = window.location.timezone ?? timeZone;
            const label = formatMessage(messages.exposure.row, {
              start: formatInstant(zone, window.start),
              end: formatInstant(zone, window.end),
            });
            return (
              <li key={window.id}>
                <ScheduleRow label={label} onClick={() => openWindowEditor(window)} />
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 min-w-0 gap-1.5"
          onClick={() => addHours(1)}
        >
          <Plus aria-hidden />
          {messages.exposure.oneHour}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 min-w-0 gap-1.5"
          onClick={() => addHours(2)}
        >
          <Plus aria-hidden />
          {messages.exposure.twoHours}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="col-span-2 h-10 gap-1.5"
          onClick={addRestOfDay}
        >
          <Plus aria-hidden />
          {messages.exposure.restOfDay}
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
            commitEditor();
          }
          skipCommitRef.current = false;
          setOpen(false);
        }}
      >
        <DialogPortal>
          <DialogBackdrop />
          {editor ? (
            <WindowSheet
              draft={editor.draft}
              onDraftChange={(patch) =>
                setEditor((current) =>
                  current ? { ...current, draft: { ...current.draft, ...patch } } : current,
                )
              }
              timeZone={editor.window.location.timezone ?? timeZone}
              now={now}
              lastLight={lastLight}
              onRemove={() => {
                skipCommitRef.current = true;
                exposure.removeWindow(editor.window.id);
                setOpen(false);
              }}
            />
          ) : null}
        </DialogPortal>
      </DialogRoot>
    </ControlCard>
  );
}

function WindowSheet({
  draft,
  onDraftChange,
  timeZone,
  now,
  lastLight,
  onRemove,
}: {
  draft: WindowDraft;
  onDraftChange: (patch: Partial<WindowDraft>) => void;
  timeZone: TimeZone;
  now: () => MsSinceEpoch;
  lastLight: MsSinceEpoch;
  onRemove: () => void;
}) {
  const instant = now();
  const startAt = resolveTimeDraft(draft.start, instant);
  const endAt = resolveTimeDraft(draft.end, instant);
  const tz = timeZone ?? deviceTimeZone();

  return (
    <DialogPopup className="gap-5 sm:max-w-md">
      <DialogTitle>{messages.exposure.sheetTitle}</DialogTitle>
      <DialogDescription className="sr-only">
        {formatInstant(tz, startAt)} to {formatInstant(tz, endAt)}
      </DialogDescription>

      <div className="grid grid-cols-2 gap-x-4">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {messages.exposure.start}
          </span>
          <div className="flex flex-col gap-1.5">
            {RELATIVE_START.map((opt) => (
              <TimeChip
                key={opt.label}
                className="w-full"
                selected={draft.start.kind === "relative" && draft.start.offset === opt.offset}
                onClick={() => onDraftChange({ start: { kind: "relative", offset: opt.offset } })}
              >
                {opt.label}
              </TimeChip>
            ))}
            <CustomTimeChip
              className="w-full"
              atMs={draft.start.kind === "absolute" ? draft.start.atMs : null}
              selected={draft.start.kind === "absolute"}
              timeZone={tz}
              now={now}
              onSelect={(atMs) => onDraftChange({ start: { kind: "absolute", atMs } })}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm font-medium text-muted-foreground">{messages.exposure.end}</span>
          <div className="flex flex-col gap-1.5">
            <TimeChip
              className="w-full"
              selected={draft.end.kind === "relative" && draft.end.offset === createMinutes(0)}
              onClick={() => onDraftChange({ end: { kind: "relative", offset: createMinutes(0) } })}
            >
              {messages.time.now}
            </TimeChip>
            <TimeChip
              className="w-full"
              selected={draft.end.kind === "absolute" && draft.end.atMs === lastLight}
              onClick={() => onDraftChange({ end: { kind: "absolute", atMs: lastLight } })}
            >
              {messages.exposure.lastLight}
            </TimeChip>
            <CustomTimeChip
              className="w-full"
              atMs={
                draft.end.kind === "absolute" && draft.end.atMs !== lastLight
                  ? draft.end.atMs
                  : null
              }
              selected={draft.end.kind === "absolute" && draft.end.atMs !== lastLight}
              timeZone={tz}
              now={now}
              onSelect={(atMs) => onDraftChange({ end: { kind: "absolute", atMs } })}
            />
          </div>
        </div>
      </div>

      <SheetActions onRemove={onRemove} />
    </DialogPopup>
  );
}
