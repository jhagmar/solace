import { describe, expect, it } from "vitest";
import { blendTrajectories } from "@/features/chart/retarget";
import { createErythemaLoad, createMsSinceEpoch, createSpf } from "@/shared/domain";

const sample = (time: number, load: number, spf: number) => ({
  time: createMsSinceEpoch(time),
  erythemaLoad: createErythemaLoad(load),
  effectiveSpf: createSpf(spf),
});

describe("blendTrajectories", () => {
  it("lerps matching series", () => {
    const from = [sample(0, 0, 1), sample(60_000, 2, 1)];
    const to = [sample(0, 4, 1), sample(60_000, 6, 1)];
    const mid = blendTrajectories(from, to, 0.5);
    expect(mid[1]?.erythemaLoad).toBe(4);
  });

  it("snaps when lengths differ", () => {
    const from = [sample(0, 0, 1)];
    const to = [sample(0, 4, 1), sample(60_000, 6, 1)];
    expect(blendTrajectories(from, to, 0.5)).toEqual(to);
  });
});
