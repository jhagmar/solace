/**
 * Applies the persisted theme before first paint so a dark preference does
 * not flash light on load. Must agree with useThemeStore (storage key and
 * `{ state: { themePreference } }` shape) and with THEME_BACKGROUND in
 * src/features/theme/chrome.ts.
 */
(function () {
  var LIGHT = "#fbf9f5";
  var DARK = "#17130e";
  try {
    var stored = JSON.parse(localStorage.getItem("solace-theme-store") || "null");
    var preference = stored && stored.state && stored.state.themePreference;
    var darkMedia = window.matchMedia("(prefers-color-scheme: dark)");
    var lightMedia = window.matchMedia("(prefers-color-scheme: light)");
    var dark =
      preference === "dark" ||
      (preference !== "light" && (darkMedia.matches || !lightMedia.matches));
    if (dark) document.documentElement.classList.add("dark");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? DARK : LIGHT);
  } catch {}
  /* Full CSS is `media="print"` so it does not block the first screen paint.
     Wait for the print <link> (this script runs mid-head) and the first
     frame, then switch to `all`. No inline onload (script-src 'self'). */
  function applyFullCss() {
    var sheets = document.querySelectorAll('link[rel="stylesheet"][media="print"]');
    for (var i = 0; i < sheets.length; i++) {
      sheets[i].media = "all";
    }
  }
  function afterFirstPaint(fn) {
    requestAnimationFrame(function () {
      requestAnimationFrame(fn);
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      afterFirstPaint(applyFullCss);
    });
  } else {
    afterFirstPaint(applyFullCss);
  }
})();
