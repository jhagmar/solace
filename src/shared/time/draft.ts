/**
 * In-dialog draft of a wall-clock instant: a relative choice ("Now",
 * "30 min ago") is an intent that only resolves when the sheet commits;
 * an absolute choice already is an instant.
 */

import { createMsSinceEpoch, type Minutes, type MsSinceEpoch } from "@/shared/domain";

export type TimeDraft =
  | { kind: "relative"; offset: Minutes }
  | { kind: "absolute"; atMs: MsSinceEpoch };

/** Resolves a time draft to an instant, given the clock at commit. */
export function resolveTimeDraft(draft: TimeDraft, now: MsSinceEpoch): MsSinceEpoch {
  if (draft.kind === "absolute") {
    return draft.atMs;
  }
  // May land on the previous local day; the chart and simulation window
  // already cover UTC yesterday, so that is a valid instant.
  return createMsSinceEpoch(Math.max(0, now - draft.offset * 60_000));
}
