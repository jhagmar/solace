import { describe, expect, it } from "vitest";
import {
  ERYTHEMAL_RECOVERY_RATE_PER_SECOND,
  firstTimeLoadReaches,
  interpolatorsFromForecasts,
  loadAtTime,
  loadDerivatives,
  SED_PER_UVI_PER_SECOND,
  SUNSCREEN_DEGRADATION_RATE_PER_SECOND,
  SUNSCREEN_FRACTION_RECOMMENDED,
  SUNSCREEN_FRACTION_TYPICAL,
  simulateLoadTrajectory,
  TODAY_OUTPUT_STEP_SECONDS,
  UNPROTECTED_SPF,
} from "@/features/simulation/load";
import type { SimulationState, TimestampedSimulationEvent } from "@/features/simulation/model";
import { PchipInterpolator } from "@/features/simulation/ode/PchipInterpolator";
import { DEFAULT_SIMULATION_CONTEXT } from "@/features/simulation/schedule";
import type { TimestampedUvForecast } from "@/shared/domain";
import {
  createErythemaLoad,
  createLocation,
  createMsSinceEpoch,
  createSeconds,
  createSpf,
  createUvIndex,
} from "@/shared/domain";

const T0 = Date.parse("2026-08-14T00:00:00Z");
const HOUR = 3_600_000;

const location = createLocation({
  id: "sthlm",
  name: "Stockholm",
  firstAdministrativeDivision: undefined,
  countryName: undefined,
  latitude: 59.33,
  longitude: 18.07,
  timezone: "Europe/Stockholm",
});

const initial = (time = T0, load = 0, spf = 1): SimulationState => ({
  time: createMsSinceEpoch(time),
  erythemaLoad: createErythemaLoad(load),
  effectiveSpf: createSpf(spf),
});

const constantUv = (uv: number): PchipInterpolator =>
  new PchipInterpolator([
    { x: T0, y: uv },
    { x: T0 + 24 * HOUR, y: uv },
  ]);

const interpolators = (uv: number): Map<typeof location.id, PchipInterpolator> =>
  new Map([[location.id, constantUv(uv)]]);

const outdoor = (time: number): TimestampedSimulationEvent => ({
  time: createMsSinceEpoch(time),
  event: { type: "exposureStart", location },
});

const indoor = (time: number): TimestampedSimulationEvent => ({
  time: createMsSinceEpoch(time),
  event: { type: "exposureEnd" },
});

const apply = (
  time: number,
  spf: number,
  degree: "light" | "typical" | "recommended" = "typical",
): TimestampedSimulationEvent => ({
  time: createMsSinceEpoch(time),
  event: {
    type: "sunscreenApplied",
    sunscreenSettings: {
      spf: createSpf(spf),
      appliedAt: createMsSinceEpoch(time),
      degree,
    },
  },
});

const remainingLoad = (load: number, durationS: number): number =>
  load * Math.exp(-ERYTHEMAL_RECOVERY_RATE_PER_SECOND * durationS);

const remainingSpf = (spf: number, durationS: number): number =>
  1 + (spf - 1) * Math.exp(-SUNSCREEN_DEGRADATION_RATE_PER_SECOND * durationS);

const effectiveSpf = (spf: number, fraction: number): number => spf ** fraction;

const remove = (time: number): TimestampedSimulationEvent => ({
  time: createMsSinceEpoch(time),
  event: { type: "sunscreenRemoved" },
});

describe("loadDerivatives", () => {
  it("is identically zero indoors when there is nothing to recover or degrade", () => {
    const yp = loadDerivatives(0, [0, 1], DEFAULT_SIMULATION_CONTEXT, interpolators(8), T0);
    expect(yp[0]).toBeCloseTo(0);
    expect(yp[1]).toBeCloseTo(0);
  });

  it("recovers load and degrades surplus Spf indoors", () => {
    const yp = loadDerivatives(0, [2, 5], DEFAULT_SIMULATION_CONTEXT, interpolators(8), T0);
    expect(yp[0]).toBeCloseTo(-ERYTHEMAL_RECOVERY_RATE_PER_SECOND * 2);
    expect(yp[1]).toBeCloseTo(-SUNSCREEN_DEGRADATION_RATE_PER_SECOND * (5 - 1));
  });

  it("accumulates load as uv / (spf · 4000) outdoors, plus recovery, with Spf decaying toward 1", () => {
    const yp = loadDerivatives(
      0,
      [0, 2],
      { exposure: { status: "outdoors", location }, sunscreen: null },
      interpolators(8),
      T0,
    );
    expect(yp[0]).toBeCloseTo((8 * SED_PER_UVI_PER_SECOND) / 2);
    expect(yp[1]).toBeCloseTo(-SUNSCREEN_DEGRADATION_RATE_PER_SECOND * (2 - 1));
  });

  it("treats a missing interpolator as UV 0", () => {
    const yp = loadDerivatives(
      0,
      [0, 1],
      { exposure: { status: "outdoors", location }, sunscreen: null },
      new Map(),
      T0,
    );
    expect(yp[0]).toBeCloseTo(0);
    expect(yp[1]).toBeCloseTo(0);
  });
});

describe("simulateLoadTrajectory", () => {
  it("rejects a reversed interval and returns the initial state on a degenerate one", () => {
    expect(() =>
      simulateLoadTrajectory({
        t0: createMsSinceEpoch(T0 + 1000),
        tEnd: createMsSinceEpoch(T0),
        initial: initial(),
        events: [],
        interpolators: new Map(),
        outputStepSeconds: 0,
      }),
    ).toThrow(/tEnd/);

    expect(
      simulateLoadTrajectory({
        t0: createMsSinceEpoch(T0),
        tEnd: createMsSinceEpoch(T0),
        initial: initial(T0, 1.5, 30),
        events: [],
        interpolators: new Map(),
        outputStepSeconds: 60,
      }),
    ).toEqual([initial(T0, 1.5, 30)]);
  });

  it("does not accumulate load while indoors", () => {
    const trajectory = simulateLoadTrajectory({
      t0: createMsSinceEpoch(T0),
      tEnd: createMsSinceEpoch(T0 + HOUR),
      initial: initial(),
      events: [],
      interpolators: interpolators(8),
      outputStepSeconds: 0,
    });
    const end = trajectory[trajectory.length - 1];
    expect(end.erythemaLoad).toBeCloseTo(0);
    expect(end.effectiveSpf).toBe(UNPROTECTED_SPF);
    expect(end.time).toBe(T0 + HOUR);
  });

  it("accumulates load while outdoors under constant UV", () => {
    const durationS = 10;
    const uv = 4;
    const trajectory = simulateLoadTrajectory({
      t0: createMsSinceEpoch(T0),
      tEnd: createMsSinceEpoch(T0 + durationS * 1000),
      initial: initial(),
      events: [outdoor(T0)],
      interpolators: interpolators(uv),
      outputStepSeconds: 0,
    });
    const end = trajectory[trajectory.length - 1];
    // 10 s is a blink relative to the 40 h recovery half-life
    expect(end.erythemaLoad).toBeCloseTo(uv * SED_PER_UVI_PER_SECOND * durationS, 6);
    expect(end.effectiveSpf).toBe(1);
  });

  it("jumps effective Spf on apply/remove and scales the subsequent load rate", () => {
    const uv = 4;
    const labelled = 4;
    const applied = effectiveSpf(labelled, SUNSCREEN_FRACTION_TYPICAL);
    const trajectory = simulateLoadTrajectory({
      t0: createMsSinceEpoch(T0),
      tEnd: createMsSinceEpoch(T0 + 20_000),
      initial: initial(),
      events: [outdoor(T0), apply(T0 + 10_000, labelled), remove(T0 + 15_000)],
      interpolators: interpolators(uv),
      outputStepSeconds: 0,
    });
    const at = (time: number) => trajectory.filter((p) => p.time === time).at(-1);
    expect(at(T0 + 10_000)?.effectiveSpf).toBeCloseTo(applied);
    expect(at(T0 + 15_000)?.effectiveSpf).toBe(1);

    const end = trajectory[trajectory.length - 1];
    const unprotected = uv * SED_PER_UVI_PER_SECOND * 10;
    const protectedSegment = ((uv * SED_PER_UVI_PER_SECOND) / applied) * 5;
    const afterRemove = uv * SED_PER_UVI_PER_SECOND * 5;
    expect(end.erythemaLoad).toBeCloseTo(unprotected + protectedSegment + afterRemove, 5);
  });

  it("uses the labelled Spf at the recommended amount and replaces rather than stacking", () => {
    const labelled = 16;
    const trajectory = simulateLoadTrajectory({
      t0: createMsSinceEpoch(T0),
      tEnd: createMsSinceEpoch(T0 + 2000),
      initial: initial(),
      events: [apply(T0, labelled, "recommended"), apply(T0 + 1000, 4, "recommended")],
      interpolators: interpolators(0),
      outputStepSeconds: 0,
    });
    const at = (time: number) => trajectory.filter((p) => p.time === time).at(-1);
    expect(at(T0)?.effectiveSpf).toBeCloseTo(
      effectiveSpf(labelled, SUNSCREEN_FRACTION_RECOMMENDED),
    );
    expect(at(T0 + 1000)?.effectiveSpf).toBeCloseTo(
      effectiveSpf(4, SUNSCREEN_FRACTION_RECOMMENDED),
    );
  });

  it("collapses same-time samples to the right limit", () => {
    const trajectory = simulateLoadTrajectory({
      t0: createMsSinceEpoch(T0),
      tEnd: createMsSinceEpoch(T0 + 1000),
      initial: initial(),
      events: [apply(T0, 30), outdoor(T0)],
      interpolators: interpolators(0),
      outputStepSeconds: 0,
    });
    const atT0 = trajectory.filter((p) => p.time === T0);
    expect(atT0).toHaveLength(1);
    expect(atT0[0].effectiveSpf).toBeCloseTo(effectiveSpf(30, SUNSCREEN_FRACTION_TYPICAL));
    expect(trajectory.every((p, i) => i === 0 || p.time > trajectory[i - 1].time)).toBe(true);
  });

  it("emits minute-resolution interior samples for a today-style run", () => {
    const tEnd = T0 + 3 * 60_000;
    const trajectory = simulateLoadTrajectory({
      t0: createMsSinceEpoch(T0),
      tEnd: createMsSinceEpoch(tEnd),
      initial: initial(),
      events: [],
      interpolators: new Map(),
      outputStepSeconds: TODAY_OUTPUT_STEP_SECONDS,
    });
    expect(trajectory.map((p) => p.time)).toEqual([T0, T0 + 60_000, T0 + 120_000, tEnd]);
  });

  it("with no interior samples, still returns endpoints so history can take the last point", () => {
    const tEnd = T0 + HOUR;
    const trajectory = simulateLoadTrajectory({
      t0: createMsSinceEpoch(T0),
      tEnd: createMsSinceEpoch(tEnd),
      initial: initial(T0, 0.4, 15),
      events: [outdoor(T0), indoor(T0 + 10_000)],
      interpolators: interpolators(0),
      outputStepSeconds: 0,
    });
    expect(trajectory[0].time).toBe(T0);
    const end = trajectory[trajectory.length - 1];
    expect(end.time).toBe(tEnd);
    expect(end.erythemaLoad).toBeCloseTo(remainingLoad(0.4, HOUR / 1000), 5);
    expect(end.effectiveSpf).toBeCloseTo(remainingSpf(15, HOUR / 1000), 5);
    // Interior minutes are not recorded
    expect(trajectory.some((p) => p.time === T0 + 60_000)).toBe(false);
  });

  it("ignores events after tEnd and folds events before t0 into context", () => {
    const trajectory = simulateLoadTrajectory({
      t0: createMsSinceEpoch(T0 + HOUR),
      tEnd: createMsSinceEpoch(T0 + 2 * HOUR),
      initial: initial(T0 + HOUR),
      events: [outdoor(T0), indoor(T0 + 2 * HOUR + 1)],
      interpolators: interpolators(8),
      outputStepSeconds: 0,
    });
    // Outdoor from before t0 is in context, so this hour accumulates
    const end = trajectory[trajectory.length - 1];
    expect(end.erythemaLoad).toBeGreaterThan(0);
  });

  it("halves surplus Spf over the two-hour wear half-life", () => {
    const trajectory = simulateLoadTrajectory({
      t0: createMsSinceEpoch(T0),
      tEnd: createMsSinceEpoch(T0 + 2 * HOUR),
      initial: initial(T0, 0, 9),
      events: [],
      interpolators: new Map(),
      outputStepSeconds: 0,
    });
    const end = trajectory[trajectory.length - 1];
    expect(end.effectiveSpf).toBeCloseTo(5, 5);
    expect(end.erythemaLoad).toBe(0);
  });
});

describe("interpolatorsFromForecasts", () => {
  it("builds a PCHIP per location from the retained forecasts", () => {
    const forecast: TimestampedUvForecast = {
      fetchedAt: createMsSinceEpoch(T0),
      forecast: {
        utcOffsetSeconds: createSeconds(0),
        hourly: [
          { time: createMsSinceEpoch(T0), uvIndex: createUvIndex(0) },
          { time: createMsSinceEpoch(T0 + HOUR), uvIndex: createUvIndex(4) },
        ],
      },
    };
    const map = interpolatorsFromForecasts({ [location.id]: forecast });
    expect(map.get(location.id)?.evaluate(T0 + HOUR)).toBe(4);
  });
});

describe("loadAtTime / firstTimeLoadReaches", () => {
  const trajectory: SimulationState[] = [
    initial(T0, 0, 1),
    initial(T0 + 1000, 2, 1),
    initial(T0 + 2000, 4, 1),
  ];

  it("interpolates between samples and clamps outside the span", () => {
    expect(loadAtTime([], T0)).toBe(0);
    expect(loadAtTime(trajectory, T0 - 1)).toBe(0);
    expect(loadAtTime(trajectory, T0 + 2000)).toBe(4);
    expect(loadAtTime(trajectory, T0 + 3000)).toBe(4);
    expect(loadAtTime(trajectory, T0 + 500)).toBeCloseTo(1);
    expect(loadAtTime([initial(T0, 1, 1), initial(T0, 3, 1), initial(T0 + 1000, 5, 1)], T0)).toBe(
      1,
    );
  });

  it("returns the first instant the load reaches a threshold", () => {
    expect(firstTimeLoadReaches([], 1)).toBeNull();
    expect(firstTimeLoadReaches(trajectory, 2)).toBe(T0 + 1000);
    expect(firstTimeLoadReaches(trajectory, 5)).toBeNull();
  });
});
