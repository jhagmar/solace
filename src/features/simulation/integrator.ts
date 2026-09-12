import type { SimulationState, TimestampedSimulationEvent } from "@/features/simulation/model";
import type { LocationId, MsSinceEpoch, TimestampedUvForecast } from "@/shared/domain";

/** Serializable ODE job: forecasts travel as data so a worker can rebuild interpolants. */
export interface LoadJob {
  generation: number;
  purpose: "window" | "history";
  t0: MsSinceEpoch;
  tEnd: MsSinceEpoch;
  initial: SimulationState;
  events: TimestampedSimulationEvent[];
  forecasts: Record<LocationId, TimestampedUvForecast>;
  outputStepSeconds: number;
  windowStart: MsSinceEpoch;
}

export interface LoadIntegrator {
  integrate(job: LoadJob, onResult: (job: LoadJob, trajectory: SimulationState[]) => void): void;
}
