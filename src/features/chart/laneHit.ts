/**
 * Hit-testing for outdoor-window edge handles on the chart lane.
 *
 * Visual handles are a few pixels wide. Pointer targets are a lane-high
 * margin above and below the lane (three lane-heights tall) and two
 * lane-heights wide, centered on the handle. Overlapping targets resolve
 * to the closest handle, not paint order.
 */

export interface LaneHandle {
  id: string;
  edge: "start" | "end";
  x: number;
}

export function nearestLaneHandle(
  svgX: number,
  svgY: number,
  handles: readonly LaneHandle[],
  laneY: number,
  laneH: number,
): LaneHandle | null {
  const hitTop = laneY - laneH;
  const hitBottom = laneY + 2 * laneH;
  if (svgY < hitTop || svgY > hitBottom) {
    return null;
  }
  const halfWidth = laneH;
  let best: LaneHandle | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const handle of handles) {
    const dist = Math.abs(svgX - handle.x);
    if (dist <= halfWidth && dist < bestDist) {
      best = handle;
      bestDist = dist;
    }
  }
  return best;
}
