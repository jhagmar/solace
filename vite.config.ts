import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import type { Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

const { version } = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "package.json"), "utf-8"),
) as {
  version: string;
};

/** Same policy as deploy/Caddyfile. Preview must send it so Lighthouse sees CSP. */
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com; worker-src 'self'; manifest-src 'self'; upgrade-insecure-requests";

const securityHeaders = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function preloadCriticalAssets(): Plugin {
  return {
    name: "preload-critical-assets",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!ctx.bundle) {
          return html;
        }
        let htmlOut = html;
        const tags: string[] = [];
        for (const item of Object.values(ctx.bundle)) {
          if (item.type === "asset" && item.fileName.endsWith(".css")) {
            const escaped = item.fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const href = item.fileName.startsWith("/") ? item.fileName : `/${item.fileName}`;
            htmlOut = htmlOut.replace(new RegExp(`<link[^>]*href="[^"]*${escaped}"[^>]*>\\s*`), "");
            // `media="print"` is not render-blocking for screen. theme-boot.js
            // switches to `all` after the first frame so LCP can use critical CSS.
            tags.push(`<link rel="preload" href="${href}" as="style" fetchpriority="high" />`);
            tags.push(`<link rel="stylesheet" href="${href}" media="print" />`);
          }
        }
        if (tags.length === 0) {
          return htmlOut;
        }
        return htmlOut.replace("</head>", `${tags.join("\n  ")}\n  </head>`);
      },
    },
  };
}

function manifestContentType(): Plugin {
  const setType = (
    url: string | undefined,
    res: { setHeader: (name: string, value: string) => void },
  ) => {
    if (url?.split("?")[0].endsWith(".webmanifest")) {
      res.setHeader("Content-Type", "application/manifest+json");
    }
  };
  return {
    name: "manifest-content-type",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        setType(req.url, res);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        setType(req.url, res);
        next();
      });
    },
  };
}

function injectAppVersion(): Plugin {
  return {
    name: "inject-app-version",
    transformIndexHtml(html) {
      return html.replaceAll("%SOLACE_VERSION%", version);
    },
  };
}

export default defineConfig({
  test: {
    environment: "jsdom", // Optional, good if some hooks use DOM
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      include: ["src/shared/**/*.ts", "src/features/**/*.ts"],
      exclude: ["**/*.tsx", "**/*.test.ts", "**/*.gen.ts", "**/*.worker.ts", "src/app/compose/**"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/app/routes",
      generatedRouteTree: "./src/app/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
    preloadCriticalAssets(),
    injectAppVersion(),
    manifestContentType(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: [
        "favicon.ico",
        "favicon.svg",
        "apple-touch-icon-180x180.png",
        "mask-icon.svg",
        "robots.txt",
        "theme-boot.js",
      ],
      workbox: {
        // Bumping package.json version changes this id so installed PWAs
        // drop old Workbox caches and install the new worker.
        cacheId: `solace-${version}`,
        // 1. Force the active Service Worker to claim all open tabs immediately
        clientsClaim: true,
        // 2. Automatically clean up caches from old Vite builds
        cleanupOutdatedCaches: true,
        // 3. Precache static assets built into /dist (so local images load offline)
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2}"],
        globIgnores: ["**/screenshot-*"],
        navigateFallback: "index.html",
        // 4. Runtime caching strategy for external images/CDNs
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 30 * 24 * 60 * 60, // Cache for 30 Days
              },
              cacheableResponse: {
                statuses: [0, 200], // 0 allows caching opaque CORS responses
              },
            },
          },
        ],
      },
      manifest: {
        // App identity (Chrome uses `id` to tell installed apps apart)
        id: "/",
        name: "Solace — Personal UV Tracker",
        short_name: "Solace",
        description:
          "See today's UV forecast for any place on Earth, and track a personal UV load related to SED from skin tone, sunscreen and time outdoors.",
        // Splash/title-bar colors match the light theme's warm off-white
        // (--background in index.css). The manifest carries a single value;
        // in-app Light/Dark is applied to theme-color by theme-boot.js
        // and applyResolvedTheme.
        theme_color: "#fbf9f5",
        background_color: "#fbf9f5",
        start_url: "/",
        scope: "/",
        // Phone column on mobile; do not lock desktop/iPad installed windows
        orientation: "any",
        display_override: ["window-controls-overlay", "standalone"],
        display: "standalone",
        categories: ["health", "lifestyle", "weather"],
        lang: "en",
        dir: "ltr",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        screenshots: [
          {
            src: "screenshot-desktop.webp",
            sizes: "1280x720",
            type: "image/webp",
            form_factor: "wide",
            label: "Today's UV forecast and personal burn-risk chart",
          },
          {
            src: "screenshot-mobile.webp",
            sizes: "390x844",
            type: "image/webp",
            form_factor: "narrow",
            label: "Location, skin tone, sunscreen and exposure controls",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // tsc uses src/types/odex.d.ts; runtime must load the published CommonJS.
      odex: path.resolve(import.meta.dirname, "./node_modules/odex/src/odex.js"),
    },
  },
  // Production CSP stays on preview (and Caddy). The Vite dev server injects
  // an inline module for React refresh; `script-src 'self'` blocks it, every
  // TSX file throws, and the page never leaves the static HTML shell.
  server: {
    headers: {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  },
  preview: {
    headers: securityHeaders,
  },
  build: {
    modulePreload: false,
  },
});
