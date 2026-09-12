import { describe, expect, it, vi } from "vitest";
import { useActiveLocationStore } from "@/features/location/activeStore";
import { useVisibilityStore } from "@/features/runtime";
import { renderHook } from "@/test/renderHook";
import { useExposureSync } from "./sync";

const exposure = vi.hoisted(() => ({
  handleVisibilityChange: vi.fn(),
  handleLocationChange: vi.fn(),
}));

vi.mock("@/app/compose/exposure", () => ({ exposure }));

describe("useExposureSync", () => {
  it("runs on mount and on visibility and location store writes", () => {
    const { unmount } = renderHook(() => {
      useExposureSync();
    });
    expect(exposure.handleVisibilityChange).toHaveBeenCalledTimes(1);

    useVisibilityStore.setState({ visibilityState: { status: "hidden" } });
    expect(exposure.handleVisibilityChange).toHaveBeenCalledTimes(2);

    useActiveLocationStore.setState({ activeLocation: { status: "empty" } });
    expect(exposure.handleLocationChange).toHaveBeenCalledTimes(1);

    unmount();
    useVisibilityStore.setState({ visibilityState: { status: "visible" } });
    expect(exposure.handleVisibilityChange).toHaveBeenCalledTimes(2);
  });
});
