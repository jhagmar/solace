import { useActiveLocationStore } from "@/features/location/activeStore";
import type { Location } from "@/shared/domain";

/**
 * The location the app should act on, reactively: the set location, or —
 * while the user is mid-search — the last set location, so displayed data
 * doesn't flap. The reactive counterpart of the store's getEffectiveLocation
 * adapter (which the state machines use).
 */
export function useEffectiveLocation(): Location | null {
  return useActiveLocationStore((state) => {
    const active = state.activeLocation;
    switch (active.status) {
      case "set":
        return active.location;
      case "searching":
        return active.fallback.status === "set" ? active.fallback.location : null;
      case "empty":
        return null;
    }
  });
}
