import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@/test/renderHook";
import { applyResolvedTheme } from "./chrome";
import { useThemeStore } from "./store";
import { useThemeSync } from "./sync";

vi.mock("./chrome", () => ({
  applyResolvedTheme: vi.fn(),
}));

describe("useThemeSync", () => {
  afterEach(() => {
    vi.mocked(applyResolvedTheme).mockClear();
    useThemeStore.setState({ themePreference: "auto" });
  });

  it("applies the resolved theme and tracks OS scheme changes", () => {
    const darkListeners: Array<() => void> = [];
    const lightListeners: Array<() => void> = [];
    const matchMedia = (query: string): MediaQueryList => {
      const dark = query.includes("prefers-color-scheme: dark");
      return {
        matches: dark,
        media: query,
        addEventListener: (_type: string, listener: EventListener) => {
          (dark ? darkListeners : lightListeners).push(listener as () => void);
        },
        removeEventListener: (_type: string, listener: EventListener) => {
          const bucket = dark ? darkListeners : lightListeners;
          const index = bucket.indexOf(listener as () => void);
          if (index >= 0) {
            bucket.splice(index, 1);
          }
        },
      } as MediaQueryList;
    };
    Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });

    const { unmount } = renderHook(() => {
      useThemeSync();
    });
    expect(applyResolvedTheme).toHaveBeenCalled();

    act(() => {
      darkListeners[0]?.();
    });
    expect(vi.mocked(applyResolvedTheme).mock.calls.length).toBeGreaterThan(1);

    unmount();
    expect(darkListeners).toHaveLength(0);
    expect(lightListeners).toHaveLength(0);
  });
});
