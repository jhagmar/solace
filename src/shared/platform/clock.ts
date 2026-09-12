/**
 * Clock and timer plumbing.
 *
 * Machines receive a {@link Clock} and a {@link TimeoutFactory}. Production
 * injects {@link systemClock} / {@link SystemTimeoutFactory}; tests inject fakes.
 */

import { createMsSinceEpoch, type Milliseconds, type MsSinceEpoch } from "@/shared/domain";

/** Production and test clocks: current instant as branded epoch ms. */
export type Clock = () => MsSinceEpoch;

/** Production clock adapter. Constructed in `app/compose/clock.ts`. */
export const systemClock: Clock = () => createMsSinceEpoch(Date.now());

/** A scheduled timer that can be cancelled before it fires. */
export interface Timeout {
  cancel(): void;
}

/** Creates cancellable timeouts. */
export interface TimeoutFactory {
  create(handler: () => void, ms: Milliseconds): Timeout;
}

/** Production timeout factory. */
export class SystemTimeoutFactory implements TimeoutFactory {
  create = (handler: () => void, ms: Milliseconds): Timeout => {
    const id = setTimeout(handler, ms);
    return { cancel: () => clearTimeout(id) };
  };
}
