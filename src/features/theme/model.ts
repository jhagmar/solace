/**
 * Theme preference domain logic.
 * The user preference is a three-state choice; the resolved theme is what
 * actually gets applied to the document.
 */

export type ThemePreference = "light" | "dark" | "auto";

export type ResolvedTheme = "light" | "dark";

/** OS color scheme, including no preference yet. */
export type SystemColorScheme = "dark" | "light" | "no-preference";

export function systemColorScheme(prefersDark: boolean, prefersLight: boolean): SystemColorScheme {
  if (prefersDark) {
    return "dark";
  }
  if (prefersLight) {
    return "light";
  }
  return "no-preference";
}

/**
 * Resolves a preference against the system setting.
 * Auto follows the OS. Dark is the default when Auto has no preference yet.
 */
export function resolveTheme(
  preference: ThemePreference,
  system: SystemColorScheme,
): ResolvedTheme {
  if (preference === "auto") {
    return system === "light" ? "light" : "dark";
  }
  return preference;
}

/** Narrows untrusted persisted JSON to a valid preference, or null. */
export function asThemePreference(value: unknown): ThemePreference | null {
  return value === "light" || value === "dark" || value === "auto" ? value : null;
}
