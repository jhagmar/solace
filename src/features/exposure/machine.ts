import type { ExposureStateStore, OutdoorWindow } from "@/features/exposure/model";
import { windowContaining } from "@/features/exposure/model";
import type { Location, MsSinceEpoch } from "@/shared/domain";
import { createMsSinceEpoch } from "@/shared/domain";
import {
  deviceTimeZone,
  firstSecondOfLocalDay,
  lastSecondOfLocalDay,
  localDayNumber,
} from "@/shared/time";

/** Default length of an Add pair. */
export const TAPPED_WINDOW_MS = 60 * 60 * 1000;

/** Shortest representable outdoor pair. */
const MIN_WINDOW_MS = 60_000;

/**
 * Defines the public API for the Exposure State Machine.
 * Each handler reacts to an external signal; the machine decides what to do.
 */
export interface ExposurePort {
  handleVisibilityChange(): void;
  handleLocationChange(): void;
  goOutdoors(): string | null;
  goIndoors(): void;
  /** Creates a 1 h pair from `at`; returns its id, or the pair that already contains `at`. */
  addWindowAt(at: MsSinceEpoch): string | null;
  /** Creates a pair from now lasting `durationMs`, or the next free slot of that length. */
  addDurationFromNow(durationMs: number): string | null;
  /** Creates a 1 h pair from now, or the next free hour if that overlaps. */
  addDefaultWindow(): string | null;
  /**
   * One outdoor pair covering the rest of the local day: from now through the
   * last second. Later pairs are dropped. A pair that already contains now is
   * extended to that last second.
   */
  coverRestOfDay(): string | null;
  /** Creates a pair with the given ends, clamped to the day and neighbours. */
  addWindow(start: MsSinceEpoch, end: MsSinceEpoch): string | null;
  updateWindow(id: string, start: MsSinceEpoch, end: MsSinceEpoch): void;
  removeWindow(id: string): void;
  /** Drops every outdoor pair. */
  clearWindows(): void;
  /** One-time hydrate from a reconstructed log when the store has no pairs. */
  adoptWindowsIfEmpty(windows: readonly OutdoorWindow[]): void;
}

/**
 * Enforces the invariants of outdoor pairs that the UI cannot:
 *
 * 1. A pair needs a location. Losing the effective location closes the
 *    pair that contains now, at now.
 * 2. A pair cannot span a local midnight. When the page is visible on a
 *    later civil day than a window's start, that window's end is clamped
 *    to the last second of its start day. The pair stays in the list so
 *    the simulation can still compile it; the UI shows only today's.
 * 3. Changing location while now sits in a pair splits it: the old pair
 *    ends at now, a new pair starts at now against the new place.
 *
 * `start < end`, same local day, and no overlap are preserved on every
 * write. Default end for a live go-outdoors (location split) is injected
 * — compose uses now + 1 h, clamped to the local day.
 */
export class ExposureStateMachine implements ExposurePort {
  private readonly store: ExposureStateStore;
  private readonly getEffectiveLocation: () => Location | null;
  private readonly isVisible: () => boolean;
  private readonly now: () => MsSinceEpoch;
  private readonly defaultEnd: (location: Location, start: MsSinceEpoch) => MsSinceEpoch;
  private seq = 0;

  constructor(
    store: ExposureStateStore,
    getEffectiveLocation: () => Location | null,
    isVisible: () => boolean,
    now: () => MsSinceEpoch,
    defaultEnd: (location: Location, start: MsSinceEpoch) => MsSinceEpoch,
  ) {
    this.store = store;
    this.getEffectiveLocation = getEffectiveLocation;
    this.isVisible = isVisible;
    this.now = now;
    this.defaultEnd = defaultEnd;
  }

  handleVisibilityChange = (): void => {
    if (!this.isVisible()) {
      return;
    }
    this.closeCurrentIfLocationUnset();
    this.clampWindowsPastTheirDay();
  };

  handleLocationChange = (): void => {
    this.closeCurrentIfLocationUnset();
    this.splitCurrentIfLocationChanged();
  };

  goOutdoors = (): string | null => {
    const location = this.getEffectiveLocation();
    if (!location) {
      return null;
    }
    const now = this.now();
    const current = windowContaining(this.windows(), now);
    if (current) {
      return current.id;
    }
    const end = this.defaultEnd(location, now);
    return this.insertWindow(location, now, end);
  };

  goIndoors = (): void => {
    const now = this.now();
    const current = windowContaining(this.windows(), now);
    if (!current) {
      return;
    }
    if (now - current.start < MIN_WINDOW_MS) {
      this.replaceWindows(this.windows().filter((window) => window.id !== current.id));
      return;
    }
    this.replaceWindows(
      this.windows().map((window) => (window.id === current.id ? { ...window, end: now } : window)),
    );
  };

  addWindowAt = (at: MsSinceEpoch): string | null => {
    const location = this.getEffectiveLocation();
    if (!location) {
      return null;
    }
    if (windowContaining(this.windows(), at)) {
      return windowContaining(this.windows(), at)?.id ?? null;
    }
    return this.insertWindow(location, at, createMsSinceEpoch(at + TAPPED_WINDOW_MS));
  };

  addDurationFromNow = (durationMs: number): string | null => {
    const location = this.getEffectiveLocation();
    if (!location) {
      return null;
    }
    return this.insertFreeWindow(location, this.now(), durationMs);
  };

  addDefaultWindow = (): string | null => {
    return this.addDurationFromNow(TAPPED_WINDOW_MS);
  };

  coverRestOfDay = (): string | null => {
    const location = this.getEffectiveLocation();
    if (!location) {
      return null;
    }
    const now = this.now();
    const tz = location.timezone ?? deviceTimeZone();
    const dayEnd = lastSecondOfLocalDay(tz, now);
    if (dayEnd - now < MIN_WINDOW_MS) {
      return null;
    }
    const live = windowContaining(this.windows(), now);
    const kept = this.windows().filter((window) => window.end <= now && window.id !== live?.id);
    if (live) {
      this.replaceWindows([...kept, { ...live, end: dayEnd }]);
      return live.id;
    }
    const id = this.nextId(now);
    this.replaceWindows([...kept, { id, start: now, end: dayEnd, location }]);
    return id;
  };

  addWindow = (start: MsSinceEpoch, end: MsSinceEpoch): string | null => {
    const location = this.getEffectiveLocation();
    if (!location) {
      return null;
    }
    return this.insertWindow(location, start, end);
  };

  updateWindow = (id: string, start: MsSinceEpoch, end: MsSinceEpoch): void => {
    const existing = this.windows().find((window) => window.id === id);
    if (!existing) {
      return;
    }
    const clamped = this.clampPair(existing.location, start, end, id);
    if (!clamped) {
      return;
    }
    this.replaceWindows(
      this.windows().map((window) =>
        window.id === id ? { ...window, start: clamped.start, end: clamped.end } : window,
      ),
    );
  };

  removeWindow = (id: string): void => {
    this.replaceWindows(this.windows().filter((window) => window.id !== id));
  };

  clearWindows = (): void => {
    if (this.windows().length === 0) {
      return;
    }
    this.replaceWindows([]);
  };

  adoptWindowsIfEmpty = (windows: readonly OutdoorWindow[]): void => {
    if (this.windows().length > 0 || windows.length === 0) {
      return;
    }
    this.replaceWindows([...windows]);
  };

  private windows = (): OutdoorWindow[] => this.store.getExposureState().windows ?? [];

  private replaceWindows = (windows: OutdoorWindow[]): void => {
    this.store.setExposureState({ windows });
  };

  private nextId = (start: MsSinceEpoch): string => {
    this.seq += 1;
    return `w-${start}-${this.seq}`;
  };

  /**
   * Plants a pair of `duration` at `from`, or the next free slot of that
   * length if that span overlaps an existing pair. Day and neighbour clamps
   * still apply on insert.
   */
  private insertFreeWindow = (
    location: Location,
    from: MsSinceEpoch,
    duration: number = TAPPED_WINDOW_MS,
  ): string | null => {
    let start = from as number;
    const others = this.windows()
      .slice()
      .sort((a, b) => a.start - b.start);
    for (const other of others) {
      const end = start + duration;
      if (other.end <= start || other.start >= end) {
        continue;
      }
      start = other.end;
    }
    return this.insertWindow(
      location,
      createMsSinceEpoch(start),
      createMsSinceEpoch(start + duration),
    );
  };

  private insertWindow = (
    location: Location,
    start: MsSinceEpoch,
    end: MsSinceEpoch,
  ): string | null => {
    const clamped = this.clampPair(location, start, end, null);
    if (!clamped) {
      return null;
    }
    const id = this.nextId(clamped.start);
    this.replaceWindows([
      ...this.windows(),
      { id, start: clamped.start, end: clamped.end, location },
    ]);
    return id;
  };

  /**
   * Same local day, `end - start >= 1 min`, no overlap with other pairs.
   * Neighbours are the other windows sorted by start.
   */
  private clampPair = (
    location: Location,
    start: MsSinceEpoch,
    end: MsSinceEpoch,
    ignoreId: string | null,
  ): { start: MsSinceEpoch; end: MsSinceEpoch } | null => {
    const tz = location.timezone ?? deviceTimeZone();
    const dayStart = firstSecondOfLocalDay(tz, start);
    const dayEnd = lastSecondOfLocalDay(tz, start);
    let nextStart = createMsSinceEpoch(Math.max(start, dayStart));
    let nextEnd = createMsSinceEpoch(Math.min(end, dayEnd));
    if (nextEnd <= nextStart) {
      return null;
    }
    const others = this.windows()
      .filter((window) => window.id !== ignoreId)
      .slice()
      .sort((a, b) => a.start - b.start);
    for (const other of others) {
      if (other.end <= nextStart || other.start >= nextEnd) {
        continue;
      }
      if (nextStart < other.start) {
        nextEnd = createMsSinceEpoch(Math.min(nextEnd, other.start));
      } else {
        nextStart = createMsSinceEpoch(Math.max(nextStart, other.end));
      }
    }
    if (nextEnd - nextStart < MIN_WINDOW_MS) {
      return null;
    }
    if (localDayNumber(tz, nextStart) !== localDayNumber(tz, nextEnd)) {
      nextEnd = dayEnd;
    }
    if (nextEnd - nextStart < MIN_WINDOW_MS) {
      return null;
    }
    return { start: nextStart, end: nextEnd };
  };

  private closeCurrentIfLocationUnset = (): void => {
    if (this.getEffectiveLocation()) {
      return;
    }
    const now = this.now();
    const current = windowContaining(this.windows(), now);
    if (!current) {
      return;
    }
    if (now - current.start < MIN_WINDOW_MS) {
      this.replaceWindows(this.windows().filter((window) => window.id !== current.id));
      return;
    }
    this.replaceWindows(
      this.windows().map((window) => (window.id === current.id ? { ...window, end: now } : window)),
    );
  };

  private splitCurrentIfLocationChanged = (): void => {
    const location = this.getEffectiveLocation();
    if (!location) {
      return;
    }
    const now = this.now();
    const current = windowContaining(this.windows(), now);
    if (!current || current.location.id === location.id) {
      return;
    }
    const without = this.windows().filter((window) => window.id !== current.id);
    const kept: OutdoorWindow[] =
      now - current.start >= MIN_WINDOW_MS ? [{ ...current, end: now }] : [];
    this.replaceWindows([...without, ...kept]);
    this.insertWindow(location, now, this.defaultEnd(location, now));
  };

  private clampWindowsPastTheirDay = (): void => {
    const now = this.now();
    let changed = false;
    const next = this.windows().flatMap((window) => {
      const tz = window.location.timezone ?? deviceTimeZone();
      if (localDayNumber(tz, now) === localDayNumber(tz, window.start)) {
        return [window];
      }
      const end = lastSecondOfLocalDay(tz, window.start);
      changed = true;
      if (end - window.start < MIN_WINDOW_MS) {
        return [];
      }
      return [{ ...window, end }];
    });
    if (changed) {
      this.replaceWindows(next);
    }
  };
}
