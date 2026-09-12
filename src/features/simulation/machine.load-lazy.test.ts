import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { createSimulationStateStore } from "@/features/simulation/store";
import type { Milliseconds } from "@/shared/domain";
import { createLocation, createMsSinceEpoch } from "@/shared/domain";
import type { Timeout, TimeoutFactory } from "@/shared/platform/clock";
import type { RequestFactory, RequestHandle, ResponseHandler } from "@/shared/platform/http";
import type { UvForecastQuery } from "@/shared/platform/open-meteo/uvUrl";
import { SimulationStateMachine } from "./machine";
import { createSimulationStore, type SimulationStore } from "./store";

class ImmediateTimeoutFactory implements TimeoutFactory {
  create = (_handler: () => void, _duration: Milliseconds): Timeout => ({
    cancel: () => {},
  });
}

class IdleRequestFactory implements RequestFactory<UvForecastQuery> {
  create = (_query: UvForecastQuery, _handler: ResponseHandler): RequestHandle => ({
    cancel: () => {},
  });
}

describe("SimulationStateMachine integrateOnMain", () => {
  it("loads the ODE module on first evaluate", async () => {
    const store = createStore<SimulationStore>()(createSimulationStore);
    const stateStore = createSimulationStateStore(store);
    const location = createLocation({
      id: "loc1",
      name: "Location loc1",
      firstAdministrativeDivision: undefined,
      countryName: undefined,
      latitude: 10,
      longitude: 20,
      timezone: "UTC",
    });
    const now = createMsSinceEpoch(Date.parse("2026-08-14T12:00:00Z"));
    const machine = new SimulationStateMachine(
      stateStore,
      new ImmediateTimeoutFactory(),
      new IdleRequestFactory(),
      () => location,
      () => true,
      () => true,
      () => now,
    );
    machine.handleVisibilityChange();
    await vi.waitFor(() => {
      expect(stateStore.getSimulationOutput().status).toBe("ready");
    });
  });
});
