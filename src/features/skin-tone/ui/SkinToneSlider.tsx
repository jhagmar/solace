import { skinTone as skinToneController } from "@/app/compose/skin-tone";
import { SKIN_TONE_IDS, SKIN_TONE_PROFILES, type SkinTone } from "@/features/skin-tone/model";
import { useSkinToneStore } from "@/features/skin-tone/store";
import { cn } from "@/shared/ui/cn";
import { ControlCard } from "@/shared/ui/control-card";
import { messages } from "@/shared/ui/messages";

const SKIN_TONE_LABELS = {
  veryFair: messages.skinTone.veryFair,
  fair: messages.skinTone.fair,
  medium: messages.skinTone.medium,
  olive: messages.skinTone.olive,
  brown: messages.skinTone.brown,
  darkBrown: messages.skinTone.darkBrown,
} as const satisfies Record<SkinTone, string>;

/**
 * Discrete six-step skin tone picker: a row of stylized faces on a track.
 * Semantically a radiogroup (single choice, arrow-key navigable); the faces
 * carry the meaning, so no Fitzpatrick jargon is needed anywhere. The choice
 * lives in the persisted skin tone store, so this component is self-contained
 * (like ThemeControl) rather than prop-driven.
 *
 * The hair/skin colors encode realistic tones and stay fixed; legibility in
 * both themes comes from neutral framing instead — each face sits on a
 * medallion (bg + border) and the hair silhouette carries a faint
 * foreground-colored outline that is dark-on-light and light-on-dark.
 */
export function SkinToneSlider() {
  const skinTone = useSkinToneStore((s) => s.skinTone);
  const step = SKIN_TONE_IDS.indexOf(skinTone);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? Math.min(SKIN_TONE_IDS.length - 1, step + 1)
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? Math.max(0, step - 1)
          : null;
    if (next !== null) {
      e.preventDefault();
      skinToneController.setSkinTone(SKIN_TONE_IDS[next]);
    }
  };

  return (
    <ControlCard
      label={messages.skinTone.label}
      aside={
        <span className="text-sm font-medium" aria-live="polite">
          {SKIN_TONE_LABELS[skinTone]}
        </span>
      }
    >
      <div role="radiogroup" aria-label={messages.skinTone.label} className="relative">
        {/* Track, spanning the centers of the first and last cells */}
        <div
          aria-hidden
          className="absolute inset-x-[9%] top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted"
        />
        {/* Fluid grid: the faces shrink proportionally on narrow screens
            instead of overlapping; the gap absorbs the selection ring */}
        <div className="relative grid grid-cols-6 gap-2" onKeyDown={handleKeyDown}>
          {SKIN_TONE_IDS.map((id, i) => {
            const tone = SKIN_TONE_PROFILES[id];
            const selected = i === step;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={SKIN_TONE_LABELS[id]}
                tabIndex={selected ? 0 : -1}
                onClick={() => skinToneController.setSkinTone(id)}
                className={cn(
                  "relative aspect-square w-full max-w-11 cursor-pointer justify-self-center rounded-full border border-border bg-background outline-none transition-transform duration-150",
                  "focus-visible:ring-3 focus-visible:ring-ring/50",
                  "active:scale-95",
                  selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "",
                )}
              >
                {/* Stylized androgynous face: short hair that hugs the skull
                    and stops around the ears, a forehead band as hairline, and
                    a face that is neither gaunt nor round. Only the colors
                    vary between steps. */}
                <svg viewBox="0 0 36 36" aria-hidden className="absolute inset-0 size-full">
                  {/* Hair: skull-hugging mass plus a shallow band across the
                      forehead that reads as a hairline fringe. The faint
                      foreground-colored outline keeps the silhouette legible
                      for the darkest hair on dark themes (and the lightest
                      hair on light themes). */}
                  <ellipse
                    cx="18"
                    cy="16.5"
                    rx="14"
                    ry="12"
                    fill={tone.hairColor}
                    className="stroke-foreground/15"
                    strokeWidth="1"
                  />
                  <rect
                    x="8"
                    y="11"
                    width="20"
                    height="9"
                    rx="2.75"
                    fill={tone.skinColor}
                    strokeWidth="1"
                  />
                  {/* Face: soft oval, cheeks and chin clear of the hair */}
                  <ellipse cx="18" cy="20.5" rx="10" ry="10" fill={tone.skinColor} />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    </ControlCard>
  );
}
