import { useEffect } from "react";
import { applyResolvedTheme } from "@/features/theme/chrome";
import { resolveTheme, systemColorScheme } from "@/features/theme/model";
import { useThemeStore } from "@/features/theme/store";

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";
const LIGHT_MEDIA_QUERY = "(prefers-color-scheme: light)";

/**
 * Applies the theme preference to the document and keeps it in sync.
 * Auto resolves against the OS and tracks it live. Dark is the default
 * when Auto has no preference yet. The initial pre-paint application
 * happens in public/theme-boot.js; this hook owns updates after mount.
 */
export function useThemeSync(): void {
  const preference = useThemeStore((s) => s.themePreference);

  useEffect(() => {
    const darkMedia = window.matchMedia(DARK_MEDIA_QUERY);
    const lightMedia = window.matchMedia(LIGHT_MEDIA_QUERY);
    const apply = () => {
      applyResolvedTheme(
        resolveTheme(preference, systemColorScheme(darkMedia.matches, lightMedia.matches)),
      );
    };
    apply();
    darkMedia.addEventListener("change", apply);
    lightMedia.addEventListener("change", apply);
    return () => {
      darkMedia.removeEventListener("change", apply);
      lightMedia.removeEventListener("change", apply);
    };
  }, [preference]);
}
