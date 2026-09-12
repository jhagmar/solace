/**
 * The sunscreen store: the editable list of applications. Persisted — an
 * application from before the app was closed still affects the simulation.
 */

import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import { asSunscreenState, type SunscreenState } from "@/features/sunscreen/model";
import {
  PERSIST_SCHEMA_VERSION,
  persistMerge,
  persistMigrate,
  persistStorage,
} from "@/shared/platform/persist";

export interface SunscreenStore {
  sunscreenState: SunscreenState;
  setSunscreenState: (state: SunscreenState) => void;
}

export const createSunscreenStore: StateCreator<SunscreenStore, [], [], SunscreenStore> = (
  set,
) => ({
  sunscreenState: { applications: [], removals: [] },

  setSunscreenState: (sunscreenState) => set({ sunscreenState }),
});

export const useSunscreenStore = create<SunscreenStore>()(
  persist((...a) => ({ ...createSunscreenStore(...a) }), {
    name: "solace-sunscreen-store",
    version: PERSIST_SCHEMA_VERSION,
    migrate: persistMigrate,
    storage: persistStorage,
    partialize: (state) => ({ sunscreenState: state.sunscreenState }),
    merge: (persistedState: unknown, currentState: SunscreenStore): SunscreenStore =>
      persistMerge(currentState, () => {
        const persisted = persistedState as
          | Partial<Pick<SunscreenStore, "sunscreenState">>
          | undefined;
        return {
          sunscreenState:
            asSunscreenState(persisted?.sunscreenState) ?? currentState.sunscreenState,
        };
      }),
  }),
);
