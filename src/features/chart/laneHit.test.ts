import { describe, expect, it } from "vitest";
import { nearestLaneHandle } from "./laneHit";

const LANE_Y = 100;
const LANE_H = 18;

describe("nearestLaneHandle", () => {
  const start = { id: "a", edge: "start" as const, x: 40 };
  const end = { id: "a", edge: "end" as const, x: 80 };

  it("rejects a pointer outside the three-lane-height band", () => {
    expect(nearestLaneHandle(40, LANE_Y - LANE_H - 0.5, [start], LANE_Y, LANE_H)).toBeNull();
    expect(nearestLaneHandle(40, LANE_Y + 2 * LANE_H + 0.5, [start], LANE_Y, LANE_H)).toBeNull();
  });

  it("accepts a lane-high margin above and below the lane", () => {
    expect(nearestLaneHandle(40, LANE_Y - LANE_H, [start], LANE_Y, LANE_H)?.edge).toBe("start");
    expect(nearestLaneHandle(40, LANE_Y + 2 * LANE_H, [start], LANE_Y, LANE_H)?.edge).toBe("start");
  });

  it("rejects a pointer outside the two-lane-height width", () => {
    expect(nearestLaneHandle(40 + LANE_H + 0.5, LANE_Y, [start], LANE_Y, LANE_H)).toBeNull();
  });

  it("picks the closest handle when hitboxes overlap", () => {
    const left = { id: "left", edge: "end" as const, x: 50 };
    const right = { id: "right", edge: "start" as const, x: 60 };
    expect(nearestLaneHandle(52, LANE_Y, [left, right], LANE_Y, LANE_H)).toEqual(left);
    expect(nearestLaneHandle(58, LANE_Y, [left, right], LANE_Y, LANE_H)).toEqual(right);
  });

  it("keeps a pointer on the handle center", () => {
    expect(nearestLaneHandle(80, LANE_Y + LANE_H / 2, [start, end], LANE_Y, LANE_H)).toEqual(end);
  });
});
