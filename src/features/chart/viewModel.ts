/**
 * Chart-facing view of today's UV forecast and erythemal trajectory.
 *
 * The plot is always the location-local calendar day (wall-clock 0–24),
 * even when overnight UV is zero. UV index and load share the frame but
 * not a scale: UV is environmental (anchored at 10 = "very high") and load
 * is personal (fixed at 0–3 MED). Above 3 MED the curve is clipped, not
 * rescaled. SED is never labelled; risk is color on the load curve
 * (green / amber / red).
 */

import type { ForecastState } from "@/features/forecast";
import {
  applySimulationEvent,
  firstTimeLoadReaches,
  loadAtTime,
  PchipInterpolator,
  type SimulationState,
  type TimestampedSimulationEvent,
  uvInterpolatorFromForecast,
  windowFrom,
} from "@/features/simulation";
import { CHART_MED_FRACTION, loadThresholdsFor, type SkinTone } from "@/features/skin-tone";
import type { UvForecast } from "@/shared/domain";
import {
  createErythemaLoad,
  createSeconds,
  createSpf,
  type LocationId,
  type MsSinceEpoch,
  type TimeZone,
} from "@/shared/domain";
import { instantAtLocalMinutes, localHoursOnChart, nextFirstSecondOfLocalDay } from "@/shared/time";

/** Floor for the UV axis — WHO "very high" */
export const UV_AXIS_FLOOR = 10;
/** Headroom above today's peak UV when the peak exceeds the floor */
export const UV_AXIS_HEADROOM = 1.1;
/** Interior UV samples, in minutes (hourly knots are PCHIP'd) */
export const UV_SAMPLE_MINUTES = 15;

export interface UvPoint {
  time: number;
  uvIndex: number;
}

export interface LoadPoint {
  time: number;
  /** Remaining load related to SED — used for scaling, never labelled */
  load: number;
  /** Right-limit indoor/outdoor at this sample; fills of (this, next) use it */
  indoors: boolean;
}

export type LoadTone = "safe" | "moderate" | "danger";

/** Caption levels for the load curve: green / amber / red */
export type BurnRiskLevel = "low" | "caution" | "danger";

const BURN_RISK_FROM_TONE: Record<LoadTone, BurnRiskLevel> = {
  safe: "low",
  moderate: "caution",
  danger: "danger",
};

/** Next change of {@link BurnRiskLevel} on the displayed day, after now */
export interface BurnRiskTransition {
  level: BurnRiskLevel;
  atMs: number;
}

/** A maximal run of the load curve with one visual class */
export interface LoadSegment {
  points: LoadPoint[];
  tone: LoadTone;
  future: boolean;
  indoors: boolean;
  /** Strictly above the 3 MED ceiling — still `danger`, drawn as a clip */
  clipped: boolean;
}

export interface ChartData {
  uv: UvPoint[];
  load: LoadPoint[];
  segments: LoadSegment[];
  cautionSed: number;
  dangerSed: number;
  cautionTime: number | null;
  dangerTime: number | null;
  uvNow: number;
  uvPeak: UvPoint;
  loadNow: number;
  /** Peak load on the local-day series (may exceed {@link ChartData.loadMax}) */
  loadPeak: number;
  uvMax: number;
  /** Plot ceiling at 3 MED, in the same units as the load. Does not follow the peak. */
  loadMax: number;
  domain: { start: number; end: number };
  timeZone: TimeZone;
}

/** Inputs for {@link createDayChartData} */
export interface DayChartRequest {
  nowMs: number;
  timeZone: TimeZone;
  skinTone: SkinTone;
  forecast: UvForecast | null;
  trajectory: readonly SimulationState[];
  events: readonly TimestampedSimulationEvent[];
  dayStart: MsSinceEpoch;
}

/** UV axis maximum: at least 10, or 10% above today's peak if that is higher */
export function uvAxisMax(peakUv: number): number {
  return Math.max(UV_AXIS_FLOOR, UV_AXIS_HEADROOM * peakUv);
}

/** Load axis maximum: always 3 MED. The peak never stretches the scale. */
export function loadAxisMax(medSed: number): number {
  return CHART_MED_FRACTION * medSed;
}

/** True when a load value sits strictly above the 3 MED plot ceiling */
export function isLoadOffChart(load: number, chartSed: number): boolean {
  return load > chartSed;
}

/** True when now or today's peak sits strictly above the 3 MED ceiling */
export function isLoadChartOffScale(
  data: Pick<ChartData, "loadNow" | "loadPeak" | "loadMax">,
): boolean {
  return isLoadOffChart(data.loadNow, data.loadMax) || isLoadOffChart(data.loadPeak, data.loadMax);
}

export function toneForLoad(load: number, cautionSed: number, dangerSed: number): LoadTone {
  if (load >= dangerSed) {
    return "danger";
  }
  if (load >= cautionSed) {
    return "moderate";
  }
  return "safe";
}

export function burnRiskLevelForLoad(
  load: number,
  cautionSed: number,
  dangerSed: number,
): BurnRiskLevel {
  return BURN_RISK_FROM_TONE[toneForLoad(load, cautionSed, dangerSed)];
}

/**
 * The next burn-risk level change after `nowMs` on the charted local day.
 * The load may rise or fall (healing, shade, sunscreen), so the next
 * level can be more severe or more benign. Null when the level holds
 * through the end of the displayed domain.
 */
export function nextBurnRiskTransition(
  data: Pick<ChartData, "load" | "cautionSed" | "dangerSed" | "loadNow" | "domain">,
  nowMs: number,
): BurnRiskTransition | null {
  const { load, cautionSed, dangerSed, loadNow, domain } = data;
  if (load.length < 2 || nowMs >= domain.end) {
    return null;
  }
  const current = burnRiskLevelForLoad(loadNow, cautionSed, dangerSed);
  const fromMs = Math.max(nowMs, domain.start);

  for (let i = 1; i < load.length; i += 1) {
    let a = load[i - 1];
    let b = load[i];
    if (b.time <= fromMs) {
      continue;
    }
    if (a.time >= domain.end) {
      break;
    }
    if (a.time < fromMs) {
      a = interpolateLoadPoint(a, b, fromMs);
    }
    if (b.time > domain.end) {
      b = interpolateLoadPoint(a, b, domain.end);
    }

    const times = thresholdCrossingsOnSegment(a, b, cautionSed, dangerSed)
      .filter((time) => time > fromMs && time <= domain.end)
      .sort((x, y) => x - y);

    for (const time of times) {
      const peekAt = time < b.time ? Math.min(b.time, time + 1) : time;
      const level = burnRiskLevelForLoad(loadOnSegment(a, b, peekAt), cautionSed, dangerSed);
      if (level !== current) {
        return { level, atMs: time };
      }
    }
  }
  return null;
}

function interpolateLoadPoint(a: LoadPoint, b: LoadPoint, time: number): LoadPoint {
  return { time, load: loadOnSegment(a, b, time), indoors: a.indoors };
}

function loadOnSegment(a: LoadPoint, b: LoadPoint, time: number): number {
  const span = b.time - a.time;
  const lambda = span === 0 ? 1 : (time - a.time) / span;
  return a.load + lambda * (b.load - a.load);
}

/** Instants where the segment hits or leaves a risk threshold */
function thresholdCrossingsOnSegment(
  a: LoadPoint,
  b: LoadPoint,
  cautionSed: number,
  dangerSed: number,
): number[] {
  const times: number[] = [];
  for (const threshold of [cautionSed, dangerSed]) {
    const da = a.load - threshold;
    const db = b.load - threshold;
    if (da === 0 && db === 0) {
      continue;
    }
    if (da === 0 && db !== 0) {
      if (b.time > a.time) {
        times.push(Math.min(b.time, a.time + 1));
      }
      continue;
    }
    if ((da > 0 && db > 0) || (da < 0 && db < 0) || a.load === b.load) {
      continue;
    }
    const lambda = (threshold - a.load) / (b.load - a.load);
    if (lambda <= 0 || lambda > 1) {
      /* v8 ignore next -- opposite-sign loads already constrain lambda to (0, 1] */
      continue;
    }
    times.push(a.time + lambda * (b.time - a.time));
  }
  return times;
}

/**
 * Forecast to draw for `locationId`: the successful series, or a retained
 * previous one while a refresh is in flight / after a failure. Mismatched
 * location ids are ignored so a stale other-place forecast cannot paint.
 */
export function forecastForChart(
  state: ForecastState,
  locationId: LocationId | undefined,
): UvForecast | null {
  if (locationId === undefined) {
    return null;
  }
  switch (state.status) {
    case "success":
      return state.locationId === locationId ? state.forecast : null;
    case "fetching":
      return state.locationId === locationId ? (state.previous?.forecast ?? null) : null;
    case "failure":
      return state.locationId === locationId ? (state.previous?.forecast ?? null) : null;
    case "empty":
      return null;
  }
}

/**
 * True while this location has no UV series to draw and one is still on
 * its way. A refresh that retained the previous forecast is not pending:
 * the chart keeps showing that series instead of a spinner.
 */
export function isUvForecastPending(
  state: ForecastState,
  locationId: LocationId | undefined,
): boolean {
  if (forecastForChart(state, locationId) !== null) {
    return false;
  }
  if (locationId === undefined) {
    return false;
  }
  switch (state.status) {
    case "empty":
      return true;
    case "fetching":
      return state.locationId === locationId;
    case "success":
    case "failure":
      return false;
  }
}

/**
 * Assembles today's chart from the set location's forecast and, when
 * present, the current simulation trajectory. The x domain is always
 * local midnight to the next midnight. Missing forecast hours are UV 0;
 * a missing trajectory is an indoor zero-load line the plot can hide
 * until the run is current.
 */
export function createDayChartData(request: DayChartRequest): ChartData {
  const { nowMs, timeZone, skinTone, forecast, trajectory, events, dayStart } = request;
  const dayEnd = nextFirstSecondOfLocalDay(timeZone, dayStart);
  const { cautionSed, dangerSed, chartSed } = loadThresholdsFor(skinTone);

  const uv = uvSeriesForDay(forecast, dayStart, dayEnd);
  const uvPeak = uv.reduce((max, point) => (point.uvIndex > max.uvIndex ? point : max), uv[0]);
  const uvNow = uvAtTime(uv, nowMs);

  const dayTrajectory = sliceTrajectoryToDay(trajectory, dayStart, dayEnd);
  const load = tagLoadWithExposure(dayTrajectory, events, dayStart, dayEnd);
  const peakLoad = load.reduce((max, point) => Math.max(max, point.load), 0);
  const segments = buildLoadSegments(load, cautionSed, dangerSed, chartSed, nowMs);

  return {
    uv,
    load,
    segments,
    cautionSed,
    dangerSed,
    cautionTime: firstTimeLoadReaches(dayTrajectory, cautionSed),
    dangerTime: firstTimeLoadReaches(dayTrajectory, dangerSed),
    uvNow,
    uvPeak,
    loadNow: loadAtTime(trajectory, nowMs),
    loadPeak: peakLoad,
    uvMax: uvAxisMax(uvPeak.uvIndex),
    loadMax: chartSed,
    domain: { start: dayStart, end: dayEnd },
    timeZone,
  };
}

/**
 * Splits the load series into maximal runs of equal (tone, past/future,
 * indoor, clipped) class, interpolating exact crossings of the thresholds
 * and now. The 3 MED ceiling is a clip, not a fourth risk colour.
 */
export function buildLoadSegments(
  load: readonly LoadPoint[],
  cautionSed: number,
  dangerSed: number,
  chartSed: number,
  nowMs: number,
): LoadSegment[] {
  if (load.length < 2) {
    return [];
  }

  const split: LoadPoint[] = [load[0]];
  for (let i = 1; i < load.length; i += 1) {
    const a = load[i - 1];
    const b = load[i];
    for (const threshold of [cautionSed, dangerSed, chartSed]) {
      if ((a.load - threshold) * (b.load - threshold) < 0) {
        const lambda = (threshold - a.load) / (b.load - a.load);
        split.push({
          time: a.time + lambda * (b.time - a.time),
          load: threshold,
          indoors: a.indoors,
        });
      }
    }
    if (a.time < nowMs && b.time > nowMs) {
      const lambda = (nowMs - a.time) / (b.time - a.time);
      split.push({
        time: nowMs,
        load: a.load + lambda * (b.load - a.load),
        indoors: a.indoors,
      });
    }
    split.push(b);
  }
  split.sort((p, q) => p.time - q.time);

  const segments: LoadSegment[] = [];
  for (let i = 0; i < split.length - 1; i += 1) {
    const a = split[i];
    const b = split[i + 1];
    if (a.time === b.time && a.load === b.load) {
      continue;
    }
    const midLoad = (a.load + b.load) / 2;
    const tone = toneForLoad(midLoad, cautionSed, dangerSed);
    const clipped = isLoadOffChart(midLoad, chartSed);
    const future = (a.time + b.time) / 2 > nowMs;
    const last = segments[segments.length - 1];
    if (
      last &&
      last.tone === tone &&
      last.future === future &&
      last.indoors === a.indoors &&
      last.clipped === clipped
    ) {
      last.points.push(b);
    } else {
      segments.push({ points: [a, b], tone, future, indoors: a.indoors, clipped });
    }
  }
  return segments;
}

/** Pixel x of an instant on the 0–24 local-hour axis */
export function chartX(
  data: Pick<ChartData, "timeZone" | "domain">,
  time: number,
  plotWidth: number,
): number {
  const hours = localHoursOnChart(data.timeZone, time, data.domain.start, data.domain.end);
  return (hours / 24) * plotWidth;
}

/** Instant on the local-day axis for a pixel x in the plot. */
export function chartTime(
  data: Pick<ChartData, "timeZone" | "domain">,
  plotX: number,
  plotWidth: number,
): MsSinceEpoch {
  const hours = Math.min(24, Math.max(0, (plotX / plotWidth) * 24));
  return instantAtLocalMinutes(data.timeZone, hours * 60, data.domain.start);
}

/**
 * Pixel x of a wall-clock hour label on a 0–24 plot. Labels are placed at
 * equal fractions of the axis, not by converting `hour:00` to an instant
 * and running it through {@link chartX}: a leftover `domain.start` after
 * midnight (another zone's day) would clamp every morning tick to x = 0.
 */
export function chartHourTickOffset(hour: number, plotWidth: number): number {
  return (hour / 24) * plotWidth;
}

function uvSeriesForDay(
  forecast: UvForecast | null,
  dayStart: MsSinceEpoch,
  dayEnd: MsSinceEpoch,
): UvPoint[] {
  const hourly = (forecast?.hourly ?? []).filter(
    (entry) => entry.time >= dayStart && entry.time <= dayEnd,
  );
  const interpolator =
    hourly.length > 0
      ? uvInterpolatorFromForecast({
          utcOffsetSeconds: forecast?.utcOffsetSeconds ?? createSeconds(0),
          hourly,
        })
      : new PchipInterpolator([]);
  const first = hourly[0]?.time;
  const last = hourly[hourly.length - 1]?.time;
  const stepMs = UV_SAMPLE_MINUTES * 60_000;
  const points: UvPoint[] = [];
  for (let t = dayStart as number; t < dayEnd; t += stepMs) {
    points.push({ time: t, uvIndex: uvAtKnot(interpolator, t, first, last) });
  }
  points.push({ time: dayEnd, uvIndex: uvAtKnot(interpolator, dayEnd, first, last) });
  return points;
}

function uvAtKnot(
  interpolator: PchipInterpolator,
  t: number,
  first: number | undefined,
  last: number | undefined,
): number {
  if (first === undefined || last === undefined || t < first || t > last) {
    return 0;
  }
  return interpolator.evaluate(t);
}

function uvAtTime(uv: readonly UvPoint[], atMs: number): number {
  /* v8 ignore next -- the day sampler always emits at least two knots */
  if (uv.length === 0) {
    return 0;
  }
  if (atMs <= uv[0].time) {
    return uv[0].uvIndex;
  }
  const last = uv[uv.length - 1];
  if (atMs >= last.time) {
    return last.uvIndex;
  }
  for (let i = 1; i < uv.length; i += 1) {
    const a = uv[i - 1];
    const b = uv[i];
    if (atMs <= b.time) {
      const span = b.time - a.time;
      const lambda = span === 0 ? 1 : (atMs - a.time) / span;
      return a.uvIndex + lambda * (b.uvIndex - a.uvIndex);
    }
  }
  /* v8 ignore next -- sorted UV knots always return in the loop */
  return last.uvIndex;
}

function sliceTrajectoryToDay(
  trajectory: readonly SimulationState[],
  dayStart: MsSinceEpoch,
  dayEnd: MsSinceEpoch,
): SimulationState[] {
  if (trajectory.length === 0) {
    return [];
  }
  const interior = trajectory.filter((sample) => sample.time > dayStart && sample.time < dayEnd);
  const at = (time: MsSinceEpoch): SimulationState => {
    const exact = trajectory.find((sample) => sample.time === time);
    if (exact) {
      return exact;
    }
    return {
      time,
      erythemaLoad: createErythemaLoad(loadAtTime(trajectory, time)),
      effectiveSpf: createSpf(1),
    };
  };
  return [at(dayStart), ...interior, at(dayEnd)];
}

function tagLoadWithExposure(
  trajectory: readonly SimulationState[],
  events: readonly TimestampedSimulationEvent[],
  dayStart: MsSinceEpoch,
  dayEnd: MsSinceEpoch,
): LoadPoint[] {
  if (trajectory.length === 0) {
    return [
      { time: dayStart, load: 0, indoors: true },
      { time: dayEnd, load: 0, indoors: true },
    ];
  }
  const { context: startContext, events: upcoming } = windowFrom(events, dayStart);
  let eventIndex = 0;
  let context = startContext;
  const points: LoadPoint[] = [];
  for (const sample of trajectory) {
    while (eventIndex < upcoming.length && upcoming[eventIndex].time <= sample.time) {
      context = applySimulationEvent(context, upcoming[eventIndex].event);
      eventIndex += 1;
    }
    points.push({
      time: sample.time,
      load: sample.erythemaLoad,
      indoors: context.exposure.status === "indoors",
    });
  }
  return points;
}
