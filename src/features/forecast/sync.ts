import { useEffect } from "react";
import { useActiveLocationStore } from "@/features/location";
import { useNetworkStore, useVisibilityStore } from "@/features/runtime";

/**
 * Wires the forecast state machine to its signals: the machine re-evaluates
 * whenever the effective location, the network status, or the page
 * visibility changes — fetching a forecast when the location is set, the
 * page is visible, the network is online, and the cached forecast is
 * missing or stale. Runs once on mount too, so a fresh app start with a
 * persisted location fetches immediately.
 * Mount once at the app root.
 */
export function useForecastSync() {
  useEffect(() => {
    let cancelled = false;
    const unsubscribers: Array<() => void> = [];

    void import("@/app/compose/forecast").then(({ forecast }) => {
      if (cancelled) {
        return;
      }
      forecast.handleLocationChange();
      unsubscribers.push(
        useActiveLocationStore.subscribe(() => forecast.handleLocationChange()),
        useNetworkStore.subscribe(() => forecast.handleNetworkChange()),
        useVisibilityStore.subscribe(() => forecast.handleVisibilityChange()),
      );
    });

    return () => {
      cancelled = true;
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, []);
}
