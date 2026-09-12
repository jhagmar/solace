/**
 * Location-local civil time.
 *
 * Instants in the app are epoch-ms. The location's IANA zone is used only
 * at the presentation/draft boundary — wall-clock there, minutes since local
 * midnight there. Conversion uses the browser IANA database via Intl.
 * The device zone is a last-resort display fallback only.
 */

import {
  asTimeZone,
  createMsSinceEpoch,
  createSeconds,
  createTimeZone,
  type MsSinceEpoch,
  type Seconds,
  type TimeZone,
} from "@/shared/domain";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** Device's own time zone — last-resort display fallback only. */
export function deviceTimeZone(): TimeZone {
  return asTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? createTimeZone("UTC");
}

/** UTC offset of `tz` at `atMs`, DST-aware (epoch ms, unbranded for the UI layer). */
export function utcOffsetSecondsAt(tz: TimeZone, atMs: number): Seconds {
  // Intl wall-clock parts have no milliseconds. Subtracting a sub-second
  // `atMs` from a whole-second `asUtc` and rounding would shift the offset
  // by 1 s whenever the clock landed in the latter half of a second — and
  // {@link firstSecondOfLocalDay} would then disagree with itself across
  // evaluates, leaving the chart stuck on "simulating".
  const instant = Math.floor(atMs / 1000) * 1000;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return createSeconds(Math.round((asUtc - instant) / 1000));
}

/**
 * Instant on the location-local day containing `referenceMs` whose wall
 * clock is `minutes` past local midnight — the inverse of localMinutesAt.
 * Offset is sampled at `referenceMs`, so the result can be off by an hour
 * on a DST-transition day; acceptable here.
 */
export function instantAtLocalMinutes(
  tz: TimeZone,
  minutes: number,
  referenceMs: number,
): MsSinceEpoch {
  const offsetMs = utcOffsetSecondsAt(tz, referenceMs) * 1000;
  const localMidnightMs = Math.floor((referenceMs + offsetMs) / DAY_MS) * DAY_MS - offsetMs;
  return createMsSinceEpoch(localMidnightMs + minutes * MINUTE_MS);
}

/** Number of local days since the epoch in `tz` — for same-day/yesterday comparisons. */
export function localDayNumber(tz: TimeZone, atMs: number): number {
  const offsetMs = utcOffsetSecondsAt(tz, atMs) * 1000;
  return Math.floor((atMs + offsetMs) / DAY_MS);
}

/** First instant of the location-local day containing `atMs` (local midnight). */
export function firstSecondOfLocalDay(tz: TimeZone, atMs: number): MsSinceEpoch {
  return instantAtLocalMinutes(tz, 0, atMs);
}

/**
 * Local midnight of the day `daysAgo` location-local days before the day
 * containing `atMs`. Walks midnight-to-midnight so DST 23/25-hour days are
 * counted as one day each. `daysAgo` 0 is {@link firstSecondOfLocalDay}.
 */
export function firstSecondOfLocalDayDaysAgo(
  tz: TimeZone,
  atMs: number,
  daysAgo: number,
): MsSinceEpoch {
  let t = firstSecondOfLocalDay(tz, atMs);
  for (let i = 0; i < daysAgo; i += 1) {
    t = firstSecondOfLocalDay(tz, t - 12 * 60 * 60 * 1000);
  }
  return t;
}

/**
 * First instant of the next location-local day after the day containing
 * `atMs`. Days are 23–25 h around DST, so the next midnight is found by
 * probing ~1.5 days ahead of the day's start rather than assuming 24 h.
 */
export function nextFirstSecondOfLocalDay(tz: TimeZone, atMs: number): MsSinceEpoch {
  const dayStart = firstSecondOfLocalDay(tz, atMs);
  return firstSecondOfLocalDay(tz, dayStart + 36 * 60 * 60 * 1000);
}

/** Nearest multiple of `minutes` on the epoch-ms timeline. Used to quantize chart drags. */
export function snapToMinutes(atMs: number, minutes: number): MsSinceEpoch {
  const step = minutes * MINUTE_MS;
  return createMsSinceEpoch(Math.round(atMs / step) * step);
}

/** Last second of the location-local day containing `atMs`. */
export function lastSecondOfLocalDay(tz: TimeZone, atMs: number): MsSinceEpoch {
  return createMsSinceEpoch(nextFirstSecondOfLocalDay(tz, atMs) - 1000);
}

/**
 * Last light on the location-local day containing `dayMs`: one hour after
 * the last hourly sample with UV > 0, clamped to the last second of that
 * day. No positive sample means last second of the day — the honest bound
 * when the forecast is missing or the sun never rose.
 */
export function lastLightOfLocalDay(
  tz: TimeZone,
  dayMs: number,
  hourly: readonly { time: number; uvIndex: number }[],
): MsSinceEpoch {
  const dayStart = firstSecondOfLocalDay(tz, dayMs);
  const dayEnd = lastSecondOfLocalDay(tz, dayMs);
  let lastPositive: number | undefined;
  for (const sample of hourly) {
    if (sample.time >= dayStart && sample.time <= dayEnd && sample.uvIndex > 0) {
      lastPositive = sample.time;
    }
  }
  if (lastPositive === undefined) {
    return dayEnd;
  }
  return createMsSinceEpoch(Math.min(lastPositive + 3_600_000, dayEnd));
}

/** Location-local calendar date of `atMs` as `YYYY-MM-DD`. */
export function localIsoDate(tz: TimeZone, atMs: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(atMs);
  const get = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((p) => p.type === type);
    /* v8 ignore next -- en-US always emits year/month/day parts */
    return part?.value ?? "";
  };
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Wall-clock hours on a 0–24 chart of the location-local day spanning
 * `[dayStart, dayEnd]`. Next local midnight maps to 24, not 0.
 */
export function localHoursOnChart(
  tz: TimeZone,
  atMs: number,
  dayStart: number,
  dayEnd: number,
): number {
  if (atMs <= dayStart) {
    return 0;
  }
  if (atMs >= dayEnd) {
    return 24;
  }
  return localMinutesAt(tz, atMs) / 60;
}

/** Minutes since local midnight in `tz` at `atMs`. */
export function localMinutesAt(tz: TimeZone, atMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(atMs);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value);
  return (get("hour") % 24) * 60 + get("minute");
}

/** Locale-aware short wall time of an instant in `tz`. */
export function formatInstant(tz: TimeZone, atMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(atMs));
}

/** Locale-aware rendering of minutes-since-local-midnight (already local). */
export function formatTimeOfDay(minutes: number): string {
  const d = new Date(Date.UTC(2020, 0, 1) + minutes * MINUTE_MS);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** Fixed `HH:MM` (24h) required as the value of `input[type=time]`. */
export function formatTimeInputValue(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
