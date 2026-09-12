/**
 * The skin tone store: the user's selected skin tone, which sets the
 * caution/danger thresholds (MED) of the load simulation. Persisted (see
 * store/index.ts) — it is long-term user data, like the theme preference.
 */

import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import { asSkinTone, type SkinTone } from "@/features/skin-tone/model";
import {
  PERSIST_SCHEMA_VERSION,
  persistMerge,
  persistMigrate,
  persistStorage,
} from "@/shared/platform/persist";

export interface SkinToneStore {
  skinTone: SkinTone;
  setSkinTone: (skinTone: SkinTone) => void;
}

export const createSkinToneStore: StateCreator<SkinToneStore, [], [], SkinToneStore> = (set) => ({
  skinTone: "medium",

  setSkinTone: (skinTone) => set({ skinTone }),
});

export const useSkinToneStore = create<SkinToneStore>()(
  persist((...a) => ({ ...createSkinToneStore(...a) }), {
    name: "solace-skin-tone-store",
    version: PERSIST_SCHEMA_VERSION,
    migrate: persistMigrate,
    storage: persistStorage,
    partialize: (state) => ({ skinTone: state.skinTone }),
    merge: (persistedState: unknown, currentState: SkinToneStore): SkinToneStore =>
      persistMerge(currentState, () => {
        const persisted = persistedState as Partial<Pick<SkinToneStore, "skinTone">> | undefined;
        return { skinTone: asSkinTone(persisted?.skinTone) ?? currentState.skinTone };
      }),
  }),
);
