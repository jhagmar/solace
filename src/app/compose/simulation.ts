import { getEffectiveLocation } from "@/features/location/activeStore";
import { isNetworkOnline } from "@/features/runtime/networkStore";
import { isPageVisible } from "@/features/runtime/visibilityStore";
import { SimulationStateMachine } from "@/features/simulation/machine";
import { simulationStateStore } from "@/features/simulation/store";
import { exposure } from "./exposure";
import { createWorkerLoadIntegrator } from "./load-integrator";
import { clock, timeoutFactory, uvForecastRequestFactory } from "./platform";
import { sunscreen } from "./sunscreen";

export const simulation = new SimulationStateMachine(
  simulationStateStore,
  timeoutFactory,
  uvForecastRequestFactory,
  getEffectiveLocation,
  isNetworkOnline,
  isPageVisible,
  clock,
  createWorkerLoadIntegrator(),
);

/** Clears outdoor windows, sunscreen stamps, leftover load, and the film. */
export function clearLoggedDay(): void {
  exposure.clearWindows();
  sunscreen.clear();
  simulation.clearLoggedDay();
}
