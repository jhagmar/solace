import { describe, expect, it } from "vitest";
import type { TimestampedSimulationEvent } from "@/features/simulation/model";
import {
  applicationsFromEvents,
  applySimulationEvent,
  asSimulationEvent,
  clipEventsFrom,
  DEFAULT_SIMULATION_CONTEXT,
  eventsFromSchedule,
  insertTimestampedEvent,
  locationIdsInEvents,
  pruneForecasts,
  pruneSimulationInput,
  removalsFromEvents,
  uvInterpolatorFromForecast,
  windowFrom,
  windowsFromEvents,
} from "@/features/simulation/schedule";
import type { TimestampedUvForecast } from "@/shared/domain";
import {
  createErythemaLoad,
  createLocation,
  createMsSinceEpoch,
  createSeconds,
  createSpf,
  createUvIndex,
} from "@/shared/domain";

const T0 = createMsSinceEpoch(1_000);
const T1 = createMsSinceEpoch(2_000);
const T2 = createMsSinceEpoch(3_000);

const stockholm = createLocation({
  id: "sthlm",
  name: "Stockholm",
  firstAdministrativeDivision: undefined,
  countryName: undefined,
  latitude: 59.33,
  longitude: 18.07,
  timezone: "Europe/Stockholm",
});

const gothenburg = createLocation({
  id: "gbg",
  name: "Gothenburg",
  firstAdministrativeDivision: undefined,
  countryName: undefined,
  latitude: 57.71,
  longitude: 11.97,
  timezone: "Europe/Stockholm",
});

const settings = {
  spf: createSpf(30),
  appliedAt: T0,
  degree: "typical" as const,
};

const startAt = (time: number, location = stockholm): TimestampedSimulationEvent => ({
  time: createMsSinceEpoch(time),
  event: { type: "exposureStart", location },
});

const endAt = (time: number): TimestampedSimulationEvent => ({
  time: createMsSinceEpoch(time),
  event: { type: "exposureEnd" },
});

const applyAt = (time: number): TimestampedSimulationEvent => ({
  time: createMsSinceEpoch(time),
  event: { type: "sunscreenApplied", sunscreenSettings: settings },
});

const removeAt = (time: number): TimestampedSimulationEvent => ({
  time: createMsSinceEpoch(time),
  event: { type: "sunscreenRemoved" },
});

const forecast = (fetchedAt: number): TimestampedUvForecast => ({
  fetchedAt: createMsSinceEpoch(fetchedAt),
  forecast: {
    utcOffsetSeconds: createSeconds(0),
    hourly: [
      { time: T0, uvIndex: createUvIndex(0) },
      { time: T1, uvIndex: createUvIndex(4) },
    ],
  },
});

describe("applySimulationEvent", () => {
  it("toggles exposure and sunscreen independently", () => {
    let context = DEFAULT_SIMULATION_CONTEXT;
    context = applySimulationEvent(context, { type: "exposureStart", location: stockholm });
    expect(context.exposure).toEqual({ status: "outdoors", location: stockholm });
    context = applySimulationEvent(context, {
      type: "sunscreenApplied",
      sunscreenSettings: settings,
    });
    expect(context.sunscreen).toEqual(settings);
    context = applySimulationEvent(context, { type: "exposureEnd" });
    expect(context.exposure).toEqual({ status: "indoors" });
    expect(context.sunscreen).toEqual(settings);
    context = applySimulationEvent(context, { type: "sunscreenRemoved" });
    expect(context).toEqual(DEFAULT_SIMULATION_CONTEXT);
  });
});

describe("insertTimestampedEvent", () => {
  it("keeps the log ordered by time and stable for ties", () => {
    const first = endAt(2000);
    const later = startAt(4000);
    const between = applyAt(3000);
    const tied = removeAt(4000);

    const events = insertTimestampedEvent(
      insertTimestampedEvent(insertTimestampedEvent([first], later), between),
      tied,
    );

    expect(events.map((e) => e.event.type)).toEqual([
      "exposureEnd",
      "sunscreenApplied",
      "exposureStart",
      "sunscreenRemoved",
    ]);
  });
});

describe("eventsFromSchedule", () => {
  it("compiles pairs and applications, applying cream before a same-instant start", () => {
    const events = eventsFromSchedule(
      [
        {
          id: "w",
          start: T1,
          end: T2,
          location: stockholm,
        },
      ],
      [{ id: "s", settings: { ...settings, appliedAt: T1 } }],
    );
    expect(events.map((e) => e.event.type)).toEqual([
      "sunscreenApplied",
      "exposureStart",
      "exposureEnd",
    ]);
  });

  it("compiles wash-offs after a same-instant end", () => {
    const events = eventsFromSchedule(
      [
        {
          id: "w",
          start: T1,
          end: T2,
          location: stockholm,
        },
      ],
      [],
      [{ id: "r", at: T2 }],
    );
    expect(events.map((e) => e.event.type)).toEqual([
      "exposureStart",
      "exposureEnd",
      "sunscreenRemoved",
    ]);
  });
});

describe("windowsFromEvents / applicationsFromEvents", () => {
  it("pairs starts with ends and collects applies", () => {
    const events = [startAt(1000), applyAt(1500), endAt(2000)];
    expect(windowsFromEvents(events)).toEqual([
      { id: "from-log-1000-0", start: T0, end: T1, location: stockholm },
    ]);
    expect(applicationsFromEvents(events)).toEqual([{ id: "from-log-1500-0", settings }]);
    expect(removalsFromEvents([removeAt(2500)])).toEqual([
      { id: "from-log-2500-0", at: createMsSinceEpoch(2500) },
    ]);
  });
});

describe("windowFrom", () => {
  it("folds events before t0 into context and keeps the rest", () => {
    const events = [startAt(1000), applyAt(1500), endAt(2000), removeAt(2500)];
    const window = windowFrom(events, T1);

    expect(window.context).toEqual({
      exposure: { status: "outdoors", location: stockholm },
      sunscreen: settings,
    });
    expect(window.events.map((e) => e.event.type)).toEqual(["exposureEnd", "sunscreenRemoved"]);
  });
});

describe("clipEventsFrom", () => {
  it("drops events before the cutoff and does not carry an open outdoor interval", () => {
    const events = [applyAt(1000), startAt(1500, gothenburg), endAt(3000)];
    expect(clipEventsFrom(events, T1)).toEqual([endAt(3000)]);
  });

  it("keeps events at the cutoff", () => {
    const events = [startAt(2000), endAt(3000)];
    expect(clipEventsFrom(events, T1)).toEqual(events);
  });
});

describe("pruneForecasts / pruneSimulationInput", () => {
  it("keeps forecasts for remaining outdoor locations and explicit retain ids", () => {
    const events = [startAt(2000, stockholm)];
    const forecasts = {
      [stockholm.id]: forecast(1),
      [gothenburg.id]: forecast(2),
      extra: forecast(3),
    };

    expect(Object.keys(pruneForecasts(forecasts, events, [gothenburg.id])).sort()).toEqual([
      "gbg",
      "sthlm",
    ]);
    expect(
      locationIdsInEvents([startAt(2000), endAt(2500), startAt(3000), startAt(4000, gothenburg)]),
    ).toEqual([stockholm.id, gothenburg.id]);

    const pruned = pruneSimulationInput(
      {
        initialConditions: {
          time: T2,
          erythemaLoad: createErythemaLoad(0),
          effectiveSpf: createSpf(1),
        },
        forecasts,
        events: [applyAt(1000), startAt(2000, stockholm), endAt(3000)],
      },
      T1,
      [],
    );
    expect(Object.keys(pruned.forecasts)).toEqual(["sthlm"]);
    expect(pruned.events[0].time).toBe(T1);
  });
});

describe("asSimulationEvent", () => {
  it("drops a leftover loadReset from persisted JSON", () => {
    expect(asSimulationEvent({ type: "loadReset" })).toBeNull();
  });
});

describe("uvInterpolatorFromForecast", () => {
  it("passes through hourly UV knots", () => {
    const interp = uvInterpolatorFromForecast(forecast(0).forecast);
    expect(interp.evaluate(T0)).toBe(0);
    expect(interp.evaluate(T1)).toBe(4);
  });
});
