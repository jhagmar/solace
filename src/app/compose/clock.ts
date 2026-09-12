/**
 * Production clock and timeout factory. Feature compose modules import
 * these so a header control does not evaluate the forecast graph.
 */

import { SystemTimeoutFactory, systemClock } from "@/shared/platform/clock";

export const clock = systemClock;

export const timeoutFactory = new SystemTimeoutFactory();
