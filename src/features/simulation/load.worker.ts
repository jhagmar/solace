import type { LoadJob } from "@/features/simulation/integrator";
import { interpolatorsFromForecasts, simulateLoadTrajectory } from "@/features/simulation/load";

onmessage = (event: MessageEvent<LoadJob>) => {
  const job = event.data;
  const trajectory = simulateLoadTrajectory({
    t0: job.t0,
    tEnd: job.tEnd,
    initial: job.initial,
    events: job.events,
    interpolators: interpolatorsFromForecasts(job.forecasts),
    outputStepSeconds: job.outputStepSeconds,
  });
  postMessage({ generation: job.generation, trajectory });
};
