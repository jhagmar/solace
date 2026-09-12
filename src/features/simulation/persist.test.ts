import { describe, expect, it } from "vitest";
import {
  asSimulationInput,
  asSimulationOutput,
  isSimulationOutputCurrent,
} from "@/features/simulation/persist";
import { createLocation, createLocationId, createMsSinceEpoch } from "@/shared/domain";

const T0 = Date.parse("2026-08-14T12:00:00Z");

const rawLocation = {
  id: "loc1",
  name: "Stockholm",
  firstAdministrativeDivision: "Stockholm County",
  countryName: "Sweden",
  coordinates: { latitude: 59.33, longitude: 18.07 },
  timezone: "Europe/Stockholm",
};

const stockholm = createLocation({
  id: "loc1",
  name: "Stockholm",
  firstAdministrativeDivision: "Stockholm County",
  countryName: "Sweden",
  latitude: 59.33,
  longitude: 18.07,
  timezone: "Europe/Stockholm",
});

const rawForecast = {
  fetchedAt: T0,
  forecast: {
    utcOffsetSeconds: 7200,
    hourly: [
      { time: Date.parse("2026-08-14T01:00:00Z"), uvIndex: 0.1 },
      { time: Date.parse("2026-08-14T00:00:00Z"), uvIndex: 0 },
    ],
  },
};

const rawSunscreen = { spf: 30, appliedAt: T0, degree: "typical" };

const rawEvents = [
  { time: T0, event: { type: "exposureStart" as const, location: rawLocation } },
  { time: T0, event: { type: "sunscreenApplied" as const, sunscreenSettings: rawSunscreen } },
  { time: T0 + 1000, event: { type: "exposureEnd" as const } },
  { time: T0 + 2000, event: { type: "sunscreenRemoved" as const } },
];

const expectedEvents = [
  { time: T0, event: { type: "exposureStart" as const, location: stockholm } },
  { time: T0, event: { type: "sunscreenApplied" as const, sunscreenSettings: rawSunscreen } },
  { time: T0 + 1000, event: { type: "exposureEnd" as const } },
  { time: T0 + 2000, event: { type: "sunscreenRemoved" as const } },
];

const validInput = {
  initialConditions: { time: T0, erythemaLoad: 1.5, effectiveSpf: 30 },
  forecasts: { loc1: rawForecast },
  events: rawEvents,
};

describe("asSimulationInput", () => {
  it("round-trips a fully valid state", () => {
    const result = asSimulationInput(validInput);

    expect(result?.initialConditions).toEqual({ time: T0, erythemaLoad: 1.5, effectiveSpf: 30 });
    expect(Object.keys(result?.forecasts ?? {})).toEqual(["loc1"]);
    expect(result?.events).toEqual(expectedEvents);
  });

  it("hydrates legacy erythemaDose as erythemaLoad", () => {
    const result = asSimulationInput({
      ...validInput,
      initialConditions: { time: T0, erythemaDose: 1.5, effectiveSpf: 30 },
    });

    expect(result?.initialConditions).toEqual({ time: T0, erythemaLoad: 1.5, effectiveSpf: 30 });
  });

  it("restores the hourly sorting invariant on rehydration", () => {
    const result = asSimulationInput(validInput);
    const hourly = result?.forecasts[createLocationId("loc1")]?.forecast.hourly;

    expect(hourly?.[0].time).toBeLessThan(hourly?.[1].time as number);
  });

  it("accepts undefined initial conditions", () => {
    const result = asSimulationInput({ ...validInput, initialConditions: undefined });

    expect(result?.initialConditions).toBeUndefined();
  });

  it("degrades corrupt initial conditions to undefined rather than sinking the state", () => {
    const result = asSimulationInput({
      ...validInput,
      initialConditions: { time: -1, erythemaLoad: 1.5, effectiveSpf: 30 },
    });

    expect(result?.initialConditions).toBeUndefined();
    expect(result?.events).toHaveLength(4);
  });

  it("degrades invalid effective Spf in initial conditions rather than sinking the state", () => {
    const result = asSimulationInput({
      ...validInput,
      initialConditions: { time: T0, erythemaLoad: 1.5, effectiveSpf: 0 },
    });

    expect(result?.initialConditions).toBeUndefined();
    expect(result?.events).toHaveLength(4);
  });

  it("returns null for non-objects and structurally wrong states", () => {
    expect(asSimulationInput(null)).toBeNull();
    expect(asSimulationInput("state")).toBeNull();
    expect(asSimulationInput({ ...validInput, forecasts: [] })).toBeNull();
    expect(asSimulationInput({ ...validInput, events: {} })).toBeNull();
  });

  it("returns null when the events list cannot be walked", () => {
    const events = [...rawEvents];
    Object.defineProperty(events, "flatMap", {
      value: () => {
        throw new Error("corrupt");
      },
    });
    expect(asSimulationInput({ ...validInput, events })).toBeNull();
  });

  it("drops corrupt collection entries but keeps the valid ones", () => {
    const result = asSimulationInput({
      ...validInput,
      forecasts: { loc1: rawForecast, bad: { fetchedAt: "never" } },
      events: [
        ...rawEvents,
        { time: T0, event: { type: "notAnEvent" } },
        { time: T0, event: { type: "exposureStart" } },
        { time: T0, event: { type: "exposureStart", location: null } },
        {
          time: T0,
          event: { type: "sunscreenApplied", sunscreenSettings: { spf: 0, appliedAt: T0 } },
        },
        { time: T0, event: { type: "sunscreenApplied", sunscreenSettings: "nope" } },
        { time: T0, event: { type: "sunscreenApplied", data: rawSunscreen } },
        { time: T0, event: {} },
        { time: T0, event: null },
        { time: T0 },
        { time: -1, event: { type: "exposureEnd" } },
        "not-an-event",
      ],
    });

    expect(Object.keys(result?.forecasts ?? {})).toEqual(["loc1"]);
    expect(result?.events).toEqual(expectedEvents);
  });

  it("drops forecasts with corrupt hourly entries", () => {
    const result = asSimulationInput({
      ...validInput,
      forecasts: {
        loc1: {
          fetchedAt: T0,
          forecast: { utcOffsetSeconds: 0, hourly: [{ time: T0, uvIndex: -3 }] },
        },
      },
    });

    expect(result?.forecasts).toEqual({});
  });

  it("drops non-object collection entries", () => {
    const result = asSimulationInput({
      ...validInput,
      initialConditions: "bogus",
      forecasts: { loc1: rawForecast, junk: "not-a-forecast" },
      events: [...rawEvents, "not-an-event"],
    });

    expect(result?.initialConditions).toBeUndefined();
    expect(Object.keys(result?.forecasts ?? {})).toEqual(["loc1"]);
    expect(result?.events).toEqual(expectedEvents);
  });

  it("drops forecasts whose hourly is not an array or whose fetchedAt is invalid", () => {
    const result = asSimulationInput({
      ...validInput,
      forecasts: {
        badHourly: { fetchedAt: T0, forecast: { utcOffsetSeconds: 0, hourly: {} } },
        badFetchedAt: { fetchedAt: -1, forecast: rawForecast.forecast },
      },
    });

    expect(result?.forecasts).toEqual({});
  });
});

const readyOutput = {
  status: "ready" as const,
  windowStart: T0,
  trajectory: [
    { time: T0 + 1000, erythemaLoad: 1, effectiveSpf: 1 },
    { time: T0, erythemaLoad: 0, effectiveSpf: 1 },
    { time: T0 + 1000, erythemaLoad: 2, effectiveSpf: 30 },
    { time: T0 + 2000, erythemaLoad: -1, effectiveSpf: 1 },
  ],
};

describe("asSimulationOutput", () => {
  it("round-trips empty and ready states, sorting and collapsing the trajectory", () => {
    expect(asSimulationOutput({ status: "empty" })).toEqual({ status: "empty" });
    expect(asSimulationOutput(readyOutput)).toEqual({
      status: "ready",
      windowStart: T0,
      trajectory: [
        { time: T0, erythemaLoad: 0, effectiveSpf: 1 },
        { time: T0 + 1000, erythemaLoad: 2, effectiveSpf: 30 },
      ],
    });
  });

  it("rejects pending, structurally wrong, and corrupt ready payloads", () => {
    expect(asSimulationOutput({ status: "pending" })).toBeNull();
    expect(asSimulationOutput(null)).toBeNull();
    expect(asSimulationOutput("ready")).toBeNull();
    expect(asSimulationOutput({ status: "ready", trajectory: {} })).toBeNull();
    expect(asSimulationOutput({ status: "ready", windowStart: -1, trajectory: [] })).toBeNull();
    expect(asSimulationOutput({ status: "ready", dayStart: T0, trajectory: [] })).toBeNull();
    expect(asSimulationOutput({ status: "other" })).toBeNull();
  });
});

describe("isSimulationOutputCurrent", () => {
  const windowStart = createMsSinceEpoch(Date.UTC(2026, 7, 13, 0, 0, 0));

  it("is true only for a ready trajectory whose windowStart is UTC yesterday", () => {
    expect(isSimulationOutputCurrent({ status: "empty" }, T0)).toBe(false);
    expect(isSimulationOutputCurrent({ status: "pending" }, T0)).toBe(false);
    expect(isSimulationOutputCurrent({ status: "ready", windowStart, trajectory: [] }, T0)).toBe(
      true,
    );
    expect(
      isSimulationOutputCurrent({ status: "ready", windowStart, trajectory: [] }, T0 + 600),
    ).toBe(true);
    expect(
      isSimulationOutputCurrent(
        { status: "ready", windowStart, trajectory: [] },
        T0 + 24 * 3600 * 1000,
      ),
    ).toBe(false);
  });
});
