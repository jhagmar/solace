import { afterEach, describe, expect, it, vi } from "vitest";
import { createTimeZone } from "@/shared/domain";
import {
  deviceTimeZone,
  firstSecondOfLocalDay,
  firstSecondOfLocalDayDaysAgo,
  firstSecondOfUtcDay,
  firstSecondOfUtcDayDaysAgo,
  formatInstant,
  formatTimeInputValue,
  formatTimeOfDay,
  instantAtLocalMinutes,
  lastLightOfLocalDay,
  lastSecondOfLocalDay,
  localDayNumber,
  localIsoDate,
  localMinutesAt,
  nextFirstSecondOfLocalDay,
  snapToMinutes,
  utcForecastWindow,
  utcIsoDate,
  utcOffsetSecondsAt,
} from "@/shared/time";

const STOCKHOLM = createTimeZone("Europe/Stockholm");
const UTC = createTimeZone("UTC");

describe("utcOffsetSecondsAt", () => {
  it("is DST-aware: +1 in winter, +2 in summer for Stockholm", () => {
    expect(utcOffsetSecondsAt(STOCKHOLM, Date.UTC(2026, 0, 15, 12))).toBe(3600);
    expect(utcOffsetSecondsAt(STOCKHOLM, Date.UTC(2026, 6, 15, 12))).toBe(7200);
  });

  it("is zero for UTC", () => {
    expect(utcOffsetSecondsAt(UTC, Date.UTC(2026, 6, 15, 12))).toBe(0);
  });

  it("handles sub-hour offsets", () => {
    // Nepal is UTC+5:45
    expect(utcOffsetSecondsAt(createTimeZone("Asia/Kathmandu"), Date.UTC(2026, 6, 15, 12))).toBe(
      5 * 3600 + 45 * 60,
    );
  });

  it("does not change when the instant has a sub-second remainder", () => {
    const base = Date.UTC(2026, 6, 15, 12, 0, 0);
    for (const ms of [0, 1, 499, 500, 600, 999]) {
      expect(utcOffsetSecondsAt(STOCKHOLM, base + ms)).toBe(7200);
      expect(utcOffsetSecondsAt(UTC, base + ms)).toBe(0);
    }
  });
});

describe("localMinutesAt", () => {
  it("extracts minutes since local midnight in the given zone", () => {
    expect(localMinutesAt(UTC, Date.UTC(2026, 7, 15, 9, 30))).toBe(9 * 60 + 30);
    expect(localMinutesAt(UTC, Date.UTC(2026, 7, 15, 0, 0))).toBe(0);
  });

  it("is independent of the device's zone", () => {
    // 12:00 UTC is 14:00 in summer Stockholm
    expect(localMinutesAt(STOCKHOLM, Date.UTC(2026, 6, 15, 12, 0))).toBe(14 * 60);
  });
});

describe("instantAtLocalMinutes", () => {
  it("is the inverse of localMinutesAt on a regular day", () => {
    const reference = Date.UTC(2026, 7, 15, 16, 40);
    const at = instantAtLocalMinutes(STOCKHOLM, 9 * 60 + 30, reference);
    // 09:30 in summer Stockholm is 07:30 UTC
    expect(at).toBe(Date.UTC(2026, 7, 15, 7, 30));
    expect(localMinutesAt(STOCKHOLM, at)).toBe(9 * 60 + 30);
  });

  it("anchors to the location-local day of the reference, not the UTC day", () => {
    // 00:30 JST is 15:30 UTC the previous day; 09:00 JST on that JST day is 00:00 UTC
    const tokyo = createTimeZone("Asia/Tokyo");
    const reference = Date.UTC(2026, 7, 15, 15, 30);
    expect(instantAtLocalMinutes(tokyo, 9 * 60, reference)).toBe(Date.UTC(2026, 7, 16, 0, 0));
  });
});

describe("localDayNumber", () => {
  it("distinguishes today from yesterday in the given zone", () => {
    const today = Date.UTC(2026, 7, 15, 12, 0);
    const yesterday = Date.UTC(2026, 7, 14, 12, 0);
    expect(localDayNumber(UTC, today) - localDayNumber(UTC, yesterday)).toBe(1);
  });

  it("is zone-dependent around midnight", () => {
    // 23:30 UTC is 08:30 the next day in Tokyo (UTC+9)
    const at = Date.UTC(2026, 7, 15, 23, 30);
    expect(localDayNumber(createTimeZone("Asia/Tokyo"), at)).toBe(localDayNumber(UTC, at) + 1);
  });
});

describe("firstSecondOfLocalDay", () => {
  it("is local midnight of the containing day", () => {
    const noon = Date.UTC(2026, 7, 15, 12, 0);
    expect(firstSecondOfLocalDay(UTC, noon)).toBe(Date.UTC(2026, 7, 15, 0, 0));
    // Summer Stockholm (UTC+2): local midnight is 22:00 UTC the previous calendar day
    expect(firstSecondOfLocalDay(STOCKHOLM, noon)).toBe(Date.UTC(2026, 7, 14, 22, 0, 0));
  });

  it("is the same midnight for every millisecond of a second", () => {
    const base = Date.UTC(2026, 7, 14, 12, 0, 0);
    const stockholmMidnight = firstSecondOfLocalDay(STOCKHOLM, base);
    const utcMidnight = firstSecondOfLocalDay(UTC, base);
    for (const ms of [0, 1, 499, 500, 600, 999]) {
      expect(firstSecondOfLocalDay(STOCKHOLM, base + ms)).toBe(stockholmMidnight);
      expect(firstSecondOfLocalDay(UTC, base + ms)).toBe(utcMidnight);
    }
  });
});

describe("lastSecondOfLocalDay", () => {
  it("is 23:59:59 local on a regular day", () => {
    const noon = Date.UTC(2026, 7, 15, 12, 0);
    const last = lastSecondOfLocalDay(UTC, noon);
    expect(last).toBe(Date.UTC(2026, 7, 16, 0, 0) - 1000);
    // Summer Stockholm (UTC+2): local 23:59:59 is 21:59:59 UTC
    expect(lastSecondOfLocalDay(STOCKHOLM, noon)).toBe(Date.UTC(2026, 7, 15, 21, 59, 59));
  });

  it("stays on the same local day across DST transitions", () => {
    // Stockholm springs forward on 2026-03-29 (a 23-hour day)
    const springDay = Date.UTC(2026, 2, 29, 12, 0);
    const last = lastSecondOfLocalDay(STOCKHOLM, springDay);
    expect(localDayNumber(STOCKHOLM, last)).toBe(localDayNumber(STOCKHOLM, springDay));
    // …and one second later is the next local day
    expect(localDayNumber(STOCKHOLM, last + 1000)).toBe(localDayNumber(STOCKHOLM, springDay) + 1);
  });
});

describe("nextFirstSecondOfLocalDay", () => {
  it("is local midnight of the following day", () => {
    const noon = Date.UTC(2026, 7, 15, 12, 0);
    expect(nextFirstSecondOfLocalDay(UTC, noon)).toBe(Date.UTC(2026, 7, 16, 0, 0));
    expect(nextFirstSecondOfLocalDay(STOCKHOLM, noon)).toBe(Date.UTC(2026, 7, 15, 22, 0, 0));
  });
});

describe("firstSecondOfLocalDayDaysAgo", () => {
  it("is a no-op at 0 days and walks midnight-to-midnight otherwise", () => {
    const noon = Date.UTC(2026, 7, 22, 12, 0);
    expect(firstSecondOfLocalDayDaysAgo(UTC, noon, 0)).toBe(Date.UTC(2026, 7, 22, 0, 0));
    expect(firstSecondOfLocalDayDaysAgo(UTC, noon, 14)).toBe(Date.UTC(2026, 7, 8, 0, 0));
    expect(firstSecondOfLocalDayDaysAgo(STOCKHOLM, noon, 1)).toBe(
      firstSecondOfLocalDay(STOCKHOLM, Date.UTC(2026, 7, 21, 12, 0)),
    );
  });

  it("counts a DST 23-hour day as one local day", () => {
    // 2026-03-30 12:00 UTC is a Monday after the Sunday spring-forward
    const after = Date.UTC(2026, 2, 30, 12, 0);
    const twoDaysAgo = firstSecondOfLocalDayDaysAgo(STOCKHOLM, after, 2);
    expect(localIsoDate(STOCKHOLM, twoDaysAgo)).toBe("2026-03-28");
  });
});

describe("localIsoDate", () => {
  it("formats the location-local calendar date as YYYY-MM-DD", () => {
    expect(localIsoDate(UTC, Date.UTC(2026, 7, 15, 12, 0))).toBe("2026-08-15");
    // 23:30 UTC on the 14th is already the 15th in Stockholm (UTC+2)
    expect(localIsoDate(STOCKHOLM, Date.UTC(2026, 7, 14, 23, 30))).toBe("2026-08-15");
  });
});

describe("formatInstant", () => {
  // The device locale decides 12h vs 24h, so accept both "13:45" and "1:45 PM"
  it("renders the instant as wall time in the given zone", () => {
    expect(formatInstant(UTC, Date.UTC(2026, 7, 15, 13, 45))).toMatch(/(13|1):45/);
    // 13:45 UTC is 15:45 in summer Stockholm
    expect(formatInstant(STOCKHOLM, Date.UTC(2026, 6, 15, 13, 45))).toMatch(/(15|3):45/);
  });
});

describe("formatTimeOfDay", () => {
  it("renders a minutes-since-midnight value", () => {
    expect(formatTimeOfDay(13 * 60 + 45)).toMatch(/(13|1):45/);
  });
});

describe("formatTimeInputValue", () => {
  it("formats as 24h HH:MM with zero padding", () => {
    expect(formatTimeInputValue(8 * 60 + 5)).toBe("08:05");
    expect(formatTimeInputValue(13 * 60 + 45)).toBe("13:45");
    expect(formatTimeInputValue(0)).toBe("00:00");
  });
});

describe("deviceTimeZone", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to UTC when the runtime reports an unknown zone", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      locale: "en-US",
      calendar: "gregory",
      numberingSystem: "latn",
      timeZone: "Not/AZone",
    });
    expect(deviceTimeZone()).toBe("UTC");
  });
});

describe("firstSecondOfUtcDay", () => {
  it("snaps to UTC midnight of the containing day", () => {
    expect(firstSecondOfUtcDay(Date.UTC(2026, 7, 14, 12, 0))).toBe(Date.UTC(2026, 7, 14, 0, 0));
  });
});

describe("firstSecondOfUtcDayDaysAgo", () => {
  it("walks whole UTC days", () => {
    const noon = Date.UTC(2026, 7, 14, 12, 0);
    expect(firstSecondOfUtcDayDaysAgo(noon, 0)).toBe(Date.UTC(2026, 7, 14, 0, 0));
    expect(firstSecondOfUtcDayDaysAgo(noon, 14)).toBe(Date.UTC(2026, 6, 31, 0, 0));
  });
});

describe("utcForecastWindow", () => {
  it("covers UTC yesterday through the exclusive end of UTC tomorrow", () => {
    const window = utcForecastWindow(Date.UTC(2026, 7, 14, 12, 0));
    expect(window.start).toBe(Date.UTC(2026, 7, 13, 0, 0));
    expect(window.end).toBe(Date.UTC(2026, 7, 16, 0, 0));
  });
});

describe("utcIsoDate", () => {
  it("formats the UTC calendar date as YYYY-MM-DD", () => {
    expect(utcIsoDate(Date.UTC(2026, 7, 14, 12, 0))).toBe("2026-08-14");
    expect(utcIsoDate(Date.UTC(2026, 7, 14, 0, 0) - 1)).toBe("2026-08-13");
  });
});

describe("snapToMinutes", () => {
  it("rounds to the nearest multiple of the step", () => {
    expect(snapToMinutes(Date.UTC(2026, 7, 14, 12, 4), 10)).toBe(Date.UTC(2026, 7, 14, 12, 0));
    expect(snapToMinutes(Date.UTC(2026, 7, 14, 12, 5), 10)).toBe(Date.UTC(2026, 7, 14, 12, 10));
  });
});

describe("lastLightOfLocalDay", () => {
  it("is one hour after the last positive UV sample, clamped to the day", () => {
    const day = Date.UTC(2026, 7, 14, 12, 0);
    expect(
      lastLightOfLocalDay(UTC, day, [
        { time: Date.UTC(2026, 7, 14, 6, 0), uvIndex: 1 },
        { time: Date.UTC(2026, 7, 14, 20, 0), uvIndex: 0.2 },
        { time: Date.UTC(2026, 7, 14, 21, 0), uvIndex: 0 },
      ]),
    ).toBe(Date.UTC(2026, 7, 14, 21, 0));
  });

  it("falls back to last second of the day when no sample is positive", () => {
    const day = Date.UTC(2026, 7, 14, 12, 0);
    expect(lastLightOfLocalDay(UTC, day, [])).toBe(lastSecondOfLocalDay(UTC, day));
  });
});
