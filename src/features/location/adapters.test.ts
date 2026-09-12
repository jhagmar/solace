import { beforeEach, describe, expect, it } from "vitest";
import type { ExposureState } from "@/features/exposure/model";
import { exposureStateStore, useExposureStore } from "@/features/exposure/store";
import { useForecastStore } from "@/features/forecast/store";
import { getEffectiveLocation, useActiveLocationStore } from "@/features/location/activeStore";
import { recentLocationsRecorder, useRecentLocationsStore } from "@/features/location/recentsStore";
import { isNetworkOnline, useNetworkStore } from "@/features/runtime/networkStore";
import { isPageVisible, useVisibilityStore } from "@/features/runtime/visibilityStore";
import { simulationStateStore, useSimulationStore } from "@/features/simulation/store";
import {
  createLocation,
  createLocationQuery,
  createMsSinceEpoch,
  createSeconds,
  createUvIndex,
  type Location,
} from "@/shared/domain";

const createTestLocation = (id: string): Location =>
  createLocation({
    id,
    name: `Location ${id}`,
    firstAdministrativeDivision: undefined,
    countryName: undefined,
    latitude: 10,
    longitude: 20,
    timezone: undefined,
  });

describe("Global state readers", () => {
  beforeEach(() => {
    useNetworkStore.setState({ networkState: { status: "online" } });
    useVisibilityStore.setState({ visibilityState: { status: "visible" } });
    useActiveLocationStore.setState({ activeLocation: { status: "empty" } });
    useRecentLocationsStore.setState({ recentLocations: { recents: [] } });
    useForecastStore.setState({ forecastState: { status: "empty" } });
  });

  it("isNetworkOnline reads the network store", () => {
    expect(isNetworkOnline()).toBe(true);
    useNetworkStore.setState({ networkState: { status: "offline" } });
    expect(isNetworkOnline()).toBe(false);
  });

  it("isPageVisible reads the visibility store", () => {
    expect(isPageVisible()).toBe(true);
    useVisibilityStore.setState({ visibilityState: { status: "hidden" } });
    expect(isPageVisible()).toBe(false);
  });

  it("getEffectiveLocation follows set / searching-with-fallback / empty", () => {
    const location = createTestLocation("a");
    const fallback = createTestLocation("b");

    expect(getEffectiveLocation()).toBeNull();

    useActiveLocationStore.setState({ activeLocation: { status: "set", location } });
    expect(getEffectiveLocation()).toEqual(location);

    // Mid-search with a set fallback: the forecast keeps tracking the fallback
    useActiveLocationStore.setState({
      activeLocation: {
        status: "searching",
        remoteSearchState: { status: "paused" },
        fallback: { status: "set", location: fallback },
      },
    });
    expect(getEffectiveLocation()).toEqual(fallback);

    // Mid-search with no fallback: nothing to track
    useActiveLocationStore.setState({
      activeLocation: {
        status: "searching",
        remoteSearchState: { status: "paused" },
        fallback: { status: "empty" },
      },
    });
    expect(getEffectiveLocation()).toBeNull();
  });

  it("recentLocationsRecorder records into the recent locations store", () => {
    const location = createTestLocation("a");
    recentLocationsRecorder.addLocation(location);
    expect(useRecentLocationsStore.getState().recentLocations.recents).toEqual([location]);
  });

  it("exposureStateStore reads and writes the exposure store", () => {
    const state: ExposureState = {
      windows: [
        {
          id: "w-1",
          start: createMsSinceEpoch(1000),
          end: createMsSinceEpoch(2000),
          location: createTestLocation("a"),
        },
      ],
    };
    exposureStateStore.setExposureState(state);
    expect(exposureStateStore.getExposureState()).toEqual(state);
    expect(useExposureStore.getState().exposureState).toEqual(state);
  });

  it("simulationStateStore reads and writes the simulation store", () => {
    const state = {
      initialConditions: undefined,
      forecasts: {},
      events: [],
    };
    simulationStateStore.setSimulationInput(state);
    expect(simulationStateStore.getSimulationInput()).toEqual(state);
    expect(useSimulationStore.getState().simulationInput).toEqual(state);

    simulationStateStore.setSimulationOutput({ status: "pending" });
    expect(simulationStateStore.getSimulationOutput()).toEqual({ status: "pending" });
    expect(useSimulationStore.getState().simulationOutput).toEqual({ status: "pending" });
  });
});

describe("Store persistence edge cases", () => {
  it("forecast rehydration drops non-success states and keeps successful ones", async () => {
    // A persisted "failure" (or any non-success) rehydrates as empty
    window.localStorage.setItem(
      "solace-forecast-store",
      JSON.stringify({
        state: { forecastState: { status: "failure", locationId: "a", reason: "x" } },
        version: 0,
      }),
    );
    await useForecastStore.persist.rehydrate();
    expect(useForecastStore.getState().forecastState).toEqual({ status: "empty" });

    // A persisted success survives
    const success = {
      status: "success",
      locationId: "a",
      forecast: {
        utcOffsetSeconds: createSeconds(0),
        hourly: [{ time: createMsSinceEpoch(1000), uvIndex: createUvIndex(1) }],
      },
      fetchedAt: createMsSinceEpoch(1000),
    };
    window.localStorage.setItem(
      "solace-forecast-store",
      JSON.stringify({ state: { forecastState: success }, version: 0 }),
    );
    await useForecastStore.persist.rehydrate();
    expect(useForecastStore.getState().forecastState).toEqual(success);
  });

  it("exposure rehydration narrows persisted JSON and rejects invalid values", async () => {
    const locationJson = {
      id: "a",
      name: "Location a",
      coordinates: { latitude: 10, longitude: 20 },
      timezone: null,
    };
    window.localStorage.setItem(
      "solace-exposure-store",
      JSON.stringify({
        state: {
          exposureState: {
            windows: [{ id: "w-1", start: 1000, end: 2000, location: locationJson }],
          },
        },
        version: 0,
      }),
    );
    await useExposureStore.persist.rehydrate();
    expect(useExposureStore.getState().exposureState).toEqual({
      windows: [
        {
          id: "w-1",
          start: 1000,
          end: 2000,
          location: createLocation({
            id: "a",
            name: "Location a",
            firstAdministrativeDivision: undefined,
            countryName: undefined,
            latitude: 10,
            longitude: 20,
            timezone: undefined,
          }),
        },
      ],
    });

    useExposureStore.setState({
      exposureState: { windows: [] },
    });
    window.localStorage.setItem(
      "solace-exposure-store",
      JSON.stringify({ state: { exposureState: { status: "outdoors" } }, version: 0 }),
    );
    await useExposureStore.persist.rehydrate();
    expect(useExposureStore.getState().exposureState).toEqual({
      windows: [],
    });
  });

  it("simulation rehydration narrows persisted JSON and rejects invalid values", async () => {
    // A valid persisted state survives, branded fields intact
    window.localStorage.setItem(
      "solace-simulation-store",
      JSON.stringify({
        state: {
          simulationInput: {
            initialConditions: { time: 1000, erythemaLoad: 2.5, effectiveSpf: 30 },
            forecasts: {},
            events: [
              {
                time: 1000,
                event: {
                  type: "sunscreenApplied",
                  sunscreenSettings: { spf: 30, appliedAt: 1000, degree: "typical" },
                },
              },
            ],
          },
          simulationOutput: {
            status: "ready",
            windowStart: 1000,
            trajectory: [{ time: 1000, erythemaLoad: 2.5, effectiveSpf: 30 }],
          },
        },
        version: 0,
      }),
    );
    await useSimulationStore.persist.rehydrate();
    expect(useSimulationStore.getState().simulationInput).toEqual({
      initialConditions: { time: 1000, erythemaLoad: 2.5, effectiveSpf: 30 },
      forecasts: {},
      events: [
        {
          time: 1000,
          event: {
            type: "sunscreenApplied",
            sunscreenSettings: { spf: 30, appliedAt: 1000, degree: "typical" },
          },
        },
      ],
    });
    expect(useSimulationStore.getState().simulationOutput).toEqual({
      status: "ready",
      windowStart: 1000,
      trajectory: [{ time: 1000, erythemaLoad: 2.5, effectiveSpf: 30 }],
    });

    // Corrupted persisted value falls back to the current state
    useSimulationStore.setState({
      simulationInput: {
        initialConditions: undefined,
        forecasts: {},
        events: [],
      },
      simulationOutput: { status: "empty" },
    });
    window.localStorage.setItem(
      "solace-simulation-store",
      JSON.stringify({ state: { simulationInput: { forecasts: [] } }, version: 0 }),
    );
    await useSimulationStore.persist.rehydrate();
    expect(useSimulationStore.getState().simulationInput).toEqual({
      initialConditions: undefined,
      forecasts: {},
      events: [],
    });
  });

  it("active location rehydration unwraps an interrupted search to its fallback", async () => {
    const location = createTestLocation("a");
    window.localStorage.setItem(
      "solace-active-location-store",
      JSON.stringify({
        state: {
          activeLocation: {
            status: "searching",
            remoteSearchState: {
              status: "debouncing",
              query: createLocationQuery("Sto"),
            },
            fallback: { status: "set", location },
          },
        },
        version: 0,
      }),
    );
    await useActiveLocationStore.persist.rehydrate();
    expect(useActiveLocationStore.getState().activeLocation).toEqual({
      status: "set",
      location,
    });
  });

  it("active location rehydration drops a set location that cannot be narrowed", async () => {
    window.localStorage.setItem(
      "solace-active-location-store",
      JSON.stringify({
        state: {
          activeLocation: {
            status: "set",
            location: { id: "a", name: "Nowhere" },
          },
        },
        version: 0,
      }),
    );
    await useActiveLocationStore.persist.rehydrate();
    expect(useActiveLocationStore.getState().activeLocation).toEqual({ status: "empty" });
  });

  it("active location rehydration restores a valid set location", async () => {
    const location = createTestLocation("a");
    window.localStorage.setItem(
      "solace-active-location-store",
      JSON.stringify({
        state: { activeLocation: { status: "set", location } },
        version: 0,
      }),
    );
    await useActiveLocationStore.persist.rehydrate();
    expect(useActiveLocationStore.getState().activeLocation).toEqual({
      status: "set",
      location,
    });
  });
});
