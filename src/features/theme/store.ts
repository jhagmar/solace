/**
 * The theme store: the user's light/dark/auto preference. Persisted (see
 * store/index.ts) and applied to the document by the useThemeSync hook; the
 * boot script in public/theme-boot.js reads the persisted value before
 * first paint to avoid a theme flash on load.
 */

import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import { asThemePreference, type ThemePreference } from "@/features/theme/model";
import {
  PERSIST_SCHEMA_VERSION,
  persistMerge,
  persistMigrate,
  persistStorage,
} from "@/shared/platform/persist";

export interface ThemeStore {
  /** The user's theme choice; "auto" follows the OS setting */
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
}

export const createThemeStore: StateCreator<ThemeStore, [], [], ThemeStore> = (set) => ({
  themePreference: "auto",
  setThemePreference: (preference) => set({ themePreference: preference }),
});

export const useThemeStore = create<ThemeStore>()(
  persist((...a) => ({ ...createThemeStore(...a) }), {
    name: "solace-theme-store",
    version: PERSIST_SCHEMA_VERSION,
    migrate: persistMigrate,
    storage: persistStorage,
    partialize: (state) => ({ themePreference: state.themePreference }),
    merge: (persistedState: unknown, currentState: ThemeStore): ThemeStore =>
      persistMerge(currentState, () => {
        const persisted = persistedState as
          | Partial<Pick<ThemeStore, "themePreference">>
          | undefined;
        return {
          themePreference:
            asThemePreference(persisted?.themePreference) ?? currentState.themePreference,
        };
      }),
  }),
);
