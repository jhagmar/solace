import type { UvForecast, UvForecastEntry } from "@/shared/domain";
import { createMsSinceEpoch, createSeconds, createUvIndex } from "@/shared/domain";
import type { ForecastResponse } from "./forecastSchema";

/**
 * Maps a validated Open-Meteo forecast response to {@link UvForecast}.
 * Hourly stamps are local wall-clock without offset; subtracting
 * `utc_offset_seconds` yields the true instant.
 */
export function mapForecastResponseToUvForecast(response: ForecastResponse): UvForecast {
  const { utc_offset_seconds: utcOffsetSeconds, hourly } = response;

  const entries: UvForecastEntry[] = hourly.time.map((localTime, index) => ({
    time: createMsSinceEpoch(Date.parse(`${localTime}Z`) - utcOffsetSeconds * 1000),
    uvIndex: createUvIndex(hourly.uv_index[index]),
  }));

  entries.sort((a, b) => a.time - b.time);

  return { utcOffsetSeconds: createSeconds(utcOffsetSeconds), hourly: entries };
}
