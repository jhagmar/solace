import { describe, expect, it } from "vitest";
import { asThemePreference, resolveTheme, systemColorScheme } from "@/features/theme/model";

describe("resolveTheme", () => {
  it("resolves explicit preferences regardless of the system setting", () => {
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("light", "light")).toBe("light");
    expect(resolveTheme("dark", "dark")).toBe("dark");
    expect(resolveTheme("dark", "light")).toBe("dark");
  });

  it("resolves auto against the system setting, with dark when there is no preference", () => {
    expect(resolveTheme("auto", "dark")).toBe("dark");
    expect(resolveTheme("auto", "light")).toBe("light");
    expect(resolveTheme("auto", "no-preference")).toBe("dark");
  });
});

describe("systemColorScheme", () => {
  it("prefers an explicit dark or light match, else no-preference", () => {
    expect(systemColorScheme(true, false)).toBe("dark");
    expect(systemColorScheme(false, true)).toBe("light");
    expect(systemColorScheme(false, false)).toBe("no-preference");
  });
});

describe("asThemePreference", () => {
  it("accepts the three valid preferences", () => {
    expect(asThemePreference("light")).toBe("light");
    expect(asThemePreference("dark")).toBe("dark");
    expect(asThemePreference("auto")).toBe("auto");
  });

  it("rejects anything else", () => {
    expect(asThemePreference("system")).toBeNull();
    expect(asThemePreference("")).toBeNull();
    expect(asThemePreference(undefined)).toBeNull();
    expect(asThemePreference(null)).toBeNull();
    expect(asThemePreference(42)).toBeNull();
  });
});
