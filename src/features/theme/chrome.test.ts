import { afterEach, describe, expect, it } from "vitest";
import { applyResolvedTheme, THEME_BACKGROUND } from "./chrome";

describe("applyResolvedTheme", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark");
    document.querySelectorAll('meta[name="theme-color"]').forEach((node) => {
      node.remove();
    });
  });

  it("toggles html.dark and writes a single theme-color meta", () => {
    const stale = document.createElement("meta");
    stale.name = "theme-color";
    stale.media = "(prefers-color-scheme: dark)";
    stale.content = "#000000";
    document.head.appendChild(stale);

    applyResolvedTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
    expect(metas).toHaveLength(1);
    expect(metas[0].hasAttribute("media")).toBe(false);
    expect((metas[0] as HTMLMetaElement).content).toBe(THEME_BACKGROUND.dark);

    applyResolvedTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect((document.querySelector('meta[name="theme-color"]') as HTMLMetaElement).content).toBe(
      THEME_BACKGROUND.light,
    );
  });
});
