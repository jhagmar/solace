/**
 * UTC calendar helpers. Forecast and simulation windows are UTC days;
 * location-local wall clock lives in {@link ./civil}.
 */

import { createMsSinceEpoch, type MsSinceEpoch } from "@/shared/domain";

const DAY_MS = 86_400_000;

/** Inclusive UTC yesterday through exclusive end of UTC tomorrow. */
export interface UtcForecastWindow {
  start: MsSinceEpoch;
  end: MsSinceEpoch;
}

/** First instant of the UTC calendar day containing `atMs`. */
export function firstSecondOfUtcDay(atMs: number): MsSinceEpoch {
  return createMsSinceEpoch(Math.floor(atMs / DAY_MS) * DAY_MS);
}

/**
 * UTC midnight of the day `daysAgo` UTC days before the day containing
 * `atMs`. UTC days are always 24 h. `daysAgo` 0 is {@link firstSecondOfUtcDay}.
 */
export function firstSecondOfUtcDayDaysAgo(atMs: number, daysAgo: number): MsSinceEpoch {
  return createMsSinceEpoch(firstSecondOfUtcDay(atMs) - daysAgo * DAY_MS);
}

/**
 * Rolling forecast/simulation window: UTC yesterday 00:00 through the
 * exclusive end of UTC tomorrow (today start + 2 days).
 */
export function utcForecastWindow(atMs: number): UtcForecastWindow {
  const todayStart = firstSecondOfUtcDay(atMs);
  return {
    start: createMsSinceEpoch(todayStart - DAY_MS),
    end: createMsSinceEpoch(todayStart + 2 * DAY_MS),
  };
}

/** UTC calendar date of `atMs` as `YYYY-MM-DD` — Open-Meteo `start_date` / `end_date`. */
export function utcIsoDate(atMs: number): string {
  return new Date(atMs).toISOString().slice(0, 10);
}
