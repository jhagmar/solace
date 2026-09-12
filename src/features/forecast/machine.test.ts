import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { ForecastStateStore } from "@/features/forecast/model";
import { createForecastStateStore } from "@/features/forecast/store";
import {
  createLocation,
  createMsSinceEpoch,
  type Location,
  type Milliseconds,
} from "@/shared/domain";
import type { Timeout, TimeoutFactory } from "@/shared/platform/clock";
import type { RequestFactory, RequestHandle, ResponseHandler } from "@/shared/platform/http";
import type { ForecastResponse } from "@/shared/platform/open-meteo/forecastSchema";
import type { UvForecastQuery } from "@/shared/platform/open-meteo/uvUrl";
import { FORECAST_REFRESH_INTERVAL, ForecastStateMachine } from "./machine";
import { createForecastStore, type ForecastStore } from "./store";

/**
 * A deterministic timeout factory for testing.
 * Captures wakeup callbacks so the test can flush them deterministically.
 */
class MockTimeoutFactory implements TimeoutFactory {
  activeTimeouts: Array<() => void> = [];

  create = (handler: () => void, _duration: Milliseconds): Timeout => {
    this.activeTimeouts.push(handler);
    return {
      cancel: () => {
        this.activeTimeouts = this.activeTimeouts.filter((h) => h !== handler);
      },
    };
  };

  /**
   * Executes all currently queued timeouts immediately.
   */
  flush = () => {
    const handlers = [...this.activeTimeouts];
    this.activeTimeouts = [];
    handlers.forEach((handler) => handler());
  };
}

/**
 * A mock network request factory for testing.
 * Captures every created handler so the test can simulate responses
 * deterministically, including late responses from superseded requests.
 */
class MockRequestFactory implements RequestFactory<UvForecastQuery> {
  createdHandlers: ResponseHandler[] = [];
  lastQuery?: UvForecastQuery;
  cancelCount = 0;

  create = (q: UvForecastQuery, handler: ResponseHandler): RequestHandle => {
    this.lastQuery = q;
    this.createdHandlers.push(handler);
    return {
      cancel: () => {
        this.cancelCount += 1;
      },
    };
  };

  get requestCount(): number {
    return this.createdHandlers.length;
  }

  /**
   * Simulates a successful API JSON response on the most recent request.
   */
  simulateSuccess = async (mockData: unknown, handlerIndex?: number) => {
    const handler =
      handlerIndex === undefined
        ? this.createdHandlers[this.createdHandlers.length - 1]
        : this.createdHandlers[handlerIndex];
    const response = new Response(JSON.stringify(mockData), { status: 200 });
    await handler?.onResponse(response);
  };

  /**
   * Simulates an HTTP error response (non-2xx status).
   */
  simulateHttpError = async (status: number) => {
    const response = new Response(null, { status });
    await this.createdHandlers[this.createdHandlers.length - 1]?.onResponse(response);
  };

  /**
   * Simulates a network failure or rejection.
   */
  simulateError = async (error: Error) => {
    await this.createdHandlers[this.createdHandlers.length - 1]?.onError(error);
  };
}

const createTestLocation = (id: string) =>
  createLocation({
    id,
    name: `Location ${id}`,
    firstAdministrativeDivision: undefined,
    countryName: undefined,
    latitude: 10,
    longitude: 20,
    timezone: undefined,
  });

const createForecastResponseJson = (): ForecastResponse => ({
  latitude: 10,
  longitude: 20,
  generationtime_ms: 0.03,
  utc_offset_seconds: 0,
  timezone: "GMT",
  timezone_abbreviation: "GMT",
  elevation: 24,
  hourly_units: { time: "iso8601", uv_index: "" },
  hourly: {
    time: ["2026-08-14T00:00", "2026-08-14T01:00"],
    uv_index: [0, 0.1],
  },
});

describe("ForecastStateMachine", () => {
  let store: StoreApi<ForecastStore>;
  let stateStore: ForecastStateStore;
  let mockTimeoutFactory: MockTimeoutFactory;
  let mockRequestFactory: MockRequestFactory;
  let machine: ForecastStateMachine;
  let location: Location;
  let effectiveLocation: Location | null;
  let online: boolean;
  let visible: boolean;
  let now: number;

  const T0 = Date.parse("2026-08-14T12:00:00Z");

  beforeEach(() => {
    store = createStore<ForecastStore>()(createForecastStore);
    stateStore = createForecastStateStore(store);
    mockTimeoutFactory = new MockTimeoutFactory();
    mockRequestFactory = new MockRequestFactory();
    location = createTestLocation("loc1");
    effectiveLocation = location;
    online = true;
    visible = true;
    now = T0;

    machine = new ForecastStateMachine(
      mockRequestFactory,
      mockTimeoutFactory,
      stateStore,
      () => effectiveLocation,
      () => online,
      () => visible,
      () => createMsSinceEpoch(now),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches when location is set, online, visible, and no forecast exists", () => {
    machine.handleLocationChange();

    expect(mockRequestFactory.requestCount).toBe(1);
    expect(mockRequestFactory.lastQuery).toEqual({
      coordinates: location.coordinates,
      startDate: "2026-08-13",
      endDate: "2026-08-15",
    });
    const state = store.getState().forecastState;
    expect(state.status).toBe("fetching");
    expect(state.status === "fetching" && state.locationId).toBe(location.id);
  });

  it("does not fetch while offline, but fetches when connectivity returns", () => {
    online = false;
    machine.handleLocationChange();
    expect(mockRequestFactory.requestCount).toBe(0);

    online = true;
    machine.handleNetworkChange();
    expect(mockRequestFactory.requestCount).toBe(1);
  });

  it("does not fetch while hidden, but fetches when the page becomes visible", () => {
    visible = false;
    machine.handleLocationChange();
    expect(mockRequestFactory.requestCount).toBe(0);

    visible = true;
    machine.handleVisibilityChange();
    expect(mockRequestFactory.requestCount).toBe(1);
  });

  it("does not start a second fetch while one is in flight", () => {
    machine.handleLocationChange();
    expect(mockRequestFactory.requestCount).toBe(1);

    // Repeated signals while the request is in flight are no-ops
    machine.handleNetworkChange();
    machine.handleVisibilityChange();
    machine.handleLocationChange();

    expect(mockRequestFactory.requestCount).toBe(1);
  });

  it("does not refetch a fresh forecast on signals", async () => {
    machine.handleLocationChange();
    await mockRequestFactory.simulateSuccess(createForecastResponseJson());
    expect(mockRequestFactory.requestCount).toBe(1);

    now += FORECAST_REFRESH_INTERVAL - 1;
    machine.handleNetworkChange();
    machine.handleVisibilityChange();
    machine.handleLocationChange();

    expect(mockRequestFactory.requestCount).toBe(1);
  });

  it("refetches a stale forecast on the next signal", async () => {
    machine.handleLocationChange();
    await mockRequestFactory.simulateSuccess(createForecastResponseJson());

    now += FORECAST_REFRESH_INTERVAL + 1;
    machine.handleNetworkChange();

    expect(mockRequestFactory.requestCount).toBe(2);
  });

  it("clears the forecast and cancels in-flight work when the location is unset", () => {
    machine.handleLocationChange();
    expect(store.getState().forecastState.status).toBe("fetching");

    effectiveLocation = null;
    machine.handleLocationChange();

    expect(mockRequestFactory.cancelCount).toBe(1);
    expect(store.getState().forecastState.status).toBe("empty");
  });

  it("cancels the old request and fetches anew when the location changes", () => {
    machine.handleLocationChange();
    expect(mockRequestFactory.requestCount).toBe(1);

    const newLocation = createTestLocation("loc2");
    effectiveLocation = newLocation;
    machine.handleLocationChange();

    expect(mockRequestFactory.cancelCount).toBe(1);
    expect(mockRequestFactory.requestCount).toBe(2);
    const state = store.getState().forecastState;
    expect(state.status === "fetching" && state.locationId).toBe(newLocation.id);
  });

  it("stores a successful response and schedules a refresh wakeup", async () => {
    machine.handleLocationChange();
    await mockRequestFactory.simulateSuccess(createForecastResponseJson());

    const state = store.getState().forecastState;
    expect(state.status).toBe("success");
    expect(state.status === "success" && state.fetchedAt).toBe(createMsSinceEpoch(T0));
    expect(state.status === "success" && state.forecast.hourly.map((e) => e.uvIndex)).toEqual([
      0, 0.1,
    ]);
    expect(mockTimeoutFactory.activeTimeouts.length).toBe(1);
  });

  it("refetches when the wakeup fires after the refresh interval", async () => {
    machine.handleLocationChange();
    await mockRequestFactory.simulateSuccess(createForecastResponseJson());

    now += FORECAST_REFRESH_INTERVAL;
    mockTimeoutFactory.flush();

    expect(mockRequestFactory.requestCount).toBe(2);
  });

  it("does not refetch when the wakeup fires while hidden, but recovers on visibility", async () => {
    machine.handleLocationChange();
    await mockRequestFactory.simulateSuccess(createForecastResponseJson());

    visible = false;
    now += FORECAST_REFRESH_INTERVAL;
    mockTimeoutFactory.flush();
    expect(mockRequestFactory.requestCount).toBe(1);

    visible = true;
    machine.handleVisibilityChange();
    expect(mockRequestFactory.requestCount).toBe(2);
  });

  it("clears a settled forecast when the location is unset", async () => {
    machine.handleLocationChange();
    await mockRequestFactory.simulateSuccess(createForecastResponseJson());
    expect(store.getState().forecastState.status).toBe("success");

    effectiveLocation = null;
    machine.handleLocationChange();

    expect(mockRequestFactory.cancelCount).toBe(0);
    expect(store.getState().forecastState.status).toBe("empty");
  });

  it("marks the fetch as failed on HTTP errors and network failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    machine.handleLocationChange();
    await mockRequestFactory.simulateHttpError(500);

    let state = store.getState().forecastState;
    expect(state.status).toBe("failure");
    expect(state.status === "failure" && state.reason).toBe("Request failed with status 500");

    machine.handleNetworkChange();
    await mockRequestFactory.simulateError(new Error("network down"));

    state = store.getState().forecastState;
    expect(state.status).toBe("failure");
    expect(state.status === "failure" && state.reason).toBe("Error fetching forecast");
  });

  it("marks the fetch as failed on invalid response data", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    machine.handleLocationChange();
    await mockRequestFactory.simulateSuccess({ not: "a forecast" });

    const state = store.getState().forecastState;
    expect(state.status).toBe("failure");
    expect(state.status === "failure" && state.reason).toBe("Error validating response");
  });

  it("drops a late response from a request superseded by a location change", async () => {
    machine.handleLocationChange();

    const newLocation = createTestLocation("loc2");
    effectiveLocation = newLocation;
    machine.handleLocationChange();

    // The response for the old location arrives late and must be dropped
    await mockRequestFactory.simulateSuccess(createForecastResponseJson(), 0);

    const state = store.getState().forecastState;
    expect(state.status).toBe("fetching");
    expect(state.status === "fetching" && state.locationId).toBe(newLocation.id);
  });

  it("retains the previous forecast when a refresh fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    machine.handleLocationChange();
    await mockRequestFactory.simulateSuccess(createForecastResponseJson());

    now += FORECAST_REFRESH_INTERVAL + 1;
    machine.handleNetworkChange();
    await mockRequestFactory.simulateError(new Error("network down"));

    const state = store.getState().forecastState;
    expect(state.status).toBe("failure");
    expect(state.status === "failure" && state.previous?.forecast.hourly.length).toBe(2);
  });
});
