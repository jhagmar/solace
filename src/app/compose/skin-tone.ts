import { SkinToneController } from "@/features/skin-tone/controller";
import { useSkinToneStore } from "@/features/skin-tone/store";

export const skinTone = new SkinToneController((next) =>
  useSkinToneStore.getState().setSkinTone(next),
);
