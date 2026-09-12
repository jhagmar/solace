/**
 * Registers persist flushers and binds hide / pagehide.
 * Importing this module constructs no timers until {@link startPersistLifetime}.
 */

import { useExposureStore } from "@/features/exposure/store";
import { useForecastStore } from "@/features/forecast/store";
import { useActiveLocationStore } from "@/features/location/activeStore";
import { useRecentLocationsStore } from "@/features/location/recentsStore";
import { useSimulationStore } from "@/features/simulation/store";
import { useSkinToneStore } from "@/features/skin-tone/store";
import { useSunscreenStore } from "@/features/sunscreen/store";
import { useThemeStore } from "@/features/theme/store";
import { bindPersistLifetime, registerPersistFlush } from "@/shared/platform/persist";

registerPersistFlush(() => useThemeStore.setState((state) => ({ ...state })));
registerPersistFlush(() => useSkinToneStore.setState((state) => ({ ...state })));
registerPersistFlush(() => useSunscreenStore.setState((state) => ({ ...state })));
registerPersistFlush(() => useExposureStore.setState((state) => ({ ...state })));
registerPersistFlush(() => useSimulationStore.setState((state) => ({ ...state })));
registerPersistFlush(() => useRecentLocationsStore.setState((state) => ({ ...state })));
registerPersistFlush(() => useActiveLocationStore.setState((state) => ({ ...state })));
registerPersistFlush(() => useForecastStore.setState((state) => ({ ...state })));

export function startPersistLifetime(): void {
  bindPersistLifetime();
}
