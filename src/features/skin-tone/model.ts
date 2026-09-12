/**
 * Skin tone identity and presentation.
 *
 * The six steps correspond to Fitzpatrick I–VI but are deliberately unnamed
 * in the UI — the face illustrations carry the meaning. MED values are
 * indicative unadapted 1-MED doses in SED (ICNIRP mid-range). The chart
 * paints moderate from 1 MED (just-perceptible erythema) and dangerous
 * from 2 MED (obvious / painful sunburn), without showing SED. The chart
 * ceiling is {@link CHART_MED_FRACTION} MED; above that the curve clips.
 */

/** All skin tone ids, ordered light to dark */
export const SKIN_TONE_IDS = ["veryFair", "fair", "medium", "olive", "brown", "darkBrown"] as const;

export type SkinTone = (typeof SKIN_TONE_IDS)[number];

/** Presentation and chart-scale data for one skin tone */
export interface SkinToneProfile {
  /**
   * Indicative unadapted 1-MED dose in SED — just-perceptible erythema
   * 24 h later on previously unexposed skin. Not the chart's red line;
   * that is {@link DANGER_MED_FRACTION} times this value.
   */
  medSed: number;
  skinColor: string;
  hairColor: string;
}

/**
 * Per-tone data, keyed by {@link SkinTone} so adding a tone to the type
 * forces adding its profile. Iteration order (light to dark) is given by
 * {@link SKIN_TONE_IDS}.
 *
 * `medSed` is the midpoint of ICNIRP's indicative unadapted range
 * (Types I–II keep 2.0 / 2.5 SED).
 */
export const SKIN_TONE_PROFILES: Record<SkinTone, SkinToneProfile> = {
  veryFair: { medSed: 2.0, skinColor: "#ffdfd0", hairColor: "#e8c15a" },
  fair: { medSed: 2.5, skinColor: "#f6cfae", hairColor: "#a97c46" },
  medium: { medSed: 4.0, skinColor: "#e9b489", hairColor: "#5f3d22" },
  olive: { medSed: 6.0, skinColor: "#ce9563", hairColor: "#38271a" },
  brown: { medSed: 8.5, skinColor: "#a06c40", hairColor: "#221812" },
  darkBrown: { medSed: 12.0, skinColor: "#6f4729", hairColor: "#16100c" },
};

/** Load below this fraction of 1 MED is "safe"; at or above it is "moderate" */
export const CAUTION_MED_FRACTION = 1;

/** Load at or above this fraction of 1 MED is "dangerous" (obvious sunburn risk) */
export const DANGER_MED_FRACTION = 2;

/** Chart y-ceiling as a multiple of 1 MED. Visual only — not a clinical line. */
export const CHART_MED_FRACTION = 3;

/** Narrows untrusted persisted JSON to a valid skin tone, or null. */
export function asSkinTone(value: unknown): SkinTone | null {
  return SKIN_TONE_IDS.includes(value as SkinTone) ? (value as SkinTone) : null;
}

/** Chart thresholds: moderate from 1 MED, dangerous from 2 MED, ceiling at 3 MED */
export function loadThresholdsFor(skinTone: SkinTone): {
  cautionSed: number;
  dangerSed: number;
  chartSed: number;
} {
  const medSed = SKIN_TONE_PROFILES[skinTone].medSed;
  return {
    cautionSed: CAUTION_MED_FRACTION * medSed,
    dangerSed: DANGER_MED_FRACTION * medSed,
    chartSed: CHART_MED_FRACTION * medSed,
  };
}
