import { ExposureStateMachine } from "@/features/exposure/machine";
import { exposureStateStore } from "@/features/exposure/store";
import { getEffectiveLocation } from "@/features/location/activeStore";
import { isPageVisible } from "@/features/runtime/visibilityStore";
import type { Location, MsSinceEpoch } from "@/shared/domain";
import { createMsSinceEpoch } from "@/shared/domain";
import { deviceTimeZone, lastSecondOfLocalDay } from "@/shared/time";
import { clock } from "./platform";

const HOUR_MS = 60 * 60 * 1000;

/** One hour from `start`, clamped to the last second of the location-local day. */
function defaultEnd(location: Location, start: MsSinceEpoch): MsSinceEpoch {
  const tz = location.timezone ?? deviceTimeZone();
  const dayEnd = lastSecondOfLocalDay(tz, start);
  const hour = start + HOUR_MS;
  return hour < dayEnd ? createMsSinceEpoch(hour) : dayEnd;
}

export const exposure = new ExposureStateMachine(
  exposureStateStore,
  getEffectiveLocation,
  isPageVisible,
  clock,
  defaultEnd,
);
