import { useEffect } from "react";
import { exposure } from "@/app/compose/exposure";
import { sunscreen } from "@/app/compose/sunscreen";
import { useExposureStore } from "@/features/exposure";
import { useForecastStore } from "@/features/forecast";
import { getEffectiveLocation, useActiveLocationStore } from "@/features/location";
import { useNetworkStore, useVisibilityStore } from "@/features/runtime";
import {
  applicationsFromEvents,
  removalsFromEvents,
  windowsFromEvents,
} from "@/features/simulation/schedule";
import { useSimulationStore } from "@/features/simulation/store";
import { useSunscreenStore } from "@/features/sunscreen";

/**
 * Wires the simulation state machine to its signals: new forecasts, the
 * editable outdoor/sunscreen schedule, location, network and visibility.
 * On mount the schedule is adopted from a leftover event log if the new
 * stores are empty (one-time migrate), then compiled into the log and
 * evaluated. Further store writes replace the log rather than appending.
 * The compose module (and therefore odex) is loaded after first paint.
 */
export function useSimulationSync() {
  useEffect(() => {
    let cancelled = false;
    const unsubscribers: Array<() => void> = [];

    void import("@/app/compose/simulation").then(({ simulation }) => {
      if (cancelled) {
        return;
      }

      const events = useSimulationStore.getState().simulationInput.events;
      exposure.adoptWindowsIfEmpty(windowsFromEvents(events));
      sunscreen.adoptApplicationsIfEmpty(applicationsFromEvents(events));
      sunscreen.adoptRemovalsIfEmpty(removalsFromEvents(events));
      simulation.handleScheduleChange(
        useExposureStore.getState().exposureState,
        useSunscreenStore.getState().sunscreenState,
      );
      simulation.handleVisibilityChange();

      const publishSchedule = () => {
        simulation.handleScheduleChange(
          useExposureStore.getState().exposureState,
          useSunscreenStore.getState().sunscreenState,
        );
      };

      unsubscribers.push(
        useForecastStore.subscribe((state) => {
          const forecastState = state.forecastState;
          if (forecastState.status === "success") {
            simulation.handleForecastChange(forecastState.locationId, {
              fetchedAt: forecastState.fetchedAt,
              forecast: forecastState.forecast,
            });
          }
        }),
        useExposureStore.subscribe(publishSchedule),
        useSunscreenStore.subscribe(publishSchedule),
      );
      const locationId = (): string | null => getEffectiveLocation()?.id ?? null;
      let lastLocationId = locationId();
      unsubscribers.push(
        useActiveLocationStore.subscribe(() => {
          const next = locationId();
          if (next === lastLocationId) {
            return;
          }
          lastLocationId = next;
          simulation.handleLocationChange();
        }),
        useNetworkStore.subscribe(() => simulation.handleNetworkChange()),
        useVisibilityStore.subscribe(() => simulation.handleVisibilityChange()),
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
