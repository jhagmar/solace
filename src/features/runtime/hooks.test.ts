import { act } from "react";
import { describe, expect, it } from "vitest";
import { renderHook } from "@/test/renderHook";
import { useNetworkStore } from "./networkStore";
import { useNetworkStatus } from "./useNetworkStatus";
import { usePageVisibility } from "./usePageVisibility";
import { useVisibilityStore } from "./visibilityStore";

describe("useNetworkStatus", () => {
  it("writes online/offline from the browser and unsubscribes on unmount", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    const { unmount } = renderHook(() => {
      useNetworkStatus();
    });
    expect(useNetworkStore.getState().networkState.status).toBe("online");

    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(useNetworkStore.getState().networkState.status).toBe("offline");

    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(useNetworkStore.getState().networkState.status).toBe("online");

    unmount();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(useNetworkStore.getState().networkState.status).toBe("online");
  });
});

describe("usePageVisibility", () => {
  it("writes visible/hidden from document.visibilityState", () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    const { unmount } = renderHook(() => {
      usePageVisibility();
    });
    expect(useVisibilityStore.getState().visibilityState.status).toBe("visible");

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(useVisibilityStore.getState().visibilityState.status).toBe("hidden");

    unmount();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(useVisibilityStore.getState().visibilityState.status).toBe("hidden");
  });
});
