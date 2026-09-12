import type { ResolvedTheme } from "./model";

/**
 * Title-bar / splash colours. Keep in sync with `public/theme-boot.js`
 * and the light/dark `--background` tokens in index.css
 * (`oklch(0.982 0.006 85)` / `oklch(0.19 0.012 70)`).
 */
export const THEME_BACKGROUND = {
  light: "#fbf9f5",
  dark: "#17130e",
} as const;

/**
 * Applies a resolved theme to the document: `html.dark` and the
 * `theme-color` meta (so the browser chrome follows in-app Light/Dark,
 * not only `prefers-color-scheme`).
 */
export function applyResolvedTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");

  const color = THEME_BACKGROUND[resolved];
  document.querySelectorAll('meta[name="theme-color"]').forEach((node) => {
    node.remove();
  });
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = color;
  document.head.appendChild(meta);
}
