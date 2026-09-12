/**
 * Service worker update notifier.
 *
 * Registers the PWA service worker and polls hourly for updates. Shows a
 * column overlay when the app is ready for offline use or when a new
 * version is waiting. Reload skips waiting, waits until the new worker
 * controls the page, then reloads so the new precache is what paints.
 * Offline-ready is a one-off fact and dismisses after three seconds.
 */

import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect, useRef } from "react";
import { timeoutFactory } from "@/app/compose/clock";
import { createMilliseconds } from "@/shared/domain";
import type { Timeout } from "@/shared/platform/clock";
import { messages } from "@/shared/ui/messages";
import { ShellNotice } from "@/shared/ui/shell-notice";

const UPDATE_POLL_INTERVAL_MS = 60 * 60 * 1000;
const OFFLINE_READY_MS = 3000;
const RELOAD_FALLBACK_MS = 400;

function reloadWhenControlling(updateServiceWorker: (reloadPage?: boolean) => Promise<void>): void {
  const serviceWorker = navigator.serviceWorker;
  if (!serviceWorker) {
    void updateServiceWorker(true);
    return;
  }
  let reloaded = false;
  const reload = () => {
    if (reloaded) {
      return;
    }
    reloaded = true;
    window.location.reload();
  };
  serviceWorker.addEventListener("controllerchange", reload, { once: true });
  void updateServiceWorker(false).then(() => {
    timeoutFactory.create(reload, createMilliseconds(RELOAD_FALLBACK_MS));
  });
}

export function PWAUpdater() {
  const pollRef = useRef<Timeout | null>(null);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: false,
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        const poll = () => {
          void registration.update();
          pollRef.current = timeoutFactory.create(
            poll,
            createMilliseconds(UPDATE_POLL_INTERVAL_MS),
          );
        };
        pollRef.current = timeoutFactory.create(poll, createMilliseconds(UPDATE_POLL_INTERVAL_MS));
      }
    },
    onRegisterError(error) {
      console.error("Service Worker registration failed:", error);
    },
  });

  useEffect(() => {
    if (needRefresh && pollRef.current) {
      pollRef.current.cancel();
      pollRef.current = null;
    }
    return () => {
      pollRef.current?.cancel();
      pollRef.current = null;
    };
  }, [needRefresh]);

  useEffect(() => {
    if (!offlineReady || needRefresh) {
      return;
    }
    const timeout = timeoutFactory.create(
      () => setOfflineReady(false),
      createMilliseconds(OFFLINE_READY_MS),
    );
    return () => timeout.cancel();
  }, [offlineReady, needRefresh, setOfflineReady]);

  if (!offlineReady && !needRefresh) return null;

  const dismiss = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <ShellNotice>
      <p>
        {needRefresh ? messages.pwa.updateReady : messages.pwa.offlineReady}
        {needRefresh ? (
          <>
            {" "}
            <button
              type="button"
              className="cursor-pointer font-medium text-foreground underline decoration-foreground/30 underline-offset-2"
              onClick={() => {
                reloadWhenControlling(updateServiceWorker);
              }}
            >
              {messages.pwa.reload}
            </button>
          </>
        ) : null}{" "}
        <button
          type="button"
          className="cursor-pointer font-medium text-foreground underline decoration-foreground/30 underline-offset-2"
          onClick={dismiss}
        >
          {messages.pwa.dismiss}
        </button>
      </p>
    </ShellNotice>
  );
}
