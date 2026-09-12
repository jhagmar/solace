/**
 * The network store: whether the app is currently online.
 *
 * Volatile by nature — deliberately not persisted (see store/index.ts).
 * Written by the useNetworkStatus hook, read by the state machines (through
 * injected ports) and by the UI for graceful offline degradation.
 */

import { create, type StateCreator } from "zustand";
import type { NetworkState } from "@/features/runtime/model";

export interface NetworkStore {
  networkState: NetworkState;
  setNetworkState: (networkState: NetworkState) => void;
}

export const createNetworkStore: StateCreator<NetworkStore, [], [], NetworkStore> = (set) => ({
  // A fresh page load is online in the common case... except when it isn't,
  // so start pessimistic and let the event wiring correct this on mount.
  networkState: { status: "offline" },

  setNetworkState: (networkState) =>
    set({
      networkState,
    }),
});

export const useNetworkStore = create<NetworkStore>()(createNetworkStore);

export const isNetworkOnline = (): boolean =>
  useNetworkStore.getState().networkState.status === "online";
