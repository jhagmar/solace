/**
 * Open-Meteo hourly UV query.
 *
 * Live forecasts and historical folds share this date-range request:
 * `timezone=GMT` so `start_date` / `end_date` are UTC calendar dates and
 * hourly stamps come back as GMT+0. Response shape is unchanged, so mapping
 * reuses {@link mapForecastResponseToUvForecast}.
 */

import type { Coordinates } from "@/shared/domain";

/** Query for hourly UV over an inclusive UTC-date range at one point */
export interface UvForecastQuery {
  coordinates: Coordinates;
  /** Inclusive UTC start date, `YYYY-MM-DD` */
  startDate: string;
  /** Inclusive UTC end date, `YYYY-MM-DD` */
  endDate: string;
}

/**
 * Maps a {@link UvForecastQuery} to the Open-Meteo forecast URL.
 * Coordinates and dates are URI-encoded; `timezone=GMT` keeps hourly
 * stamps on UTC.
 */
export function openMeteoUvUrl(query: UvForecastQuery): string {
  const latitude = encodeURIComponent(query.coordinates.latitude);
  const longitude = encodeURIComponent(query.coordinates.longitude);
  const startDate = encodeURIComponent(query.startDate);
  const endDate = encodeURIComponent(query.endDate);
  return `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=uv_index&timezone=GMT&start_date=${startDate}&end_date=${endDate}`;
}
