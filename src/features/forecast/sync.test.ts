import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { useActiveLocationStore } from "@/features/location";
import { useNetworkStore, useVisibilityStore } from "@/features/runtime";
import { renderHook } from "@/test/renderHook";
import { useForecastSync } from "./sync";

const forecastMod = vi.hoisted(() => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    gate,
    release: () => release(),
    handleLocationChange: vi.fn(),
    handleNetworkChange: vi.fn(),
    handleVisibilityChange: vi.fn(),
  };
});

vi.mock("@/app/compose/forecast", async () => {
  await forecastMod.gate;
  return {
    forecast: {
      handleLocationChange: forecastMod.handleLocationChange,
      handleNetworkChange: forecastMod.handleNetworkChange,
      handleVisibilityChange: forecastMod.handleVisibilityChange,
    },
  };
});

describe("useForecastSync", () => {
  it("does not subscribe if the hook unmounts before compose loads", async () => {
    const { unmount } = renderHook(() => {
      useForecastSync();
    });
    unmount();
    await act(async () => {
      forecastMod.release();
      await forecastMod.gate;
    });
    expect(forecastMod.handleLocationChange).not.toHaveBeenCalled();
  });

  it("wires location, network, and visibility once compose is loaded", async () => {
    const { unmount } = renderHook(() => {
      useForecastSync();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(forecastMod.handleLocationChange).toHaveBeenCalledTimes(1);

    useActiveLocationStore.setState({ activeLocation: { status: "empty" } });
    useNetworkStore.setState({ networkState: { status: "offline" } });
    useVisibilityStore.setState({ visibilityState: { status: "hidden" } });
    expect(forecastMod.handleLocationChange).toHaveBeenCalledTimes(2);
    expect(forecastMod.handleNetworkChange).toHaveBeenCalledTimes(1);
    expect(forecastMod.handleVisibilityChange).toHaveBeenCalledTimes(1);

    unmount();
    useNetworkStore.setState({ networkState: { status: "online" } });
    expect(forecastMod.handleNetworkChange).toHaveBeenCalledTimes(1);
  });
});
