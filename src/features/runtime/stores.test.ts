import { beforeEach, describe, expect, it } from "vitest";
import type { ExposureState } from "@/features/exposure/model";
import { useExposureStore } from "@/features/exposure/store";
import { useForecastStore } from "@/features/forecast/store";
import { useRecentLocationsStore } from "@/features/location/recentsStore";
import { useNetworkStore } from "@/features/runtime/networkStore";
import { useVisibilityStore } from "@/features/runtime/visibilityStore";
import { useSimulationStore } from "@/features/simulation/store";
import { useSkinToneStore } from "@/features/skin-tone/store";
import type { SunscreenState } from "@/features/sunscreen/model";
import { useSunscreenStore } from "@/features/sunscreen/store";
import { useThemeStore } from "@/features/theme/store";
import type { UvForecast } from "@/shared/domain";
import {
  createErythemaLoad,
  createLocation,
  createMsSinceEpoch,
  createSeconds,
  createSpf,
  createUvIndex,
  type Location,
} from "@/shared/domain";
import type { RequestHandle } from "@/shared/platform/http";

const createTestForecast = (): UvForecast => ({
  utcOffsetSeconds: createSeconds(0),
  hourly: [
    { time: createMsSinceEpoch(Date.parse("2026-08-14T00:00:00Z")), uvIndex: createUvIndex(0) },
    { time: createMsSinceEpoch(Date.parse("2026-08-14T01:00:00Z")), uvIndex: createUvIndex(0.1) },
  ],
});

const createTestRequestHandle = (): RequestHandle => ({ cancel: () => {} });

const createTestLocation = (
  id: string,
  overrides?: Partial<Parameters<typeof createLocation>[0]>,
) =>
  createLocation({
    id,
    name: `Location ${id}`,
    firstAdministrativeDivision: undefined,
    countryName: undefined,
    latitude: 10,
    longitude: 20,
    timezone: undefined,
    ...overrides,
  });

describe("Stores", () => {
  beforeEach(() => {
    useNetworkStore.setState({ networkState: { status: "offline" } });
    useRecentLocationsStore.setState({ recentLocations: { recents: [] } });
    useForecastStore.setState({ forecastState: { status: "empty" } });
    useVisibilityStore.setState({ visibilityState: { status: "visible" } });
    useThemeStore.setState({ themePreference: "auto" });
    useSkinToneStore.setState({ skinTone: "medium" });
    useSunscreenStore.setState({ sunscreenState: { applications: [], removals: [] } });
    useExposureStore.setState({
      exposureState: { windows: [] },
    });
    useSimulationStore.setState({
      simulationInput: {
        initialConditions: undefined,
        forecasts: {},
        events: [],
      },
      simulationOutput: { status: "empty" },
    });
  });

  it("ThemeStore defaults to auto and sets the preference", () => {
    const store = useThemeStore.getState();
    expect(store.themePreference).toBe("auto");

    store.setThemePreference("dark");
    expect(useThemeStore.getState().themePreference).toBe("dark");
  });

  it("ThemeStore persists the preference and rehydrates it, rejecting invalid values", async () => {
    useThemeStore.getState().setThemePreference("dark");

    const stored = window.localStorage.getItem("solace-theme-store");
    expect(JSON.parse(stored as string).state.themePreference).toBe("dark");

    // Valid persisted value rehydrates
    window.localStorage.setItem(
      "solace-theme-store",
      JSON.stringify({ state: { themePreference: "light" }, version: 0 }),
    );
    await useThemeStore.persist.rehydrate();
    expect(useThemeStore.getState().themePreference).toBe("light");

    // Corrupted persisted value falls back to the current state
    useThemeStore.setState({ themePreference: "auto" });
    window.localStorage.setItem(
      "solace-theme-store",
      JSON.stringify({ state: { themePreference: "sepia" }, version: 0 }),
    );
    await useThemeStore.persist.rehydrate();
    expect(useThemeStore.getState().themePreference).toBe("auto");
  });

  it("SkinToneStore defaults to medium and sets the tone", () => {
    const store = useSkinToneStore.getState();
    expect(store.skinTone).toBe("medium");

    store.setSkinTone("olive");
    expect(useSkinToneStore.getState().skinTone).toBe("olive");
  });

  it("SkinToneStore persists the tone and rehydrates it, rejecting invalid values", async () => {
    useSkinToneStore.getState().setSkinTone("darkBrown");

    const stored = window.localStorage.getItem("solace-skin-tone-store");
    expect(JSON.parse(stored as string).state.skinTone).toBe("darkBrown");

    // Valid persisted value rehydrates
    window.localStorage.setItem(
      "solace-skin-tone-store",
      JSON.stringify({ state: { skinTone: "fair" }, version: 0 }),
    );
    await useSkinToneStore.persist.rehydrate();
    expect(useSkinToneStore.getState().skinTone).toBe("fair");

    // Corrupted persisted value falls back to the current state
    useSkinToneStore.setState({ skinTone: "medium" });
    window.localStorage.setItem(
      "solace-skin-tone-store",
      JSON.stringify({ state: { skinTone: "blue" }, version: 0 }),
    );
    await useSkinToneStore.persist.rehydrate();
    expect(useSkinToneStore.getState().skinTone).toBe("medium");
  });

  const appliedState: SunscreenState = {
    applications: [
      {
        id: "a",
        settings: {
          spf: createSpf(30),
          appliedAt: createMsSinceEpoch(Date.parse("2026-08-15T08:45:00Z")),
          degree: "typical",
        },
      },
    ],
    removals: [],
  };

  it("SunscreenStore defaults to no applications and sets the state", () => {
    const store = useSunscreenStore.getState();
    expect(store.sunscreenState).toEqual({ applications: [], removals: [] });

    store.setSunscreenState(appliedState);
    expect(useSunscreenStore.getState().sunscreenState).toEqual(appliedState);

    store.setSunscreenState({ applications: [], removals: [] });
    expect(useSunscreenStore.getState().sunscreenState).toEqual({ applications: [], removals: [] });
  });

  it("SunscreenStore persists the state and rehydrates it, rejecting invalid values", async () => {
    useSunscreenStore.getState().setSunscreenState(appliedState);

    const stored = window.localStorage.getItem("solace-sunscreen-store");
    expect(JSON.parse(stored as string).state.sunscreenState).toEqual(appliedState);

    const appliedAt = Date.parse("2026-08-15T07:30:00Z");
    const persistedApplied = {
      status: "applied",
      settings: { spf: 50, appliedAt, degree: "light" },
    };
    window.localStorage.setItem(
      "solace-sunscreen-store",
      JSON.stringify({ state: { sunscreenState: persistedApplied }, version: 0 }),
    );
    await useSunscreenStore.persist.rehydrate();
    expect(useSunscreenStore.getState().sunscreenState).toEqual({
      applications: [
        {
          id: `migrated-${appliedAt}`,
          settings: {
            spf: createSpf(50),
            appliedAt: createMsSinceEpoch(appliedAt),
            degree: "light",
          },
        },
      ],
      removals: [],
    });

    useSunscreenStore.setState({ sunscreenState: { applications: [], removals: [] } });
    window.localStorage.setItem(
      "solace-sunscreen-store",
      JSON.stringify({
        state: { sunscreenState: { status: "applied", settings: { spf: "lots" } } },
        version: 0,
      }),
    );
    await useSunscreenStore.persist.rehydrate();
    expect(useSunscreenStore.getState().sunscreenState).toEqual({ applications: [], removals: [] });
  });

  it("ExposureStore defaults to no windows and sets the state", () => {
    const store = useExposureStore.getState();
    expect(store.exposureState).toEqual({ windows: [] });

    const outdoors: ExposureState = {
      windows: [
        {
          id: "w-1",
          start: createMsSinceEpoch(1000),
          end: createMsSinceEpoch(2000),
          location: createTestLocation("loc1"),
        },
      ],
    };
    store.setExposureState(outdoors);
    expect(useExposureStore.getState().exposureState).toEqual(outdoors);
  });

  it("SimulationStore defaults to the empty input and sets the state", () => {
    const store = useSimulationStore.getState();
    expect(store.simulationInput).toEqual({
      initialConditions: undefined,
      forecasts: {},
      events: [],
    });
    expect(store.simulationOutput).toEqual({ status: "empty" });

    const input = {
      initialConditions: {
        time: createMsSinceEpoch(1000),
        erythemaLoad: createErythemaLoad(2.5),
        effectiveSpf: createSpf(30),
      },
      forecasts: {},
      events: [],
    };
    store.setSimulationInput(input);
    expect(useSimulationStore.getState().simulationInput).toEqual(input);

    const output = {
      status: "ready" as const,
      windowStart: createMsSinceEpoch(1000),
      trajectory: [
        {
          time: createMsSinceEpoch(1000),
          erythemaLoad: createErythemaLoad(0),
          effectiveSpf: createSpf(1),
        },
      ],
    };
    store.setSimulationOutput(output);
    expect(useSimulationStore.getState().simulationOutput).toEqual(output);
  });

  it("SimulationStore persists ready output and rehydrates it, dropping pending", async () => {
    const ready = {
      status: "ready" as const,
      windowStart: createMsSinceEpoch(1000),
      trajectory: [
        {
          time: createMsSinceEpoch(1000),
          erythemaLoad: createErythemaLoad(0),
          effectiveSpf: createSpf(1),
        },
      ],
    };
    useSimulationStore.getState().setSimulationOutput(ready);
    let stored = window.localStorage.getItem("solace-simulation-store");
    expect(JSON.parse(stored as string).state.simulationOutput).toEqual(ready);

    useSimulationStore.getState().setSimulationOutput({ status: "pending" });
    stored = window.localStorage.getItem("solace-simulation-store");
    expect(JSON.parse(stored as string).state.simulationOutput).toEqual({ status: "empty" });

    window.localStorage.setItem(
      "solace-simulation-store",
      JSON.stringify({
        state: {
          simulationInput: {
            initialConditions: undefined,
            forecasts: {},
            events: [],
          },
          simulationOutput: ready,
        },
        version: 0,
      }),
    );
    await useSimulationStore.persist.rehydrate();
    expect(useSimulationStore.getState().simulationOutput).toEqual(ready);

    window.localStorage.setItem(
      "solace-simulation-store",
      JSON.stringify({
        state: { simulationOutput: { status: "pending" } },
        version: 0,
      }),
    );
    await useSimulationStore.persist.rehydrate();
    expect(useSimulationStore.getState().simulationOutput).toEqual(ready);
  });

  it("ExposureStore persists the state and rehydrates it, rejecting invalid values", async () => {
    const outdoors: ExposureState = {
      windows: [
        {
          id: "w-1",
          start: createMsSinceEpoch(1000),
          end: createMsSinceEpoch(2000),
          location: createTestLocation("loc1"),
        },
      ],
    };
    useExposureStore.getState().setExposureState(outdoors);

    const stored = window.localStorage.getItem("solace-exposure-store");
    expect(JSON.parse(stored as string).state.exposureState).toEqual(outdoors);

    window.localStorage.setItem(
      "solace-exposure-store",
      JSON.stringify({ state: { exposureState: { windows: [] } }, version: 0 }),
    );
    await useExposureStore.persist.rehydrate();
    expect(useExposureStore.getState().exposureState).toEqual({ windows: [] });

    useExposureStore.setState({
      exposureState: { windows: [] },
    });
    window.localStorage.setItem(
      "solace-exposure-store",
      JSON.stringify({ state: { exposureState: { status: "outside" } }, version: 0 }),
    );
    await useExposureStore.persist.rehydrate();
    expect(useExposureStore.getState().exposureState).toEqual({ windows: [] });
  });

  it("ExposureStore migrates a live indoors/outdoors persist shape", async () => {
    const location = createTestLocation("loc1", { timezone: "UTC" });
    const since = Date.UTC(2026, 7, 15, 12, 0);
    window.localStorage.setItem(
      "solace-exposure-store",
      JSON.stringify({
        state: {
          exposureState: {
            status: "outdoors",
            since,
            location: {
              id: location.id,
              name: location.name,
              coordinates: location.coordinates,
              timezone: "UTC",
            },
          },
        },
        version: 0,
      }),
    );
    await useExposureStore.persist.rehydrate();
    const windows = useExposureStore.getState().exposureState.windows;
    expect(windows).toHaveLength(1);
    expect(windows[0]?.start).toBe(since);
    expect(windows[0]?.end).toBeGreaterThan(since);

    window.localStorage.setItem(
      "solace-exposure-store",
      JSON.stringify({ state: { exposureState: { status: "indoors", since } }, version: 0 }),
    );
    await useExposureStore.persist.rehydrate();
    expect(useExposureStore.getState().exposureState).toEqual({ windows: [] });
  });

  it("ExposureStore rehydrate of corrupt JSON does not throw", async () => {
    useExposureStore.setState({ exposureState: { windows: [] } });
    window.localStorage.setItem("solace-exposure-store", "{not json");
    await expect(useExposureStore.persist.rehydrate()).resolves.toBeUndefined();
    expect(useExposureStore.getState().exposureState).toEqual({ windows: [] });
  });

  it("NetworkStore sets network state", () => {
    const store = useNetworkStore.getState();
    expect(store.networkState.status).toBe("offline");

    store.setNetworkState({ status: "online" });

    expect(useNetworkStore.getState().networkState.status).toBe("online");
  });

  it("VisibilityStore sets visibility state", () => {
    const store = useVisibilityStore.getState();
    expect(store.visibilityState.status).toBe("visible");

    store.setVisibilityState({ status: "hidden" });

    expect(useVisibilityStore.getState().visibilityState.status).toBe("hidden");
  });

  it("RecentLocationsStore adds and clears locations", () => {
    const store = useRecentLocationsStore.getState();

    const loc1 = createTestLocation("loc1");
    const loc2 = createTestLocation("loc2");

    store.addLocation(loc1);
    store.addLocation(loc2);

    let recents = useRecentLocationsStore.getState().recentLocations.recents;
    expect(recents.length).toBe(2);
    expect(recents[0].id).toBe("loc2"); // Added last is first

    useRecentLocationsStore.getState().clearRecentLocations();

    recents = useRecentLocationsStore.getState().recentLocations.recents;
    expect(recents.length).toBe(0);
  });

  it("RecentLocationsStore dedupes by id and keeps the most recent first", () => {
    const store = useRecentLocationsStore.getState();

    const loc1 = createTestLocation("loc1");
    const loc2 = createTestLocation("loc2");

    store.addLocation(loc1);
    store.addLocation(loc2);
    // Re-adding loc1 moves it to the front instead of duplicating it
    store.addLocation(loc1);

    const recents = useRecentLocationsStore.getState().recentLocations.recents;
    expect(recents.length).toBe(2);
    expect(recents[0].id).toBe("loc1");
    expect(recents[1].id).toBe("loc2");
  });

  it("RecentLocationsStore caps the list at 5 entries", () => {
    const store = useRecentLocationsStore.getState();

    const locations: Location[] = ["1", "2", "3", "4", "5", "6"].map((i) =>
      createTestLocation(`loc${i}`),
    );
    locations.forEach((loc) => store.addLocation(loc));

    const recents = useRecentLocationsStore.getState().recentLocations.recents;
    expect(recents.length).toBe(5);
    expect(recents[0].id).toBe("loc6");
    expect(recents.some((r) => r.id === "loc1")).toBe(false);
  });

  it("ForecastStore starts empty and tracks a fetch through to success", () => {
    const location = createTestLocation("loc1");
    const store = useForecastStore.getState();
    expect(store.forecastState.status).toBe("empty");

    store.startForecastFetch(location.id, createTestRequestHandle());
    let state = useForecastStore.getState().forecastState;
    expect(state.status).toBe("fetching");
    expect(state.status === "fetching" && state.locationId).toBe(location.id);
    expect(state.status === "fetching" && state.previous).toBeNull();

    const fetchedAt = createMsSinceEpoch(Date.parse("2026-08-14T12:00:00Z"));
    useForecastStore.getState().setForecastSuccess(location.id, createTestForecast(), fetchedAt);
    state = useForecastStore.getState().forecastState;
    expect(state.status).toBe("success");
    expect(state.status === "success" && state.fetchedAt).toBe(fetchedAt);
    expect(state.status === "success" && state.forecast.hourly.map((e) => e.uvIndex)).toEqual([
      0, 0.1,
    ]);
  });

  it("ForecastStore drops success and failure for superseded requests", () => {
    const loc1 = createTestLocation("loc1");
    const loc2 = createTestLocation("loc2");
    const store = useForecastStore.getState();

    store.startForecastFetch(loc1.id, createTestRequestHandle());
    useForecastStore.getState().startForecastFetch(loc2.id, createTestRequestHandle());

    // A late response for loc1 must not clobber the in-flight fetch for loc2
    useForecastStore
      .getState()
      .setForecastSuccess(loc1.id, createTestForecast(), createMsSinceEpoch(1000));
    let state = useForecastStore.getState().forecastState;
    expect(state.status).toBe("fetching");
    expect(state.status === "fetching" && state.locationId).toBe(loc2.id);

    useForecastStore.getState().setForecastFailure(loc1.id, "late failure");
    state = useForecastStore.getState().forecastState;
    expect(state.status).toBe("fetching");
  });

  it("ForecastStore retains the cached forecast across a failed refresh", () => {
    const location = createTestLocation("loc1");
    const store = useForecastStore.getState();
    const forecast = createTestForecast();
    const fetchedAt = createMsSinceEpoch(1000);

    store.startForecastFetch(location.id, createTestRequestHandle());
    useForecastStore.getState().setForecastSuccess(location.id, forecast, fetchedAt);

    // Refresh fails: the stale forecast is retained as `previous`
    useForecastStore.getState().startForecastFetch(location.id, createTestRequestHandle());
    useForecastStore.getState().setForecastFailure(location.id, "boom");

    const state = useForecastStore.getState().forecastState;
    expect(state.status).toBe("failure");
    expect(state.status === "failure" && state.reason).toBe("boom");
    expect(state.status === "failure" && state.previous).toEqual({ forecast, fetchedAt });
  });

  it("ForecastStore clears the forecast", () => {
    const location = createTestLocation("loc1");
    const store = useForecastStore.getState();
    store.startForecastFetch(location.id, createTestRequestHandle());
    useForecastStore
      .getState()
      .setForecastSuccess(location.id, createTestForecast(), createMsSinceEpoch(1000));

    useForecastStore.getState().clearForecast();

    expect(useForecastStore.getState().forecastState.status).toBe("empty");
  });

  it("ForecastStore persists only successful forecasts to storage", () => {
    const location = createTestLocation("loc1");
    const store = useForecastStore.getState();

    // Volatile states persist as empty
    store.startForecastFetch(location.id, createTestRequestHandle());
    let stored = window.localStorage.getItem("solace-forecast-store");
    expect(JSON.parse(stored as string).state.forecastState.status).toBe("empty");

    useForecastStore
      .getState()
      .setForecastSuccess(location.id, createTestForecast(), createMsSinceEpoch(1000));
    stored = window.localStorage.getItem("solace-forecast-store");
    const persisted = JSON.parse(stored as string).state.forecastState;
    expect(persisted.status).toBe("success");
    expect(persisted.locationId).toBe(location.id);
  });

  it("ForecastStore rehydrates a persisted success and discards anything else", async () => {
    const location = createTestLocation("loc1");
    const successState = {
      status: "success",
      locationId: location.id,
      forecast: createTestForecast(),
      fetchedAt: 1000,
    };
    window.localStorage.setItem(
      "solace-forecast-store",
      JSON.stringify({ state: { forecastState: successState }, version: 0 }),
    );

    await useForecastStore.persist.rehydrate();
    expect(useForecastStore.getState().forecastState).toEqual(successState);

    // A persisted volatile state (e.g. written by an older version) rehydrates as empty
    window.localStorage.setItem(
      "solace-forecast-store",
      JSON.stringify({ state: { forecastState: { status: "fetching" } }, version: 0 }),
    );

    await useForecastStore.persist.rehydrate();
    expect(useForecastStore.getState().forecastState.status).toBe("empty");
  });
});
