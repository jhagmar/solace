/**
 * Simulation input and output domain support.
 *
 * The load simulation integrates UV exposure
 * over time from the raw inputs collected in SimulationInputState: the last
 * computed state (initial conditions), the latest forecast per location,
 * and the timestamped exposure and sunscreen events. Skin tone is not an
 * input; it only paints risk zones on the chart.
 *
 * This module holds the rehydration guards for that state and for the
 * persisted trajectory. The policy is lenient within collections — a
 * single corrupt forecast, event, or trajectory sample is dropped rather
 * than sinking the whole state — but strict about the top-level shape.
 * Corrupt initial conditions degrade to `undefined`, which the state
 * machine treats as "start fresh from UTC yesterday".
 */

import type {
  SimulationInputState,
  SimulationOutputState,
  SimulationState,
  TimestampedSimulationEvent,
} from "@/features/simulation/model";
import { asSimulationEvent } from "@/features/simulation/schedule";
import type { TimestampedUvForecast, UvForecast, UvForecastEntry } from "@/shared/domain";
import {
  createErythemaLoad,
  createLocationId,
  createMsSinceEpoch,
  createSeconds,
  createSpf,
  createUvIndex,
  type LocationId,
} from "@/shared/domain";
import { utcForecastWindow } from "@/shared/time";

/** Narrows untrusted JSON to a simulation state sample, or null */
export function asSimulationState(value: unknown): SimulationState | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  try {
    const raw = value as {
      time: unknown;
      erythemaLoad?: unknown;
      erythemaDose?: unknown;
      effectiveSpf: unknown;
    };
    return {
      time: createMsSinceEpoch(raw.time as number),
      erythemaLoad: createErythemaLoad((raw.erythemaLoad ?? raw.erythemaDose) as number),
      effectiveSpf: createSpf(raw.effectiveSpf as number),
    };
  } catch {
    return null;
  }
}

function asUvForecast(value: unknown): UvForecast | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = value as { utcOffsetSeconds: unknown; hourly: unknown };
  if (!Array.isArray(raw.hourly)) {
    return null;
  }
  try {
    const hourly: UvForecastEntry[] = raw.hourly.map((entry) => {
      const e = entry as { time: unknown; uvIndex: unknown };
      return {
        time: createMsSinceEpoch(e.time as number),
        uvIndex: createUvIndex(e.uvIndex as number),
      };
    });
    // Restore the sorting invariant rather than trusting the persisted order
    hourly.sort((a, b) => a.time - b.time);
    return { utcOffsetSeconds: createSeconds(raw.utcOffsetSeconds as number), hourly };
  } catch {
    return null;
  }
}

function asTimestampedUvForecast(value: unknown): TimestampedUvForecast | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  try {
    const raw = value as { fetchedAt: unknown; forecast: unknown };
    const forecast = asUvForecast(raw.forecast);
    if (!forecast) {
      return null;
    }
    return { fetchedAt: createMsSinceEpoch(raw.fetchedAt as number), forecast };
  } catch {
    return null;
  }
}

function asTimestampedSimulationEvent(value: unknown): TimestampedSimulationEvent | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const event = asSimulationEvent((value as { event?: unknown }).event);
  if (!event) {
    return null;
  }
  try {
    return {
      time: createMsSinceEpoch((value as { time: unknown }).time as number),
      event,
    };
  } catch {
    return null;
  }
}

/** Narrows untrusted persisted JSON to a valid simulation input state, or null */
export function asSimulationInput(value: unknown): SimulationInputState | null {
  try {
    if (typeof value !== "object" || value === null) {
      return null;
    }
    const raw = value as {
      initialConditions?: unknown;
      forecasts?: unknown;
      events?: unknown;
    };
    if (
      typeof raw.forecasts !== "object" ||
      raw.forecasts === null ||
      Array.isArray(raw.forecasts)
    ) {
      return null;
    }
    if (!Array.isArray(raw.events)) {
      return null;
    }

    const forecasts: Record<LocationId, TimestampedUvForecast> = {};
    for (const [key, entry] of Object.entries(raw.forecasts)) {
      const forecast = asTimestampedUvForecast(entry);
      if (forecast) {
        forecasts[createLocationId(key)] = forecast;
      }
    }

    const events = raw.events.flatMap((entry) => {
      const event = asTimestampedSimulationEvent(entry);
      return event ? [event] : [];
    });

    return {
      initialConditions:
        raw.initialConditions === undefined || raw.initialConditions === null
          ? undefined
          : (asSimulationState(raw.initialConditions) ?? undefined),
      forecasts,
      events,
    };
  } catch {
    return null;
  }
}

/**
 * Narrows untrusted persisted JSON to a valid simulation output, or null.
 * `pending` is a runtime-only status and is rejected so a stale in-flight
 * marker cannot be rehydrated; the machine will set it again if needed.
 * Corrupt trajectory samples are dropped; a `ready` result may therefore
 * have fewer points than were persisted.
 */
export function asSimulationOutput(value: unknown): SimulationOutputState | null {
  if (typeof value !== "object" || value === null || !("status" in value)) {
    return null;
  }
  const raw = value as { status: unknown; windowStart?: unknown; trajectory?: unknown };
  switch (raw.status) {
    case "empty":
      return { status: "empty" };
    case "ready": {
      if (!Array.isArray(raw.trajectory)) {
        return null;
      }
      try {
        const windowStart = createMsSinceEpoch(raw.windowStart as number);
        const samples = raw.trajectory.flatMap((entry) => {
          const sample = asSimulationState(entry);
          return sample ? [sample] : [];
        });
        samples.sort((a, b) => a.time - b.time);
        const trajectory: SimulationState[] = [];
        for (const sample of samples) {
          const last = trajectory[trajectory.length - 1];
          if (last && last.time === sample.time) {
            trajectory[trajectory.length - 1] = sample;
          } else {
            trajectory.push(sample);
          }
        }
        return { status: "ready", windowStart, trajectory };
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}

/**
 * True when `output` is a ready trajectory whose `windowStart` is UTC
 * yesterday for `nowMs`. The UI treats a false result as "show a spinner
 * until a fresh run lands".
 */
export function isSimulationOutputCurrent(output: SimulationOutputState, nowMs: number): boolean {
  return output.status === "ready" && output.windowStart === utcForecastWindow(nowMs).start;
}
