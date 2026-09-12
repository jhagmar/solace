/**
 * Minimal typings for `odex` 3.x.
 *
 * The package ships TypeScript sources that fail this project's
 * `erasableSyntaxOnly` setting, so `tsc` is pointed here instead of
 * `node_modules/odex`. Vite aliases the same specifier to the published JS.
 */

export type Derivative = (x: number, y: number[], yp?: number[]) => number[] | void;

export type DenseOutputFunction = (component: number, x: number) => number;

export type OutputFunction = (
  xOld: number,
  x: number,
  y: number[],
  dense: DenseOutputFunction,
) => void;

export interface SolverOptions {
  maxSteps?: number;
  initialStepSize?: number;
  maxStepSize?: number;
  absoluteTolerance?: number | number[];
  relativeTolerance?: number | number[];
  denseOutput?: boolean;
}

export class Solver {
  constructor(f: Derivative, n: number, options?: SolverOptions);
  solve(
    x0: number,
    y0: number[],
    xEnd: number,
    solOut?: OutputFunction,
  ): { y: number[]; xEnd: number; nStep: number; nAccept: number; nReject: number; nEval: number };
  integrate(x0: number, y0: number[]): (x?: number, ys?: number[]) => number[];
}
