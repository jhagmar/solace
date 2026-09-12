import type { LocationId, MsSinceEpoch, TimestampedUvForecast, UvForecast } from "@/shared/domain";
import type { RequestHandle } from "@/shared/platform/http";

export type { TimestampedUvForecast, UvForecast, UvForecastEntry } from "@/shared/domain";

/**
 * Forecast machine state. Tracks which location the data belongs to and
 * when it was fetched, so a forecast is never shown for the wrong place
 * and staleness can drive refetch.
 */
export type ForecastState =
  | { status: "empty" }
  | {
      status: "fetching";
      locationId: LocationId;
      requestHandle: RequestHandle;
      previous: TimestampedUvForecast | null;
    }
  | { status: "success"; locationId: LocationId; forecast: UvForecast; fetchedAt: MsSinceEpoch }
  | {
      status: "failure";
      locationId: LocationId;
      reason: string;
      previous: TimestampedUvForecast | null;
    };

/** Narrow port the forecast machine uses to drive persisted forecast state. */
export interface ForecastStateStore {
  getForecastState(): ForecastState;
  startForecastFetch(locationId: LocationId, requestHandle: RequestHandle): void;
  setForecastSuccess(locationId: LocationId, forecast: UvForecast, fetchedAt: MsSinceEpoch): void;
  setForecastFailure(locationId: LocationId, reason: string): void;
  clearForecast(): void;
}
