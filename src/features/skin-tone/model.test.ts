import { describe, expect, it } from "vitest";
import {
  asSkinTone,
  CAUTION_MED_FRACTION,
  CHART_MED_FRACTION,
  DANGER_MED_FRACTION,
  loadThresholdsFor,
  SKIN_TONE_IDS,
  SKIN_TONE_PROFILES,
} from "@/features/skin-tone/model";

describe("asSkinTone", () => {
  it("accepts the six ids and rejects anything else", () => {
    for (const id of SKIN_TONE_IDS) {
      expect(asSkinTone(id)).toBe(id);
    }
    expect(asSkinTone("Type I")).toBeNull();
    expect(asSkinTone(null)).toBeNull();
  });
});

describe("SKIN_TONE_PROFILES", () => {
  it("covers every skin tone id with ICNIRP mid-range 1-MED values", () => {
    expect(Object.keys(SKIN_TONE_PROFILES)).toEqual([...SKIN_TONE_IDS]);
    expect(SKIN_TONE_PROFILES.veryFair.medSed).toBe(2);
    expect(SKIN_TONE_PROFILES.fair.medSed).toBe(2.5);
    expect(SKIN_TONE_PROFILES.medium.medSed).toBe(4);
    expect(SKIN_TONE_PROFILES.olive.medSed).toBe(6);
    expect(SKIN_TONE_PROFILES.brown.medSed).toBe(8.5);
    expect(SKIN_TONE_PROFILES.darkBrown.medSed).toBe(12);
  });

  it("paints moderate at 1 MED and dangerous at 2 MED, with a 3 MED chart ceiling", () => {
    expect(CAUTION_MED_FRACTION).toBe(1);
    expect(DANGER_MED_FRACTION).toBe(2);
    expect(CHART_MED_FRACTION).toBe(3);
    expect(loadThresholdsFor("veryFair")).toEqual({ cautionSed: 2, dangerSed: 4, chartSed: 6 });
    expect(loadThresholdsFor("fair")).toEqual({ cautionSed: 2.5, dangerSed: 5, chartSed: 7.5 });
    expect(loadThresholdsFor("medium")).toEqual({ cautionSed: 4, dangerSed: 8, chartSed: 12 });
    expect(loadThresholdsFor("brown")).toEqual({ cautionSed: 8.5, dangerSed: 17, chartSed: 25.5 });
  });
});
