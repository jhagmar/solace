import type { LoadIntegrator, LoadJob } from "@/features/simulation/integrator";
import type { SimulationState } from "@/features/simulation/model";

interface WorkerResult {
  generation: number;
  trajectory: SimulationState[];
}

/**
 * Browser ODE integrator: one in-flight worker job. The machine holds the
 * replace-on-write queue; this adapter posts the latest accepted job.
 */
export function createWorkerLoadIntegrator(): LoadIntegrator {
  const worker = new Worker(new URL("../../features/simulation/load.worker.ts", import.meta.url), {
    type: "module",
  });
  let inflight: {
    job: LoadJob;
    onResult: (job: LoadJob, trajectory: SimulationState[]) => void;
  } | null = null;

  worker.onmessage = (event: MessageEvent<WorkerResult>) => {
    const current = inflight;
    inflight = null;
    if (!current || event.data.generation !== current.job.generation) {
      return;
    }
    current.onResult(current.job, event.data.trajectory);
  };

  return {
    integrate(job, onResult) {
      inflight = { job, onResult };
      worker.postMessage(job);
    },
  };
}
