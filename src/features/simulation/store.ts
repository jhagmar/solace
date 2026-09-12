/**
 * The simulation store: the raw inputs the load simulation integrates over
 * plus the last completed UTC-window trajectory. Persisted — the event
 * history and last graph must survive a reload, otherwise load accumulated
 * while the app was closed is lost and the chart flashes empty until the
 * next run finishes.
 */

import type { StoreApi } from "zustand";
import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import type {
  SimulationInputState,
  SimulationOutputState,
  SimulationStateStore,
} from "@/features/simulation/model";
import { asSimulationInput, asSimulationOutput } from "@/features/simulation/persist";
import {
  PERSIST_SCHEMA_VERSION,
  persistMerge,
  persistMigrate,
  persistStorage,
} from "@/shared/platform/persist";

/** The empty simulation input: no computed state, no history yet */
export const EMPTY_SIMULATION_INPUT: SimulationInputState = {
  initialConditions: undefined,
  forecasts: {},
  events: [],
};

/** No trajectory yet — the machine fills this on the first visible evaluation */
export const EMPTY_SIMULATION_OUTPUT: SimulationOutputState = { status: "empty" };

export interface SimulationStore {
  simulationInput: SimulationInputState;
  setSimulationInput: (state: SimulationInputState) => void;
  simulationOutput: SimulationOutputState;
  setSimulationOutput: (state: SimulationOutputState) => void;
}

export const createSimulationStore: StateCreator<SimulationStore, [], [], SimulationStore> = (
  set,
) => ({
  simulationInput: EMPTY_SIMULATION_INPUT,
  simulationOutput: EMPTY_SIMULATION_OUTPUT,

  setSimulationInput: (simulationInput) => {
    set({ simulationInput });
  },

  setSimulationOutput: (simulationOutput) => {
    set({ simulationOutput });
  },
});

export const useSimulationStore = create<SimulationStore>()(
  persist((...a) => ({ ...createSimulationStore(...a) }), {
    name: "solace-simulation-store",
    version: PERSIST_SCHEMA_VERSION,
    migrate: persistMigrate,
    storage: persistStorage,
    partialize: (state) => ({
      simulationInput: state.simulationInput,
      simulationOutput:
        state.simulationOutput.status === "ready"
          ? state.simulationOutput
          : { status: "empty" as const },
    }),
    merge: (persistedState: unknown, currentState: SimulationStore): SimulationStore =>
      persistMerge(currentState, () => {
        const persisted = persistedState as
          | Partial<Pick<SimulationStore, "simulationInput" | "simulationOutput">>
          | undefined;
        const output = asSimulationOutput(persisted?.simulationOutput);
        return {
          simulationInput:
            asSimulationInput(persisted?.simulationInput) ?? currentState.simulationInput,
          simulationOutput: output?.status === "ready" ? output : currentState.simulationOutput,
        };
      }),
  }),
);

export const createSimulationStateStore = (
  store: StoreApi<SimulationStore>,
): SimulationStateStore => ({
  getSimulationInput: () => store.getState().simulationInput,
  setSimulationInput: (state) => store.getState().setSimulationInput(state),
  getSimulationOutput: () => store.getState().simulationOutput,
  setSimulationOutput: (state) => store.getState().setSimulationOutput(state),
});

export const simulationStateStore: SimulationStateStore =
  createSimulationStateStore(useSimulationStore);
