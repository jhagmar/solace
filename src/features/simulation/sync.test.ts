import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { useExposureStore } from "@/features/exposure";
import { useForecastStore } from "@/features/forecast";
import { getEffectiveLocation, useActiveLocationStore } from "@/features/location";
import { useNetworkStore, useVisibilityStore } from "@/features/runtime";
import { useSimulationStore } from "@/features/simulation/store";
import { useSunscreenStore } from "@/features/sunscreen";
import { createLocation, createMsSinceEpoch, createSeconds, createUvIndex } from "@/shared/domain";
import { renderHook } from "@/test/renderHook";
import { useSimulationSync } from "./sync";

const compose = vi.hoisted(() => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    gate,
    release: () => release(),
    exposure: { adoptWindowsIfEmpty: vi.fn() },
    sunscreen: {
      adoptApplicationsIfEmpty: vi.fn(),
      adoptRemovalsIfEmpty: vi.fn(),
    },
    simulation: {
      handleScheduleChange: vi.fn(),
      handleVisibilityChange: vi.fn(),
      handleForecastChange: vi.fn(),
      handleLocationChange: vi.fn(),
      handleNetworkChange: vi.fn(),
    },
  };
});

vi.mock("@/app/compose/exposure", () => ({ exposure: compose.exposure }));
vi.mock("@/app/compose/sunscreen", () => ({ sunscreen: compose.sunscreen }));
vi.mock("@/app/compose/simulation", async () => {
  await compose.gate;
  return { simulation: compose.simulation };
});

const stockholm = createLocation({
  id: "sthlm",
  name: "Stockholm",
  firstAdministrativeDivision: undefined,
  countryName: undefined,
  latitude: 59.33,
  longitude: 18.07,
  timezone: "Europe/Stockholm",
});

describe("useSimulationSync", () => {
  it("does not subscribe if the hook unmounts before compose loads", async () => {
    const { unmount } = renderHook(() => {
      useSimulationSync();
    });
    unmount();
    await act(async () => {
      compose.release();
      await compose.gate;
    });
    expect(compose.simulation.handleScheduleChange).not.toHaveBeenCalled();
  });

  it("adopts leftover events, then forwards store signals", async () => {
    useSimulationStore.setState({
      simulationInput: {
        initialConditions: undefined,
        forecasts: {},
        events: [
          {
            time: createMsSinceEpoch(Date.UTC(2026, 7, 14, 10)),
            event: { type: "exposureStart", location: stockholm },
          },
        ],
      },
    });
    const { unmount } = renderHook(() => {
      useSimulationSync();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(compose.exposure.adoptWindowsIfEmpty).toHaveBeenCalled();
    expect(compose.sunscreen.adoptApplicationsIfEmpty).toHaveBeenCalled();
    expect(compose.sunscreen.adoptRemovalsIfEmpty).toHaveBeenCalled();
    expect(compose.simulation.handleScheduleChange).toHaveBeenCalled();
    expect(compose.simulation.handleVisibilityChange).toHaveBeenCalled();

    useForecastStore.setState({
      forecastState: {
        status: "success",
        locationId: stockholm.id,
        fetchedAt: createMsSinceEpoch(1),
        forecast: {
          utcOffsetSeconds: createSeconds(0),
          hourly: [{ time: createMsSinceEpoch(0), uvIndex: createUvIndex(1) }],
        },
      },
    });
    expect(compose.simulation.handleForecastChange).toHaveBeenCalled();

    useForecastStore.setState({ forecastState: { status: "empty" } });
    expect(compose.simulation.handleForecastChange).toHaveBeenCalledTimes(1);

    useExposureStore.setState({ exposureState: { windows: [] } });
    useSunscreenStore.setState({ sunscreenState: { applications: [], removals: [] } });

    useActiveLocationStore.setState({
      activeLocation: { status: "set", location: stockholm },
    });
    expect(compose.simulation.handleLocationChange).toHaveBeenCalledTimes(1);
    useActiveLocationStore.setState({
      activeLocation: { status: "set", location: stockholm },
    });
    expect(compose.simulation.handleLocationChange).toHaveBeenCalledTimes(1);

    useNetworkStore.setState({ networkState: { status: "offline" } });
    useVisibilityStore.setState({ visibilityState: { status: "hidden" } });
    expect(compose.simulation.handleNetworkChange).toHaveBeenCalledTimes(1);
    expect(compose.simulation.handleVisibilityChange.mock.calls.length).toBeGreaterThan(1);

    expect(getEffectiveLocation()?.id).toBe(stockholm.id);
    unmount();
  });
});
