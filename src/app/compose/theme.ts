import { ThemeController } from "@/features/theme/controller";
import { useThemeStore } from "@/features/theme/store";

export const theme = new ThemeController((preference) =>
  useThemeStore.getState().setThemePreference(preference),
);
