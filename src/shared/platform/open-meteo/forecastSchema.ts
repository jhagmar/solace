/**
 * Zod schema for the Open-Meteo forecast API
 * (https://api.open-meteo.com/v1/forecast?hourly=uv_index).
 */

import { z } from "zod";

export const HourlyUnitsSchema = z.object({
  time: z.string(),
  uv_index: z.string(),
});

export const HourlyForecastSchema = z.object({
  time: z.array(z.string()),
  uv_index: z.array(z.number()),
});

export const ForecastResponseSchema = z
  .object({
    latitude: z.number(),
    longitude: z.number(),
    generationtime_ms: z.number(),
    utc_offset_seconds: z.number(),
    timezone: z.string(),
    timezone_abbreviation: z.string(),
    elevation: z.number(),
    hourly_units: HourlyUnitsSchema,
    hourly: HourlyForecastSchema,
  })
  .refine((data) => data.hourly.time.length === data.hourly.uv_index.length, {
    message: "hourly.time and hourly.uv_index must have the same length",
  });

export type HourlyUnits = z.infer<typeof HourlyUnitsSchema>;
export type HourlyForecast = z.infer<typeof HourlyForecastSchema>;
export type ForecastResponse = z.infer<typeof ForecastResponseSchema>;
