/**
 * Zod schemas for the Open-Meteo Geocoding API
 * (https://geocoding-api.open-meteo.com/v1/search).
 */

import { z } from "zod";

export const GeocodingLocationSchema = z.object({
  id: z.number(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  elevation: z.number().optional(),
  feature_code: z.string(),
  country_code: z.string(),
  admin1_id: z.number().optional(),
  admin2_id: z.number().optional(),
  admin3_id: z.number().optional(),
  admin4_id: z.number().optional(),
  timezone: z.string().optional(),
  population: z.number().optional(),
  postcodes: z.array(z.string()).optional(),
  country_id: z.number().optional(),
  country: z.string().optional(),
  admin1: z.string().optional(),
  admin2: z.string().optional(),
  admin3: z.string().optional(),
  admin4: z.string().optional(),
});

export const ErrorResponseSchema = z.object({
  error: z.boolean(),
  reason: z.string(),
});

export const GeocodingResponseSchema = z.object({
  results: z.array(GeocodingLocationSchema).optional(),
});

export type GeocodingLocation = z.infer<typeof GeocodingLocationSchema>;
export type GeocodingResponse = z.infer<typeof GeocodingResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
