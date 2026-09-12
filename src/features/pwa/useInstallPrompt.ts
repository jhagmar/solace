import { useEffect, useState } from "react";

/**
 * Captures the browser's `beforeinstallprompt` event so the app can offer
 * PWA installation from its own UI (the header's Install button) instead of
 * the browser's intrusive mini-infobar. Mount once at the app root.
 */

/**
 * The `beforeinstallprompt` event is not yet part of the standard DOM lib types.
 * See https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      // Prevent Chromium from automatically showing an intrusive mini-infobar
      e.preventDefault();
      // Stash the event so it can be triggered later via a button click
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const triggerInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  return { isInstallable: !!deferredPrompt, triggerInstall };
}
