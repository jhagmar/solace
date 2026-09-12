/**
 * Event-driven wrapper around Hairer–Wanner ODEX (non-stiff GBS).
 *
 * Integrates y' = f(t, y, ctx) on [t0, tEnd], restarting at each
 * discontinuity so the right-hand side stays smooth on every segment.
 * `f` is a pure function of time, state, and a piecewise-constant
 * *context* — the typed analogue of CVODE's `user_data`, without a
 * mutable void pointer. The solver holds the current context and passes
 * it into `f`; events return a new context instead of mutating one that
 * `f` closed over.
 *
 * Put continuously evolving quantities in `y` (erythemal load; a decaying
 * protection factor). Put switches that are constant between events in
 * context (indoor/outdoor). Immutable inputs that never jump — a PCHIP
 * UV interpolant — may be closed over when *building* `f`; they are not
 * event-driven state.
 *
 * Events before t0 are ignored; fold them into the initial state and
 * context. Same-time events apply in input order with no integration
 * between them. Output is the piecewise trajectory: t0, optional interior
 * samples, left and right limits at each event, and tEnd. Restarting at
 * C¹ interpolant knots is unnecessary.
 */

import { Solver } from "odex";

/** One sample of the integrated trajectory. `y` is a copy and is safe to keep. */
export interface TrajectoryPoint<C> {
  t: number;
  y: number[];
  context: C;
}

/**
 * A discontinuity at a single instant. Receives a copy of the left-limit
 * state and the current context, and must return the right-limit pair.
 * Replace context with a new value (e.g. `{ ...ctx, outdoor: false }`);
 * do not mutate the object `f` is about to read. Jump rate coefficients,
 * not accumulated load.
 */
export interface SimulationEvent<C> {
  time: number;
  apply: (state: number[], context: Readonly<C>) => { state: number[]; context: C };
}

export interface SolverConfig {
  absoluteTolerance?: number;
  relativeTolerance?: number;
  /**
   * Uniform spacing for extra samples strictly inside each smooth segment.
   * `0` (the default) records only segment endpoints and event jumps.
   */
  outputStepSize?: number;
  maxSteps?: number;
}

export type OdeDerivatives<C> = (t: number, state: number[], context: Readonly<C>) => number[];

export class EventDrivenOdeSolver<C> {
  private readonly stateDimension: number;
  private readonly derivatives: OdeDerivatives<C>;
  private readonly absoluteTolerance: number;
  private readonly relativeTolerance: number;
  private readonly outputStepSize: number;
  private readonly maxSteps: number;

  constructor(stateDimension: number, derivatives: OdeDerivatives<C>, config: SolverConfig = {}) {
    if (!Number.isInteger(stateDimension) || stateDimension < 1) {
      throw new Error(`Invalid state dimension: ${stateDimension}. Must be a positive integer.`);
    }
    this.stateDimension = stateDimension;
    this.derivatives = derivatives;
    this.absoluteTolerance = requirePositiveFinite(
      config.absoluteTolerance ?? 1e-6,
      "absoluteTolerance",
    );
    this.relativeTolerance = requirePositiveFinite(
      config.relativeTolerance ?? 1e-6,
      "relativeTolerance",
    );
    this.outputStepSize = requireNonNegativeFinite(config.outputStepSize ?? 0, "outputStepSize");
    this.maxSteps = requirePositiveInteger(config.maxSteps ?? 10000, "maxSteps");
  }

  public integrate(
    t0: number,
    tEnd: number,
    initialState: number[],
    initialContext: C,
    events: SimulationEvent<C>[] = [],
  ): TrajectoryPoint<C>[] {
    requireFinite(t0, "t0");
    requireFinite(tEnd, "tEnd");
    if (tEnd < t0) {
      throw new Error(`Invalid interval: tEnd (${tEnd}) is before t0 (${t0}).`);
    }
    this.requireState(initialState, "initialState");

    for (const event of events) {
      requireFinite(event.time, "event time");
    }

    const sortedEvents = events
      .filter((event) => event.time >= t0 && event.time <= tEnd)
      .sort((a, b) => a.time - b.time);

    let currentTime = t0;
    let currentState = copyState(initialState);
    let currentContext = initialContext;
    const results: TrajectoryPoint<C>[] = [this.point(currentTime, currentState, currentContext)];

    let eventIndex = 0;
    while (true) {
      const eventAtNow =
        eventIndex < sortedEvents.length && sortedEvents[eventIndex].time === currentTime;
      if (currentTime >= tEnd && !eventAtNow) {
        break;
      }

      const nextTime = eventAtNow
        ? currentTime
        : eventIndex < sortedEvents.length
          ? sortedEvents[eventIndex].time
          : tEnd;

      if (nextTime > currentTime) {
        const { interior, yEnd } = this.advanceSegment(
          currentTime,
          nextTime,
          currentState,
          currentContext,
        );
        for (const sample of interior) {
          results.push(sample);
        }
        currentState = yEnd;
        currentTime = nextTime;
        results.push(this.point(currentTime, currentState, currentContext));
      }

      while (eventIndex < sortedEvents.length && sortedEvents[eventIndex].time === currentTime) {
        ({ state: currentState, context: currentContext } = this.applyEvent(
          sortedEvents[eventIndex],
          currentState,
          currentContext,
        ));
        results.push(this.point(currentTime, currentState, currentContext));
        eventIndex += 1;
      }
    }

    return results;
  }

  private point(t: number, y: number[], context: C): TrajectoryPoint<C> {
    return { t, y: copyState(y), context };
  }

  private advanceSegment(
    t0: number,
    t1: number,
    y0: number[],
    context: C,
  ): { interior: TrajectoryPoint<C>[]; yEnd: number[] } {
    const duration = t1 - t0;
    const interiorTimes = this.interiorSampleTimes(t0, t1);

    if (interiorTimes.length === 0) {
      const solver = this.createSolver(duration, false, context);
      return { interior: [], yEnd: copyState(solver.solve(t0, y0, t1).y) };
    }

    const solver = this.createSolver(duration, true, context);
    const interpolant = solver.integrate(t0, y0);
    try {
      const interior = interiorTimes.map((t) => this.point(t, interpolant(t), context));
      const yEnd = copyState(interpolant(t1));
      return { interior, yEnd };
    } finally {
      interpolant();
    }
  }

  private interiorSampleTimes(t0: number, t1: number): number[] {
    if (this.outputStepSize === 0) {
      return [];
    }
    const times: number[] = [];
    for (let k = 1; ; k += 1) {
      const t = t0 + k * this.outputStepSize;
      if (t >= t1) {
        break;
      }
      times.push(t);
    }
    return times;
  }

  private createSolver(segmentDuration: number, denseOutput: boolean, context: C): Solver {
    const initialStepSize = Math.max(segmentDuration * 1e-4, Number.EPSILON);
    return new Solver((t, y) => this.evaluateRhs(t, y, context), this.stateDimension, {
      absoluteTolerance: this.absoluteTolerance,
      relativeTolerance: this.relativeTolerance,
      maxSteps: this.maxSteps,
      denseOutput,
      initialStepSize,
      ...(denseOutput ? { maxStepSize: segmentDuration } : {}),
    });
  }

  private evaluateRhs(t: number, y: number[], context: C): number[] {
    const yp = this.derivatives(t, y.slice(), context);
    if (yp.length !== this.stateDimension) {
      throw new Error(
        `Derivative dimension ${yp.length} does not match state dimension ${this.stateDimension}.`,
      );
    }
    return yp;
  }

  private applyEvent(
    event: SimulationEvent<C>,
    state: number[],
    context: C,
  ): { state: number[]; context: C } {
    const next = event.apply(state.slice(), context);
    this.requireState(next.state, `event at t=${event.time}`);
    return { state: copyState(next.state), context: next.context };
  }

  private requireState(state: number[], label: string): void {
    if (!Array.isArray(state) || state.length !== this.stateDimension) {
      const length = Array.isArray(state) ? String(state.length) : "non-array";
      throw new Error(`${label} has length ${length}; expected ${this.stateDimension}.`);
    }
    for (const value of state) {
      if (!Number.isFinite(value)) {
        throw new Error(`${label} contains a non-finite component.`);
      }
    }
  }
}

function copyState(state: number[]): number[] {
  return state.slice();
}

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${label}: ${value}. Must be a finite number.`);
  }
}

function requirePositiveFinite(value: number, label: string): number {
  requireFinite(value, label);
  if (value <= 0) {
    throw new Error(`Invalid ${label}: ${value}. Must be greater than zero.`);
  }
  return value;
}

function requireNonNegativeFinite(value: number, label: string): number {
  requireFinite(value, label);
  if (value < 0) {
    throw new Error(`Invalid ${label}: ${value}. Must be greater than or equal to zero.`);
  }
  return value;
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid ${label}: ${value}. Must be a positive integer.`);
  }
  return value;
}
