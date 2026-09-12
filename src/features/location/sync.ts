import { locationSearch } from "@/app/compose/location";
import { useActiveLocationStore } from "@/features/location/activeStore";
import { createLocationQuery, type Location } from "@/shared/domain";

/**
 * A custom hook bridging the Location Search state machine with React.
 * This strictly enforces a one-way data flow: UI -> Machine -> Zustand -> UI.
 *
 * @returns {object} An object containing the current search state and action bound methods.
 */
export const useLocationSearch = () => {
  // Read state reactively from Zustand
  const activeLocation = useActiveLocationStore((state) => state.activeLocation);

  // Expose bound machine methods for actions
  return {
    /** The current state of the active location store */
    state: activeLocation,

    /** Triggers a location search update, restarting the debounce timer */
    search: (query: string) => locationSearch.handleSearchInput(createLocationQuery(query)),

    /** Selects a final location, overriding the current search */
    select: (location: Location) => locationSearch.setLocation(location),

    /** Cancels the ongoing search and reverts to the last known fallback */
    cancel: () => locationSearch.cancelSearch(),

    /** Clears the location entirely, leaving no active location */
    unset: () => locationSearch.unsetLocation(),
  };
};
