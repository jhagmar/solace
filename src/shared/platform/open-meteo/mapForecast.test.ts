import { describe, expect, it } from "vitest";
import type { ForecastResponse } from "@/shared/platform/open-meteo/forecastSchema";
import { mapForecastResponseToUvForecast } from "@/shared/platform/open-meteo/mapForecast";

const createForecastResponse = (
  overrides?: Partial<ForecastResponse> & { hourly?: Partial<ForecastResponse["hourly"]> },
): ForecastResponse => ({
  latitude: 59.33,
  longitude: 18.07,
  generationtime_ms: 0.03,
  utc_offset_seconds: 0,
  timezone: "GMT",
  timezone_abbreviation: "GMT",
  elevation: 24,
  hourly_units: { time: "iso8601", uv_index: "" },
  hourly: {
    time: ["2026-08-14T00:00", "2026-08-14T01:00"],
    uv_index: [0, 0.1],
    ...overrides?.hourly,
  },
  ...overrides,
});

describe("mapForecastResponseToUvForecast", () => {
  it("zips parallel arrays into time-value pairs and keeps the UTC offset", () => {
    const result = mapForecastResponseToUvForecast(
      createForecastResponse({ utc_offset_seconds: 7200 }),
    );

    expect(result.utcOffsetSeconds).toBe(7200);
    expect(result.hourly).toEqual([
      { time: Date.parse("2026-08-14T00:00:00Z") - 7200 * 1000, uvIndex: 0 },
      { time: Date.parse("2026-08-14T01:00:00Z") - 7200 * 1000, uvIndex: 0.1 },
    ]);
  });

  it("resolves local timestamps to instants for positive and negative offsets", () => {
    // 14:00 local at UTC+2 is 12:00Z
    const east = mapForecastResponseToUvForecast(
      createForecastResponse({
        utc_offset_seconds: 7200,
        hourly: { time: ["2026-08-14T14:00"], uv_index: [4.35] },
      }),
    );
    expect(east.hourly[0].time).toBe(Date.parse("2026-08-14T12:00:00Z"));

    // 08:00 local at UTC-4 is also 12:00Z
    const west = mapForecastResponseToUvForecast(
      createForecastResponse({
        utc_offset_seconds: -14400,
        hourly: { time: ["2026-08-14T08:00"], uv_index: [4.35] },
      }),
    );
    expect(west.hourly[0].time).toBe(Date.parse("2026-08-14T12:00:00Z"));
  });

  it("guarantees the result is sorted ascending by time", () => {
    const result = mapForecastResponseToUvForecast(
      createForecastResponse({
        hourly: {
          time: ["2026-08-14T02:00", "2026-08-14T00:00", "2026-08-14T01:00"],
          uv_index: [0.2, 0, 0.1],
        },
      }),
    );

    expect(result.hourly.map((e) => e.time)).toEqual([
      Date.parse("2026-08-14T00:00:00Z"),
      Date.parse("2026-08-14T01:00:00Z"),
      Date.parse("2026-08-14T02:00:00Z"),
    ]);
    // Values travel with their timestamps
    expect(result.hourly.map((e) => e.uvIndex)).toEqual([0, 0.1, 0.2]);
  });

  it("rejects unparseable timestamps and negative UV values", () => {
    expect(() =>
      mapForecastResponseToUvForecast(
        createForecastResponse({ hourly: { time: ["not-a-time"], uv_index: [1] } }),
      ),
    ).toThrow("Invalid timestamp");

    expect(() =>
      mapForecastResponseToUvForecast(
        createForecastResponse({ hourly: { time: ["2026-08-14T00:00"], uv_index: [-1] } }),
      ),
    ).toThrow("Invalid UV index");
  });
});
