import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore, type StoreApi } from "zustand/vanilla";
import { createLocationSearchStateStore } from "@/features/location/activeStore";
import type { LocationSearchStateStore, RecentLocationsRecorder } from "@/features/location/model";
import {
  createLocation,
  createLocationQuery,
  type Location,
  type LocationQuery,
  type Milliseconds,
} from "@/shared/domain";
import type { Timeout, TimeoutFactory } from "@/shared/platform/clock";
import type { RequestFactory, RequestHandle, ResponseHandler } from "@/shared/platform/http";
import { type ActiveLocationStore, createActiveLocationStore } from "./activeStore";
import { LocationSearchStateMachine } from "./machine";

/**
 * A deterministic timeout factory for testing.
 * Instead of waiting real time, it captures the callbacks and allows the test to flush them deterministically.
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
 * Captures the request handlers so the test can simulate success or failure deterministically.
 */
class MockRequestFactory implements RequestFactory<LocationQuery> {
  lastHandler?: ResponseHandler;
  cancelCount = 0;

  create = (_q: LocationQuery, handler: ResponseHandler): RequestHandle => {
    this.lastHandler = handler;
    return {
      cancel: () => {
        this.cancelCount += 1;
      },
    };
  };

  /**
   * Simulates a successful API JSON response.
   */
  simulateSuccess = async (mockData: unknown) => {
    const response = new Response(JSON.stringify(mockData), { status: 200 });
    await this.lastHandler?.onResponse(response);
  };

  /**
   * Simulates an HTTP error response (non-2xx status).
   */
  simulateHttpError = async (status: number) => {
    const response = new Response(null, { status });
    await this.lastHandler?.onResponse(response);
  };

  /**
   * Simulates an API failure or rejection.
   */
  simulateError = async (error: Error) => {
    await this.lastHandler?.onError(error);
  };
}

const createTestLocation = () =>
  createLocation({
    id: 1,
    name: "Test City",
    firstAdministrativeDivision: "Test County",
    countryName: "Testland",
    latitude: 10,
    longitude: 20,
    timezone: undefined,
  });

describe("LocationSearchStateMachine", () => {
  let store: StoreApi<ActiveLocationStore>;
  let stateStore: LocationSearchStateStore;
  let mockTimeoutFactory: MockTimeoutFactory;
  let mockRequestFactory: MockRequestFactory;
  let online: boolean;
  let recordedLocations: Location[];
  let recentsRecorder: RecentLocationsRecorder;
  let machine: LocationSearchStateMachine;

  beforeEach(() => {
    // Each test gets an isolated store instance with the real slice logic,
    // adapted to the narrow port the machine depends on.
    store = createStore<ActiveLocationStore>()(createActiveLocationStore);
    stateStore = createLocationSearchStateStore(store);

    online = true;
    recordedLocations = [];
    recentsRecorder = {
      addLocation: (location) => {
        recordedLocations.push(location);
      },
    };

    mockTimeoutFactory = new MockTimeoutFactory();
    mockRequestFactory = new MockRequestFactory();
    machine = new LocationSearchStateMachine(
      mockTimeoutFactory,
      mockRequestFactory,
      stateStore,
      () => online,
      recentsRecorder,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const getActiveLocation = () => store.getState().activeLocation;

  it("should transition to fetching when debounce completes", () => {
    machine.handleSearchInput(createLocationQuery("Stockholm"));

    let state = getActiveLocation();
    expect(state.status).toBe("searching");
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("debouncing");
    }

    mockTimeoutFactory.flush();

    state = getActiveLocation();
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("fetching");
    } else {
      expect.fail("Expected state to be searching");
    }
  });

  it("should successfully parse results and map wire fields to domain types", async () => {
    machine.handleSearchInput(createLocationQuery("Stockholm"));
    mockTimeoutFactory.flush();

    // Note: the API wire format uses admin1 / country keys
    await mockRequestFactory.simulateSuccess({
      results: [
        {
          id: 1,
          name: "Stockholm",
          latitude: 59.32,
          longitude: 18.06,
          timezone: "Europe/Stockholm",
          admin1: "Stockholm County",
          country: "Sweden",
          feature_code: "PPLC",
          country_code: "SE",
        },
      ],
    });

    const state = getActiveLocation();
    expect(state.status).toBe("searching");
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("success");
      if (state.remoteSearchState.status === "success") {
        const result = state.remoteSearchState.results[0];
        expect(result.name).toBe("Stockholm");
        expect(result.id).toBe("1");
        expect(result.firstAdministrativeDivision).toBe("Stockholm County");
        expect(result.countryName).toBe("Sweden");
        expect(result.timezone).toBe("Europe/Stockholm");
      }
    }
  });

  it("should leave optional fields undefined when the API omits them", async () => {
    machine.handleSearchInput(createLocationQuery("Nowhere"));
    mockTimeoutFactory.flush();

    await mockRequestFactory.simulateSuccess({
      results: [
        {
          id: 2,
          name: "Nowhere",
          latitude: 1,
          longitude: 2,
          timezone: undefined,
          feature_code: "PPL",
          country_code: "SE",
        },
      ],
    });

    const state = getActiveLocation();
    if (state.status === "searching" && state.remoteSearchState.status === "success") {
      expect(state.remoteSearchState.results[0].firstAdministrativeDivision).toBeUndefined();
      expect(state.remoteSearchState.results[0].countryName).toBeUndefined();
      expect(state.remoteSearchState.results[0].timezone).toBeNull();
    } else {
      expect.fail("Expected state to be searching with success");
    }
  });

  it("should succeed with empty results when the response has none", async () => {
    machine.handleSearchInput(createLocationQuery("Nowhere"));
    mockTimeoutFactory.flush();

    await mockRequestFactory.simulateSuccess({});

    const state = getActiveLocation();
    expect(state.status).toBe("searching");
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("success");
      if (state.remoteSearchState.status === "success") {
        expect(state.remoteSearchState.results).toEqual([]);
      }
    }
  });

  it("should ignore a debounce timeout after the search has left that state", () => {
    machine.handleSearchInput(createLocationQuery("Stockholm"));
    expect(mockTimeoutFactory.activeTimeouts.length).toBe(1);

    // The slice dropped the search, but the timer was not cancelled — the
    // race the machine guards against when a late timeout fires.
    store.getState().cancelSearch();
    mockTimeoutFactory.flush();

    expect(mockRequestFactory.lastHandler).toBeUndefined();
    expect(getActiveLocation().status).toBe("empty");
  });

  it("should gracefully handle validation errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    machine.handleSearchInput(createLocationQuery("Stockholm"));
    mockTimeoutFactory.flush();

    // Simulate returning malformed data that fails Zod validation
    await mockRequestFactory.simulateSuccess({
      results: [{ wrong_key: "Stockholm" }],
    });

    const state = getActiveLocation();
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("failure");
    } else {
      expect.fail("Expected state to be searching");
    }
  });

  it("should gracefully handle network errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    machine.handleSearchInput(createLocationQuery("Stockholm"));
    mockTimeoutFactory.flush();

    await mockRequestFactory.simulateError(new Error("Network disconnect"));

    const state = getActiveLocation();
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("failure");
    } else {
      expect.fail("Expected state to be searching");
    }
  });

  it("should report failure when the response status is not ok", async () => {
    machine.handleSearchInput(createLocationQuery("Stockholm"));
    mockTimeoutFactory.flush();

    await mockRequestFactory.simulateHttpError(500);

    const state = getActiveLocation();
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("failure");
      if (state.remoteSearchState.status === "failure") {
        expect(state.remoteSearchState.reason).toContain("500");
      }
    } else {
      expect.fail("Expected state to be searching");
    }
  });

  it("should pause without debouncing when the query is shorter than the minimum length", () => {
    // 2 characters is below the minimum query length of 3
    machine.handleSearchInput(createLocationQuery("St"));

    expect(mockTimeoutFactory.activeTimeouts.length).toBe(0);

    const state = getActiveLocation();
    expect(state.status).toBe("searching");
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("paused");
      expect(state.fallback.status).toBe("empty");
    }
  });

  it("should debounce once the query reaches the minimum length", () => {
    // Exactly 3 characters meets the minimum query length
    machine.handleSearchInput(createLocationQuery("Sto"));

    expect(mockTimeoutFactory.activeTimeouts.length).toBe(1);

    const state = getActiveLocation();
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("debouncing");
    } else {
      expect.fail("Expected state to be searching");
    }
  });

  it("should cancel the pending debounce when the query drops below the minimum length", () => {
    machine.handleSearchInput(createLocationQuery("Stockholm"));
    expect(mockTimeoutFactory.activeTimeouts.length).toBe(1);

    // Deleting back below the minimum length pauses the search
    machine.handleSearchInput(createLocationQuery("St"));

    expect(mockTimeoutFactory.activeTimeouts.length).toBe(0);

    const state = getActiveLocation();
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("paused");
    } else {
      expect.fail("Expected state to be searching");
    }
  });

  it("should keep the set location as fallback when pausing from a set state", () => {
    machine.setLocation(createTestLocation());

    machine.handleSearchInput(createLocationQuery("St"));

    const state = getActiveLocation();
    expect(state.status).toBe("searching");
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("paused");
      expect(state.fallback.status).toBe("set");
    }

    // Cancelling the paused search reverts to the set location
    machine.cancelSearch();
    expect(getActiveLocation().status).toBe("set");
  });

  it("should not fetch remotely while offline, but keep the query for local filtering", () => {
    online = false;

    machine.handleSearchInput(createLocationQuery("Stockholm"));

    // No debounce timer and no request while offline
    expect(mockTimeoutFactory.activeTimeouts.length).toBe(0);
    expect(mockRequestFactory.lastHandler).toBeUndefined();

    const state = getActiveLocation();
    expect(state.status).toBe("searching");
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("offline");
      if (state.remoteSearchState.status === "offline") {
        expect(state.remoteSearchState.query.name).toBe("Stockholm");
      }
    }
  });

  it("should pause rather than go offline when the query is below the minimum length", () => {
    online = false;

    machine.handleSearchInput(createLocationQuery("St"));

    const state = getActiveLocation();
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("paused");
    } else {
      expect.fail("Expected state to be searching");
    }
  });

  it("should resume remote searching on the next keystroke after coming back online", () => {
    online = false;
    machine.handleSearchInput(createLocationQuery("Stockholm"));

    let state = getActiveLocation();
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("offline");
    } else {
      expect.fail("Expected state to be searching");
    }

    online = true;
    machine.handleSearchInput(createLocationQuery("Stockholms"));

    expect(mockTimeoutFactory.activeTimeouts.length).toBe(1);
    state = getActiveLocation();
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("debouncing");
    } else {
      expect.fail("Expected state to be searching");
    }
  });

  it("should record selected locations into the recent locations history", () => {
    const testLocation = createTestLocation();

    machine.setLocation(testLocation);

    expect(recordedLocations).toEqual([testLocation]);
    expect(getActiveLocation().status).toBe("set");
  });

  it("should set selected location and allow searching again from set state", () => {
    machine.setLocation(createTestLocation());
    let state = getActiveLocation();
    expect(state.status).toBe("set");

    // Start search again to trigger the 'set' fallback branch
    machine.handleSearchInput(createLocationQuery("Stockholm"));

    state = getActiveLocation();
    expect(state.status).toBe("searching");
    if (state.status === "searching") {
      expect(state.fallback.status).toBe("set");
    }

    // Cancel search to ensure we revert to 'set'
    machine.cancelSearch();
    state = getActiveLocation();
    expect(state.status).toBe("set");
  });

  it("should handle cancel when not searching", () => {
    machine.cancelSearch();
    expect(getActiveLocation().status).toBe("empty");
  });

  it("should ignore result transitions that do not match the current state", () => {
    // All of these are no-ops while the state is 'empty'
    store.getState().setSearchFetching({ cancel: () => {} });
    expect(getActiveLocation().status).toBe("empty");

    store.getState().setSearchResults([]);
    expect(getActiveLocation().status).toBe("empty");

    store.getState().setSearchError("nope");
    expect(getActiveLocation().status).toBe("empty");
  });

  it("should enter a paused searching state when pauseSearch is called from empty", () => {
    store.getState().pauseSearch();

    const state = getActiveLocation();
    expect(state.status).toBe("searching");
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("paused");
      expect(state.fallback.status).toBe("empty");
    }
  });

  it("should cancel the in-flight request when the query updates during fetch", () => {
    machine.handleSearchInput(createLocationQuery("Stockholm"));
    mockTimeoutFactory.flush();

    let state = getActiveLocation();
    expect(state.status).toBe("searching");
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("fetching");
    }

    // Typing another character should cancel the request
    machine.handleSearchInput(createLocationQuery("Stockhol"));
    expect(mockRequestFactory.cancelCount).toBe(1);

    state = getActiveLocation();
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("debouncing");
    } else {
      expect.fail("Expected state to be searching");
    }
  });

  it("should unset a set location, unlike cancelSearch which reverts to it", () => {
    const testLocation = createTestLocation();
    machine.setLocation(testLocation);
    expect(getActiveLocation().status).toBe("set");

    machine.unsetLocation();

    expect(getActiveLocation().status).toBe("empty");
  });

  it("should cancel in-flight work and discard the fallback on unsetLocation", () => {
    const testLocation = createTestLocation();
    machine.setLocation(testLocation);

    machine.handleSearchInput(createLocationQuery("Oslo"));
    mockTimeoutFactory.flush();
    expect(mockRequestFactory.lastHandler).toBeDefined();

    machine.unsetLocation();

    // The request is cancelled and the state is empty — NOT the fallback
    expect(mockRequestFactory.cancelCount).toBe(1);
    expect(getActiveLocation().status).toBe("empty");
  });

  it("should cancel the in-flight request on cancelSearch", () => {
    machine.handleSearchInput(createLocationQuery("Stockholm"));
    mockTimeoutFactory.flush();
    expect(mockRequestFactory.lastHandler).toBeDefined();

    machine.cancelSearch();

    expect(mockRequestFactory.cancelCount).toBe(1);
    expect(getActiveLocation().status).toBe("empty");
  });

  it("should cancel the pending debounce timeout on cancelSearch", () => {
    machine.handleSearchInput(createLocationQuery("Stockholm"));
    expect(mockTimeoutFactory.activeTimeouts.length).toBe(1);

    machine.cancelSearch();

    expect(mockTimeoutFactory.activeTimeouts.length).toBe(0);
    expect(getActiveLocation().status).toBe("empty");
  });

  it("should cancel pending work when a location is selected mid-search", () => {
    const testLocation = createTestLocation();

    // Selecting during debounce cancels the timer
    machine.handleSearchInput(createLocationQuery("Stockholm"));
    expect(mockTimeoutFactory.activeTimeouts.length).toBe(1);
    machine.setLocation(testLocation);
    expect(mockTimeoutFactory.activeTimeouts.length).toBe(0);
    expect(getActiveLocation().status).toBe("set");

    // Selecting during fetch cancels the request
    machine.handleSearchInput(createLocationQuery("Oslo"));
    mockTimeoutFactory.flush();
    machine.setLocation(testLocation);
    expect(mockRequestFactory.cancelCount).toBe(1);
    expect(getActiveLocation().status).toBe("set");
  });

  it("should gracefully handle non-Zod parsing errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    machine.handleSearchInput(createLocationQuery("Stockholm"));
    mockTimeoutFactory.flush();

    // Simulate a raw response that throws on .json()
    const badResponse = {
      ok: true,
      json: async () => {
        throw new Error("JSON parse error");
      },
    } as unknown as Response;

    await mockRequestFactory.lastHandler?.onResponse(badResponse);

    const state = getActiveLocation();
    if (state.status === "searching") {
      expect(state.remoteSearchState.status).toBe("failure");
    } else {
      expect.fail("Expected state to be searching");
    }
  });
});
