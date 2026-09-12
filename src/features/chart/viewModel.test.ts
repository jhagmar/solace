import { describe, expect, it } from "vitest";
import type { ChartData, LoadPoint } from "@/features/chart/viewModel";
import {
  buildLoadSegments,
  burnRiskLevelForLoad,
  chartHourTickOffset,
  chartTime,
  chartX,
  createDayChartData,
  forecastForChart,
  isLoadChartOffScale,
  isLoadOffChart,
  isUvForecastPending,
  loadAxisMax,
  nextBurnRiskTransition,
  toneForLoad,
  UV_AXIS_FLOOR,
  UV_AXIS_HEADROOM,
  uvAxisMax,
} from "@/features/chart/viewModel";
import type { SimulationState, TimestampedSimulationEvent } from "@/features/simulation/model";
import { loadThresholdsFor, SKIN_TONE_PROFILES } from "@/features/skin-tone/model";
import {
  createErythemaLoad,
  createLocation,
  createLocationId,
  createMsSinceEpoch,
  createSeconds,
  createSpf,
  createTimeZone,
  createUvIndex,
} from "@/shared/domain";
import { firstSecondOfLocalDay, localHoursOnChart, nextFirstSecondOfLocalDay } from "@/shared/time";

const UTC = createTimeZone("UTC");
const DAY_START = createMsSinceEpoch(Date.UTC(2026, 7, 14, 0, 0, 0));
const NOON = Date.UTC(2026, 7, 14, 12, 0, 0);
const HOUR = 3_600_000;

const stockholm = createLocation({
  id: "sthlm",
  name: "Stockholm",
  firstAdministrativeDivision: undefined,
  countryName: undefined,
  latitude: 59.33,
  longitude: 18.07,
  timezone: "Europe/Stockholm",
});

const sample = (time: number, load: number, spf = 1): SimulationState => ({
  time: createMsSinceEpoch(time),
  erythemaLoad: createErythemaLoad(load),
  effectiveSpf: createSpf(spf),
});

const outdoorAt = (time: number): TimestampedSimulationEvent => ({
  time: createMsSinceEpoch(time),
  event: { type: "exposureStart", location: stockholm },
});

const indoorAt = (time: number): TimestampedSimulationEvent => ({
  time: createMsSinceEpoch(time),
  event: { type: "exposureEnd" },
});

describe("axis scales", () => {
  it("floors UV at 10 and adds 10% headroom above a higher peak", () => {
    expect(uvAxisMax(6)).toBe(UV_AXIS_FLOOR);
    expect(uvAxisMax(10)).toBeCloseTo(10 * UV_AXIS_HEADROOM);
    expect(uvAxisMax(12)).toBeCloseTo(12 * UV_AXIS_HEADROOM);
  });

  it("pins the load axis at 3 MED regardless of peak", () => {
    expect(loadAxisMax(4)).toBe(12);
    expect(loadAxisMax(8.5)).toBeCloseTo(25.5);
    expect(isLoadOffChart(12, 12)).toBe(false);
    expect(isLoadOffChart(12.01, 12)).toBe(true);
  });
});

describe("loadThresholdsFor / toneForLoad", () => {
  it("uses 1 MED and 2 MED from the ICNIRP mid-range table", () => {
    expect(SKIN_TONE_PROFILES.olive.medSed).toBe(6);
    expect(SKIN_TONE_PROFILES.darkBrown.medSed).toBe(12);
    expect(loadThresholdsFor("medium")).toEqual({ cautionSed: 4, dangerSed: 8, chartSed: 12 });
    expect(toneForLoad(3.9, 4, 8)).toBe("safe");
    expect(toneForLoad(4, 4, 8)).toBe("moderate");
    expect(toneForLoad(8, 4, 8)).toBe("danger");
  });
});

describe("forecastForChart", () => {
  const forecast = {
    utcOffsetSeconds: createSeconds(0),
    hourly: [{ time: DAY_START, uvIndex: createUvIndex(4) }],
  };
  const loc = createLocationId("sthlm");
  const other = createLocationId("gbg");

  it("returns the matching success, previous-while-fetching, or previous-on-failure", () => {
    expect(
      forecastForChart({ status: "success", locationId: loc, forecast, fetchedAt: DAY_START }, loc),
    ).toEqual(forecast);
    expect(
      forecastForChart(
        {
          status: "fetching",
          locationId: loc,
          requestHandle: { cancel: () => {} },
          previous: { forecast, fetchedAt: DAY_START },
        },
        loc,
      ),
    ).toEqual(forecast);
    expect(
      forecastForChart(
        {
          status: "failure",
          locationId: loc,
          reason: "x",
          previous: { forecast, fetchedAt: DAY_START },
        },
        loc,
      ),
    ).toEqual(forecast);
  });

  it("ignores empty, mismatched, and missing-previous states", () => {
    expect(forecastForChart({ status: "empty" }, loc)).toBeNull();
    expect(
      forecastForChart(
        { status: "success", locationId: other, forecast, fetchedAt: DAY_START },
        loc,
      ),
    ).toBeNull();
    expect(
      forecastForChart(
        {
          status: "fetching",
          locationId: loc,
          requestHandle: { cancel: () => {} },
          previous: null,
        },
        loc,
      ),
    ).toBeNull();
    expect(
      forecastForChart({ status: "failure", locationId: loc, reason: "x", previous: null }, loc),
    ).toBeNull();
    expect(
      forecastForChart(
        {
          status: "fetching",
          locationId: other,
          requestHandle: { cancel: () => {} },
          previous: { forecast, fetchedAt: DAY_START },
        },
        loc,
      ),
    ).toBeNull();
    expect(
      forecastForChart(
        {
          status: "failure",
          locationId: other,
          reason: "x",
          previous: { forecast, fetchedAt: DAY_START },
        },
        loc,
      ),
    ).toBeNull();
    expect(forecastForChart({ status: "empty" }, undefined)).toBeNull();
  });
});

describe("isUvForecastPending", () => {
  const loc = createLocationId("sthlm");

  it("is pending while empty or fetching this location with nothing retained", () => {
    expect(isUvForecastPending({ status: "empty" }, loc)).toBe(true);
    expect(
      isUvForecastPending(
        {
          status: "fetching",
          locationId: loc,
          requestHandle: { cancel: () => {} },
          previous: null,
        },
        loc,
      ),
    ).toBe(true);
  });

  it("is not pending when a refresh still has a forecast to draw", () => {
    const forecast = {
      utcOffsetSeconds: createSeconds(0),
      hourly: [{ time: DAY_START, uvIndex: createUvIndex(4) }],
    };
    expect(
      isUvForecastPending(
        {
          status: "fetching",
          locationId: loc,
          requestHandle: { cancel: () => {} },
          previous: { forecast, fetchedAt: DAY_START },
        },
        loc,
      ),
    ).toBe(false);
  });

  it("is not pending once this location has a terminal forecast", () => {
    const forecast = {
      utcOffsetSeconds: createSeconds(0),
      hourly: [{ time: DAY_START, uvIndex: createUvIndex(4) }],
    };
    expect(
      isUvForecastPending(
        { status: "success", locationId: loc, forecast, fetchedAt: DAY_START },
        loc,
      ),
    ).toBe(false);
    expect(
      isUvForecastPending({ status: "failure", locationId: loc, reason: "x", previous: null }, loc),
    ).toBe(false);
    expect(isUvForecastPending({ status: "empty" }, undefined)).toBe(false);
  });
});

describe("createDayChartData", () => {
  const dayEnd = nextFirstSecondOfLocalDay(UTC, DAY_START);

  it("spans the full local day and floors empty UV/load axes", () => {
    const data = createDayChartData({
      nowMs: NOON,
      timeZone: UTC,
      skinTone: "medium",
      forecast: null,
      trajectory: [],
      events: [],
      dayStart: DAY_START,
    });
    expect(data.domain).toEqual({ start: DAY_START, end: dayEnd });
    expect(localHoursOnChart(UTC, data.domain.start, DAY_START, dayEnd)).toBe(0);
    expect(localHoursOnChart(UTC, data.domain.end, DAY_START, dayEnd)).toBe(24);
    expect(data.uv[0]?.uvIndex).toBe(0);
    expect(data.uv[data.uv.length - 1]?.uvIndex).toBe(0);
    expect(data.uvMax).toBe(10);
    expect(data.loadMax).toBe(12);
    expect(data.loadPeak).toBe(0);
    expect(isLoadChartOffScale(data)).toBe(false);
    expect(data.load.every((p) => p.indoors)).toBe(true);
  });

  it("interpolates load at the day bounds when the trajectory does not sample them", () => {
    const data = createDayChartData({
      nowMs: NOON,
      timeZone: UTC,
      skinTone: "medium",
      forecast: null,
      trajectory: [sample(NOON, 1), sample(NOON + HOUR, 3)],
      events: [],
      dayStart: DAY_START,
    });
    expect(data.load[0]?.load).toBe(1);
    expect(data.load[data.load.length - 1]?.load).toBe(3);
  });

  it("treats UV outside the forecast hourly span as 0 and scales to the peak", () => {
    const data = createDayChartData({
      nowMs: NOON,
      timeZone: UTC,
      skinTone: "medium",
      forecast: {
        utcOffsetSeconds: createSeconds(0),
        hourly: [
          { time: createMsSinceEpoch(Date.UTC(2026, 7, 14, 10, 0)), uvIndex: createUvIndex(0) },
          { time: createMsSinceEpoch(Date.UTC(2026, 7, 14, 12, 0)), uvIndex: createUvIndex(12) },
          { time: createMsSinceEpoch(Date.UTC(2026, 7, 14, 14, 0)), uvIndex: createUvIndex(0) },
        ],
      },
      trajectory: [sample(DAY_START, 0), sample(dayEnd, 0)],
      events: [],
      dayStart: DAY_START,
    });
    expect(data.uv.find((p) => p.time === DAY_START)?.uvIndex).toBe(0);
    expect(data.uvPeak.uvIndex).toBe(12);
    expect(data.uvMax).toBeCloseTo(12 * 1.1);
    expect(data.uvNow).toBeCloseTo(12);
  });

  it("treats an empty hourly forecast as UV 0", () => {
    const data = createDayChartData({
      nowMs: NOON,
      timeZone: UTC,
      skinTone: "medium",
      forecast: { utcOffsetSeconds: createSeconds(0), hourly: [] },
      trajectory: [],
      events: [],
      dayStart: DAY_START,
    });
    expect(data.uv.every((point) => point.uvIndex === 0)).toBe(true);
  });

  it("clamps uvNow to the ends of the sampled series", () => {
    const forecast = {
      utcOffsetSeconds: createSeconds(0),
      hourly: [
        { time: createMsSinceEpoch(Date.UTC(2026, 7, 14, 12, 0)), uvIndex: createUvIndex(5) },
      ],
    };
    const before = createDayChartData({
      nowMs: DAY_START,
      timeZone: UTC,
      skinTone: "medium",
      forecast,
      trajectory: [sample(DAY_START, 0), sample(dayEnd, 0)],
      events: [],
      dayStart: DAY_START,
    });
    expect(before.uvNow).toBe(0);
    const after = createDayChartData({
      nowMs: dayEnd,
      timeZone: UTC,
      skinTone: "medium",
      forecast,
      trajectory: [sample(DAY_START, 0), sample(dayEnd, 0)],
      events: [],
      dayStart: DAY_START,
    });
    expect(after.uvNow).toBe(0);
  });

  it("tags indoor/outdoor from the event log (right limit) and keeps loadMax at 3 MED", () => {
    const data = createDayChartData({
      nowMs: NOON,
      timeZone: UTC,
      skinTone: "medium",
      forecast: null,
      trajectory: [
        sample(DAY_START, 0),
        sample(NOON, 4),
        sample(NOON + HOUR, 5),
        sample(dayEnd, 12),
      ],
      events: [outdoorAt(NOON), indoorAt(NOON + HOUR)],
      dayStart: DAY_START,
    });
    expect(data.load.find((p) => p.time === DAY_START)?.indoors).toBe(true);
    expect(data.load.find((p) => p.time === NOON)?.indoors).toBe(false);
    expect(data.load.find((p) => p.time === NOON + HOUR)?.indoors).toBe(true);
    expect(data.loadMax).toBe(12);
    expect(data.loadPeak).toBe(12);
    expect(isLoadChartOffScale(data)).toBe(false);
    expect(data.cautionTime).toBe(NOON);
    expect(data.dangerTime).toBe(dayEnd);
  });

  it("does not stretch the load axis when the peak exceeds 3 MED", () => {
    const data = createDayChartData({
      nowMs: NOON,
      timeZone: UTC,
      skinTone: "medium",
      forecast: null,
      trajectory: [sample(DAY_START, 0), sample(NOON, 8), sample(dayEnd, 20)],
      events: [outdoorAt(DAY_START)],
      dayStart: DAY_START,
    });
    expect(data.loadMax).toBe(12);
    expect(data.loadPeak).toBe(20);
    expect(isLoadChartOffScale(data)).toBe(true);
    expect(data.segments.some((s) => s.clipped && s.tone === "danger")).toBe(true);
    expect(data.segments.some((s) => s.tone === "danger" && !s.clipped)).toBe(true);
  });

  it("slices a multi-day trajectory to the local chart domain", () => {
    const windowStart = Date.UTC(2026, 7, 13, 0, 0, 0);
    const windowEnd = Date.UTC(2026, 7, 16, 0, 0, 0);
    const data = createDayChartData({
      nowMs: NOON,
      timeZone: UTC,
      skinTone: "medium",
      forecast: null,
      trajectory: [
        sample(windowStart, 0),
        sample(DAY_START, 1),
        sample(NOON, 2),
        sample(dayEnd, 3),
        sample(windowEnd, 4),
      ],
      events: [outdoorAt(windowStart + HOUR)],
      dayStart: DAY_START,
    });
    expect(data.load[0]?.time).toBe(DAY_START);
    expect(data.load[data.load.length - 1]?.time).toBe(dayEnd);
    expect(data.load.every((p) => p.time >= DAY_START && p.time <= dayEnd)).toBe(true);
    expect(data.load.find((p) => p.time === DAY_START)?.indoors).toBe(false);
  });
});

describe("buildLoadSegments", () => {
  it("splits at risk thresholds, now, and indoor transitions", () => {
    const segments = buildLoadSegments(
      [
        { time: 0, load: 0, indoors: true },
        { time: 100, load: 1, indoors: true },
        { time: 200, load: 2, indoors: false },
        { time: 300, load: 4, indoors: false },
      ],
      1.5,
      3,
      4.5,
      250,
    );
    expect(segments.some((s) => s.tone === "safe" && s.indoors)).toBe(true);
    expect(segments.some((s) => s.tone === "moderate" && !s.future)).toBe(true);
    expect(segments.some((s) => s.future)).toBe(true);
    expect(segments.some((s) => s.tone === "danger")).toBe(true);
    expect(segments.some((s) => !s.indoors)).toBe(true);
  });

  it("skips zero-width duplicate samples", () => {
    const segments = buildLoadSegments(
      [
        { time: 0, load: 0, indoors: true },
        { time: 0, load: 0, indoors: true },
        { time: 100, load: 1, indoors: true },
      ],
      1.5,
      3,
      4.5,
      50,
    );
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.every((s) => s.points.length >= 2)).toBe(true);
  });

  it("returns empty for a degenerate series", () => {
    expect(buildLoadSegments([], 1, 2, 3, 0)).toEqual([]);
    expect(buildLoadSegments([{ time: 0, load: 0, indoors: true }], 1, 2, 3, 0)).toEqual([]);
  });

  it("marks runs strictly above the ceiling as clipped danger, not a new tone", () => {
    const segments = buildLoadSegments(
      [
        { time: 0, load: 2, indoors: false },
        { time: 100, load: 3, indoors: false },
        { time: 200, load: 5, indoors: false },
        { time: 300, load: 5, indoors: false },
      ],
      1,
      2,
      3,
      400,
    );
    expect(segments.some((s) => s.tone === "danger" && !s.clipped)).toBe(true);
    const clipped = segments.filter((s) => s.clipped);
    expect(clipped.length).toBeGreaterThan(0);
    expect(clipped.every((s) => s.tone === "danger")).toBe(true);
    expect(clipped[0]?.points[0]?.load).toBeCloseTo(3);
  });

  it("does not clip a run that only sits on the 3 MED ceiling", () => {
    const segments = buildLoadSegments(
      [
        { time: 0, load: 3, indoors: false },
        { time: 100, load: 3, indoors: false },
      ],
      1,
      2,
      3,
      50,
    );
    expect(segments.every((s) => !s.clipped)).toBe(true);
    expect(segments.every((s) => s.tone === "danger")).toBe(true);
  });
});

describe("localHoursOnChart", () => {
  it("maps the local day onto 0–24, including next midnight as 24", () => {
    const start = firstSecondOfLocalDay(UTC, NOON);
    const end = nextFirstSecondOfLocalDay(UTC, NOON);
    expect(localHoursOnChart(UTC, start, start, end)).toBe(0);
    expect(localHoursOnChart(UTC, NOON, start, end)).toBe(12);
    expect(localHoursOnChart(UTC, end, start, end)).toBe(24);
    expect(localHoursOnChart(UTC, start - 1, start, end)).toBe(0);
  });
});

describe("chartX", () => {
  it("places local midnight at 0 and next midnight at the plot width", () => {
    const dayEnd = nextFirstSecondOfLocalDay(UTC, DAY_START);
    const data = { timeZone: UTC, domain: { start: DAY_START as number, end: dayEnd as number } };
    expect(chartX(data, DAY_START, 240)).toBe(0);
    expect(chartX(data, NOON, 240)).toBe(120);
    expect(chartX(data, dayEnd, 240)).toBe(240);
  });

  it("clamps instants before the domain start to x = 0", () => {
    const dayEnd = nextFirstSecondOfLocalDay(UTC, DAY_START);
    const data = { timeZone: UTC, domain: { start: DAY_START as number, end: dayEnd as number } };
    expect(chartX(data, DAY_START - HOUR, 240)).toBe(0);
  });
});

describe("chartTime", () => {
  it("inverts chartX on the local-day axis", () => {
    const dayEnd = nextFirstSecondOfLocalDay(UTC, DAY_START);
    const data = { timeZone: UTC, domain: { start: DAY_START as number, end: dayEnd as number } };
    expect(chartTime(data, 0, 240)).toBe(DAY_START);
    expect(chartTime(data, 120, 240)).toBe(NOON);
    expect(chartTime(data, 240, 240)).toBe(dayEnd);
  });
});

describe("chartHourTickOffset", () => {
  it("places hour labels at equal fractions of the 0–24 axis", () => {
    expect(chartHourTickOffset(0, 240)).toBe(0);
    expect(chartHourTickOffset(12, 240)).toBe(120);
    expect(chartHourTickOffset(6, 240)).toBe(60);
    expect(chartHourTickOffset(24, 240)).toBe(240);
  });
});

describe("burnRiskLevelForLoad / nextBurnRiskTransition", () => {
  const cautionSed = 4;
  const dangerSed = 8;

  const point = (time: number, load: number): LoadPoint => ({
    time,
    load,
    indoors: false,
  });

  const data = (
    load: LoadPoint[],
    nowLoad: number,
    domain: { start: number; end: number } = { start: 0, end: 1_000 },
  ): Pick<ChartData, "load" | "cautionSed" | "dangerSed" | "loadNow" | "domain"> => ({
    load,
    cautionSed,
    dangerSed,
    loadNow: nowLoad,
    domain,
  });

  it("maps SED onto low / caution / danger", () => {
    expect(burnRiskLevelForLoad(3.9, cautionSed, dangerSed)).toBe("low");
    expect(burnRiskLevelForLoad(4, cautionSed, dangerSed)).toBe("caution");
    expect(burnRiskLevelForLoad(8, cautionSed, dangerSed)).toBe("danger");
  });

  it("is null when the level holds through the rest of the displayed day", () => {
    expect(nextBurnRiskTransition(data([point(0, 0), point(1_000, 1)], 0.5), 100)).toBeNull();
    expect(nextBurnRiskTransition(data([point(0, 9), point(1_000, 9)], 9), 100)).toBeNull();
  });

  it("reports the next more-severe level, not a later one", () => {
    expect(
      nextBurnRiskTransition(
        data([point(0, 0), point(200, 0), point(400, 5), point(800, 10)], 0),
        100,
      ),
    ).toEqual({ level: "caution", atMs: 200 + ((4 - 0) / (5 - 0)) * 200 });
  });

  it("from caution, the next transition is danger when load keeps rising", () => {
    expect(
      nextBurnRiskTransition(data([point(0, 5), point(200, 5), point(600, 10)], 5), 100),
    ).toEqual({ level: "danger", atMs: 200 + ((8 - 5) / (10 - 5)) * 400 });
  });

  it("from danger, a falling load reports caution then would later report low", () => {
    const falling = data([point(0, 10), point(100, 10), point(500, 0)], 10);
    const toCaution = nextBurnRiskTransition(falling, 50);
    expect(toCaution?.level).toBe("caution");
    expect(toCaution?.atMs).toBeCloseTo(100 + ((8 - 10) / (0 - 10)) * 400);

    const afterCaution = data([point(0, 10), point(100, 10), point(500, 0)], 5);
    const toLow = nextBurnRiskTransition(afterCaution, toCaution!.atMs + 1);
    expect(toLow?.level).toBe("low");
    expect(toLow?.atMs).toBeCloseTo(100 + ((4 - 10) / (0 - 10)) * 400);
  });

  it("ignores crossings at or before now, and after the displayed domain", () => {
    expect(
      nextBurnRiskTransition(data([point(0, 0), point(200, 5), point(400, 10)], 5), 250),
    ).toEqual({ level: "danger", atMs: 200 + ((8 - 5) / (10 - 5)) * 200 });

    expect(
      nextBurnRiskTransition(data([point(0, 0), point(200, 5)], 0, { start: 0, end: 150 }), 50),
    ).toBeNull();
  });

  it("crosses caution first when a single segment jumps from low to danger", () => {
    expect(
      nextBurnRiskTransition(data([point(0, 0), point(100, 0), point(500, 12)], 0), 50),
    ).toEqual({ level: "caution", atMs: 100 + ((4 - 0) / (12 - 0)) * 400 });
  });

  it("is null for a short series, after the domain, or when a later sample is past the domain", () => {
    expect(nextBurnRiskTransition(data([point(0, 0)], 0), 0)).toBeNull();
    expect(nextBurnRiskTransition(data([point(0, 0), point(1_000, 10)], 0), 1_000)).toBeNull();
    expect(
      nextBurnRiskTransition(
        data([point(0, 0), point(50, 0), point(1_000, 0), point(2_000, 10)], 0, {
          start: 0,
          end: 1_000,
        }),
        50,
      ),
    ).toBeNull();
  });

  it("skips a segment that sits on a threshold at both ends, then leaves it", () => {
    expect(nextBurnRiskTransition(data([point(0, 4), point(200, 4), point(400, 9)], 4), 0)).toEqual(
      {
        level: "danger",
        atMs: 200 + ((8 - 4) / (9 - 4)) * 200,
      },
    );
  });

  it("starts a crossing from a sample sitting on the threshold", () => {
    expect(nextBurnRiskTransition(data([point(0, 4), point(200, 9)], 4), 0)?.level).toBe("danger");
  });
});
