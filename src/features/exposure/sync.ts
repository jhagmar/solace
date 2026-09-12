import { useEffect } from "react";
import { exposure } from "@/app/compose/exposure";
import { useActiveLocationStore } from "@/features/location";
import { useVisibilityStore } from "@/features/runtime";

/**
 * Wires the exposure state machine to its signals: the machine re-evaluates
 * whenever the page becomes visible (clamping outdoor pairs left over
 * from a previous day to that day's last second) and whenever the effective
 * location changes (closing the pair that contains now if the location was
 * unset, or splitting a current pair onto a newly set location). Runs once
 * on mount too, so an inconsistent persisted state is caught at startup.
 * Mount once at the app root.
 */
export function useExposureSync() {
  useEffect(() => {
    exposure.handleVisibilityChange();
    const unsubscribeVisibility = useVisibilityStore.subscribe(() =>
      exposure.handleVisibilityChange(),
    );
    const unsubscribeLocation = useActiveLocationStore.subscribe(() =>
      exposure.handleLocationChange(),
    );
    return () => {
      unsubscribeVisibility();
      unsubscribeLocation();
    };
  }, []);
}
