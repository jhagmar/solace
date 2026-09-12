/**
 * Schedule helpers for the load simulation.
 *
 * Persistent inputs are the outdoor pairs, the sunscreen applications and
 * wash-offs, and the latest UV forecast per location. The integrator reads a
 * compiled event log: each pair becomes `exposureStart` then `exposureEnd`;
 * each application becomes `sunscreenApplied`; each wash-off becomes
 * `sunscreenRemoved`. The schedule lists are the document; rewriting them
 * replaces the log rather than appending. Skin tone is not an input — it
 * only paints risk zones on the chart.
 * `SimulationState` is (time, load, effective Spf). The integrator runs
 * on the UTC forecast window (yesterday through tomorrow). A pair cannot
 * span the location-local day boundary (the exposure machine clamps it
 * to the last second of its start day).
 *
 * The ODE solver ignores events before t0 and applies events at t0, so
 * {@link windowFrom} is the split the integrator should use: replay
 * `time < t0` into the initial context, pass `time >= t0` to the solver.
 * For a t0 of UTC yesterday on a clipped log, that context is the default
 * (indoors, no sunscreen event still in force).
 *
 * After rolling initial conditions to UTC yesterday, {@link clipEventsFrom}
 * drops earlier events. Open outdoor intervals are not reified: the window
 * starts indoors unless an outdoor event remains at or after t0.
 */

import type { OutdoorWindow } from "@/features/exposure";
import type {
  SimulationEvent,
  SimulationInputState,
  TimestampedSimulationEvent,
} from "@/features/simulation/model";
import { PchipInterpolator } from "@/features/simulation/ode/PchipInterpolator";
import {
  asSunscreenSettings,
  type SunscreenApplication,
  type SunscreenRemoval,
  type SunscreenSettings,
} from "@/features/sunscreen";
import type { TimestampedUvForecast, UvForecast } from "@/shared/domain";
import { asLocation, type Location, type LocationId, type MsSinceEpoch } from "@/shared/domain";
import { deviceTimeZone, lastSecondOfLocalDay } from "@/shared/time";

/** Piecewise-constant exposure: UV is only attributed while outdoors */
export type ExposureContext = { status: "indoors" } | { status: "outdoors"; location: Location };

/**
 * The switches the right-hand side reads between events. Default — and the
 * context implied by an empty log — is indoors with no sunscreen.
 */
export interface PiecewiseSimulationContext {
  exposure: ExposureContext;
  sunscreen: SunscreenSettings | null;
}

export const DEFAULT_SIMULATION_CONTEXT: PiecewiseSimulationContext = {
  exposure: { status: "indoors" },
  sunscreen: null,
};

/** Solver-facing view of the log at an instant t0 */
export interface SimulationWindow {
  context: PiecewiseSimulationContext;
  events: TimestampedSimulationEvent[];
}

/** Applies a single domain event to the piecewise context */
export function applySimulationEvent(
  context: PiecewiseSimulationContext,
  event: SimulationEvent,
): PiecewiseSimulationContext {
  switch (event.type) {
    case "exposureStart":
      return { ...context, exposure: { status: "outdoors", location: event.location } };
    case "exposureEnd":
      return { ...context, exposure: { status: "indoors" } };
    case "sunscreenApplied":
      return { ...context, sunscreen: event.sunscreenSettings };
    case "sunscreenRemoved":
      return { ...context, sunscreen: null };
  }
}

/** Replays `events` in stored order (already time-sorted, stable for ties) */
export function replaySimulationContext(
  events: readonly TimestampedSimulationEvent[],
): PiecewiseSimulationContext {
  return events.reduce(
    (context, entry) => applySimulationEvent(context, entry.event),
    DEFAULT_SIMULATION_CONTEXT,
  );
}

/**
 * Inserts `entry` so the log stays ordered by time. Same-time events keep
 * arrival order: the new one is placed after any existing event at that
 * instant, matching the solver's "apply in input order" rule.
 */
export function insertTimestampedEvent(
  events: readonly TimestampedSimulationEvent[],
  entry: TimestampedSimulationEvent,
): TimestampedSimulationEvent[] {
  const index = events.findIndex((existing) => existing.time > entry.time);
  if (index === -1) {
    return [...events, entry];
  }
  return [...events.slice(0, index), entry, ...events.slice(index)];
}

const EVENT_RANK: Record<SimulationEvent["type"], number> = {
  sunscreenApplied: 0,
  exposureStart: 1,
  exposureEnd: 2,
  sunscreenRemoved: 3,
};

/**
 * Compiles the editable schedule into the discontinuity log the ODE reads.
 * Same-time order: apply, then start, then end, then remove — so cream is
 * on before a pair begins at the same instant.
 */
export function eventsFromSchedule(
  windows: readonly OutdoorWindow[],
  applications: readonly SunscreenApplication[],
  removals: readonly SunscreenRemoval[] = [],
): TimestampedSimulationEvent[] {
  const events: TimestampedSimulationEvent[] = [];
  for (const window of windows) {
    events.push({
      time: window.start,
      event: { type: "exposureStart", location: window.location },
    });
    events.push({ time: window.end, event: { type: "exposureEnd" } });
  }
  for (const application of applications) {
    events.push({
      time: application.settings.appliedAt,
      event: { type: "sunscreenApplied", sunscreenSettings: application.settings },
    });
  }
  for (const removal of removals) {
    events.push({ time: removal.at, event: { type: "sunscreenRemoved" } });
  }
  return events.sort(
    (a, b) => a.time - b.time || EVENT_RANK[a.event.type] - EVENT_RANK[b.event.type],
  );
}

/** Reconstructs pairs from a persisted start/end log (migrate, then rewrite). */
export function windowsFromEvents(events: readonly TimestampedSimulationEvent[]): OutdoorWindow[] {
  const windows: OutdoorWindow[] = [];
  let open: { start: MsSinceEpoch; location: Location } | null = null;
  for (const entry of events) {
    if (entry.event.type === "exposureStart") {
      if (open) {
        windows.push(windowFromOpen(open, entry.time, windows.length));
      }
      open = { start: entry.time, location: entry.event.location };
    } else if (entry.event.type === "exposureEnd" && open) {
      windows.push(windowFromOpen(open, entry.time, windows.length));
      open = null;
    }
  }
  if (open) {
    const tz = open.location.timezone ?? deviceTimeZone();
    windows.push(windowFromOpen(open, lastSecondOfLocalDay(tz, open.start), windows.length));
  }
  return windows.filter((window) => window.end > window.start);
}

function windowFromOpen(
  open: { start: MsSinceEpoch; location: Location },
  end: MsSinceEpoch,
  index: number,
): OutdoorWindow {
  return {
    id: `from-log-${open.start}-${index}`,
    start: open.start,
    end,
    location: open.location,
  };
}

/** Reconstructs wash-off stamps from a persisted remove log. */
export function removalsFromEvents(
  events: readonly TimestampedSimulationEvent[],
): SunscreenRemoval[] {
  const removals: SunscreenRemoval[] = [];
  for (const entry of events) {
    if (entry.event.type !== "sunscreenRemoved") {
      continue;
    }
    removals.push({
      id: `from-log-${entry.time}-${removals.length}`,
      at: entry.time,
    });
  }
  return removals;
}

export function applicationsFromEvents(
  events: readonly TimestampedSimulationEvent[],
): SunscreenApplication[] {
  const applications: SunscreenApplication[] = [];
  for (const entry of events) {
    if (entry.event.type !== "sunscreenApplied") {
      continue;
    }
    applications.push({
      id: `from-log-${entry.time}-${applications.length}`,
      settings: entry.event.sunscreenSettings,
    });
  }
  return applications;
}

/**
 * Splits the log at t0: events before t0 fold into context, events at or
 * after t0 are the discontinuities the solver should see.
 */
export function windowFrom(
  events: readonly TimestampedSimulationEvent[],
  t0: MsSinceEpoch,
): SimulationWindow {
  const past: TimestampedSimulationEvent[] = [];
  const upcoming: TimestampedSimulationEvent[] = [];
  for (const entry of events) {
    if (entry.time < t0) {
      past.push(entry);
    } else {
      upcoming.push(entry);
    }
  }
  return { context: replaySimulationContext(past), events: upcoming };
}

/**
 * Drops events strictly before `start`. Outdoor intervals are assumed
 * closed at the location-local day boundary, so an open outdoor context
 * is not carried across the cutoff.
 */
export function clipEventsFrom(
  events: readonly TimestampedSimulationEvent[],
  start: MsSinceEpoch,
): TimestampedSimulationEvent[] {
  return events.filter((entry) => entry.time >= start);
}

/** Location ids that remaining exposure-start events still bind to a UV series */
export function locationIdsInEvents(events: readonly TimestampedSimulationEvent[]): LocationId[] {
  const ids: LocationId[] = [];
  const seen = new Set<string>();
  for (const entry of events) {
    if (entry.event.type !== "exposureStart") {
      continue;
    }
    const id = entry.event.location.id;
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Keeps forecasts for locations still mentioned in `events`, plus any
 * `retainIds` (the current effective location, even with no outdoor event
 * yet — the next interval and the chart projection need that series).
 */
export function pruneForecasts(
  forecasts: Record<LocationId, TimestampedUvForecast>,
  events: readonly TimestampedSimulationEvent[],
  retainIds: readonly LocationId[] = [],
): Record<LocationId, TimestampedUvForecast> {
  const keep = new Set<string>([...locationIdsInEvents(events), ...retainIds]);
  const pruned: Record<LocationId, TimestampedUvForecast> = {};
  for (const [id, forecast] of Object.entries(forecasts)) {
    if (keep.has(id)) {
      pruned[id as LocationId] = forecast;
    }
  }
  return pruned;
}

/**
 * Clips the event log to `start` and drops forecasts that no remaining
 * exposure-start (nor `retainIds`) still needs.
 */
export function pruneSimulationInput(
  state: SimulationInputState,
  start: MsSinceEpoch,
  retainIds: readonly LocationId[] = [],
): SimulationInputState {
  const events = clipEventsFrom(state.events, start);
  return {
    ...state,
    events,
    forecasts: pruneForecasts(state.forecasts, events, retainIds),
  };
}

/** PCHIP through a forecast's hourly UV; empty hourly evaluates to 0 */
export function uvInterpolatorFromForecast(forecast: UvForecast): PchipInterpolator {
  return new PchipInterpolator(
    forecast.hourly.map((entry) => ({ x: entry.time, y: entry.uvIndex })),
  );
}

/** Narrows untrusted JSON to a domain event, or null */
export function asSimulationEvent(value: unknown): SimulationEvent | null {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return null;
  }
  const raw = value as { type: unknown; sunscreenSettings?: unknown; location?: unknown };
  switch (raw.type) {
    case "sunscreenRemoved":
    case "exposureEnd":
      return { type: raw.type };
    case "exposureStart": {
      const location = asLocation(raw.location);
      return location ? { type: "exposureStart", location } : null;
    }
    case "sunscreenApplied": {
      const sunscreenSettings = asSunscreenSettings(raw.sunscreenSettings);
      return sunscreenSettings ? { type: "sunscreenApplied", sunscreenSettings } : null;
    }
    default:
      return null;
  }
}
