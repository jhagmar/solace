import type { SimulationState } from "@/features/simulation";
import { createErythemaLoad, createSpf } from "@/shared/domain";

export const RETARGET_MS = 200;

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Interpolates two same-length, same-time trajectories. Mismatched series
 * snap to `to` — a window rewrite is not a morph.
 */
export function blendTrajectories(
  from: readonly SimulationState[],
  to: readonly SimulationState[],
  t: number,
): SimulationState[] {
  if (t >= 1 || from.length !== to.length || from.length === 0) {
    return [...to];
  }
  if (from[0].time !== to[0].time || from[from.length - 1].time !== to[to.length - 1].time) {
    return [...to];
  }
  const lambda = Math.min(1, Math.max(0, t));
  return from.map((point, i) => {
    const next = to[i];
    return {
      time: next.time,
      erythemaLoad: createErythemaLoad(
        point.erythemaLoad + lambda * (next.erythemaLoad - point.erythemaLoad),
      ),
      effectiveSpf: createSpf(
        point.effectiveSpf + lambda * (next.effectiveSpf - point.effectiveSpf),
      ),
    };
  });
}
