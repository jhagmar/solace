/**
 * UV forecast series. Shared by the forecast feature, the load simulation,
 * and the Open-Meteo mapper — a kernel type, not a Zustand concern.
 */

import type { MsSinceEpoch, Seconds, UvIndex } from "./primitives";

/** One hourly UV sample. */
export interface UvForecastEntry {
  /** Instant this sample applies to */
  time: MsSinceEpoch;
  uvIndex: UvIndex;
}

/**
 * UV forecast for a location: time-value pairs sorted ascending by time,
 * plus the offset needed to render location-local wall-clock times.
 * Producers must uphold the sorting invariant; consumers may rely on it.
 */
export interface UvForecast {
  /** Offset between UTC and the forecast's local timezone */
  utcOffsetSeconds: Seconds;
  /** Hourly UV index values, sorted ascending by time */
  hourly: UvForecastEntry[];
}

/**
 * A successfully fetched forecast plus when it was fetched, retained so a
 * failed refresh can still present stale data.
 */
export interface TimestampedUvForecast {
  forecast: UvForecast;
  fetchedAt: MsSinceEpoch;
}
