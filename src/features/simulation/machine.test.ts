import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { ExposureState, OutdoorWindow } from "@/features/exposure";
import type { LoadIntegrator } from "@/features/simulation/integrator";
import type { SimulationState, SimulationStateStore } from "@/features/simulation/model";
import { isSimulationOutputCurrent } from "@/features/simulation/persist";
import { createSimulationStateStore } from "@/features/simulation/store";
import type { SunscreenApplication, SunscreenState } from "@/features/sunscreen";
import type { TimestampedUvForecast, UvForecast } from "@/shared/domain";
import {
  createErythemaLoad,
  createLocation,
  createMsSinceEpoch,
  createSeconds,
  createSpf,
  createUvIndex,
  type Location,
  type Milliseconds,
} from "@/shared/domain";
import type { Timeout, TimeoutFactory } from "@/shared/platform/clock";
import type { RequestFactory, RequestHandle, ResponseHandler } from "@/shared/platform/http";
import type { ForecastResponse } from "@/shared/platform/open-meteo/forecastSchema";
import type { UvForecastQuery } from "@/shared/platform/open-meteo/uvUrl";
import { firstSecondOfUtcDayDaysAgo } from "@/shared/time";
import { HISTORICAL_LOOKBACK_DAYS, preloadSimulationLoad, SimulationStateMachine } from "./machine";
import { createSimulationStore, type SimulationStore } from "./store";

class MockTimeoutFactory implements TimeoutFactory {
  activeTimeouts: Array<() => void> = [];

  create = (handler: () => void, _duration: Milliseconds): Timeout => {
    this.activeTimeouts.push(handler);
    return {
      cancel: () => {
        this.activeTimeouts = this.activeTimeouts.filter((h) => h !== handler);
      },
    };
  };

  flush = () => {
    const handlers = [...this.activeTimeouts];
    this.activeTimeouts = [];
    handlers.forEach((handler) => handler());
  };
}

class MockRequestFactory implements RequestFactory<UvForecastQuery> {
  createdHandlers: ResponseHandler[] = [];
  queries: UvForecastQuery[] = [];
  cancelCount = 0;

  create = (query: UvForecastQuery, handler: ResponseHandler): RequestHandle => {
    this.queries.push(query);
    this.createdHandlers.push(handler);
    return {
      cancel: () => {
        this.cancelCount += 1;
      },
    };
  };

  get requestCount(): number {
    return this.createdHandlers.length;
  }

  simulateSuccess = async (mockData: unknown, handlerIndex?: number) => {
    const handler =
      handlerIndex === undefined
        ? this.createdHandlers[this.createdHandlers.length - 1]
        : this.createdHandlers[handlerIndex];
    await handler?.onResponse(new Response(JSON.stringify(mockData), { status: 200 }));
  };

  simulateHttpError = async (status: number, handlerIndex?: number) => {
    const handler =
      handlerIndex === undefined
        ? this.createdHandlers[this.createdHandlers.length - 1]
        : this.createdHandlers[handlerIndex];
    await handler?.onResponse(new Response(null, { status }));
  };

  simulateError = async (error: Error, handlerIndex?: number) => {
    const handler =
      handlerIndex === undefined
        ? this.createdHandlers[this.createdHandlers.length - 1]
        : this.createdHandlers[handlerIndex];
    await handler?.onError(error);
  };
}

const createTestLocation = (id: string, timezone?: string) =>
  createLocation({
    id,
    name: `Location ${id}`,
    firstAdministrativeDivision: undefined,
    countryName: undefined,
    latitude: 10,
    longitude: 20,
    timezone,
  });

const createTestForecast = (): UvForecast => ({
  utcOffsetSeconds: createSeconds(0),
  hourly: [
    { time: createMsSinceEpoch(Date.parse("2026-08-14T00:00:00Z")), uvIndex: createUvIndex(0) },
    { time: createMsSinceEpoch(Date.parse("2026-08-14T01:00:00Z")), uvIndex: createUvIndex(0.1) },
  ],
});

const createTestTimestampedUvForecast = (fetchedAt: number): TimestampedUvForecast => ({
  fetchedAt: createMsSinceEpoch(fetchedAt),
  forecast: createTestForecast(),
});

const createHistoricalResponseJson = (): ForecastResponse => ({
  latitude: 10,
  longitude: 20,
  generationtime_ms: 0.03,
  utc_offset_seconds: 0,
  timezone: "GMT",
  timezone_abbreviation: "GMT",
  elevation: 24,
  hourly_units: { time: "iso8601", uv_index: "" },
  hourly: {
    time: ["2026-08-13T00:00", "2026-08-13T12:00", "2026-08-13T23:00"],
    uv_index: [0, 6, 0],
  },
});

describe("SimulationStateMachine", () => {
  beforeAll(async () => {
    await preloadSimulationLoad();
  });

  let store: StoreApi<SimulationStore>;
  let stateStore: SimulationStateStore;
  let mockTimeoutFactory: MockTimeoutFactory;
  let mockRequestFactory: MockRequestFactory;
  let machine: SimulationStateMachine;
  let effectiveLocation: Location | null;
  let online: boolean;
  let visible: boolean;
  let now: number;

  const T0 = Date.parse("2026-08-14T12:00:00Z");
  const WINDOW_START = Date.UTC(2026, 7, 13, 0, 0, 0);
  const WINDOW_END = Date.UTC(2026, 7, 16, 0, 0, 0);
  const WINDOW_POINTS = 72 * 60 + 1;
  const NEXT_START = Date.UTC(2026, 7, 14, 0, 0, 0);
  const YESTERDAY_NOON = WINDOW_START + 12 * 3600 * 1000;

  const NONE: SunscreenState = { applications: [], removals: [] };
  const NO_WINDOWS: ExposureState = { windows: [] };

  const pair = (start: number, end: number, location: Location): OutdoorWindow => ({
    id: `w-${start}`,
    start: createMsSinceEpoch(start),
    end: createMsSinceEpoch(end),
    location,
  });

  const applied = (appliedAt: number, spf = 30): SunscreenApplication => ({
    id: `s-${appliedAt}-${spf}`,
    settings: {
      spf: createSpf(spf),
      appliedAt: createMsSinceEpoch(appliedAt),
      degree: "typical",
    },
  });

  beforeEach(() => {
    store = createStore<SimulationStore>()(createSimulationStore);
    stateStore = createSimulationStateStore(store);
    mockTimeoutFactory = new MockTimeoutFactory();
    mockRequestFactory = new MockRequestFactory();
    effectiveLocation = createTestLocation("loc1", "UTC");
    online = true;
    visible = true;
    now = T0;

    machine = new SimulationStateMachine(
      stateStore,
      mockTimeoutFactory,
      mockRequestFactory,
      () => effectiveLocation,
      () => online,
      () => visible,
      () => createMsSinceEpoch(now),
    );
  });

  it("initializes initial conditions at UTC yesterday with zero load and unprotected Spf", () => {
    machine.handleVisibilityChange();
    expect(stateStore.getSimulationInput().initialConditions).toEqual({
      time: WINDOW_START,
      erythemaLoad: 0,
      effectiveSpf: 1,
    });
  });

  it("does not use the location's time zone for the window start", () => {
    effectiveLocation = createTestLocation("loc1", "Europe/Stockholm");
    machine.handleVisibilityChange();
    expect(stateStore.getSimulationInput().initialConditions?.time).toBe(WINDOW_START);
  });

  it("initializes on any signal, not just visibility", () => {
    machine.handleNetworkChange();
    expect(stateStore.getSimulationInput().initialConditions?.time).toBe(WINDOW_START);
  });

  it("does not evaluate while hidden", () => {
    visible = false;
    machine.handleVisibilityChange();
    machine.handleScheduleChange(NO_WINDOWS, { removals: [], applications: [applied(T0)] });
    const state = stateStore.getSimulationInput();
    expect(state.initialConditions).toBeUndefined();
    expect(state.events).toHaveLength(1);
  });

  it("keeps in-window initial conditions without advancing from history", () => {
    machine.handleVisibilityChange();
    const advanceSpy = vi.spyOn(machine, "advanceInitialConditionsFromHistory");
    machine.handleNetworkChange();
    expect(advanceSpy).not.toHaveBeenCalled();
  });

  it("advances initial conditions from history when they predate UTC yesterday", () => {
    machine.handleVisibilityChange();
    now = T0 + 24 * 60 * 60 * 1000;
    const advanceSpy = vi.spyOn(machine, "advanceInitialConditionsFromHistory");
    machine.handleNetworkChange();
    expect(advanceSpy).toHaveBeenCalledTimes(1);
  });

  it("does not fold or reset when the location timezone changes", () => {
    machine.handleVisibilityChange();
    const ic = stateStore.getSimulationInput().initialConditions;
    const advanceSpy = vi.spyOn(machine, "advanceInitialConditionsFromHistory");
    effectiveLocation = createTestLocation("loc2", "Pacific/Auckland");
    machine.handleLocationChange();
    expect(advanceSpy).not.toHaveBeenCalled();
    expect(stateStore.getSimulationInput().initialConditions).toEqual(ic);
    expect(mockRequestFactory.requestCount).toBe(0);
  });

  it("evaluates when the location changes", () => {
    machine.handleLocationChange();
    expect(stateStore.getSimulationInput().initialConditions?.time).toBe(WINDOW_START);
  });

  it("clearLoggedDay zeros load and Spf and drops the event log", () => {
    machine.handleVisibilityChange();
    machine.handleScheduleChange(
      { windows: [pair(now, WINDOW_END - 1000, effectiveLocation as Location)] },
      { applications: [applied(T0)], removals: [] },
    );
    expect(stateStore.getSimulationInput().events.length).toBeGreaterThan(0);
    const state = stateStore.getSimulationInput();
    stateStore.setSimulationInput({
      ...state,
      initialConditions: {
        time: createMsSinceEpoch(WINDOW_START),
        erythemaLoad: createErythemaLoad(1.5),
        effectiveSpf: createSpf(15),
      },
    });
    machine.clearLoggedDay();
    const next = stateStore.getSimulationInput();
    expect(next.events).toEqual([]);
    expect(next.initialConditions).toEqual({
      time: WINDOW_START,
      erythemaLoad: 0,
      effectiveSpf: 1,
    });
  });

  it("keeps initial conditions across a location switch while outdoors", () => {
    const stockholm = createTestLocation("sthlm", "Europe/Stockholm");
    const sydney = createTestLocation("sydney", "Australia/Sydney");
    effectiveLocation = stockholm;
    machine.handleVisibilityChange();
    machine.handleScheduleChange({ windows: [pair(now, WINDOW_END - 1000, stockholm)] }, NONE);
    const ic = stateStore.getSimulationInput().initialConditions;
    effectiveLocation = sydney;
    machine.handleScheduleChange({ windows: [pair(now, WINDOW_END - 1000, sydney)] }, NONE);
    machine.handleLocationChange();
    expect(mockRequestFactory.requestCount).toBe(0);
    expect(stateStore.getSimulationInput().initialConditions).toEqual(ic);
    const output = stateStore.getSimulationOutput();
    expect(output.status === "ready" && output.windowStart).toBe(WINDOW_START);
  });

  it("uses the UTC window even when no location is set", () => {
    effectiveLocation = null;
    machine.handleVisibilityChange();
    expect(stateStore.getSimulationInput().initialConditions?.time).toBe(WINDOW_START);
  });

  it("defers advancing from history while offline", () => {
    machine.handleVisibilityChange();
    online = false;
    now = T0 + 24 * 60 * 60 * 1000;
    machine.handleNetworkChange();
    expect(stateStore.getSimulationInput().initialConditions).toEqual({
      time: WINDOW_START,
      erythemaLoad: 0,
      effectiveSpf: 1,
    });
    const output = stateStore.getSimulationOutput();
    expect(output.status === "ready" && output.windowStart).toBe(NEXT_START);
    expect(mockRequestFactory.requestCount).toBe(0);
  });

  it("upserts forecasts keyed by location id", () => {
    const loc1 = createTestLocation("loc1");
    const loc2 = createTestLocation("loc2");
    machine.handleForecastChange(loc1.id, createTestTimestampedUvForecast(T0));
    machine.handleForecastChange(loc2.id, createTestTimestampedUvForecast(T0 + 1000));
    machine.handleForecastChange(loc1.id, createTestTimestampedUvForecast(T0 + 2000));
    const { forecasts } = stateStore.getSimulationInput();
    expect(Object.keys(forecasts)).toHaveLength(2);
    expect(forecasts[loc1.id].fetchedAt).toBe(T0 + 2000);
    expect(forecasts[loc2.id].fetchedAt).toBe(T0 + 1000);
  });

  it("compiles an outdoor pair into start and end events", () => {
    machine.handleScheduleChange(
      { windows: [pair(T0 + 1000, T0 + 2000, effectiveLocation as Location)] },
      NONE,
    );
    expect(stateStore.getSimulationInput().events).toEqual([
      {
        time: T0 + 1000,
        event: { type: "exposureStart", location: effectiveLocation as Location },
      },
      { time: T0 + 2000, event: { type: "exposureEnd" } },
    ]);
  });

  it("records an empty schedule even when no location is set, and still evaluates", () => {
    effectiveLocation = null;
    machine.handleScheduleChange(NO_WINDOWS, NONE);
    const state = stateStore.getSimulationInput();
    expect(state.events).toEqual([]);
    expect(state.initialConditions?.time).toBe(WINDOW_START);
  });

  it("rewrites sunscreen applications instead of appending", () => {
    const first = applied(T0);
    const second = applied(T0, 50);
    machine.handleScheduleChange(NO_WINDOWS, { removals: [], applications: [first] });
    machine.handleScheduleChange(NO_WINDOWS, { removals: [], applications: [first, second] });
    expect(stateStore.getSimulationInput().events).toEqual([
      { time: T0, event: { type: "sunscreenApplied", sunscreenSettings: first.settings } },
      { time: T0, event: { type: "sunscreenApplied", sunscreenSettings: second.settings } },
    ]);
    machine.handleScheduleChange(NO_WINDOWS, { removals: [], applications: [second] });
    expect(stateStore.getSimulationInput().events).toEqual([
      { time: T0, event: { type: "sunscreenApplied", sunscreenSettings: second.settings } },
    ]);
  });

  it("keeps the window trajectory current when now has a sub-second remainder", () => {
    machine.handleVisibilityChange();
    expect(isSimulationOutputCurrent(stateStore.getSimulationOutput(), now)).toBe(true);
    now = T0 + 600;
    const cream = applied(now);
    machine.handleScheduleChange(NO_WINDOWS, { removals: [], applications: [cream] });
    now = T0 + 1100;
    machine.handleScheduleChange(
      { windows: [pair(now, WINDOW_END - 1000, effectiveLocation as Location)] },
      NONE,
    );
    expect(stateStore.getSimulationInput().initialConditions?.time).toBe(WINDOW_START);
    expect(mockRequestFactory.requestCount).toBe(0);
    expect(isSimulationOutputCurrent(stateStore.getSimulationOutput(), now)).toBe(true);
    expect(isSimulationOutputCurrent(stateStore.getSimulationOutput(), T0)).toBe(true);
  });

  it("orders a backdated sunscreen application before an outdoor start", () => {
    const cream = applied(T0);
    machine.handleScheduleChange(
      { windows: [pair(T0 + 1000, T0 + 2000, effectiveLocation as Location)] },
      { removals: [], applications: [cream] },
    );
    expect(stateStore.getSimulationInput().events.map((e) => e.event.type)).toEqual([
      "sunscreenApplied",
      "exposureStart",
      "exposureEnd",
    ]);
  });

  it("drops events from before UTC yesterday when initializing, and keeps later ones", () => {
    visible = false;
    machine.handleScheduleChange(NO_WINDOWS, {
      applications: [applied(WINDOW_START - 1000), applied(WINDOW_START + 1000, 15)],
      removals: [],
    });
    visible = true;
    machine.handleVisibilityChange();
    expect(stateStore.getSimulationInput().events).toHaveLength(1);
    expect(stateStore.getSimulationInput().events[0]?.time).toBe(WINDOW_START + 1000);
    expect(stateStore.getSimulationInput().initialConditions?.time).toBe(WINDOW_START);
  });

  it("does not record events before the initial conditions", () => {
    machine.handleVisibilityChange();
    machine.handleScheduleChange(NO_WINDOWS, {
      applications: [applied(WINDOW_START - 1)],
      removals: [],
    });
    expect(stateStore.getSimulationInput().events).toEqual([]);
  });

  it("schedules a reevaluation wakeup after each visible evaluation", () => {
    machine.handleVisibilityChange();
    expect(mockTimeoutFactory.activeTimeouts).toHaveLength(1);
    mockTimeoutFactory.flush();
    expect(mockTimeoutFactory.activeTimeouts).toHaveLength(1);
  });

  it("cancels the wakeup when the app becomes hidden", () => {
    machine.handleVisibilityChange();
    visible = false;
    machine.handleVisibilityChange();
    expect(mockTimeoutFactory.activeTimeouts).toHaveLength(0);
  });

  it("does not fetch historical UV when initial conditions are missing", () => {
    machine.advanceInitialConditionsFromHistory();
    expect(mockRequestFactory.requestCount).toBe(0);
    expect(stateStore.getSimulationOutput()).toEqual({ status: "empty" });
  });

  it("writes a minute-resolution trajectory for the UTC forecast window", () => {
    machine.handleVisibilityChange();
    const output = stateStore.getSimulationOutput();
    expect(output.status).toBe("ready");
    if (output.status !== "ready") {
      return;
    }
    expect(output.windowStart).toBe(WINDOW_START);
    expect(output.trajectory[0]?.time).toBe(WINDOW_START);
    expect(output.trajectory[output.trajectory.length - 1]?.time).toBe(WINDOW_END);
    expect(output.trajectory).toHaveLength(WINDOW_POINTS);
    expect(
      output.trajectory.every((p, i) => i === 0 || p.time > output.trajectory[i - 1].time),
    ).toBe(true);
    expect(output.trajectory.every((p) => p.erythemaLoad === 0 && p.effectiveSpf === 1)).toBe(true);
  });

  it("accumulates load from the location forecast while outdoors", () => {
    machine.handleForecastChange(
      (effectiveLocation as Location).id,
      createTestTimestampedUvForecast(T0),
    );
    machine.handleScheduleChange(
      { windows: [pair(T0, WINDOW_END - 1000, effectiveLocation as Location)] },
      NONE,
    );
    const output = stateStore.getSimulationOutput();
    expect(output.status === "ready" && output.trajectory.at(-1)?.erythemaLoad).toBeGreaterThan(0);
  });

  it("rolls initial conditions forward without a fetch when history has no outdoor intervals", () => {
    machine.handleVisibilityChange();
    now = T0 + 24 * 60 * 60 * 1000;
    machine.handleNetworkChange();
    expect(stateStore.getSimulationInput().initialConditions).toEqual({
      time: NEXT_START,
      erythemaLoad: 0,
      effectiveSpf: 1,
    });
    expect(mockRequestFactory.requestCount).toBe(0);
    const output = stateStore.getSimulationOutput();
    expect(output.status === "ready" && output.windowStart).toBe(NEXT_START);
  });

  it("fetches historical UV for outdoor locations in the fold interval, then rolls IC", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    machine.handleVisibilityChange();
    machine.handleScheduleChange(
      {
        windows: [
          pair(YESTERDAY_NOON, YESTERDAY_NOON + 6 * 3600 * 1000, effectiveLocation as Location),
        ],
      },
      NONE,
    );
    now = T0 + 24 * 60 * 60 * 1000;
    machine.handleNetworkChange();
    const inFlight = stateStore.getSimulationOutput();
    expect(inFlight.status === "ready" && inFlight.windowStart).toBe(NEXT_START);
    expect(mockRequestFactory.requestCount).toBe(1);
    expect(mockRequestFactory.queries[0]).toEqual({
      coordinates: (effectiveLocation as Location).coordinates,
      startDate: "2026-08-13",
      endDate: "2026-08-13",
    });
    expect(stateStore.getSimulationInput().initialConditions?.time).toBe(WINDOW_START);
    await mockRequestFactory.simulateSuccess(createHistoricalResponseJson());
    const ic = stateStore.getSimulationInput().initialConditions;
    expect(ic?.time).toBe(NEXT_START);
    expect(ic?.erythemaLoad).toBeGreaterThan(0);
    const output = stateStore.getSimulationOutput();
    expect(output.status === "ready" && output.windowStart).toBe(NEXT_START);
    expect(stateStore.getSimulationInput().events).toEqual([]);
    consoleSpy.mockRestore();
  });

  it("does not start a duplicate historical fetch while one is in flight", () => {
    machine.handleVisibilityChange();
    machine.handleScheduleChange(
      {
        windows: [
          pair(YESTERDAY_NOON, YESTERDAY_NOON + 6 * 3600 * 1000, effectiveLocation as Location),
        ],
      },
      NONE,
    );
    now = T0 + 24 * 60 * 60 * 1000;
    machine.handleNetworkChange();
    machine.handleNetworkChange();
    expect(mockRequestFactory.requestCount).toBe(1);
    expect(mockRequestFactory.cancelCount).toBe(0);
  });

  it("cancels an in-flight historical fetch when the outdoor locations change", async () => {
    const loc2 = createTestLocation("loc2", "UTC");
    machine.handleVisibilityChange();
    machine.handleScheduleChange(
      {
        windows: [
          pair(YESTERDAY_NOON, YESTERDAY_NOON + 6 * 3600 * 1000, effectiveLocation as Location),
        ],
      },
      NONE,
    );
    now = T0 + 24 * 60 * 60 * 1000;
    machine.handleNetworkChange();
    machine.handleScheduleChange(
      {
        windows: [pair(YESTERDAY_NOON + 1000, YESTERDAY_NOON + 6 * 3600 * 1000, loc2)],
      },
      NONE,
    );
    expect(mockRequestFactory.cancelCount).toBe(1);
    expect(mockRequestFactory.requestCount).toBe(2);
    await mockRequestFactory.simulateSuccess(createHistoricalResponseJson(), 0);
    expect(stateStore.getSimulationInput().initialConditions?.time).toBe(WINDOW_START);
  });

  it("ignores a late error from a cancelled historical fetch", async () => {
    const loc2 = createTestLocation("loc2", "UTC");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    machine.handleVisibilityChange();
    machine.handleScheduleChange(
      {
        windows: [
          pair(YESTERDAY_NOON, YESTERDAY_NOON + 6 * 3600 * 1000, effectiveLocation as Location),
        ],
      },
      NONE,
    );
    now = T0 + 24 * 60 * 60 * 1000;
    machine.handleNetworkChange();
    machine.handleScheduleChange(
      {
        windows: [pair(YESTERDAY_NOON + 1000, YESTERDAY_NOON + 6 * 3600 * 1000, loc2)],
      },
      NONE,
    );
    await mockRequestFactory.simulateError(new Error("cancelled"), 0);
    expect(stateStore.getSimulationInput().initialConditions?.time).toBe(WINDOW_START);
    consoleSpy.mockRestore();
  });

  it("completes a historical roll even when a fetch fails, treating missing UV as 0", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    machine.handleVisibilityChange();
    machine.handleScheduleChange(
      {
        windows: [
          pair(YESTERDAY_NOON, YESTERDAY_NOON + 6 * 3600 * 1000, effectiveLocation as Location),
        ],
      },
      NONE,
    );
    now = T0 + 24 * 60 * 60 * 1000;
    machine.handleNetworkChange();
    await mockRequestFactory.simulateError(new Error("network down"));
    expect(stateStore.getSimulationInput().initialConditions?.time).toBe(NEXT_START);
    expect(stateStore.getSimulationInput().initialConditions?.erythemaLoad).toBe(0);
    expect(stateStore.getSimulationOutput().status).toBe("ready");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("completes a historical roll after an HTTP error or unmappable body", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    machine.handleVisibilityChange();
    machine.handleScheduleChange(
      {
        windows: [
          pair(YESTERDAY_NOON, YESTERDAY_NOON + 6 * 3600 * 1000, effectiveLocation as Location),
        ],
      },
      NONE,
    );
    now = T0 + 24 * 60 * 60 * 1000;
    machine.handleNetworkChange();
    await mockRequestFactory.simulateHttpError(500);
    expect(stateStore.getSimulationInput().initialConditions?.time).toBe(NEXT_START);
    store.getState().setSimulationInput({
      ...stateStore.getSimulationInput(),
      initialConditions: {
        time: createMsSinceEpoch(WINDOW_START),
        erythemaLoad: createErythemaLoad(0),
        effectiveSpf: createSpf(1),
      },
      events: [
        {
          time: createMsSinceEpoch(YESTERDAY_NOON),
          event: { type: "exposureStart", location: effectiveLocation as Location },
        },
      ],
    });
    machine.handleNetworkChange();
    await mockRequestFactory.simulateSuccess({
      ...createHistoricalResponseJson(),
      hourly: { time: ["not-a-time"], uv_index: [1] },
    });
    expect(stateStore.getSimulationOutput().status).toBe("ready");
    consoleSpy.mockRestore();
  });

  it("does not apply a historical endpoint if initial conditions disappear mid-fetch", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    machine.handleVisibilityChange();
    machine.handleScheduleChange(
      {
        windows: [
          pair(YESTERDAY_NOON, YESTERDAY_NOON + 6 * 3600 * 1000, effectiveLocation as Location),
        ],
      },
      NONE,
    );
    now = T0 + 24 * 60 * 60 * 1000;
    machine.handleNetworkChange();
    store.getState().setSimulationInput({
      initialConditions: undefined,
      forecasts: {},
      events: [],
    });
    await mockRequestFactory.simulateSuccess(createHistoricalResponseJson());
    expect(stateStore.getSimulationInput().initialConditions).toBeUndefined();
    expect(stateStore.getSimulationOutput().status).toBe("ready");
    consoleSpy.mockRestore();
  });

  it("completes a historical roll after a schema-invalid historical response", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    machine.handleVisibilityChange();
    machine.handleScheduleChange(
      {
        windows: [
          pair(YESTERDAY_NOON, YESTERDAY_NOON + 6 * 3600 * 1000, effectiveLocation as Location),
        ],
      },
      NONE,
    );
    now = T0 + 24 * 60 * 60 * 1000;
    machine.handleNetworkChange();
    await mockRequestFactory.simulateSuccess({ not: "a forecast" });
    expect(stateStore.getSimulationOutput().status).toBe("ready");
    expect(stateStore.getSimulationInput().initialConditions?.time).toBe(NEXT_START);
    consoleSpy.mockRestore();
  });

  it("caps a too-old IC at 14 UTC days with healed load and Spf", () => {
    const stale = Date.UTC(2026, 6, 1, 0, 0, 0);
    store.getState().setSimulationInput({
      initialConditions: {
        time: createMsSinceEpoch(stale),
        erythemaLoad: createErythemaLoad(3),
        effectiveSpf: createSpf(30),
      },
      forecasts: {},
      events: [
        {
          time: createMsSinceEpoch(stale + 12 * 3600 * 1000),
          event: { type: "exposureStart", location: effectiveLocation as Location },
        },
        {
          time: createMsSinceEpoch(Date.UTC(2026, 7, 1, 12, 0, 0)),
          event: { type: "exposureStart", location: effectiveLocation as Location },
        },
      ],
    });
    now = T0;
    machine.handleNetworkChange();
    const capStart = firstSecondOfUtcDayDaysAgo(now, HISTORICAL_LOOKBACK_DAYS);
    expect(stateStore.getSimulationInput().initialConditions).toEqual({
      time: capStart,
      erythemaLoad: 0,
      effectiveSpf: 1,
    });
    expect(stateStore.getSimulationInput().events).toEqual([
      {
        time: Date.UTC(2026, 7, 1, 12, 0, 0),
        event: { type: "exposureStart", location: effectiveLocation as Location },
      },
    ]);
    expect(mockRequestFactory.queries[0]?.startDate).toBe("2026-07-31");
    expect(mockRequestFactory.queries[0]?.endDate).toBe("2026-08-12");
  });

  it("waits for every historical location before rolling", async () => {
    const loc2 = createTestLocation("loc2", "UTC");
    store.getState().setSimulationInput({
      initialConditions: {
        time: createMsSinceEpoch(WINDOW_START),
        erythemaLoad: createErythemaLoad(0),
        effectiveSpf: createSpf(1),
      },
      forecasts: {},
      events: [
        {
          time: createMsSinceEpoch(WINDOW_START + 1000),
          event: { type: "exposureStart", location: effectiveLocation as Location },
        },
        {
          time: createMsSinceEpoch(WINDOW_START + 1500),
          event: { type: "exposureStart", location: effectiveLocation as Location },
        },
        {
          time: createMsSinceEpoch(WINDOW_START + 2000),
          event: { type: "exposureStart", location: loc2 },
        },
      ],
    });
    now = T0 + 24 * 60 * 60 * 1000;
    machine.handleNetworkChange();
    expect(mockRequestFactory.requestCount).toBe(2);
    await mockRequestFactory.simulateSuccess(createHistoricalResponseJson(), 0);
    expect(stateStore.getSimulationInput().initialConditions?.time).toBe(WINDOW_START);
    await mockRequestFactory.simulateSuccess(createHistoricalResponseJson(), 1);
    expect(stateStore.getSimulationInput().initialConditions?.time).toBe(NEXT_START);
  });

  it("drops an in-flight window result when a newer job is queued", () => {
    const held: Array<(trajectory: SimulationState[]) => void> = [];
    const integrator: LoadIntegrator = {
      integrate(job, onResult) {
        held.push((trajectory) => onResult(job, trajectory));
      },
    };
    const queued = new SimulationStateMachine(
      stateStore,
      mockTimeoutFactory,
      mockRequestFactory,
      () => effectiveLocation,
      () => online,
      () => visible,
      () => createMsSinceEpoch(now),
      integrator,
    );
    queued.handleVisibilityChange();
    expect(held).toHaveLength(1);
    queued.handleScheduleChange(NO_WINDOWS, { applications: [applied(T0)], removals: [] });
    expect(held).toHaveLength(1);
    const stale = {
      time: createMsSinceEpoch(WINDOW_START),
      erythemaLoad: createErythemaLoad(1),
      effectiveSpf: createSpf(1),
    };
    held[0]?.([stale]);
    expect(held).toHaveLength(2);
    expect(stateStore.getSimulationOutput().status).not.toBe("ready");
    held[1]?.([{ ...stale, erythemaLoad: createErythemaLoad(2) }]);
    const output = stateStore.getSimulationOutput();
    expect(output.status).toBe("ready");
    if (output.status === "ready") {
      expect(output.trajectory[0]?.erythemaLoad).toBe(2);
    }
  });
});
