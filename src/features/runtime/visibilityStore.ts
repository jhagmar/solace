/**
 * The visibility store: whether the app's page is currently on-screen,
 * mirroring the Page Visibility API's `document.visibilityState`.
 *
 * Volatile by nature — deliberately not persisted (see store/index.ts).
 * Written by the usePageVisibility hook, read by the forecast state machine
 * (no point refreshing data nobody can see).
 */

import { create, type StateCreator } from "zustand";
import type { VisibilityState } from "@/features/runtime/model";

export interface VisibilityStore {
  visibilityState: VisibilityState;
  setVisibilityState: (visibilityState: VisibilityState) => void;
}

export const createVisibilityStore: StateCreator<VisibilityStore, [], [], VisibilityStore> = (
  set,
) => ({
  // A freshly loaded app is foregrounded in the common case; the event
  // wiring will correct this on mount if not.
  visibilityState: { status: "visible" },

  setVisibilityState: (visibilityState) =>
    set({
      visibilityState,
    }),
});

export const useVisibilityStore = create<VisibilityStore>()(createVisibilityStore);

export const isPageVisible = (): boolean =>
  useVisibilityStore.getState().visibilityState.status === "visible";
