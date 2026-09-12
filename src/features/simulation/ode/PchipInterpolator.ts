/**
 * Shape-preserving cubic interpolant (PCHIP) for a scalar series.
 *
 * Intended as the UV-index forcing for the load ODE: it passes through each
 * observation, does not overshoot local extrema (so non-negative UV stays
 * non-negative), and is C¹ between knots. Duplicate x-values are collapsed
 * by averaging their y-values so a zero-width interval cannot divide by
 * zero. Queries outside the data range clamp to the nearest endpoint value.
 */

export class PchipInterpolator {
  private xs: number[];
  private ys: number[];
  private ds: number[]; // Tangents (slopes) at each point

  constructor(points: { x: number; y: number }[]) {
    const { xs, ys } = consolidatePoints(points);
    this.xs = xs;
    this.ys = ys;
    const n = this.xs.length;

    this.ds = new Array(n).fill(0);

    if (n === 0 || n === 1) return;

    const h = new Array(n - 1);
    const m = new Array(n - 1);

    // Compute intervals and secant slopes
    for (let i = 0; i < n - 1; i++) {
      h[i] = this.xs[i + 1] - this.xs[i];
      m[i] = (this.ys[i + 1] - this.ys[i]) / h[i];
    }

    if (n === 2) {
      this.ds[0] = m[0];
      this.ds[1] = m[0];
      return;
    }

    // Interior slopes (weighted harmonic mean of secants)
    for (let i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] <= 0) {
        this.ds[i] = 0; // Local extrema or flat region: slope must be zero
      } else {
        const w1 = 2 * h[i] + h[i - 1];
        const w2 = h[i] + 2 * h[i - 1];
        this.ds[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
      }
    }

    // One-sided endpoint slopes
    this.ds[0] = this.calcEndSlope(h[0], h[1], m[0], m[1]);
    this.ds[n - 1] = this.calcEndSlope(h[n - 2], h[n - 3], m[n - 2], m[n - 3]);
  }

  private calcEndSlope(h0: number, h1: number, m0: number, m1: number): number {
    let d = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
    if (Math.sign(d) !== Math.sign(m0)) {
      d = 0;
    } else if (Math.sign(m0) !== Math.sign(m1) && Math.abs(d) > Math.abs(3 * m0)) {
      d = 3 * m0;
    }
    return d;
  }

  public evaluate(x: number): number {
    const n = this.xs.length;
    if (n === 0) return 0;
    if (n === 1) return this.ys[0];

    // Clamp boundary values
    if (x <= this.xs[0]) return this.ys[0];
    if (x >= this.xs[n - 1]) return this.ys[n - 1];

    // Binary search for the correct interval
    let low = 0,
      high = n - 2;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.xs[mid] <= x && x <= this.xs[mid + 1]) {
        low = mid;
        break;
      }
      if (this.xs[mid] < x) low = mid + 1;
      else high = mid - 1;
    }
    const i = low;

    // Cubic Hermite polynomial evaluation
    const h = this.xs[i + 1] - this.xs[i];
    const t = (x - this.xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;

    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    return (
      this.ys[i] * h00 + h * this.ds[i] * h10 + this.ys[i + 1] * h01 + h * this.ds[i + 1] * h11
    );
  }
}

/** Sort by x and replace runs of equal x with a single point at the mean y. */
function consolidatePoints(points: { x: number; y: number }[]): { xs: number[]; ys: number[] } {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const xs: number[] = [];
  const ys: number[] = [];

  for (let i = 0; i < sorted.length; ) {
    const x = sorted[i].x;
    let sum = 0;
    let count = 0;
    while (i < sorted.length && sorted[i].x === x) {
      sum += sorted[i].y;
      count += 1;
      i += 1;
    }
    xs.push(x);
    ys.push(sum / count);
  }

  return { xs, ys };
}
