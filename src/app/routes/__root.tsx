import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Sun } from "lucide-react";
import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { timeoutFactory } from "@/app/compose/clock";
import { GlobalError } from "@/app/GlobalError";
import { useExposureSync } from "@/features/exposure/sync";
import { useForecastSync } from "@/features/forecast/sync";
import { useEffectiveLocation } from "@/features/location";
import { useInstallPrompt } from "@/features/pwa/useInstallPrompt";
import { useNetworkStore } from "@/features/runtime";
import { useNetworkStatus } from "@/features/runtime/useNetworkStatus";
import { usePageVisibility } from "@/features/runtime/usePageVisibility";
import { useSimulationSync } from "@/features/simulation/sync";
import { useThemeSync } from "@/features/theme/sync";
import { ThemeControl } from "@/features/theme/ui/ThemeControl";
import { createMilliseconds } from "@/shared/domain";
import { getPersistFailure, subscribePersistFailure } from "@/shared/platform/persist";
import { messages } from "@/shared/ui/messages";
import { Button } from "@/shared/ui/primitives/button";
import { ShellNotice } from "@/shared/ui/shell-notice";

const PWAUpdater = lazy(() =>
  import("@/features/pwa/PWAUpdater").then((module) => ({ default: module.PWAUpdater })),
);

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: GlobalError,
});

function afterIdle(callback: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(callback);
    return () => cancelIdleCallback(id);
  }
  const onLoad = () => callback();
  if (document.readyState === "complete") {
    const timeout = timeoutFactory.create(onLoad, createMilliseconds(0));
    return () => timeout.cancel();
  }
  window.addEventListener("load", onLoad, { once: true });
  return () => window.removeEventListener("load", onLoad);
}

function DeferredPWAUpdater() {
  const [ready, setReady] = useState(false);
  useEffect(() => afterIdle(() => setReady(true)), []);
  if (!ready) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <PWAUpdater />
    </Suspense>
  );
}

function ForecastOfflineNotice() {
  const location = useEffectiveLocation();
  const offline = useNetworkStore((s) => s.networkState.status === "offline");
  if (!location || !offline) {
    return null;
  }
  return <ShellNotice>{messages.network.forecastsNeedNetwork}</ShellNotice>;
}

function PersistFailureNotice() {
  const failure = useSyncExternalStore(subscribePersistFailure, getPersistFailure, () => null);
  if (!failure) {
    return null;
  }
  return (
    <ShellNotice>
      {failure.kind === "quota" ? messages.persist.quota : messages.persist.unknown}
    </ShellNotice>
  );
}

function RootComponent() {
  const { isInstallable, triggerInstall } = useInstallPrompt();
  useThemeSync();
  useNetworkStatus();
  usePageVisibility();
  useExposureSync();
  useForecastSync();
  useSimulationSync();

  return (
    <>
      <a
        href="#main-content"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:absolute focus:top-[max(0.5rem,env(safe-area-inset-top))] focus:left-2"
      >
        {messages.skipToContent}
      </a>
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
          <Sun className="size-5 text-primary" aria-hidden />
          {messages.wordmark}
        </h1>
        <div className="flex items-center gap-2">
          {isInstallable && (
            <Button size="sm" onClick={triggerInstall}>
              {messages.install}
            </Button>
          )}
          <ThemeControl />
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-md flex-col pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto">
          <DeferredPWAUpdater />
          <PersistFailureNotice />
          <ForecastOfflineNotice />
        </div>
      </div>
    </>
  );
}
