import type { SkinTone } from "@/features/skin-tone/model";

/** Command port for the selected skin tone. */
export class SkinToneController {
  private readonly setState: (skinTone: SkinTone) => void;

  constructor(setState: (skinTone: SkinTone) => void) {
    this.setState = setState;
  }

  setSkinTone(skinTone: SkinTone): void {
    this.setState(skinTone);
  }
}
