/**
 * Shared production adapters. Feature compose modules import these so a
 * theme click does not evaluate the forecast or ODE graphs.
 */

import type { LocationQuery } from "@/shared/domain";
import { FetchRequestFactory } from "@/shared/platform/http";
import { openMeteoUvUrl, type UvForecastQuery } from "@/shared/platform/open-meteo/uvUrl";

export { clock, timeoutFactory } from "./clock";

export const locationSearchRequestFactory = new FetchRequestFactory<LocationQuery>((query) => {
  const encoded = encodeURIComponent(query.name);
  return `https://geocoding-api.open-meteo.com/v1/search?name=${encoded}`;
});

export const uvForecastRequestFactory = new FetchRequestFactory<UvForecastQuery>(openMeteoUvUrl);
