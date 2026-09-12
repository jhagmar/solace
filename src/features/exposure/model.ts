/**
 * Exposure domain: today's sun time is a list of closed outdoor pairs.
 *
 * An {@link OutdoorWindow} is `{ start, end, location }` on the location-local
 * civil day of `start`. Live status is derived: the user is outdoors when
 * `now` sits in `[start, end)`. The simulation log is compiled from this
 * list; the list is the document the user edits.
 */

import {
  asLocation,
  createMsSinceEpoch,
  type Location,
  type MsSinceEpoch,
  type TimeZone,
} from "@/shared/domain";
import { deviceTimeZone, lastSecondOfLocalDay, localDayNumber } from "@/shared/time";

/** One outdoor interval. `id` is stable across start/end edits. */
export interface OutdoorWindow {
  id: string;
  start: MsSinceEpoch;
  end: MsSinceEpoch;
  location: Location;
}

/** The editable schedule of outdoor pairs. */
export interface ExposureState {
  windows: OutdoorWindow[];
}

export const EMPTY_EXPOSURE_STATE: ExposureState = { windows: [] };

/** True when `at` sits in `[start, end)` of any window. */
export function isOutdoorsAt(windows: readonly OutdoorWindow[] | undefined, at: number): boolean {
  return windowContaining(windows, at) !== undefined;
}

/** The window that contains `at`, if any. */
export function windowContaining(
  windows: readonly OutdoorWindow[] | undefined,
  at: number,
): OutdoorWindow | undefined {
  return (windows ?? []).find((window) => window.start <= at && at < window.end);
}

/** Windows whose start falls on the location-local day of `at`. */
export function windowsOnLocalDay(
  windows: readonly OutdoorWindow[] | undefined,
  tz: TimeZone,
  at: number,
): OutdoorWindow[] {
  const day = localDayNumber(tz, at);
  return (windows ?? [])
    .filter((window) => {
      const zone = window.location.timezone ?? tz;
      return localDayNumber(zone, window.start) === day;
    })
    .slice()
    .sort((a, b) => a.start - b.start);
}

function asOutdoorWindow(value: unknown): OutdoorWindow | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = value as { id?: unknown; start?: unknown; end?: unknown; location?: unknown };
  if (typeof raw.id !== "string" || raw.id.length === 0) {
    return null;
  }
  const location = asLocation(raw.location);
  if (!location) {
    return null;
  }
  try {
    const start = createMsSinceEpoch(raw.start as number);
    const end = createMsSinceEpoch(raw.end as number);
    if (end <= start) {
      return null;
    }
    return { id: raw.id, start, end, location };
  } catch {
    return null;
  }
}

function migrateLiveExposure(value: {
  status: unknown;
  since?: unknown;
  location?: unknown;
}): ExposureState | null {
  if (value.status === "indoors") {
    return { ...EMPTY_EXPOSURE_STATE };
  }
  if (value.status !== "outdoors") {
    return null;
  }
  const location = asLocation(value.location);
  if (!location) {
    return { ...EMPTY_EXPOSURE_STATE };
  }
  try {
    const start = createMsSinceEpoch(value.since as number);
    const tz = location.timezone ?? deviceTimeZone();
    const end = lastSecondOfLocalDay(tz, start);
    if (end <= start) {
      return { ...EMPTY_EXPOSURE_STATE };
    }
    return {
      windows: [{ id: `migrated-${start}`, start, end, location }],
    };
  } catch {
    return { ...EMPTY_EXPOSURE_STATE };
  }
}

/**
 * Narrows untrusted persisted JSON. Accepts the pair list, and the previous
 * live `{ status, since }` shape: an open outdoors interval becomes one
 * window ending at the last second of its start day. A leftover `resets`
 * field is ignored. Corrupt entries in a list are dropped; the rest of the
 * schedule is kept.
 */
export function asExposure(value: unknown): ExposureState | null {
  try {
    if (typeof value !== "object" || value === null) {
      return null;
    }
    if ("windows" in value && Array.isArray(value.windows)) {
      const windows: OutdoorWindow[] = [];
      for (const entry of value.windows) {
        const window = asOutdoorWindow(entry);
        if (window) {
          windows.push(window);
        }
      }
      return { windows };
    }
    if ("status" in value) {
      return migrateLiveExposure(value);
    }
    return null;
  } catch {
    return null;
  }
}

/** Narrow port the exposure machine uses to read and replace exposure state. */
export interface ExposureStateStore {
  getExposureState(): ExposureState;
  setExposureState(state: ExposureState): void;
}
