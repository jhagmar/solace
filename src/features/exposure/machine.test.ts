import { describe, expect, it } from "vitest";
import type { ExposureState, ExposureStateStore, OutdoorWindow } from "@/features/exposure/model";
import {
  createLocation,
  createMsSinceEpoch,
  createTimeZone,
  type Location,
  type MsSinceEpoch,
} from "@/shared/domain";
import { lastSecondOfLocalDay } from "@/shared/time";
import { ExposureStateMachine, TAPPED_WINDOW_MS } from "./machine";

const createTestLocation = (timezone: string | null = "Europe/Stockholm"): Location =>
  createLocation({
    id: "2673730",
    name: "Stockholm",
    firstAdministrativeDivision: undefined,
    countryName: undefined,
    latitude: 59.33,
    longitude: 18.07,
    timezone: timezone ?? undefined,
  });

const TEST_LOCATION = createTestLocation();
const EMPTY: ExposureState = { windows: [] };

const createStore = (initial: ExposureState) => {
  let state = initial;
  const store: ExposureStateStore = {
    getExposureState: () => state,
    setExposureState: (next) => {
      state = next;
    },
  };
  return { store, getState: () => state };
};

const defaultEnd = (location: Location, start: MsSinceEpoch): MsSinceEpoch => {
  const tz = location.timezone ?? createTimeZone("UTC");
  return lastSecondOfLocalDay(tz, start);
};

const createMachine = (
  initial: ExposureState,
  now: MsSinceEpoch,
  { visible = true, location = TEST_LOCATION as Location | null } = {},
): { machine: ExposureStateMachine; getState: () => ExposureState } => {
  const { store, getState } = createStore(initial);
  return {
    machine: new ExposureStateMachine(
      store,
      () => location,
      () => visible,
      () => now,
      defaultEnd,
    ),
    getState,
  };
};

const SINCE_UTC = Date.UTC(2026, 7, 15, 12, 0);

const openWindow = (start: number, end = Date.UTC(2026, 7, 15, 21, 59, 59)): ExposureState => ({
  windows: [
    {
      id: "open",
      start: createMsSinceEpoch(start),
      end: createMsSinceEpoch(end),
      location: TEST_LOCATION,
    },
  ],
});

describe("ExposureStateMachine: stale day closure", () => {
  it("clamps a stale pair to the last second of its start day", () => {
    const now = createMsSinceEpoch(Date.UTC(2026, 7, 16, 12, 0));
    const { machine, getState } = createMachine(openWindow(SINCE_UTC), now);

    machine.handleVisibilityChange();

    const window = getState().windows[0];
    expect(window?.end).toBe(Date.UTC(2026, 7, 15, 21, 59, 59));
    expect(window?.start).toBe(SINCE_UTC);
  });

  it("does nothing while the page is hidden", () => {
    const now = createMsSinceEpoch(Date.UTC(2026, 7, 16, 12, 0));
    const spanning = openWindow(SINCE_UTC, Date.UTC(2026, 7, 16, 12, 0));
    const { machine, getState } = createMachine(spanning, now, {
      visible: false,
    });

    machine.handleVisibilityChange();

    expect(getState().windows[0]?.end).toBe(Date.UTC(2026, 7, 16, 12, 0));
  });

  it("leaves a pair from today alone", () => {
    const now = createMsSinceEpoch(Date.UTC(2026, 7, 15, 16, 0));
    const { machine, getState } = createMachine(openWindow(SINCE_UTC), now);

    machine.handleVisibilityChange();

    expect(getState().windows[0]?.end).toBe(Date.UTC(2026, 7, 15, 21, 59, 59));
  });

  it("leaves an empty list alone", () => {
    const now = createMsSinceEpoch(Date.UTC(2026, 7, 16, 12, 0));
    const { machine, getState } = createMachine(EMPTY, now);

    machine.handleVisibilityChange();

    expect(getState()).toEqual(EMPTY);
  });

  it("judges today in the pair's zone, not UTC", () => {
    const now = createMsSinceEpoch(Date.UTC(2026, 7, 15, 22, 30));
    const { machine, getState } = createMachine(openWindow(SINCE_UTC), now);

    machine.handleVisibilityChange();

    expect(getState().windows[0]?.end).toBe(Date.UTC(2026, 7, 15, 21, 59, 59));
  });

  it("does not apply the day check on a location change", () => {
    const now = createMsSinceEpoch(Date.UTC(2026, 7, 16, 12, 0));
    const { machine, getState } = createMachine(openWindow(SINCE_UTC), now);

    machine.handleLocationChange();

    expect(getState().windows[0]?.end).toBe(Date.UTC(2026, 7, 15, 21, 59, 59));
    expect(getState().windows).toHaveLength(1);
  });
});

describe("ExposureStateMachine: location unset closure", () => {
  it("closes the pair containing now when the location is unset", () => {
    const now = createMsSinceEpoch(Date.UTC(2026, 7, 15, 16, 0));
    const { machine, getState } = createMachine(openWindow(SINCE_UTC), now, {
      location: null,
    });

    machine.handleLocationChange();

    expect(getState().windows[0]?.end).toBe(now);
  });

  it("enforces the invariant on visibility changes too", () => {
    const now = createMsSinceEpoch(Date.UTC(2026, 7, 15, 16, 0));
    const { machine, getState } = createMachine(openWindow(SINCE_UTC), now, {
      location: null,
    });

    machine.handleVisibilityChange();

    expect(getState().windows[0]?.end).toBe(now);
  });

  it("does not close while hidden, even without a location", () => {
    const now = createMsSinceEpoch(Date.UTC(2026, 7, 15, 16, 0));
    const { machine, getState } = createMachine(openWindow(SINCE_UTC), now, {
      visible: false,
      location: null,
    });

    machine.handleVisibilityChange();

    expect(getState().windows[0]?.end).toBe(Date.UTC(2026, 7, 15, 21, 59, 59));
  });

  it("rebinds a current pair to a different location by splitting at now", () => {
    const now = createMsSinceEpoch(Date.UTC(2026, 7, 15, 16, 0));
    const hawaii = createLocation({
      id: "5856195",
      name: "Honolulu",
      firstAdministrativeDivision: undefined,
      countryName: undefined,
      latitude: 21.31,
      longitude: -157.86,
      timezone: "Pacific/Honolulu",
    });
    const { machine, getState } = createMachine(openWindow(SINCE_UTC), now, {
      location: hawaii,
    });

    machine.handleLocationChange();

    const windows = getState()
      .windows.slice()
      .sort((a, b) => a.start - b.start);
    expect(windows).toHaveLength(2);
    expect(windows[0]?.end).toBe(now);
    expect(windows[0]?.location.id).toBe(TEST_LOCATION.id);
    expect(windows[1]?.start).toBe(now);
    expect(windows[1]?.location.id).toBe(hawaii.id);
  });

  it("leaves an empty list alone on location change", () => {
    const now = createMsSinceEpoch(Date.UTC(2026, 7, 15, 16, 0));
    const { machine, getState } = createMachine(EMPTY, now, { location: null });

    machine.handleLocationChange();

    expect(getState()).toEqual(EMPTY);
  });
});

describe("ExposureStateMachine: live verbs and edits", () => {
  it("goOutdoors writes a pair from now to the injected default end", () => {
    const now = createMsSinceEpoch(SINCE_UTC);
    const { machine, getState } = createMachine(EMPTY, now);

    machine.goOutdoors();

    const window = getState().windows[0];
    expect(window?.start).toBe(now);
    expect(window?.end).toBe(Date.UTC(2026, 7, 15, 21, 59, 59));
    expect(window?.location).toEqual(TEST_LOCATION);
  });

  it("goOutdoors is a no-op without a location and while already outdoors", () => {
    const now = createMsSinceEpoch(SINCE_UTC);
    const empty = createMachine(EMPTY, now, { location: null });
    empty.machine.goOutdoors();
    expect(empty.getState()).toEqual(EMPTY);

    const open = createMachine(openWindow(SINCE_UTC), createMsSinceEpoch(SINCE_UTC + 60_000));
    open.machine.goOutdoors();
    expect(open.getState().windows).toHaveLength(1);
  });

  it("goIndoors clamps the current pair's end to now", () => {
    const now = createMsSinceEpoch(Date.UTC(2026, 7, 15, 16, 0));
    const { machine, getState } = createMachine(openWindow(SINCE_UTC), now);

    machine.goIndoors();

    expect(getState().windows[0]?.end).toBe(now);
  });

  it("addWindowAt places a one-hour pair and skips when the tap is inside one", () => {
    const at = createMsSinceEpoch(SINCE_UTC);
    const { machine, getState } = createMachine(EMPTY, at);

    const id = machine.addWindowAt(at);
    expect(id).toBeTruthy();
    expect(getState().windows[0]?.end).toBe(at + TAPPED_WINDOW_MS);

    expect(machine.addWindowAt(createMsSinceEpoch(at + 60_000))).toBe(id);
    expect(getState().windows).toHaveLength(1);
  });

  it("addDefaultWindow plants one hour from now, or the next free hour if that overlaps", () => {
    const now = createMsSinceEpoch(SINCE_UTC);
    const { machine, getState } = createMachine(EMPTY, now);

    const first = machine.addDefaultWindow();
    expect(first).toBeTruthy();
    expect(getState().windows[0]?.start).toBe(now);
    expect(getState().windows[0]?.end).toBe(now + TAPPED_WINDOW_MS);

    const second = machine.addDefaultWindow();
    expect(second).toBeTruthy();
    expect(getState().windows).toHaveLength(2);
    const later = getState().windows.find((window) => window.id === second);
    expect(later?.start).toBe(now + TAPPED_WINDOW_MS);
    expect(later?.end).toBe(now + 2 * TAPPED_WINDOW_MS);
  });

  it("addDurationFromNow plants a two-hour pair from now", () => {
    const now = createMsSinceEpoch(SINCE_UTC);
    const { machine, getState } = createMachine(EMPTY, now);

    expect(machine.addDurationFromNow(2 * TAPPED_WINDOW_MS)).toBeTruthy();
    expect(getState().windows[0]?.start).toBe(now);
    expect(getState().windows[0]?.end).toBe(now + 2 * TAPPED_WINDOW_MS);
  });

  it("coverRestOfDay plants from now through the last local second", () => {
    const now = createMsSinceEpoch(SINCE_UTC);
    const { machine, getState } = createMachine(EMPTY, now);
    const dayEnd = lastSecondOfLocalDay(TEST_LOCATION.timezone!, now);

    expect(machine.coverRestOfDay()).toBeTruthy();
    expect(getState().windows).toHaveLength(1);
    expect(getState().windows[0]?.start).toBe(now);
    expect(getState().windows[0]?.end).toBe(dayEnd);
  });

  it("coverRestOfDay extends a live pair and drops later pairs", () => {
    const now = createMsSinceEpoch(SINCE_UTC);
    const dayEnd = lastSecondOfLocalDay(TEST_LOCATION.timezone!, now);
    const morning: OutdoorWindow = {
      id: "morning",
      start: createMsSinceEpoch(SINCE_UTC - 3 * TAPPED_WINDOW_MS),
      end: createMsSinceEpoch(SINCE_UTC - TAPPED_WINDOW_MS),
      location: TEST_LOCATION,
    };
    const live: OutdoorWindow = {
      id: "live",
      start: createMsSinceEpoch(SINCE_UTC - 30 * 60 * 1000),
      end: createMsSinceEpoch(SINCE_UTC + TAPPED_WINDOW_MS),
      location: TEST_LOCATION,
    };
    const later: OutdoorWindow = {
      id: "later",
      start: createMsSinceEpoch(SINCE_UTC + 2 * TAPPED_WINDOW_MS),
      end: createMsSinceEpoch(SINCE_UTC + 3 * TAPPED_WINDOW_MS),
      location: TEST_LOCATION,
    };
    const { machine, getState } = createMachine({ windows: [morning, live, later] }, now);

    expect(machine.coverRestOfDay()).toBe("live");
    expect(
      getState()
        .windows.map((window) => window.id)
        .sort(),
    ).toEqual(["live", "morning"]);
    expect(getState().windows.find((window) => window.id === "live")?.end).toBe(dayEnd);
    expect(getState().windows.find((window) => window.id === "morning")?.end).toBe(morning.end);
  });

  it("updateWindow clamps to neighbours and the local day", () => {
    const now = createMsSinceEpoch(SINCE_UTC);
    const first: OutdoorWindow = {
      id: "a",
      start: createMsSinceEpoch(SINCE_UTC),
      end: createMsSinceEpoch(SINCE_UTC + 3_600_000),
      location: TEST_LOCATION,
    };
    const second: OutdoorWindow = {
      id: "b",
      start: createMsSinceEpoch(SINCE_UTC + 4 * 3_600_000),
      end: createMsSinceEpoch(SINCE_UTC + 5 * 3_600_000),
      location: TEST_LOCATION,
    };
    const { machine, getState } = createMachine({ windows: [first, second] }, now);

    machine.updateWindow("a", first.start, createMsSinceEpoch(SINCE_UTC + 10 * 3_600_000));
    expect(getState().windows.find((w) => w.id === "a")?.end).toBe(second.start);
  });

  it("removeWindow drops the pair", () => {
    const now = createMsSinceEpoch(SINCE_UTC);
    const { machine, getState } = createMachine(openWindow(SINCE_UTC), now);
    machine.removeWindow("open");
    expect(getState()).toEqual(EMPTY);
  });

  it("clearWindows drops every pair", () => {
    const now = createMsSinceEpoch(SINCE_UTC);
    const { machine, getState } = createMachine(openWindow(SINCE_UTC), now);
    machine.clearWindows();
    expect(getState()).toEqual(EMPTY);
    machine.clearWindows();
    expect(getState()).toEqual(EMPTY);
  });

  it("adoptWindowsIfEmpty fills only an empty store", () => {
    const now = createMsSinceEpoch(SINCE_UTC);
    const adopted: OutdoorWindow = {
      id: "from-log",
      start: createMsSinceEpoch(SINCE_UTC),
      end: createMsSinceEpoch(SINCE_UTC + 3_600_000),
      location: TEST_LOCATION,
    };
    const empty = createMachine(EMPTY, now);
    empty.machine.adoptWindowsIfEmpty([adopted]);
    expect(empty.getState().windows).toEqual([adopted]);

    const filled = createMachine(openWindow(SINCE_UTC), now);
    filled.machine.adoptWindowsIfEmpty([adopted]);
    expect(filled.getState().windows[0]?.id).toBe("open");
  });

  it("treats a leftover live { status, since } persist shape as no windows", () => {
    const leftover = {
      status: "outdoors" as const,
      since: createMsSinceEpoch(SINCE_UTC),
      location: TEST_LOCATION,
    };
    const store: ExposureStateStore = {
      getExposureState: () => leftover as unknown as ExposureState,
      setExposureState: () => {
        throw new Error("must not write on a leftover shape until it is migrated");
      },
    };
    const machine = new ExposureStateMachine(
      store,
      () => TEST_LOCATION,
      () => true,
      () => createMsSinceEpoch(SINCE_UTC),
      defaultEnd,
    );
    expect(() => machine.handleVisibilityChange()).not.toThrow();
    expect(() => machine.goIndoors()).not.toThrow();
  });
});
