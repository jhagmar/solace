import type {
  ActiveLocationState,
  LocationSearchStateStore,
  RecentLocationsRecorder,
} from "@/features/location/model";
import {
  createLocation,
  createMilliseconds,
  type Location,
  type LocationQuery,
  type Milliseconds,
} from "@/shared/domain";
import type { TimeoutFactory } from "@/shared/platform/clock";
import {
  parseJsonResponse,
  type RequestFactory,
  type ResponseHandler,
} from "@/shared/platform/http";
import {
  type GeocodingLocation,
  GeocodingResponseSchema,
} from "@/shared/platform/open-meteo/geocodingSchema";

const DEBOUNCE_TIMEOUT: Milliseconds = createMilliseconds(300);
const MINIMUM_QUERY_LENGTH: number = 3;

/**
 * Defines the public API for the Location Search State Machine.
 */
export interface LocationSearchPort {
  /**
   * Updates the location search query.
   * Will automatically debounce, fetch, and handle responses.
   * @param locationQuery - The new search query string wrapper
   */
  handleSearchInput(locationQuery: LocationQuery): void;
  /** Cancels any ongoing search and reverts to the last valid fallback state */
  cancelSearch(): void;
  /** Finalizes a search by selecting a specific location */
  setLocation(location: Location): void;
  /** Clears the location entirely, cancelling any ongoing search */
  unsetLocation(): void;
}

/**
 * Maps a validated Open-Meteo geocoding result to the domain type,
 * running every field through its validating smart constructor.
 */
const toLocation = (value: GeocodingLocation): Location =>
  createLocation({
    id: value.id,
    name: value.name,
    firstAdministrativeDivision: value.admin1,
    countryName: value.country,
    latitude: value.latitude,
    longitude: value.longitude,
    timezone: value.timezone,
  });

/**
 * Builds the response handler for geocoding requests. A single instance is
 * shared by all searches: the store guards every transition on the current
 * state, so a late response from a superseded request is dropped there.
 */
const createResponseHandler = (store: LocationSearchStateStore): ResponseHandler => ({
  onResponse: async (response) => {
    const parsed = await parseJsonResponse(response, GeocodingResponseSchema, "location search");
    if (!parsed.ok) {
      store.setSearchError(parsed.reason);
      return;
    }
    const locations: Location[] = (parsed.data.results ?? []).map(toLocation);
    store.setSearchResults(locations);
  },
  onError: async (error) => {
    console.error("Error fetching locations:", error);
    store.setSearchError("Error fetching locations");
  },
});

/**
 * The concrete implementation of the Location Search State Machine.
 * Manages side-effects (timers and network requests) deterministically.
 * All state access goes through the injected {@link LocationSearchStateStore} port,
 * keeping the machine decoupled from any concrete store implementation.
 */
export class LocationSearchStateMachine implements LocationSearchPort {
  private readonly timeoutFactory: TimeoutFactory;
  private readonly locationRequestFactory: RequestFactory<LocationQuery>;
  private readonly store: LocationSearchStateStore;
  private readonly isOnline: () => boolean;
  private readonly recentLocations: RecentLocationsRecorder;
  private readonly responseHandler: ResponseHandler;

  constructor(
    timeoutFactory: TimeoutFactory,
    locationRequestFactory: RequestFactory<LocationQuery>,
    store: LocationSearchStateStore,
    isOnline: () => boolean,
    recentLocations: RecentLocationsRecorder,
  ) {
    this.timeoutFactory = timeoutFactory;
    this.locationRequestFactory = locationRequestFactory;
    this.store = store;
    this.isOnline = isOnline;
    this.recentLocations = recentLocations;
    this.responseHandler = createResponseHandler(store);
  }

  /**
   * Cancels any pending debounce timer or in-flight request so no work
   * outlives the state transition that superseded it.
   */
  private cancelInFlightWork = (state: ActiveLocationState): void => {
    if (state.status !== "searching") {
      return;
    }

    switch (state.remoteSearchState.status) {
      case "debouncing":
        state.remoteSearchState.timeout.cancel();
        break;
      case "fetching":
        state.remoteSearchState.requestHandle.cancel();
        break;
    }
  };

  private handleDebounceTimeout = (): void => {
    const state = this.store.getActiveLocation();
    if (state.status === "searching" && state.remoteSearchState.status === "debouncing") {
      const requestHandle = this.locationRequestFactory.create(
        state.remoteSearchState.query,
        this.responseHandler,
      );
      this.store.setSearchFetching(requestHandle);
    }
  };

  handleSearchInput = (locationQuery: LocationQuery): void => {
    this.cancelInFlightWork(this.store.getActiveLocation());

    if (locationQuery.name.length < MINIMUM_QUERY_LENGTH) {
      this.store.pauseSearch();
    } else if (!this.isOnline()) {
      // Degrade gracefully: no remote search while offline.
      // The UI keeps filtering recent locations against the query locally.
      this.store.setSearchOffline(locationQuery);
    } else {
      const timeout = this.timeoutFactory.create(this.handleDebounceTimeout, DEBOUNCE_TIMEOUT);
      this.store.setSearchDebouncing(locationQuery, timeout);
    }
  };

  cancelSearch = (): void => {
    this.cancelInFlightWork(this.store.getActiveLocation());
    this.store.cancelSearch();
  };

  setLocation = (location: Location): void => {
    this.cancelInFlightWork(this.store.getActiveLocation());
    this.recentLocations.addLocation(location);
    this.store.setLocation(location);
  };

  unsetLocation = (): void => {
    this.cancelInFlightWork(this.store.getActiveLocation());
    this.store.unsetLocation();
  };
}
