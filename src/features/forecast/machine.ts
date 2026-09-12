import type { ForecastState, ForecastStateStore } from "@/features/forecast/model";
import {
  createMilliseconds,
  type Location,
  type LocationId,
  type Milliseconds,
  type MsSinceEpoch,
} from "@/shared/domain";
import type { Timeout, TimeoutFactory } from "@/shared/platform/clock";
import {
  parseJsonResponse,
  type RequestFactory,
  type ResponseHandler,
} from "@/shared/platform/http";
import { ForecastResponseSchema } from "@/shared/platform/open-meteo/forecastSchema";
import { mapForecastResponseToUvForecast } from "@/shared/platform/open-meteo/mapForecast";
import type { UvForecastQuery } from "@/shared/platform/open-meteo/uvUrl";
import { utcForecastWindow, utcIsoDate } from "@/shared/time";

/**
 * How long a fetched forecast is considered fresh before it is refetched.
 */
export const FORECAST_REFRESH_INTERVAL: Milliseconds = createMilliseconds(10 * 60 * 1000);

/**
 * Defines the public API for the Forecast State Machine.
 * Each handler reacts to an external signal; the machine decides what to do.
 */
export interface ForecastPort {
  /** Reacts to a change in network connectivity */
  handleNetworkChange(): void;
  /** Reacts to a change in page visibility */
  handleVisibilityChange(): void;
  /** Reacts to a change in the effective location */
  handleLocationChange(): void;
}

/**
 * The concrete implementation of the Forecast State Machine.
 * Fetches and refreshes the UV forecast for the effective location when the
 * app is online and visible, and the forecast is missing or stale.
 * All state access goes through the injected {@link ForecastStateStore} port
 * and all side effects through injected factories, keeping the machine
 * deterministic and unit-testable.
 */
export class ForecastStateMachine implements ForecastPort {
  private readonly requestFactory: RequestFactory<UvForecastQuery>;
  private readonly timeoutFactory: TimeoutFactory;
  private readonly store: ForecastStateStore;
  private readonly getEffectiveLocation: () => Location | null;
  private readonly isOnline: () => boolean;
  private readonly isVisible: () => boolean;
  private readonly now: () => MsSinceEpoch;
  private wakeupTimeout: Timeout | null = null;

  constructor(
    requestFactory: RequestFactory<UvForecastQuery>,
    timeoutFactory: TimeoutFactory,
    store: ForecastStateStore,
    getEffectiveLocation: () => Location | null,
    isOnline: () => boolean,
    isVisible: () => boolean,
    now: () => MsSinceEpoch,
  ) {
    this.requestFactory = requestFactory;
    this.timeoutFactory = timeoutFactory;
    this.store = store;
    this.getEffectiveLocation = getEffectiveLocation;
    this.isOnline = isOnline;
    this.isVisible = isVisible;
    this.now = now;
  }

  // Arrow-function properties are used deliberately throughout the service
  // layer so methods can be passed by reference without losing `this`.
  handleNetworkChange = (): void => this.evaluate();

  handleVisibilityChange = (): void => this.evaluate();

  handleLocationChange = (): void => this.evaluate();

  /**
   * The single decision point: reconciles the forecast state with the
   * effective location, connectivity, visibility, and freshness.
   */
  private evaluate = (): void => {
    const location = this.getEffectiveLocation();

    let state = this.store.getForecastState();

    if (!location) {
      this.cancelInFlight(state);
      this.cancelWakeup();
      this.store.clearForecast();
      return;
    }

    // Data or in-flight work belonging to a different location is useless
    if (state.status !== "empty" && state.locationId !== location.id) {
      this.cancelInFlight(state);
      this.cancelWakeup();
      this.store.clearForecast();
      state = { status: "empty" };
    }

    if (!this.isOnline() || !this.isVisible()) {
      return;
    }

    if (state.status === "fetching") {
      return;
    }

    if (state.status === "success" && this.now() - state.fetchedAt < FORECAST_REFRESH_INTERVAL) {
      return;
    }

    const window = utcForecastWindow(this.now());
    const requestHandle = this.requestFactory.create(
      {
        coordinates: location.coordinates,
        startDate: utcIsoDate(window.start),
        endDate: utcIsoDate(window.end - 1),
      },
      this.createResponseHandler(location.id),
    );
    this.store.startForecastFetch(location.id, requestHandle);
  };

  /**
   * Creates a response handler bound to the location the request was issued
   * for. The store guards on the location id, so a late response from a
   * superseded request is dropped there.
   */
  private createResponseHandler = (locationId: LocationId): ResponseHandler => ({
    onResponse: async (response) => {
      const parsed = await parseJsonResponse(response, ForecastResponseSchema, "forecast");
      if (!parsed.ok) {
        this.store.setForecastFailure(locationId, parsed.reason);
        return;
      }
      const forecast = mapForecastResponseToUvForecast(parsed.data);
      this.store.setForecastSuccess(locationId, forecast, this.now());

      // Only schedule a refresh wakeup if this success actually landed
      if (this.store.getForecastState().status === "success") {
        this.scheduleWakeup();
      }
    },
    onError: async (error) => {
      console.error("Error fetching forecast:", error);
      this.store.setForecastFailure(locationId, "Error fetching forecast");
    },
  });

  /**
   * Schedules a one-shot wakeup at the refresh interval, so a fresh forecast
   * goes stale on time even when no signal arrives.
   */
  private scheduleWakeup = (): void => {
    this.cancelWakeup();
    this.wakeupTimeout = this.timeoutFactory.create(this.handleWakeup, FORECAST_REFRESH_INTERVAL);
  };

  private cancelWakeup = (): void => {
    this.wakeupTimeout?.cancel();
    this.wakeupTimeout = null;
  };

  private handleWakeup = (): void => {
    this.wakeupTimeout = null;
    this.evaluate();
  };

  private cancelInFlight = (state: ForecastState): void => {
    if (state.status === "fetching") {
      state.requestHandle.cancel();
    }
  };
}
