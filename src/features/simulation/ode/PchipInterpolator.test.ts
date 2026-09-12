import { describe, expect, it } from "vitest";
import { PchipInterpolator } from "@/features/simulation/ode/PchipInterpolator";

const pts = (...pairs: [number, number][]): { x: number; y: number }[] =>
  pairs.map(([x, y]) => ({ x, y }));

/** Dense samples of `evaluate` on the closed interval [x0, x1]. */
const samples = (interp: PchipInterpolator, x0: number, x1: number, n = 200): number[] => {
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) {
    ys.push(interp.evaluate(x0 + ((x1 - x0) * i) / n));
  }
  return ys;
};

describe("PchipInterpolator", () => {
  describe("empty input", () => {
    it("evaluates to 0 everywhere", () => {
      const interp = new PchipInterpolator([]);
      expect(interp.evaluate(0)).toBe(0);
      expect(interp.evaluate(-1e9)).toBe(0);
      expect(interp.evaluate(1e9)).toBe(0);
    });
  });

  describe("single point", () => {
    it("evaluates to that y everywhere", () => {
      const interp = new PchipInterpolator(pts([12, 3.5]));
      expect(interp.evaluate(12)).toBe(3.5);
      expect(interp.evaluate(12 - 100)).toBe(3.5);
      expect(interp.evaluate(12 + 100)).toBe(3.5);
    });

    it("treats a run of duplicate x as a single point at the mean y", () => {
      const interp = new PchipInterpolator(pts([5, 1], [5, 2], [5, 9]));
      expect(interp.evaluate(5)).toBe(4);
      expect(interp.evaluate(0)).toBe(4);
      expect(interp.evaluate(10)).toBe(4);
    });
  });

  describe("two points", () => {
    const interp = new PchipInterpolator(pts([0, 0], [10, 5]));

    it("is linear between the knots", () => {
      expect(interp.evaluate(0)).toBe(0);
      expect(interp.evaluate(10)).toBe(5);
      expect(interp.evaluate(4)).toBeCloseTo(2, 12);
      expect(interp.evaluate(7)).toBeCloseTo(3.5, 12);
    });

    it("clamps to the nearest endpoint outside the x range", () => {
      expect(interp.evaluate(-1)).toBe(0);
      expect(interp.evaluate(10)).toBe(5);
      expect(interp.evaluate(11)).toBe(5);
    });
  });

  describe("clamping", () => {
    it("returns the first y for any x at or left of the first knot", () => {
      const interp = new PchipInterpolator(pts([2, 1], [4, 8], [6, 3]));
      expect(interp.evaluate(2)).toBe(1);
      expect(interp.evaluate(2 - 1e-9)).toBe(1);
      expect(interp.evaluate(-100)).toBe(1);
    });

    it("returns the last y for any x at or right of the last knot", () => {
      const interp = new PchipInterpolator(pts([2, 1], [4, 8], [6, 3]));
      expect(interp.evaluate(6)).toBe(3);
      expect(interp.evaluate(6 + 1e-9)).toBe(3);
      expect(interp.evaluate(100)).toBe(3);
    });
  });

  describe("knots and ordering", () => {
    it("passes through every distinct observation", () => {
      const points = pts([0, 0], [6, 2], [12, 8], [18, 2], [24, 0]);
      const interp = new PchipInterpolator(points);
      for (const { x, y } of points) {
        expect(interp.evaluate(x)).toBe(y);
      }
    });

    it("sorts input by x so unsorted observations still interpolate correctly", () => {
      const interp = new PchipInterpolator(pts([12, 8], [0, 0], [24, 0], [6, 2]));
      expect(interp.evaluate(0)).toBe(0);
      expect(interp.evaluate(6)).toBe(2);
      expect(interp.evaluate(12)).toBe(8);
      expect(interp.evaluate(24)).toBe(0);
    });

    it("does not mutate the input array or its points", () => {
      const input = pts([1, 1], [0, 0]);
      const snapshot = structuredClone(input);
      new PchipInterpolator(input);
      expect(input).toEqual(snapshot);
    });
  });

  describe("duplicate x", () => {
    it("collapses equal x to the mean y and interpolates through that point", () => {
      const interp = new PchipInterpolator(pts([1, 8], [0, 0], [1, 2], [2, 4]));
      expect(interp.evaluate(1)).toBe(5);
      expect(interp.evaluate(0)).toBe(0);
      expect(interp.evaluate(2)).toBe(4);
    });

    it("averages more than two coinciding y-values", () => {
      const interp = new PchipInterpolator(pts([0, 0], [1, 1], [1, 3], [1, 8], [2, 2]));
      expect(interp.evaluate(1)).toBe(4);
    });

    it("still linearly interpolates when duplicates collapse to two knots", () => {
      const interp = new PchipInterpolator(pts([0, 0], [0, 2], [10, 10], [10, 0]));
      expect(interp.evaluate(0)).toBe(1);
      expect(interp.evaluate(10)).toBe(5);
      expect(interp.evaluate(5)).toBeCloseTo(3, 12);
    });
  });

  describe("shape preservation", () => {
    it("does not overshoot a local maximum or go negative on a UV-shaped day", () => {
      const interp = new PchipInterpolator(pts([0, 0], [6, 2], [12, 8], [18, 2], [24, 0]));
      const ys = samples(interp, 0, 24);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(-1e-12);
      expect(Math.max(...ys)).toBeLessThanOrEqual(8 + 1e-12);
    });

    it("stays flat across a constant Fritsch–Carlson plateau", () => {
      const interp = new PchipInterpolator(
        pts(
          [0, 10],
          [2, 10],
          [3, 10],
          [5, 10],
          [6, 10],
          [8, 10],
          [9, 10.5],
          [11, 15],
          [12, 50],
          [14, 60],
          [15, 85],
        ),
      );
      for (const x of [0, 2, 3, 5, 6, 8]) {
        expect(interp.evaluate(x)).toBe(10);
      }
      for (const y of samples(interp, 0, 8, 80)) {
        expect(y).toBeCloseTo(10, 12);
      }
      expect(interp.evaluate(9)).toBe(10.5);
      expect(interp.evaluate(12)).toBe(50);
      expect(interp.evaluate(15)).toBe(85);
    });

    it("keeps a monotone increasing interval monotone", () => {
      const interp = new PchipInterpolator(pts([0, 0], [1, 1], [2, 4], [3, 6]));
      const ys = samples(interp, 0, 3);
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1] - 1e-12);
      }
    });

    it("sets a zero slope at a local extremum so the peak is not overshot", () => {
      const interp = new PchipInterpolator(pts([0, 0], [1, 4], [2, 0], [3, 2]));
      expect(interp.evaluate(1)).toBe(4);
      expect(Math.max(...samples(interp, 0, 2))).toBeCloseTo(4, 12);
    });

    it("stays constant on a zero-secant interval before a rise", () => {
      const interp = new PchipInterpolator(pts([0, 1], [1, 1], [2, 3], [3, 5]));
      for (const y of samples(interp, 0, 1, 20)) {
        expect(y).toBeCloseTo(1, 12);
      }
    });
  });

  describe("endpoint slope limiting", () => {
    it("zeros a left-end slope whose three-point estimate would reverse the first secant", () => {
      // First secant is a gentle rise; the next is a steep rise that would
      // pull the one-sided estimate negative. PCHIP must flatten instead.
      const interp = new PchipInterpolator(pts([0, 0], [1, 1], [2, 100]));
      expect(interp.evaluate(0)).toBe(0);
      expect(interp.evaluate(1)).toBe(1);
      expect(Math.min(...samples(interp, 0, 1))).toBeGreaterThanOrEqual(-1e-12);
      expect(Math.max(...samples(interp, 0, 1))).toBeLessThanOrEqual(1 + 1e-12);
    });

    it("caps a left-end slope that would overshoot a following sign change", () => {
      const interp = new PchipInterpolator(pts([0, 0], [1, 0.1], [2, -10]));
      expect(interp.evaluate(0)).toBe(0);
      expect(interp.evaluate(1)).toBe(0.1);
      expect(Math.max(...samples(interp, 0, 1))).toBeLessThanOrEqual(0.1 + 1e-12);
      expect(Math.min(...samples(interp, 0, 1))).toBeGreaterThanOrEqual(-1e-12);
    });

    it("zeros a right-end slope whose three-point estimate would reverse the last secant", () => {
      const interp = new PchipInterpolator(pts([0, 0], [1, 100], [2, 101]));
      expect(interp.evaluate(1)).toBe(100);
      expect(interp.evaluate(2)).toBe(101);
      expect(Math.min(...samples(interp, 1, 2))).toBeGreaterThanOrEqual(100 - 1e-12);
      expect(Math.max(...samples(interp, 1, 2))).toBeLessThanOrEqual(101 + 1e-12);
    });

    it("caps a right-end slope that would overshoot a preceding sign change", () => {
      const interp = new PchipInterpolator(pts([0, -10], [1, 0.1], [2, 0]));
      expect(interp.evaluate(1)).toBe(0.1);
      expect(interp.evaluate(2)).toBe(0);
      expect(Math.max(...samples(interp, 1, 2))).toBeLessThanOrEqual(0.1 + 1e-12);
      expect(Math.min(...samples(interp, 1, 2))).toBeLessThanOrEqual(0 + 1e-12);
      expect(Math.min(...samples(interp, 1, 2))).toBeGreaterThanOrEqual(-1e-12);
    });

    it("keeps a consistent three-point endpoint slope on a straight line", () => {
      const interp = new PchipInterpolator(pts([0, 0], [1, 1], [2, 2], [3, 3]));
      expect(interp.evaluate(0.5)).toBeCloseTo(0.5, 12);
      expect(interp.evaluate(2.5)).toBeCloseTo(2.5, 12);
    });
  });

  describe("interval search", () => {
    it("evaluates in the first, middle, and last intervals of a longer series", () => {
      const interp = new PchipInterpolator(
        pts([0, 0], [1, 1], [2, 4], [3, 5], [4, 8], [5, 7], [6, 9], [7, 10]),
      );
      expect(interp.evaluate(0.5)).toBeGreaterThan(0);
      expect(interp.evaluate(0.5)).toBeLessThan(1);
      expect(interp.evaluate(3.5)).toBeGreaterThan(5);
      expect(interp.evaluate(3.5)).toBeLessThan(8);
      expect(interp.evaluate(6.5)).toBeGreaterThan(9);
      expect(interp.evaluate(6.5)).toBeLessThan(10);
    });
  });
});
