import type { SunscreenSettings } from "@/features/sunscreen";
import type {
  ErythemaLoad,
  Location,
  LocationId,
  MsSinceEpoch,
  Spf,
  TimestampedUvForecast,
} from "@/shared/domain";

export type { TimestampedUvForecast, UvForecast } from "@/shared/domain";

/**
 * Load simulation state at one instant: remaining erythemal load related to
 * SED, and the effective Spf the ODE evolves. Spf 1 is unprotected.
 */
export interface SimulationState {
  time: MsSinceEpoch;
  erythemaLoad: ErythemaLoad;
  effectiveSpf: Spf;
}

/**
 * Domain log of a sunscreen or exposure jump. When it took effect lives on
 * {@link TimestampedSimulationEvent}.
 */
export type SimulationEvent =
  | { type: "sunscreenRemoved" }
  | { type: "sunscreenApplied"; sunscreenSettings: SunscreenSettings }
  | { type: "exposureStart"; location: Location }
  | { type: "exposureEnd" };

/** A {@link SimulationEvent} stamped with the instant it takes effect. */
export interface TimestampedSimulationEvent {
  time: MsSinceEpoch;
  event: SimulationEvent;
}

/** Inputs the load integrator reads: last state, forecasts, event log. */
export interface SimulationInputState {
  initialConditions: SimulationState | undefined;
  forecasts: Record<LocationId, TimestampedUvForecast>;
  events: TimestampedSimulationEvent[];
}

/**
 * Last completed UTC-window run. `pending` is runtime-only and is not
 * persisted.
 */
export type SimulationOutputState =
  | { status: "empty" }
  | { status: "pending" }
  | { status: "ready"; windowStart: MsSinceEpoch; trajectory: SimulationState[] };

/** Narrow port the simulation machine uses to read and replace simulation state. */
export interface SimulationStateStore {
  getSimulationInput(): SimulationInputState;
  setSimulationInput(state: SimulationInputState): void;
  getSimulationOutput(): SimulationOutputState;
  setSimulationOutput(state: SimulationOutputState): void;
}
