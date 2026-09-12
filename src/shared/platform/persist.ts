/**
 * Persist helpers for Zustand stores. Schema version lives on the blob.
 * Rehydrate through feature narrowers. Quota and unknown versions fail
 * closed at the field; the UI maps {@link PersistFailure} to copy.
 */

import { createJSONStorage, type StateStorage } from "zustand/middleware";

export const PERSIST_SCHEMA_VERSION = 1;

export type PersistFailureKind = "quota" | "unknown";

export interface PersistFailure {
  kind: PersistFailureKind;
}

let persistFailure: PersistFailure | null = null;
const persistFailureListeners = new Set<() => void>();
const persistFlushers = new Set<() => void>();

export function getPersistFailure(): PersistFailure | null {
  return persistFailure;
}

export function subscribePersistFailure(onStoreChange: () => void): () => void {
  persistFailureListeners.add(onStoreChange);
  return () => persistFailureListeners.delete(onStoreChange);
}

export function registerPersistFlush(flush: () => void): () => void {
  persistFlushers.add(flush);
  return () => persistFlushers.delete(flush);
}

export function flushPersistedStores(): void {
  for (const flush of persistFlushers) {
    flush();
  }
}

function reportPersistFailure(kind: PersistFailureKind): void {
  persistFailure = { kind };
  for (const listener of persistFailureListeners) {
    listener();
  }
}

const quotaLocalStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch (error) {
      const quota =
        error instanceof DOMException && (error.name === "QuotaExceededError" || error.code === 22);
      reportPersistFailure(quota ? "quota" : "unknown");
    }
  },
  removeItem: (name) => {
    localStorage.removeItem(name);
  },
};

export const persistStorage = createJSONStorage(() => quotaLocalStorage);

export function persistMigrate<T>(state: unknown, fromVersion: number): T {
  if (fromVersion > PERSIST_SCHEMA_VERSION) {
    throw new Error(`Unknown persist schema version: ${fromVersion}`);
  }
  return state as T;
}

/**
 * Zustand persist `merge` runs while the store module is first evaluated.
 * A throw there rejects the mount graph and leaves the static HTML shell
 * on screen. Narrowers already fail closed; this is the last net.
 */
export function persistMerge<T extends object>(current: T, patch: () => Partial<T>): T {
  try {
    return { ...current, ...patch() };
  } catch {
    return current;
  }
}

/** Flush on hide and pagehide. No `unload` (bfcache-friendly). */
export function bindPersistLifetime(): void {
  const onHide = () => {
    if (document.visibilityState === "hidden") {
      flushPersistedStores();
    }
  };
  document.addEventListener("visibilitychange", onHide);
  document.addEventListener("pagehide", () => {
    flushPersistedStores();
  });
}
