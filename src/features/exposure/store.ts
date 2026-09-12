/**
 * The exposure store: whether the user is currently indoors or outdoors,
 * and since when. Persisted — an outdoors interval must survive a reload,
 * otherwise the load accumulated before the app was closed would be lost.
 * Stale intervals are closed by the exposure state machine.
 */

import type { StoreApi } from "zustand";
import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import {
  asExposure,
  EMPTY_EXPOSURE_STATE,
  type ExposureState,
  type ExposureStateStore,
} from "@/features/exposure/model";
import {
  PERSIST_SCHEMA_VERSION,
  persistMerge,
  persistMigrate,
  persistStorage,
} from "@/shared/platform/persist";

export interface ExposureStore {
  exposureState: ExposureState;
  setExposureState: (state: ExposureState) => void;
}

export const createExposureStore: StateCreator<ExposureStore, [], [], ExposureStore> = (set) => ({
  exposureState: EMPTY_EXPOSURE_STATE,

  setExposureState: (exposureState) => set({ exposureState }),
});

export const useExposureStore = create<ExposureStore>()(
  persist((...a) => ({ ...createExposureStore(...a) }), {
    name: "solace-exposure-store",
    version: PERSIST_SCHEMA_VERSION,
    migrate: persistMigrate,
    storage: persistStorage,
    partialize: (state) => ({ exposureState: state.exposureState }),
    merge: (persistedState: unknown, currentState: ExposureStore): ExposureStore =>
      persistMerge(currentState, () => {
        const persisted = persistedState as
          | Partial<Pick<ExposureStore, "exposureState">>
          | undefined;
        return {
          exposureState: asExposure(persisted?.exposureState) ?? currentState.exposureState,
        };
      }),
  }),
);

export const createExposureStateStore = (store: StoreApi<ExposureStore>): ExposureStateStore => ({
  getExposureState: () => store.getState().exposureState,
  setExposureState: (state) => store.getState().setExposureState(state),
});

export const exposureStateStore: ExposureStateStore = createExposureStateStore(useExposureStore);
