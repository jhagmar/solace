/**
 * The recent locations store: a most-recently-used list of selected
 * locations, capped in size. Persisted (see store/index.ts) so the search
 * dropdown can offer history across sessions — including offline, where it
 * is the only search source.
 */

import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import type { RecentLocationsRecorder, RecentLocationsState } from "@/features/location/model";
import { asLocation, type Location } from "@/shared/domain";
import {
  PERSIST_SCHEMA_VERSION,
  persistMerge,
  persistMigrate,
  persistStorage,
} from "@/shared/platform/persist";

/** Maximum number of locations kept in the history */
const MAX_RECENT_LOCATIONS = 5;

export interface RecentLocationsStore {
  recentLocations: RecentLocationsState;
  addLocation: (location: Location) => void;
  clearRecentLocations: () => void;
}

export const createRecentLocationsStore: StateCreator<
  RecentLocationsStore,
  [],
  [],
  RecentLocationsStore
> = (set) => ({
  recentLocations: { recents: [] },

  // MRU semantics: the newest selection leads, duplicates move to the front
  addLocation: (location) =>
    set((state: RecentLocationsStore) => ({
      recentLocations: {
        recents: [
          location,
          ...state.recentLocations.recents.filter((r: Location) => r.id !== location.id),
        ].slice(0, MAX_RECENT_LOCATIONS),
      },
    })),

  clearRecentLocations: () => set({ recentLocations: { recents: [] } }),
});

export const useRecentLocationsStore = create<RecentLocationsStore>()(
  persist((...a) => ({ ...createRecentLocationsStore(...a) }), {
    name: "solace-recent-locations-store",
    version: PERSIST_SCHEMA_VERSION,
    migrate: persistMigrate,
    storage: persistStorage,
    partialize: (state) => ({ recentLocations: state.recentLocations }),
    merge: (persistedState: unknown, currentState: RecentLocationsStore): RecentLocationsStore =>
      persistMerge(currentState, () => {
        const persisted = persistedState as
          | Partial<Pick<RecentLocationsStore, "recentLocations">>
          | undefined;
        const raw = persisted?.recentLocations?.recents;
        const recents = (Array.isArray(raw) ? raw : [])
          .map(asLocation)
          .filter((location): location is Location => location !== null);
        return {
          recentLocations: {
            recents: recents.length > 0 ? recents : currentState.recentLocations.recents,
          },
        };
      }),
  }),
);

export const recentLocationsRecorder: RecentLocationsRecorder = {
  addLocation: (location) => useRecentLocationsStore.getState().addLocation(location),
};
