import { describe, expect, it } from "vitest";
import {
  EventDrivenOdeSolver,
  type SimulationEvent,
} from "@/features/simulation/ode/EventDrivenOdeSolver";

type Exposure = { outdoor: boolean };

const rate =
  (r: number) =>
  (_t: number, _y: number[], _ctx: unknown): number[] => [r];

const exposedRate = (_t: number, _y: number[], ctx: Readonly<Exposure>): number[] => [
  ctx.outdoor ? 1 : 0,
];

const jumpContext = (time: number, context: Exposure): SimulationEvent<Exposure> => ({
  time,
  apply: (state) => ({ state, context }),
});

const jumpState = <C>(time: number, update: (state: number[]) => number[]): SimulationEvent<C> => ({
  time,
  apply: (state, context) => ({ state: update(state), context: context as C }),
});

const last = <T>(items: T[]): T => items[items.length - 1];

describe("EventDrivenOdeSolver", () => {
  describe("constructor validation", () => {
    it("rejects a non-positive or non-integer state dimension", () => {
      expect(() => new EventDrivenOdeSolver(0, rate(0))).toThrow(/state dimension/);
      expect(() => new EventDrivenOdeSolver(-1, rate(0))).toThrow(/state dimension/);
      expect(() => new EventDrivenOdeSolver(1.5, rate(0))).toThrow(/state dimension/);
    });

    it("rejects non-positive tolerances", () => {
      expect(() => new EventDrivenOdeSolver(1, rate(0), { absoluteTolerance: 0 })).toThrow(
        /absoluteTolerance/,
      );
      expect(() => new EventDrivenOdeSolver(1, rate(0), { absoluteTolerance: -1 })).toThrow(
        /absoluteTolerance/,
      );
      expect(() => new EventDrivenOdeSolver(1, rate(0), { absoluteTolerance: Number.NaN })).toThrow(
        /absoluteTolerance/,
      );
      expect(() => new EventDrivenOdeSolver(1, rate(0), { relativeTolerance: 0 })).toThrow(
        /relativeTolerance/,
      );
      expect(() => new EventDrivenOdeSolver(1, rate(0), { relativeTolerance: Number.NaN })).toThrow(
        /relativeTolerance/,
      );
    });

    it("rejects a negative output step size", () => {
      expect(() => new EventDrivenOdeSolver(1, rate(0), { outputStepSize: -0.1 })).toThrow(
        /outputStepSize/,
      );
      expect(() => new EventDrivenOdeSolver(1, rate(0), { outputStepSize: Number.NaN })).toThrow(
        /outputStepSize/,
      );
    });

    it("rejects a non-positive or non-integer maxSteps", () => {
      expect(() => new EventDrivenOdeSolver(1, rate(0), { maxSteps: 0 })).toThrow(/maxSteps/);
      expect(() => new EventDrivenOdeSolver(1, rate(0), { maxSteps: 1.5 })).toThrow(/maxSteps/);
      expect(() => new EventDrivenOdeSolver(1, rate(0), { maxSteps: Number.NaN })).toThrow(
        /maxSteps/,
      );
    });
  });

  describe("integrate validation", () => {
    const solver = new EventDrivenOdeSolver(1, rate(0));

    it("rejects a reversed or non-finite interval", () => {
      expect(() => solver.integrate(Number.NaN, 1, [0], null)).toThrow(/t0/);
      expect(() => solver.integrate(0, Number.POSITIVE_INFINITY, [0], null)).toThrow(/tEnd/);
      expect(() => solver.integrate(2, 1, [0], null)).toThrow(/tEnd \(1\) is before t0 \(2\)/);
    });

    it("rejects an initial state of the wrong shape", () => {
      expect(() => solver.integrate(0, 1, [], null)).toThrow(/initialState has length 0/);
      expect(() => solver.integrate(0, 1, [0, 0], null)).toThrow(/initialState has length 2/);
      expect(() => solver.integrate(0, 1, [Number.NaN], null)).toThrow(/non-finite/);
      expect(() => solver.integrate(0, 1, "nope" as unknown as number[], null)).toThrow(
        /non-array/,
      );
    });

    it("rejects a non-finite event time even when the event is out of range", () => {
      expect(() =>
        solver.integrate(0, 1, [0], null, [
          { time: Number.NaN, apply: (state) => ({ state, context: null }) },
        ]),
      ).toThrow(/event time/);
    });
  });

  describe("smooth integration", () => {
    it("returns only the initial point on a zero-length interval", () => {
      const solver = new EventDrivenOdeSolver(1, rate(5));
      const trajectory = solver.integrate(3, 3, [7], "ctx");
      expect(trajectory).toEqual([{ t: 3, y: [7], context: "ctx" }]);
    });

    it("integrates a constant right-hand side", () => {
      const solver = new EventDrivenOdeSolver(1, rate(2));
      const trajectory = solver.integrate(0, 3, [1], null);
      expect(trajectory[0]).toEqual({ t: 0, y: [1], context: null });
      expect(last(trajectory).t).toBe(3);
      expect(last(trajectory).y[0]).toBeCloseTo(7, 5);
    });

    it("integrates y' = y from y(0) = 1 to about e at t = 1", () => {
      const solver = new EventDrivenOdeSolver(1, (_t, y) => [y[0]]);
      const trajectory = solver.integrate(0, 1, [1], null);
      expect(last(trajectory).y[0]).toBeCloseTo(Math.E, 5);
    });

    it("integrates a two-dimensional system", () => {
      const solver = new EventDrivenOdeSolver(2, () => [1, 3]);
      const trajectory = solver.integrate(0, 2, [0, 10], null);
      expect(last(trajectory).y[0]).toBeCloseTo(2, 5);
      expect(last(trajectory).y[1]).toBeCloseTo(16, 5);
    });

    it("does not mutate the initial state array", () => {
      const solver = new EventDrivenOdeSolver(1, rate(1));
      const y0 = [0];
      solver.integrate(0, 1, y0, null);
      expect(y0).toEqual([0]);
    });

    it("returns copies so later mutation of a sample does not leak", () => {
      const solver = new EventDrivenOdeSolver(1, rate(0));
      const trajectory = solver.integrate(0, 1, [4], null);
      trajectory[0].y[0] = 99;
      expect(last(trajectory).y[0]).toBeCloseTo(4, 5);
    });

    it("copies y before calling f so a mutating right-hand side cannot corrupt the step", () => {
      const solver = new EventDrivenOdeSolver(1, (_t, y) => {
        y[0] = 1e6;
        return [1];
      });
      const trajectory = solver.integrate(0, 1, [0], null);
      expect(last(trajectory).y[0]).toBeCloseTo(1, 4);
    });
  });

  describe("events and context", () => {
    it("ignores events outside [t0, tEnd]", () => {
      const solver = new EventDrivenOdeSolver(1, exposedRate);
      const trajectory = solver.integrate(0, 2, [0], { outdoor: true }, [
        jumpContext(-1, { outdoor: false }),
        jumpContext(3, { outdoor: false }),
      ]);
      expect(last(trajectory).y[0]).toBeCloseTo(2, 5);
      expect(last(trajectory).context).toEqual({ outdoor: true });
    });

    it("sorts events and applies same-time events in input order", () => {
      const solver = new EventDrivenOdeSolver<{ n: number }>(1, rate(0));
      const trajectory = solver.integrate(0, 2, [0], { n: 0 }, [
        {
          time: 1,
          apply: (state, ctx) => ({ state: [state[0] + 10], context: { n: ctx.n + 1 } }),
        },
        {
          time: 1,
          apply: (state, ctx) => ({ state: [state[0] + 3], context: { n: ctx.n + 1 } }),
        },
        {
          time: 0.5,
          apply: (state, ctx) => ({ state, context: { n: ctx.n } }),
        },
      ]);
      const atJump = trajectory.filter((p) => p.t === 1);
      expect(atJump).toHaveLength(3);
      expect(atJump[0].y[0]).toBeCloseTo(0, 5);
      expect(atJump[1].y[0]).toBeCloseTo(10, 5);
      expect(atJump[2].y[0]).toBeCloseTo(13, 5);
      expect(atJump[2].context).toEqual({ n: 2 });
    });

    it("applies an event at t0 without integrating a zero-length segment", () => {
      const solver = new EventDrivenOdeSolver<Exposure>(1, rate(1));
      const trajectory = solver.integrate(0, 2, [0], { outdoor: false }, [
        jumpContext(0, { outdoor: true }),
      ]);
      expect(trajectory[0]).toEqual({ t: 0, y: [0], context: { outdoor: false } });
      expect(trajectory[1].t).toBe(0);
      expect(trajectory[1].context).toEqual({ outdoor: true });
      expect(last(trajectory).y[0]).toBeCloseTo(2, 5);
    });

    it("applies events at t0 on a zero-length interval", () => {
      const solver = new EventDrivenOdeSolver(1, rate(1));
      const trajectory = solver.integrate(5, 5, [1], "before", [
        { time: 5, apply: (state) => ({ state: [state[0] + 4], context: "after" }) },
      ]);
      expect(trajectory.map((p) => ({ t: p.t, y: p.y, context: p.context }))).toEqual([
        { t: 5, y: [1], context: "before" },
        { t: 5, y: [5], context: "after" },
      ]);
    });

    it("records left and right limits at an interior jump and at tEnd", () => {
      const solver = new EventDrivenOdeSolver(1, exposedRate);
      const trajectory = solver.integrate(0, 4, [0], { outdoor: true }, [
        jumpContext(2, { outdoor: false }),
        jumpState(4, (state) => [state[0] + 8]),
      ]);

      const atTwo = trajectory.filter((p) => p.t === 2);
      expect(atTwo).toHaveLength(2);
      expect(atTwo[0].y[0]).toBeCloseTo(2, 5);
      expect(atTwo[0].context).toEqual({ outdoor: true });
      expect(atTwo[1].y[0]).toBeCloseTo(2, 5);
      expect(atTwo[1].context).toEqual({ outdoor: false });

      const atEnd = trajectory.filter((p) => p.t === 4);
      expect(atEnd).toHaveLength(2);
      expect(atEnd[0].y[0]).toBeCloseTo(2, 5);
      expect(atEnd[1].y[0]).toBeCloseTo(10, 5);
    });

    it("stops accumulating once context switches from outdoor to indoor", () => {
      const solver = new EventDrivenOdeSolver(1, exposedRate);
      const initial = { outdoor: true };
      const trajectory = solver.integrate(0, 10, [0], initial, [
        jumpContext(4, { outdoor: false }),
      ]);
      expect(last(trajectory).y[0]).toBeCloseTo(4, 5);
      expect(initial.outdoor).toBe(true);
    });

    it("throws when an event returns the wrong state shape", () => {
      const solver = new EventDrivenOdeSolver(1, rate(0));
      expect(() =>
        solver.integrate(0, 1, [0], null, [
          { time: 0.5, apply: () => ({ state: [1, 2], context: null }) },
        ]),
      ).toThrow(/event at t=0.5 has length 2/);
      expect(() =>
        solver.integrate(0, 1, [0], null, [
          { time: 0.5, apply: () => ({ state: [Number.POSITIVE_INFINITY], context: null }) },
        ]),
      ).toThrow(/non-finite/);
      expect(() =>
        solver.integrate(0, 1, [0], null, [
          { time: 0.5, apply: () => ({ state: null as unknown as number[], context: null }) },
        ]),
      ).toThrow(/non-array/);
    });

    it("throws when the right-hand side returns the wrong dimension", () => {
      const solver = new EventDrivenOdeSolver(1, () => [1, 2]);
      expect(() => solver.integrate(0, 1, [0], null)).toThrow(/Derivative dimension 2/);
    });
  });

  describe("output sampling", () => {
    it("omits interior samples by default", () => {
      const solver = new EventDrivenOdeSolver(1, rate(1));
      const trajectory = solver.integrate(0, 2, [0], null);
      expect(trajectory.map((p) => p.t)).toEqual([0, 2]);
    });

    it("emits uniform interior samples strictly inside each segment", () => {
      const solver = new EventDrivenOdeSolver(1, rate(1), { outputStepSize: 1 });
      const trajectory = solver.integrate(0, 3, [0], "c");
      expect(trajectory.map((p) => p.t)).toEqual([0, 1, 2, 3]);
      expect(trajectory[1].y[0]).toBeCloseTo(1, 5);
      expect(trajectory[2].y[0]).toBeCloseTo(2, 5);
      expect(trajectory.every((p) => p.context === "c")).toBe(true);
    });

    it("does not emit a grid point on the right endpoint, even when it is a multiple of the step", () => {
      const solver = new EventDrivenOdeSolver(1, rate(0), { outputStepSize: 2 });
      const times = solver.integrate(0, 2, [0], null).map((p) => p.t);
      expect(times.filter((t) => t === 2)).toHaveLength(1);
    });

    it("samples interiors on each smooth piece around an event", () => {
      const solver = new EventDrivenOdeSolver(1, exposedRate, { outputStepSize: 1 });
      const trajectory = solver.integrate(0, 4, [0], { outdoor: true }, [
        jumpContext(2, { outdoor: false }),
      ]);
      const times = trajectory.map((p) => p.t);
      expect(times).toContain(1);
      expect(times).toContain(3);
      expect(trajectory.filter((p) => p.t === 2)).toHaveLength(2);
      expect(trajectory.find((p) => p.t === 3)?.y[0]).toBeCloseTo(2, 5);
    });

    it("falls back to endpoint-only output when the step is at least the segment length", () => {
      const solver = new EventDrivenOdeSolver(1, rate(1), { outputStepSize: 5 });
      expect(solver.integrate(0, 2, [0], null).map((p) => p.t)).toEqual([0, 2]);
    });
  });

  describe("solver options", () => {
    it("honours a tight tolerance on a smooth problem", () => {
      const solver = new EventDrivenOdeSolver(1, (_t, y) => [y[0]], {
        absoluteTolerance: 1e-10,
        relativeTolerance: 1e-10,
      });
      expect(last(solver.integrate(0, 1, [1], null)).y[0]).toBeCloseTo(Math.E, 8);
    });

    it("propagates an odex maxSteps failure", () => {
      const solver = new EventDrivenOdeSolver(1, rate(1), { maxSteps: 1 });
      expect(() => solver.integrate(0, 1, [0], null)).toThrow(/maximum allowed steps/);
    });
  });
});
