import { asLocation, type Location, type LocationQuery } from "@/shared/domain";
import type { Timeout } from "@/shared/platform/clock";
import type { RequestHandle } from "@/shared/platform/http";

/** Fallback if a search is cancelled. */
export type ActiveLocationFallback = { status: "empty" } | { status: "set"; location: Location };

/** Active location, including an in-progress search. */
export type ActiveLocationState =
  | { status: "empty" }
  | { status: "set"; location: Location }
  | { status: "searching"; remoteSearchState: RemoteSearchState; fallback: ActiveLocationFallback };

/** Remote search phases. */
export type RemoteSearchState =
  | { status: "paused" }
  | { status: "offline"; query: LocationQuery }
  | { status: "debouncing"; query: LocationQuery; timeout: Timeout }
  | { status: "fetching"; query: LocationQuery; requestHandle: RequestHandle }
  | { status: "success"; query: LocationQuery; results: Location[] }
  | { status: "failure"; query: LocationQuery; reason: string };

/** Recently selected locations. */
export type RecentLocationsState = { recents: Location[] };

/**
 * Narrows untrusted persisted JSON to a restorable active-location state.
 * In-progress searches are not persisted as searches: they unwrap to the
 * fallback. A set location that fails {@link asLocation} becomes empty
 * rather than a half-formed value that later crashes forecast fetching.
 */
export function asActiveLocationState(value: unknown): ActiveLocationState | null {
  if (typeof value !== "object" || value === null || !("status" in value)) {
    return null;
  }
  const raw = value as { status: unknown; location?: unknown; fallback?: unknown };
  switch (raw.status) {
    case "empty":
      return { status: "empty" };
    case "set": {
      const location = asLocation(raw.location);
      return location ? { status: "set", location } : { status: "empty" };
    }
    case "searching":
      return asActiveLocationState(raw.fallback) ?? { status: "empty" };
    default:
      return null;
  }
}

/**
 * Narrow port through which the location search machine reads and
 * transitions active-location state.
 */
export interface LocationSearchStateStore {
  getActiveLocation(): ActiveLocationState;
  setSearchDebouncing(query: LocationQuery, timeout: Timeout): void;
  setSearchOffline(query: LocationQuery): void;
  setSearchFetching(requestHandle: RequestHandle): void;
  setSearchResults(results: Location[]): void;
  setSearchError(reason: string): void;
  setLocation(location: Location): void;
  unsetLocation(): void;
  pauseSearch(): void;
  cancelSearch(): void;
}

/** Records selected locations into recents. */
export interface RecentLocationsRecorder {
  addLocation(location: Location): void;
}
