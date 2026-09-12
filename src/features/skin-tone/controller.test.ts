import { describe, expect, it, vi } from "vitest";
import { SkinToneController } from "./controller";
import { SKIN_TONE_IDS } from "./model";

describe("SkinToneController", () => {
  it("writes the chosen skin tone", () => {
    const setState = vi.fn();
    const controller = new SkinToneController(setState);
    controller.setSkinTone(SKIN_TONE_IDS[0]);
    expect(setState).toHaveBeenCalledWith(SKIN_TONE_IDS[0]);
  });
});
