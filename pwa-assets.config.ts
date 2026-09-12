import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

const cream = "#fbf9f5";

export default defineConfig({
  headLinkOptions: {
    preset: "2023",
  },
  preset: {
    ...minimal2023Preset,
    // The source SVG already has ~20% padding and a cream field, so do not
    // shrink the glyph further. Keep the cream (not default white) on apple /
    // maskable rasters so icons match the light theme.
    transparent: {
      ...minimal2023Preset.transparent,
      padding: 0,
    },
    maskable: {
      ...minimal2023Preset.maskable,
      padding: 0,
      resizeOptions: { background: cream },
    },
    apple: {
      ...minimal2023Preset.apple,
      padding: 0,
      resizeOptions: { background: cream },
    },
  },
  images: ["public/logo.svg"],
});
