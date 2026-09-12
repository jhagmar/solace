import { activeLocationStateStore } from "@/features/location/activeStore";
import { LocationSearchStateMachine } from "@/features/location/machine";
import { recentLocationsRecorder } from "@/features/location/recentsStore";
import { isNetworkOnline } from "@/features/runtime/networkStore";
import { locationSearchRequestFactory, timeoutFactory } from "./platform";

/** Location search machine. UI talks to this port; Zustand is read-only from UI. */
export const locationSearch = new LocationSearchStateMachine(
  timeoutFactory,
  locationSearchRequestFactory,
  activeLocationStateStore,
  isNetworkOnline,
  recentLocationsRecorder,
);
