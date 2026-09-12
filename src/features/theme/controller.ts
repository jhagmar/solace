import type { ThemePreference } from "@/features/theme/model";

/** Command port for the theme preference. */
export class ThemeController {
  private readonly setState: (preference: ThemePreference) => void;

  constructor(setState: (preference: ThemePreference) => void) {
    this.setState = setState;
  }

  setPreference(preference: ThemePreference): void {
    this.setState(preference);
  }
}
