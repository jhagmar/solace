import { SunscreenController } from "@/features/sunscreen/controller";
import { useSunscreenStore } from "@/features/sunscreen/store";
import { clock } from "./platform";

export const sunscreen = new SunscreenController(
  () => useSunscreenStore.getState().sunscreenState,
  (state) => useSunscreenStore.getState().setSunscreenState(state),
  clock,
);
