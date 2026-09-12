/**
 * The forecast store: the UV forecast for the effective location and the
 * lifecycle state of fetching it (empty → fetching → success/failure).
 *
 * The state is a discriminated union (see store/types.ts) carrying the
 * location id the data belongs to; success/failure transitions are guarded
 * on the matching in-flight request, so a late response from a superseded
 * request can never clobber newer state. A failed refresh retains the
 * previously cached forecast so the UI can still present stale data.
 * Only successful forecasts are persisted (see store/index.ts).
 */

import type { StoreApi } from "zustand";
import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ForecastState,
  ForecastStateStore,
  TimestampedUvForecast,
  UvForecast,
} from "@/features/forecast/model";
import type { LocationId, MsSinceEpoch } from "@/shared/domain";
import type { RequestHandle } from "@/shared/platform/http";
import {
  PERSIST_SCHEMA_VERSION,
  persistMerge,
  persistMigrate,
  persistStorage,
} from "@/shared/platform/persist";

export interface ForecastStore {
  forecastState: ForecastState;
  startForecastFetch: (locationId: LocationId, requestHandle: RequestHandle) => void;
  setForecastSuccess: (
    locationId: LocationId,
    forecast: UvForecast,
    fetchedAt: MsSinceEpoch,
  ) => void;
  setForecastFailure: (locationId: LocationId, reason: string) => void;
  clearForecast: () => void;
}

/**
 * The cached forecast to carry into a new fetch for the same location,
 * so a failed refresh can still present stale data.
 */
const getTimestampedUvForecast = (
  state: ForecastState,
  locationId: LocationId,
): TimestampedUvForecast | null => {
  if (state.status === "success" && state.locationId === locationId) {
    return { forecast: state.forecast, fetchedAt: state.fetchedAt };
  }
  if (state.status === "failure" && state.locationId === locationId) {
    return state.previous;
  }
  return null;
};

/**
 * Applies `outcome` only while the request it answers is still in flight;
 * anything else is a late response from a superseded request and is dropped.
 */
const completeFetch = (
  current: ForecastState,
  locationId: LocationId,
  outcome: (previous: TimestampedUvForecast | null) => ForecastState,
): { forecastState: ForecastState } | Record<string, never> => {
  if (current.status === "fetching" && current.locationId === locationId) {
    return { forecastState: outcome(current.previous) };
  }
  return {};
};

export const createForecastStore: StateCreator<ForecastStore, [], [], ForecastStore> = (set) => ({
  forecastState: { status: "empty" },

  startForecastFetch: (locationId, requestHandle) =>
    set((state) => ({
      forecastState: {
        status: "fetching",
        locationId,
        requestHandle,
        previous: getTimestampedUvForecast(state.forecastState, locationId),
      },
    })),

  setForecastSuccess: (locationId, forecast, fetchedAt) =>
    set((state) =>
      completeFetch(state.forecastState, locationId, () => ({
        status: "success",
        locationId,
        forecast,
        fetchedAt,
      })),
    ),

  setForecastFailure: (locationId, reason) =>
    set((state) =>
      completeFetch(state.forecastState, locationId, (previous) => ({
        status: "failure",
        locationId,
        reason,
        previous,
      })),
    ),

  clearForecast: () => set({ forecastState: { status: "empty" } }),
});

export const useForecastStore = create<ForecastStore>()(
  persist((...a) => ({ ...createForecastStore(...a) }), {
    name: "solace-forecast-store",
    version: PERSIST_SCHEMA_VERSION,
    migrate: persistMigrate,
    storage: persistStorage,
    partialize: (state) => ({
      forecastState:
        state.forecastState.status === "success"
          ? state.forecastState
          : { status: "empty" as const },
    }),
    merge: (persistedState: unknown, currentState: ForecastStore): ForecastStore =>
      persistMerge(currentState, () => {
        const persisted = persistedState as
          | Partial<Pick<ForecastStore, "forecastState">>
          | undefined;
        const persistedForecast = persisted?.forecastState;
        return {
          forecastState:
            persistedForecast?.status === "success" ? persistedForecast : { status: "empty" },
        };
      }),
  }),
);

export const createForecastStateStore = (store: StoreApi<ForecastStore>): ForecastStateStore => ({
  getForecastState: () => store.getState().forecastState,
  startForecastFetch: (locationId, requestHandle) =>
    store.getState().startForecastFetch(locationId, requestHandle),
  setForecastSuccess: (locationId, forecast, fetchedAt) =>
    store.getState().setForecastSuccess(locationId, forecast, fetchedAt),
  setForecastFailure: (locationId, reason) =>
    store.getState().setForecastFailure(locationId, reason),
  clearForecast: () => store.getState().clearForecast(),
});

export const forecastStateStore: ForecastStateStore = createForecastStateStore(useForecastStore);
