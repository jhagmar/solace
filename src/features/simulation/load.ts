/**
 * Load-simulation integrator.
 *
 * Wraps {@link EventDrivenOdeSolver} for the erythema / Spf state
 * `y = [erythemaLoad, effectiveSpf]`. Time is integrated in **seconds since
 * t0** so the solver sees O(10⁴)–O(10⁶) rather than epoch milliseconds.
 * UV interpolants stay in epoch ms and are queried after converting `t`
 * back.
 *
 * Domain events become solver discontinuities: exposure start/end switch
 * the piecewise context the right-hand side reads; sunscreen apply/remove
 * also jump the effective-Spf component. Same-time samples collapse to the
 * right limit so the stored trajectory is a sorted list of unique times.
 *
 * The right-hand side is a two-state planning model, not CIE cumulative
 * exposure. `D` is remaining erythemal load related to SED with first-order
 * recovery; `S` is effective Spf, which decays toward 1. Applying sunscreen
 * replaces `S` with `S0^α` rather than stacking layers. See README.
 *
 */

import type { SimulationState, TimestampedSimulationEvent } from "@/features/simulation/model";
import type { PchipInterpolator } from "@/features/simulation/ode/PchipInterpolator";
import {
  applySimulationEvent,
  type PiecewiseSimulationContext,
  uvInterpolatorFromForecast,
  windowFrom,
} from "@/features/simulation/schedule";
import type { LocationId, MsSinceEpoch, TimestampedUvForecast } from "@/shared/domain";
import { createErythemaLoad, createMsSinceEpoch, createSpf } from "@/shared/domain";
import type { ApplicationDegree, SunscreenSettings } from "../sunscreen";
import {
  EventDrivenOdeSolver,
  type OdeDerivatives,
  type SimulationEvent as OdeEvent,
  type TrajectoryPoint,
} from "./ode/EventDrivenOdeSolver";

/** `y[0]` — remaining erythemal load related to SED */
export const LOAD_INDEX = 0;
/** `y[1]` — effective Spf; 1 is unprotected */
export const SPF_INDEX = 1;
/** Unprotected skin; sunscreen removal jumps back to this */
export const UNPROTECTED_SPF = 1;
/** Minute-resolution interior samples for a "today" run, in solver seconds */
export const TODAY_OUTPUT_STEP_SECONDS = 60;

/**
 * Application thickness as a fraction of the ISO 24444 test amount
 * (2 mg/cm²). Effective Spf is `S0^α` (Beer–Lambert / Faurschou–Wulf).
 * `typical` is ~1 mg/cm²; `light` is ~0.5 mg/cm².
 */
export const SUNSCREEN_FRACTION_LIGHT = 0.25;
export const SUNSCREEN_FRACTION_TYPICAL = 0.5;
export const SUNSCREEN_FRACTION_RECOMMENDED = 1.0;

/**
 * UV→SED conversion: 1 UVI = 25 mW/m² erythemally weighted irradiance
 * (WHO UVI definition), 1 SED = 100 J/m² (CIE/ISO), so one hour at 1 UVI
 * is 90 J/m² = 0.9 SED, and 1 UVI-second is 1/4000 SED.
 */
export const SED_PER_UVI_PER_SECOND = 1 / 4000;

const SECONDS_PER_HOUR = 60 * 60;

/**
 * Half-life of remaining erythemal load `D`. Diffey (2021) deduced a 40 h
 * T½ for the fading limb of the erythema time course from 8 h vs 24 h MED
 * observations. Used here as `k_r = ln(2) / τ_r` on the remaining-load
 * state — a macroscopic stand-in for epidermal repair, not CIE SED.
 */
export const ERYTHEMAL_RECOVERY_HALF_LIFE_SECONDS = 40 * SECONDS_PER_HOUR;

/**
 * Half-life of surplus Spf (`S − 1`). Chosen from the public-health
 * “reapply every two hours” interval (WHO, AAD, FDA Drug Facts), which
 * already folds in sweat, rub-off, and water, not from filter photostability
 * alone (modern films can last longer at rest).
 */
export const SUNSCREEN_DEGRADATION_HALF_LIFE_SECONDS = 2 * SECONDS_PER_HOUR;

/** `k_r` in 1/s. `dD/dt` includes `− k_r D`. */
export const ERYTHEMAL_RECOVERY_RATE_PER_SECOND =
  Math.log(2) / ERYTHEMAL_RECOVERY_HALF_LIFE_SECONDS;

/** `k_s` in 1/s. `dS/dt = − k_s (S − 1)`. */
export const SUNSCREEN_DEGRADATION_RATE_PER_SECOND =
  Math.log(2) / SUNSCREEN_DEGRADATION_HALF_LIFE_SECONDS;

/** Inputs for one integration from `t0` to `tEnd` */
export interface LoadSimulationRequest {
  t0: MsSinceEpoch;
  tEnd: MsSinceEpoch;
  initial: SimulationState;
  events: readonly TimestampedSimulationEvent[];
  interpolators: ReadonlyMap<LocationId, PchipInterpolator>;
  /**
   * Interior sample spacing in seconds since t0. `0` records only segment
   * endpoints and event jumps — use this for historical rolls that only
   * need the endpoint state.
   */
  outputStepSeconds: number;
}

/**
 * Erythema / sunscreen right-hand side. `t` is seconds since `t0EpochMs`.
 *
 * Outdoors: `dD/dt = κ · U(t) / S − k_r D`, `dS/dt = −k_s (S − 1)`.
 * Indoors: the exposure term is dropped (`χ = 0`); recovery and Spf decay
 * still run. A missing interpolator for the outdoor location is UV 0.
 */
export function loadDerivatives(
  tSeconds: number,
  y: number[],
  context: Readonly<PiecewiseSimulationContext>,
  interpolators: ReadonlyMap<LocationId, PchipInterpolator>,
  t0EpochMs: number,
): number[] {
  const S = Math.max(y[SPF_INDEX], UNPROTECTED_SPF);
  const D = Math.max(y[LOAD_INDEX], 0);
  const dSdt = -SUNSCREEN_DEGRADATION_RATE_PER_SECOND * (S - 1);
  const dDdtRecovery = -ERYTHEMAL_RECOVERY_RATE_PER_SECOND * D;

  if (context.exposure.status === "indoors") {
    return [dDdtRecovery, dSdt];
  }

  const epochMs = t0EpochMs + tSeconds * 1000;
  const interpolator = interpolators.get(context.exposure.location.id);
  const uv = interpolator?.evaluate(epochMs) ?? 0;
  const dDdtExposure = (SED_PER_UVI_PER_SECOND * uv) / S;
  return [dDdtExposure + dDdtRecovery, dSdt];
}

/** Binds interpolators and t0 into an {@link OdeDerivatives} for the solver */
export function createLoadDerivatives(
  interpolators: ReadonlyMap<LocationId, PchipInterpolator>,
  t0EpochMs: number,
): OdeDerivatives<PiecewiseSimulationContext> {
  return (t, y, context) => loadDerivatives(t, y, context, interpolators, t0EpochMs);
}

/** Builds a PCHIP interpolant per location from the retained forecasts */
export function interpolatorsFromForecasts(
  forecasts: Record<LocationId, TimestampedUvForecast>,
): Map<LocationId, PchipInterpolator> {
  const interpolators = new Map<LocationId, PchipInterpolator>();
  for (const [id, entry] of Object.entries(forecasts)) {
    interpolators.set(id as LocationId, uvInterpolatorFromForecast(entry.forecast));
  }
  return interpolators;
}

/**
 * Integrates the load ODE on `[t0, tEnd]` and returns a time-sorted
 * trajectory of unique {@link SimulationState} samples (right limit at
 * discontinuities). A degenerate interval `tEnd === t0` returns the
 * initial state as a single point.
 */
export function simulateLoadTrajectory(request: LoadSimulationRequest): SimulationState[] {
  const { t0, tEnd, initial, events, interpolators, outputStepSeconds } = request;
  if (tEnd < t0) {
    throw new Error(`Invalid interval: tEnd (${tEnd}) is before t0 (${t0}).`);
  }
  if (tEnd === t0) {
    return [{ ...initial, time: t0 }];
  }

  const t0Ms = t0 as number;
  const window = windowFrom(events, t0);
  const solverEvents = window.events.map((entry) => toSolverEvent(entry, t0Ms));
  const solver = new EventDrivenOdeSolver(2, createLoadDerivatives(interpolators, t0Ms), {
    outputStepSize: outputStepSeconds,
  });
  const points = solver.integrate(
    0,
    (tEnd - t0) / 1000,
    [initial.erythemaLoad, initial.effectiveSpf],
    window.context,
    solverEvents,
  );
  return collapseTrajectory(points, t0Ms);
}

/**
 * Linear interpolation of erythemal load along a sorted trajectory.
 * Clamps to the first/last sample outside the span; empty → 0.
 */
export function loadAtTime(trajectory: readonly SimulationState[], atMs: number): number {
  if (trajectory.length === 0) {
    return 0;
  }
  if (atMs <= trajectory[0].time) {
    return trajectory[0].erythemaLoad;
  }
  const last = trajectory[trajectory.length - 1];
  if (atMs >= last.time) {
    return last.erythemaLoad;
  }
  for (let i = 1; i < trajectory.length; i += 1) {
    const a = trajectory[i - 1];
    const b = trajectory[i];
    if (atMs <= b.time) {
      const span = b.time - a.time;
      const lambda = span === 0 ? 1 : (atMs - a.time) / span;
      return a.erythemaLoad + lambda * (b.erythemaLoad - a.erythemaLoad);
    }
  }
  /* v8 ignore next -- sorted trajectories always return in the loop */
  return last.erythemaLoad;
}

/** First sample at which load is at least `load`, or null if never */
export function firstTimeLoadReaches(
  trajectory: readonly SimulationState[],
  load: number,
): MsSinceEpoch | null {
  for (const point of trajectory) {
    if (point.erythemaLoad >= load) {
      return point.time;
    }
  }
  return null;
}

/** Maps a UI application degree to the thickness fraction `α`. */
function applicationDegreeToFraction(applicationDegree: ApplicationDegree): number {
  switch (applicationDegree) {
    case "light":
      return SUNSCREEN_FRACTION_LIGHT;
    case "typical":
      return SUNSCREEN_FRACTION_TYPICAL;
    case "recommended":
      return SUNSCREEN_FRACTION_RECOMMENDED;
  }
}

/**
 * Instantaneous apply jump: `S(t_a+) = S0^α`. Reapplication replaces the
 * previous film rather than stacking layers.
 */
function sunscreenSettingsToEffectiveSpf(settings: SunscreenSettings): number {
  return Math.pow(settings.spf, applicationDegreeToFraction(settings.degree));
}

function toSolverEvent(
  entry: TimestampedSimulationEvent,
  t0Ms: number,
): OdeEvent<PiecewiseSimulationContext> {
  return {
    time: (entry.time - t0Ms) / 1000,
    apply: (state, context) => {
      const nextContext = applySimulationEvent(context, entry.event);
      const y = state.slice();
      if (entry.event.type === "sunscreenApplied") {
        y[SPF_INDEX] = sunscreenSettingsToEffectiveSpf(entry.event.sunscreenSettings);
      } else if (entry.event.type === "sunscreenRemoved") {
        y[SPF_INDEX] = UNPROTECTED_SPF;
      }
      return { state: y, context: nextContext };
    },
  };
}

function collapseTrajectory(
  points: readonly TrajectoryPoint<PiecewiseSimulationContext>[],
  t0Ms: number,
): SimulationState[] {
  const trajectory: SimulationState[] = [];
  for (const point of points) {
    const sample = toSimulationState(point, t0Ms);
    const last = trajectory[trajectory.length - 1];
    if (last && last.time === sample.time) {
      trajectory[trajectory.length - 1] = sample;
    } else {
      trajectory.push(sample);
    }
  }
  return trajectory;
}

function toSimulationState(
  point: TrajectoryPoint<PiecewiseSimulationContext>,
  t0Ms: number,
): SimulationState {
  return {
    time: createMsSinceEpoch(Math.round(t0Ms + point.t * 1000)),
    erythemaLoad: createErythemaLoad(Math.max(0, point.y[LOAD_INDEX])),
    effectiveSpf: createSpf(Math.max(UNPROTECTED_SPF, point.y[SPF_INDEX])),
  };
}
