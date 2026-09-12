/**
 * The active location store: which location the app currently shows, plus the
 * state of an in-progress search for a new one.
 *
 * The state is a discriminated union (see store/types.ts) so illegal
 * combinations — like holding search results without an active search — are
 * unrepresentable. All transitions are guarded: a state-changing call that
 * arrives after its context was superseded (e.g. a late response) is a no-op.
 */

import type { StoreApi } from "zustand";
import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import {
  type ActiveLocationFallback,
  type ActiveLocationState,
  asActiveLocationState,
  type LocationSearchStateStore,
  type RemoteSearchState,
} from "@/features/location/model";
import type { Location, LocationQuery } from "@/shared/domain";
import type { Timeout } from "@/shared/platform/clock";
import type { RequestHandle } from "@/shared/platform/http";
import {
  PERSIST_SCHEMA_VERSION,
  persistMerge,
  persistMigrate,
  persistStorage,
} from "@/shared/platform/persist";

/**
 * Zustand store for managing the active location and search state.
 */
export interface ActiveLocationStore {
  /** The current state of the active location */
  activeLocation: ActiveLocationState;
  /** Updates the search query and starts the debounce timer */
  setSearchDebouncing: (query: LocationQuery, timeout: Timeout) => void;
  /** Marks the search as offline: no remote request is possible, local results only */
  setSearchOffline: (query: LocationQuery) => void;
  /** Transitions the state from debouncing to fetching */
  setSearchFetching: (requestHandle: RequestHandle) => void;
  /** Updates state with successful search results */
  setSearchResults: (results: Location[]) => void;
  /** Updates state with a search failure reason */
  setSearchError: (reason: string) => void;
  /** Finalizes the search by selecting a location */
  setLocation: (location: Location) => void;
  /** Unsets the location entirely, returning to the empty state */
  unsetLocation: () => void;
  /** Pauses the search, transitioning the remote state to 'paused' */
  pauseSearch: () => void;
  /** Cancels the search and reverts to the fallback state */
  cancelSearch: () => void;
}

const getFallback = (activeLocationState: ActiveLocationState): ActiveLocationFallback => {
  switch (activeLocationState.status) {
    case "empty":
      return { status: "empty" };
    case "searching":
      return activeLocationState.fallback;
    case "set":
      return { status: "set", location: activeLocationState.location };
  }
};

/**
 * Enters 'searching' status with the given remote state, preserving the
 * current active location as the fallback a cancelled search reverts to.
 */
const startSearch = (
  current: ActiveLocationState,
  remoteSearchState: RemoteSearchState,
): { activeLocation: ActiveLocationState } => {
  return {
    activeLocation: { status: "searching", remoteSearchState, fallback: getFallback(current) },
  };
};

/**
 * Completes an ongoing search with a terminal remote state (success or
 * failure). Guarded on the search still being active: a response that
 * arrives after the search was paused or cancelled is dropped.
 */
const completeSearch = (
  current: ActiveLocationState,
  outcome: (query: LocationQuery) => RemoteSearchState,
): { activeLocation: ActiveLocationState } | Record<string, never> => {
  if (current.status === "searching" && current.remoteSearchState.status !== "paused") {
    return {
      activeLocation: {
        status: "searching",
        remoteSearchState: outcome(current.remoteSearchState.query),
        fallback: current.fallback,
      },
    };
  }
  return {};
};

export const createActiveLocationStore: StateCreator<
  ActiveLocationStore,
  [],
  [],
  ActiveLocationStore
> = (set) => ({
  activeLocation: { status: "empty" },

  setSearchDebouncing: (query, timeout) =>
    set((state: ActiveLocationStore) =>
      startSearch(state.activeLocation, { status: "debouncing", query, timeout }),
    ),

  setSearchOffline: (query) =>
    set((state: ActiveLocationStore) =>
      startSearch(state.activeLocation, { status: "offline", query }),
    ),

  setSearchFetching: (requestHandle) =>
    set((state: ActiveLocationStore) => {
      const current = state.activeLocation;
      if (current.status === "searching" && current.remoteSearchState.status === "debouncing") {
        const query = current.remoteSearchState.query;
        return {
          activeLocation: {
            status: "searching",
            remoteSearchState: { status: "fetching", query, requestHandle },
            fallback: current.fallback,
          },
        };
      }
      return {};
    }),

  setSearchResults: (results) =>
    set((state: ActiveLocationStore) =>
      completeSearch(state.activeLocation, (query) => ({ status: "success", query, results })),
    ),

  setSearchError: (reason) =>
    set((state: ActiveLocationStore) =>
      completeSearch(state.activeLocation, (query) => ({ status: "failure", query, reason })),
    ),

  setLocation: (location) =>
    set(() => ({
      activeLocation: { status: "set", location },
    })),

  unsetLocation: () => set({ activeLocation: { status: "empty" } }),

  pauseSearch: () =>
    set((state: ActiveLocationStore) => {
      const current = state.activeLocation;
      const fallback = getFallback(current);

      return {
        activeLocation: {
          status: "searching",
          remoteSearchState: { status: "paused" },
          fallback,
        },
      };
    }),

  cancelSearch: () =>
    set((state: ActiveLocationStore) => {
      if (state.activeLocation.status === "searching") {
        return { activeLocation: state.activeLocation.fallback };
      }
      return {};
    }),
});

export const useActiveLocationStore = create<ActiveLocationStore>()(
  persist((...a) => ({ ...createActiveLocationStore(...a) }), {
    name: "solace-active-location-store",
    version: PERSIST_SCHEMA_VERSION,
    migrate: persistMigrate,
    storage: persistStorage,
    partialize: (state) => ({ activeLocation: state.activeLocation }),
    merge: (persistedState: unknown, currentState: ActiveLocationStore): ActiveLocationStore =>
      persistMerge(currentState, () => {
        const persisted = persistedState as
          | Partial<Pick<ActiveLocationStore, "activeLocation">>
          | undefined;
        return {
          activeLocation:
            asActiveLocationState(persisted?.activeLocation) ?? currentState.activeLocation,
        };
      }),
  }),
);

export const createLocationSearchStateStore = (
  store: StoreApi<ActiveLocationStore>,
): LocationSearchStateStore => ({
  getActiveLocation: () => store.getState().activeLocation,
  setSearchDebouncing: (query, timeout) => store.getState().setSearchDebouncing(query, timeout),
  setSearchOffline: (query) => store.getState().setSearchOffline(query),
  setSearchFetching: (requestHandle) => store.getState().setSearchFetching(requestHandle),
  setSearchResults: (results) => store.getState().setSearchResults(results),
  setSearchError: (reason) => store.getState().setSearchError(reason),
  setLocation: (location) => store.getState().setLocation(location),
  unsetLocation: () => store.getState().unsetLocation(),
  pauseSearch: () => store.getState().pauseSearch(),
  cancelSearch: () => store.getState().cancelSearch(),
});

export const activeLocationStateStore: LocationSearchStateStore =
  createLocationSearchStateStore(useActiveLocationStore);

export const getEffectiveLocation = (): Location | null => {
  const state = useActiveLocationStore.getState().activeLocation;
  switch (state.status) {
    case "set":
      return state.location;
    case "searching":
      return state.fallback.status === "set" ? state.fallback.location : null;
    case "empty":
      return null;
  }
};
