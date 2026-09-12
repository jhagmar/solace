import type { ExposureState } from "@/features/exposure";
import type { LoadIntegrator, LoadJob } from "@/features/simulation/integrator";
import type {
  SimulationInputState,
  SimulationState,
  SimulationStateStore,
  TimestampedSimulationEvent,
} from "@/features/simulation/model";
import {
  clipEventsFrom,
  eventsFromSchedule,
  pruneSimulationInput,
} from "@/features/simulation/schedule";
import type { SunscreenState } from "@/features/sunscreen";
import type { TimestampedUvForecast } from "@/shared/domain";
import {
  createErythemaLoad,
  createMilliseconds,
  createSpf,
  type Location,
  type LocationId,
  type Milliseconds,
  type MsSinceEpoch,
} from "@/shared/domain";
import type { Timeout, TimeoutFactory } from "@/shared/platform/clock";
import { parseJsonResponse, type RequestFactory, type RequestHandle } from "@/shared/platform/http";
import { ForecastResponseSchema } from "@/shared/platform/open-meteo/forecastSchema";
import { mapForecastResponseToUvForecast } from "@/shared/platform/open-meteo/mapForecast";
import type { UvForecastQuery } from "@/shared/platform/open-meteo/uvUrl";
import {
  firstSecondOfUtcDayDaysAgo,
  type UtcForecastWindow,
  utcForecastWindow,
  utcIsoDate,
} from "@/shared/time";

type LoadModule = typeof import("@/features/simulation/load");

let loadModule: LoadModule | undefined;
let loadPromise: Promise<LoadModule> | undefined;

function ensureLoad(): Promise<LoadModule> {
  if (loadModule) {
    return Promise.resolve(loadModule);
  }
  loadPromise ??= import("@/features/simulation/load").then((mod) => {
    loadModule = mod;
    return mod;
  });
  return loadPromise;
}

/**
 * Resolves the ODE integrator. Production loads it on first evaluate so odex
 * is not on the first-paint graph; tests call this in `beforeAll` so evaluate
 * stays synchronous.
 */
export async function preloadSimulationLoad(): Promise<void> {
  loadModule = await ensureLoad();
}

/**
 * How often the simulation re-evaluates while the app is visible, so the
 * load advances with time even when no signal arrives.
 */
export const SIMULATION_REFRESH_INTERVAL: Milliseconds = createMilliseconds(10 * 60 * 1000);

/** Interior sample spacing for a UTC-window run, matching load.TODAY_OUTPUT_STEP_SECONDS. */
const WINDOW_OUTPUT_STEP_SECONDS = 60;

/**
 * Historical UV lookback, in UTC days. Open-Meteo keeps about three months,
 * but erythema has healed by two weeks, so older initial conditions are
 * reset to this cap (load 0, Spf 1) rather than integrated from months ago.
 */
export const HISTORICAL_LOOKBACK_DAYS = 14;

/**
 * Defines the public API for the Simulation State Machine.
 * Each handler reacts to an external signal; the machine decides what to do.
 */
export interface SimulationPort {
  /** Reacts to a change in network connectivity */
  handleNetworkChange(): void;
  /** Reacts to a change in page visibility */
  handleVisibilityChange(): void;
  /** Reacts to a new forecast for a location */
  handleForecastChange(locationId: LocationId, forecast: TimestampedUvForecast): void;
  /** Reacts to a rewrite of the outdoor pairs and sunscreen applications */
  handleScheduleChange(exposure: ExposureState, sunscreen: SunscreenState): void;
  /** Reacts to a change in the effective location */
  handleLocationChange(): void;
  /** Zeros load and Spf at the UTC window start and drops the event log. */
  clearLoggedDay(): void;
}

/**
 * The concrete implementation of the Simulation State Machine.
 * Collects the raw inputs of the load simulation (forecasts and the
 * compiled outdoor-pair / sunscreen-application log) into the simulation store, keeps the
 * initial conditions current, and writes a minute-resolution trajectory
 * over the UTC forecast window (yesterday through tomorrow).
 *
 * The window is always integrated from the current initial conditions to
 * the exclusive end of UTC tomorrow. Initial conditions older than UTC
 * yesterday are folded forward over historical Open-Meteo UV (capped at
 * {@link HISTORICAL_LOOKBACK_DAYS}); only the endpoint of that roll is
 * kept. Location changes do not reset the timebase.
 *
 * All state access goes through the injected {@link SimulationStateStore}
 * port and all side effects through injected factories, keeping the machine
 * deterministic and unit-testable.
 */
export class SimulationStateMachine implements SimulationPort {
  private readonly store: SimulationStateStore;
  private readonly timeoutFactory: TimeoutFactory;
  private readonly uvRequestFactory: RequestFactory<UvForecastQuery>;
  private readonly getEffectiveLocation: () => Location | null;
  private readonly isOnline: () => boolean;
  private readonly isVisible: () => boolean;
  private readonly now: () => MsSinceEpoch;
  private wakeupTimeout: Timeout | null = null;
  private historyGeneration = 0;
  private historyInFlight: { key: string; handles: RequestHandle[] } | null = null;
  private readonly integrator: LoadIntegrator;
  private simGeneration = 0;
  private integrateBusy = false;
  private pendingJob: LoadJob | null = null;
  private historyIntegratePending = false;

  constructor(
    store: SimulationStateStore,
    timeoutFactory: TimeoutFactory,
    uvRequestFactory: RequestFactory<UvForecastQuery>,
    getEffectiveLocation: () => Location | null,
    isOnline: () => boolean,
    isVisible: () => boolean,
    now: () => MsSinceEpoch,
    integrator?: LoadIntegrator,
  ) {
    this.store = store;
    this.timeoutFactory = timeoutFactory;
    this.uvRequestFactory = uvRequestFactory;
    this.getEffectiveLocation = getEffectiveLocation;
    this.isOnline = isOnline;
    this.isVisible = isVisible;
    this.now = now;
    this.integrator = integrator ?? {
      integrate: (job, onResult) => this.integrateOnMain(job, onResult),
    };
  }

  // Arrow-function properties are used deliberately throughout the service
  // layer so methods can be passed by reference without losing `this`.
  handleNetworkChange = (): void => this.evaluate();

  handleVisibilityChange = (): void => this.evaluate();

  handleForecastChange = (locationId: LocationId, forecast: TimestampedUvForecast): void => {
    const state = this.store.getSimulationInput();
    this.store.setSimulationInput({
      ...state,
      forecasts: { ...state.forecasts, [locationId]: forecast },
    });
    this.evaluate();
  };

  handleScheduleChange = (exposure: ExposureState, sunscreen: SunscreenState): void => {
    const compiled = eventsFromSchedule(
      exposure.windows,
      sunscreen.applications ?? [],
      sunscreen.removals ?? [],
    );
    const state = this.store.getSimulationInput();
    const t0 = state.initialConditions?.time;
    const events = t0 === undefined ? compiled : compiled.filter((entry) => entry.time >= t0);
    this.store.setSimulationInput({ ...state, events });
    this.evaluate();
  };

  handleLocationChange = (): void => this.evaluate();

  clearLoggedDay = (): void => {
    const window = utcForecastWindow(this.now());
    const state = this.store.getSimulationInput();
    this.resetToWindowStart({ ...state, events: [] }, window.start);
    this.evaluate();
  };

  /**
   * The single decision point, run on every signal but only while visible:
   * keep IC at or after UTC yesterday (folding from history when older),
   * then simulate the UTC window into the output store.
   */
  private evaluate = (): void => {
    if (!this.isVisible()) {
      this.cancelWakeup();
      return;
    }

    let state = this.store.getSimulationInput();
    const window = utcForecastWindow(this.now());

    const initialConditions = state.initialConditions;
    if (!initialConditions) {
      state = this.resetToWindowStart(state, window.start);
    } else if (initialConditions.time < window.start) {
      this.advanceInitialConditionsFromHistory();
      state = this.store.getSimulationInput();
      const rolled = state.initialConditions;
      if (!rolled || rolled.time < window.start) {
        if (!this.historyIntegratePending) {
          this.simulateWindowFromZero(state, window);
        }
        this.scheduleWakeup();
        return;
      }
    }

    this.simulateWindow(state, window);
    this.scheduleWakeup();
  };

  /**
   * Drops in-flight history and starts the window at `windowStart`, indoors,
   * load 0. Events before that instant are clipped so t0 has nothing to fold.
   */
  private resetToWindowStart = (
    state: SimulationInputState,
    windowStart: MsSinceEpoch,
  ): SimulationInputState => {
    this.cancelHistoryFetches();
    const next = {
      ...state,
      initialConditions: {
        time: windowStart,
        erythemaLoad: createErythemaLoad(0),
        effectiveSpf: createSpf(1),
      },
      events: clipEventsFrom(state.events, windowStart),
    };
    this.store.setSimulationInput(next);
    return next;
  };

  /**
   * Rolls initial conditions that predate UTC yesterday forward to
   * `window.start`: fetch historical UV for the locations on outdoor
   * intervals in between (capped at {@link HISTORICAL_LOOKBACK_DAYS}),
   * integrate with no interior samples, keep only the endpoint as the new
   * initial conditions, then prune the log so the persisted state starts
   * at the window.
   *
   * Does not blank the chart: the caller paints a zero-load window until
   * this roll lands. When outdoor locations need a fetch, this returns
   * after starting the requests; {@link applyHistoricalEndpoint} runs when
   * they complete. With no outdoor intervals the roll is synchronous
   * (empty interpolators, UV treated as 0).
   */
  advanceInitialConditionsFromHistory = (): void => {
    const now = this.now();
    const window = utcForecastWindow(now);
    const capStart = firstSecondOfUtcDayDaysAgo(now, HISTORICAL_LOOKBACK_DAYS);

    let state = this.store.getSimulationInput();
    let initialConditions = state.initialConditions;
    if (!initialConditions) {
      return;
    }

    if (initialConditions.time < capStart) {
      initialConditions = {
        time: capStart,
        erythemaLoad: createErythemaLoad(0),
        effectiveSpf: createSpf(1),
      };
      state = {
        ...state,
        initialConditions,
        events: clipEventsFrom(state.events, capStart),
      };
      this.store.setSimulationInput(state);
    }

    if (!this.isOnline()) {
      return;
    }

    const historyStart = initialConditions.time;
    const historyEvents = eventsInHistoryWindow(state.events, historyStart, window.start);
    const locations = uniqueExposureLocations(historyEvents);
    const startDate = utcIsoDate(historyStart);
    const endDate = utcIsoDate(window.start - 1);

    if (locations.length === 0) {
      this.cancelHistoryFetches();
      this.applyHistoricalEndpoint({}, historyStart, window.start);
      return;
    }

    const key = historyFetchKey(historyStart, window.start, locations);
    if (this.historyInFlight?.key === key) {
      return;
    }

    this.cancelHistoryFetches();
    const generation = this.historyGeneration;
    const forecasts: Record<LocationId, TimestampedUvForecast> = {};
    let remaining = locations.length;
    const handles: RequestHandle[] = [];

    const onLocationSettled = (): void => {
      if (generation !== this.historyGeneration) {
        return;
      }
      remaining -= 1;
      if (remaining > 0) {
        return;
      }
      this.historyInFlight = null;
      this.applyHistoricalEndpoint(forecasts, historyStart, window.start);
      this.scheduleWakeup();
    };

    for (const location of locations) {
      const handle = this.uvRequestFactory.create(
        {
          coordinates: location.coordinates,
          startDate,
          endDate,
        },
        {
          onResponse: async (response) => {
            if (generation !== this.historyGeneration) {
              return;
            }
            const parsed = await parseJsonResponse(
              response,
              ForecastResponseSchema,
              "historical UV",
            );
            if (parsed.ok) {
              try {
                const forecast = mapForecastResponseToUvForecast(parsed.data);
                forecasts[location.id] = { fetchedAt: this.now(), forecast };
              } catch (error) {
                console.error("Error mapping historical UV:", error);
              }
            } else {
              console.error("Error fetching historical UV:", parsed.reason);
            }
            onLocationSettled();
          },
          onError: async (error) => {
            console.error("Error fetching historical UV:", error);
            onLocationSettled();
          },
        },
      );
      handles.push(handle);
    }

    this.historyInFlight = { key, handles };
  };

  /**
   * Writes a window-shaped trajectory from UTC yesterday at load 0 without
   * committing that instant as initial conditions. Used while a historical
   * roll is still in flight so the chart can show today instead of a spinner.
   */
  private simulateWindowFromZero = (
    state: SimulationInputState,
    window: UtcForecastWindow,
  ): void => {
    this.simulateWindow(
      {
        ...state,
        initialConditions: {
          time: window.start,
          erythemaLoad: createErythemaLoad(0),
          effectiveSpf: createSpf(1),
        },
        events: clipEventsFrom(state.events, window.start),
      },
      window,
    );
  };

  /**
   * Integrates from the current initial conditions to the exclusive end of
   * UTC tomorrow at minute resolution and stores the trajectory. The future
   * of the window is simulated with the events already in the log — no extra
   * events are invented. A newer job replaces a queued one; an in-flight
   * result is dropped when a replacement was waiting.
   */
  private simulateWindow = (state: SimulationInputState, window: UtcForecastWindow): void => {
    const initialConditions = state.initialConditions;
    if (!initialConditions) {
      /* v8 ignore next -- evaluate() always plants initial conditions first */
      return;
    }
    const t0 = initialConditions.time;
    if (t0 > window.end) {
      return;
    }
    this.enqueue({
      generation: ++this.simGeneration,
      purpose: "window",
      t0,
      tEnd: window.end,
      initial: initialConditions,
      events: [...state.events],
      forecasts: state.forecasts,
      outputStepSeconds: WINDOW_OUTPUT_STEP_SECONDS,
      windowStart: window.start,
    });
  };

  /**
   * Integrates the historical interval with no interior samples and writes
   * the endpoint as the window's initial conditions, then prunes stale events
   * and unused forecasts. The window run is chained when the job lands.
   */
  private applyHistoricalEndpoint = (
    forecasts: Record<LocationId, TimestampedUvForecast>,
    historyStart: MsSinceEpoch,
    windowStart: MsSinceEpoch,
  ): void => {
    const state = this.store.getSimulationInput();
    const initialConditions = state.initialConditions;
    if (!initialConditions) {
      return;
    }
    const historyEvents = eventsInHistoryWindow(state.events, historyStart, windowStart);
    this.historyIntegratePending = true;
    this.enqueue({
      generation: ++this.simGeneration,
      purpose: "history",
      t0: historyStart,
      tEnd: windowStart,
      initial: { ...initialConditions, time: historyStart },
      events: [...historyEvents],
      forecasts,
      outputStepSeconds: 0,
      windowStart,
    });
  };

  private enqueue = (job: LoadJob): void => {
    if (this.integrateBusy) {
      this.pendingJob = job;
      return;
    }
    this.integrateBusy = true;
    this.integrator.integrate(job, this.onIntegrated);
  };

  private onIntegrated = (job: LoadJob, trajectory: SimulationState[]): void => {
    const pending = this.pendingJob;
    this.pendingJob = null;
    this.integrateBusy = false;
    if (job.purpose === "history") {
      this.historyIntegratePending = false;
      if (job.generation === this.simGeneration) {
        this.commitHistoricalEndpoint(job, trajectory);
        return;
      }
    }
    if (pending) {
      this.enqueue(pending);
      return;
    }
    if (job.generation !== this.simGeneration) {
      /* v8 ignore next -- a queued replacement is drained before a stale window result */
      return;
    }
    this.store.setSimulationOutput({
      status: "ready",
      windowStart: job.windowStart,
      trajectory,
    });
  };

  private commitHistoricalEndpoint = (job: LoadJob, trajectory: SimulationState[]): void => {
    const state = this.store.getSimulationInput();
    const endpoint = trajectory[trajectory.length - 1];
    if (!endpoint) {
      return;
    }
    const newInitial: SimulationState = {
      time: job.windowStart,
      erythemaLoad: endpoint.erythemaLoad,
      effectiveSpf: endpoint.effectiveSpf,
    };
    const currentLocation = this.getEffectiveLocation();
    const retainIds = currentLocation ? [currentLocation.id] : [];
    const next = pruneSimulationInput(
      { ...state, initialConditions: newInitial },
      job.windowStart,
      retainIds,
    );
    this.store.setSimulationInput(next);
    this.simulateWindow(next, utcForecastWindow(this.now()));
  };

  private integrateOnMain = (
    job: LoadJob,
    onResult: (job: LoadJob, trajectory: SimulationState[]) => void,
  ): void => {
    const load = loadModule;
    if (!load) {
      void ensureLoad().then(() => this.integrateOnMain(job, onResult));
      return;
    }
    const trajectory = load.simulateLoadTrajectory({
      t0: job.t0,
      tEnd: job.tEnd,
      initial: job.initial,
      events: job.events,
      interpolators: load.interpolatorsFromForecasts(job.forecasts),
      outputStepSeconds: job.outputStepSeconds,
    });
    onResult(job, trajectory);
  };

  /**
   * Schedules a one-shot wakeup at the refresh interval, so the load
   * advances with time even when no signal arrives.
   */
  private scheduleWakeup = (): void => {
    this.cancelWakeup();
    this.wakeupTimeout = this.timeoutFactory.create(this.handleWakeup, SIMULATION_REFRESH_INTERVAL);
  };

  private cancelWakeup = (): void => {
    this.wakeupTimeout?.cancel();
    this.wakeupTimeout = null;
  };

  private handleWakeup = (): void => {
    this.wakeupTimeout = null;
    this.evaluate();
  };

  private cancelHistoryFetches = (): void => {
    this.historyGeneration += 1;
    if (this.historyInFlight) {
      for (const handle of this.historyInFlight.handles) {
        handle.cancel();
      }
      this.historyInFlight = null;
    }
  };
}

function eventsInHistoryWindow(
  events: readonly TimestampedSimulationEvent[],
  historyStart: MsSinceEpoch,
  windowStart: MsSinceEpoch,
): TimestampedSimulationEvent[] {
  return events.filter((entry) => entry.time >= historyStart && entry.time < windowStart);
}

function uniqueExposureLocations(events: readonly TimestampedSimulationEvent[]): Location[] {
  const locations: Location[] = [];
  const seen = new Set<string>();
  for (const entry of events) {
    if (entry.event.type !== "exposureStart") {
      continue;
    }
    const location = entry.event.location;
    if (!seen.has(location.id)) {
      seen.add(location.id);
      locations.push(location);
    }
  }
  return locations;
}

function historyFetchKey(
  historyStart: MsSinceEpoch,
  windowStart: MsSinceEpoch,
  locations: readonly Location[],
): string {
  return `${historyStart}|${windowStart}|${locations.map((location) => location.id).join(",")}`;
}
