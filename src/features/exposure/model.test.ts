import { describe, expect, it } from "vitest";
import type { OutdoorWindow } from "@/features/exposure/model";
import {
  asExposure,
  isOutdoorsAt,
  windowContaining,
  windowsOnLocalDay,
} from "@/features/exposure/model";
import { createLocation, createMsSinceEpoch, createTimeZone } from "@/shared/domain";
import { lastSecondOfLocalDay } from "@/shared/time";

const STOCKHOLM_JSON = {
  id: "2673730",
  name: "Stockholm",
  firstAdministrativeDivision: "Stockholm County",
  countryName: "Sweden",
  coordinates: { latitude: 59.33, longitude: 18.07 },
  timezone: "Europe/Stockholm",
};

const stockholm = createLocation({
  id: "2673730",
  name: "Stockholm",
  firstAdministrativeDivision: "Stockholm County",
  countryName: "Sweden",
  latitude: 59.33,
  longitude: 18.07,
  timezone: "Europe/Stockholm",
});

describe("asExposure", () => {
  it("accepts a pair list", () => {
    expect(
      asExposure({
        windows: [
          {
            id: "w-1",
            start: 1000,
            end: 2000,
            location: STOCKHOLM_JSON,
          },
        ],
      }),
    ).toEqual({
      windows: [
        {
          id: "w-1",
          start: 1000,
          end: 2000,
          location: stockholm,
        },
      ],
    });
  });

  it("migrates a live indoors state to an empty list", () => {
    expect(asExposure({ status: "indoors", since: 1000 })).toEqual({ windows: [] });
  });

  it("migrates a live outdoors interval to a pair ending at last light of that day", () => {
    const since = Date.UTC(2026, 7, 15, 12, 0);
    const state = asExposure({
      status: "outdoors",
      since,
      location: STOCKHOLM_JSON,
    });
    expect(state?.windows).toHaveLength(1);
    expect(state?.windows[0]?.start).toBe(since);
    expect(state?.windows[0]?.end).toBe(
      lastSecondOfLocalDay(createTimeZone("Europe/Stockholm"), since),
    );
    expect(state?.windows[0]?.location).toEqual(stockholm);
  });

  it("drops corrupt windows and keeps the rest of the schedule", () => {
    expect(
      asExposure({
        windows: [
          {
            id: "w-1",
            start: 1000,
            end: 2000,
            location: STOCKHOLM_JSON,
          },
          { id: "bad", start: 2000, end: 1000 },
        ],
      }),
    ).toEqual({
      windows: [
        {
          id: "w-1",
          start: 1000,
          end: 2000,
          location: stockholm,
        },
      ],
    });
  });

  it("rejects unknown shapes and an all-invalid window list as empty", () => {
    expect(asExposure(null)).toBeNull();
    expect(asExposure("outdoors")).toBeNull();
    expect(asExposure({ windows: [{ id: "x", start: 2000, end: 1000 }] })).toEqual({
      windows: [],
    });
    expect(
      asExposure({
        windows: [{ id: "eq", start: 1000, end: 1000, location: STOCKHOLM_JSON }],
      }),
    ).toEqual({ windows: [] });
    expect(asExposure({ status: "outside" })).toBeNull();
    expect(asExposure({ status: "outdoors", since: 1000 })).toEqual({ windows: [] });
    expect(asExposure({ foo: 1 })).toBeNull();
    expect(asExposure({ windows: [null, { id: "", start: 1, end: 2 }] })).toEqual({
      windows: [],
    });
    expect(
      asExposure({ windows: [{ id: "w", start: "nope", end: 2, location: STOCKHOLM_JSON }] }),
    ).toEqual({
      windows: [],
    });
  });

  it("migrates an outdoors pair that cannot span a minute to empty", () => {
    const since = lastSecondOfLocalDay(
      createTimeZone("Europe/Stockholm"),
      Date.UTC(2026, 7, 15, 12),
    );
    expect(
      asExposure({
        status: "outdoors",
        since,
        location: STOCKHOLM_JSON,
      }),
    ).toEqual({ windows: [] });
  });

  it("migrates corrupt outdoors since to empty", () => {
    expect(
      asExposure({
        status: "outdoors",
        since: -1,
        location: STOCKHOLM_JSON,
      }),
    ).toEqual({ windows: [] });
  });

  it("drops leftover reset stamps from persisted JSON", () => {
    expect(
      asExposure({
        windows: [],
        resets: [{ id: "r-1", at: 1500 }, { id: "bad" }],
      }),
    ).toEqual({
      windows: [],
    });
  });

  it("fails closed when the window list cannot be walked", () => {
    const windows: unknown[] = [];
    Object.defineProperty(windows, Symbol.iterator, {
      value: () => {
        throw new Error("corrupt");
      },
    });
    expect(asExposure({ windows })).toBeNull();
  });
});

describe("windowContaining / isOutdoorsAt", () => {
  const window: OutdoorWindow = {
    id: "w",
    start: createMsSinceEpoch(1000),
    end: createMsSinceEpoch(2000),
    location: stockholm,
  };

  it("is outdoors on [start, end)", () => {
    expect(isOutdoorsAt([window], createMsSinceEpoch(1000))).toBe(true);
    expect(isOutdoorsAt([window], createMsSinceEpoch(1500))).toBe(true);
    expect(isOutdoorsAt([window], createMsSinceEpoch(2000))).toBe(false);
    expect(windowContaining([window], createMsSinceEpoch(1500))?.id).toBe("w");
    expect(isOutdoorsAt(undefined, createMsSinceEpoch(1500))).toBe(false);
  });
});

describe("windowsOnLocalDay", () => {
  it("keeps pairs that start on that civil day in the given zone", () => {
    const tz = createTimeZone("Europe/Stockholm");
    const today = createMsSinceEpoch(Date.UTC(2026, 7, 15, 12));
    const todayWindow: OutdoorWindow = {
      id: "today",
      start: createMsSinceEpoch(Date.UTC(2026, 7, 15, 10)),
      end: createMsSinceEpoch(Date.UTC(2026, 7, 15, 12)),
      location: stockholm,
    };
    const yesterday: OutdoorWindow = {
      id: "yday",
      start: createMsSinceEpoch(Date.UTC(2026, 7, 14, 10)),
      end: createMsSinceEpoch(Date.UTC(2026, 7, 14, 12)),
      location: stockholm,
    };
    expect(windowsOnLocalDay([yesterday, todayWindow], tz, today).map((w) => w.id)).toEqual([
      "today",
    ]);
    const laterToday: OutdoorWindow = {
      id: "later",
      start: createMsSinceEpoch(Date.UTC(2026, 7, 15, 14)),
      end: createMsSinceEpoch(Date.UTC(2026, 7, 15, 16)),
      location: stockholm,
    };
    expect(windowsOnLocalDay([laterToday, todayWindow], tz, today).map((w) => w.id)).toEqual([
      "today",
      "later",
    ]);
    expect(windowsOnLocalDay(undefined, tz, today)).toEqual([]);
    const noZone = {
      ...todayWindow,
      id: "no-zone",
      location: createLocation({
        id: "x",
        name: "X",
        firstAdministrativeDivision: undefined,
        countryName: undefined,
        latitude: 0,
        longitude: 0,
        timezone: undefined,
      }),
    };
    expect(windowsOnLocalDay([noZone], tz, today).map((w) => w.id)).toEqual(["no-zone"]);
  });
});
