import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMilliseconds } from "@/shared/domain";
import { SystemTimeoutFactory } from "@/shared/platform/clock";

describe("SystemTimeoutFactory", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires the handler after the given duration", () => {
    const handler = vi.fn();
    new SystemTimeoutFactory().create(handler, createMilliseconds(100));

    vi.advanceTimersByTime(99);
    expect(handler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not fire after cancellation", () => {
    const handler = vi.fn();
    const timeout = new SystemTimeoutFactory().create(handler, createMilliseconds(100));

    timeout.cancel();
    vi.advanceTimersByTime(1000);
    expect(handler).not.toHaveBeenCalled();
  });
});
