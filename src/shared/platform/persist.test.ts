import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bindPersistLifetime,
  flushPersistedStores,
  getPersistFailure,
  PERSIST_SCHEMA_VERSION,
  persistMerge,
  persistMigrate,
  persistStorage,
  registerPersistFlush,
  subscribePersistFailure,
} from "./persist";

describe("persistMigrate", () => {
  it("accepts the current schema version and older blobs", () => {
    expect(persistMigrate({ themePreference: "dark" }, 0)).toEqual({ themePreference: "dark" });
    expect(persistMigrate({ themePreference: "dark" }, PERSIST_SCHEMA_VERSION)).toEqual({
      themePreference: "dark",
    });
  });

  it("rejects a newer schema version", () => {
    expect(() => persistMigrate({}, PERSIST_SCHEMA_VERSION + 1)).toThrow(
      /Unknown persist schema version/,
    );
  });
});

describe("persistMerge", () => {
  it("returns current state when the patch throws", () => {
    const current = { ok: true };
    expect(
      persistMerge(current, () => {
        throw new Error("corrupt");
      }),
    ).toEqual(current);
  });
});

describe("persist flush and quota", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs registered flushers", () => {
    const flush = vi.fn();
    const stop = registerPersistFlush(flush);
    flushPersistedStores();
    expect(flush).toHaveBeenCalledOnce();
    stop();
    flushPersistedStores();
    expect(flush).toHaveBeenCalledOnce();
  });

  it("reports quota failures from storage", () => {
    const listener = vi.fn();
    const stop = subscribePersistFailure(listener);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    persistStorage?.setItem("solace-test", { state: {}, version: 1 });
    expect(getPersistFailure()).toEqual({ kind: "quota" });
    expect(listener).toHaveBeenCalled();
    stop();
  });

  it("flushes on pagehide and hidden visibility", () => {
    const flush = vi.fn();
    registerPersistFlush(flush);
    bindPersistLifetime();
    document.dispatchEvent(new Event("pagehide"));
    expect(flush).toHaveBeenCalled();
    flush.mockClear();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(flush).toHaveBeenCalled();
  });
});
