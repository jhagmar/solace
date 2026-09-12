import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@/test/renderHook";
import { useInstallPrompt } from "./useInstallPrompt";

describe("useInstallPrompt", () => {
  it("stashes beforeinstallprompt and clears after an accepted install", async () => {
    const { result, unmount } = renderHook(() => useInstallPrompt());
    expect(result.current.isInstallable).toBe(false);
    await result.current.triggerInstall();
    expect(result.current.isInstallable).toBe(false);

    const prompt = vi.fn(async () => undefined);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.isInstallable).toBe(true);

    await act(async () => {
      await result.current.triggerInstall();
    });
    expect(prompt).toHaveBeenCalled();
    expect(result.current.isInstallable).toBe(false);
    unmount();
  });

  it("keeps the prompt when the user dismisses it", async () => {
    const { result, unmount } = renderHook(() => useInstallPrompt());
    const prompt = vi.fn(async () => undefined);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt,
      userChoice: Promise.resolve({ outcome: "dismissed" as const }),
    });
    act(() => {
      window.dispatchEvent(event);
    });
    await act(async () => {
      await result.current.triggerInstall();
    });
    expect(result.current.isInstallable).toBe(true);
    unmount();
  });
});
