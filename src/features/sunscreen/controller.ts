import {
  type ApplicationDegree,
  EMPTY_SUNSCREEN_STATE,
  resolveTimeDraft,
  type SunscreenApplication,
  type SunscreenRemoval,
  type SunscreenState,
  type TimeDraft,
} from "@/features/sunscreen/model";
import type { MsSinceEpoch, Spf } from "@/shared/domain";
import type { Clock } from "@/shared/platform/clock";

/** Command port for applying, washing off, updating, or removing stamps. */
export class SunscreenController {
  private readonly setState: (state: SunscreenState) => void;
  private readonly getState: () => SunscreenState;
  private readonly clock: Clock;
  private seq = 0;

  constructor(
    getState: () => SunscreenState,
    setState: (state: SunscreenState) => void,
    clock: Clock,
  ) {
    this.getState = getState;
    this.setState = setState;
    this.clock = clock;
  }

  apply(input: { spf: Spf; degree: ApplicationDegree; time: TimeDraft }): string {
    const settings = {
      spf: input.spf,
      degree: input.degree,
      appliedAt: resolveTimeDraft(input.time, this.clock()),
    };
    const id = this.nextId("s", settings.appliedAt);
    this.write({ applications: [...this.applications(), { id, settings }] });
    return id;
  }

  washOff(time: TimeDraft): string {
    const at = resolveTimeDraft(time, this.clock());
    const id = this.nextId("r", at);
    this.write({ removals: [...this.removals(), { id, at }] });
    return id;
  }

  update(id: string, input: { spf: Spf; degree: ApplicationDegree; time: TimeDraft }): void {
    const appliedAt = resolveTimeDraft(input.time, this.clock());
    this.write({
      applications: this.applications().map((entry) =>
        entry.id === id
          ? { id, settings: { spf: input.spf, degree: input.degree, appliedAt } }
          : entry,
      ),
    });
  }

  updateRemoval(id: string, time: TimeDraft): void {
    const at = resolveTimeDraft(time, this.clock());
    this.write({
      removals: this.removals().map((entry) => (entry.id === id ? { id, at } : entry)),
    });
  }

  /** Moves a stamp (apply or wash-off) to an absolute instant — used by lane drag. */
  moveStamp(id: string, at: MsSinceEpoch): void {
    const application = this.applications().find((entry) => entry.id === id);
    if (application) {
      this.write({
        applications: this.applications().map((entry) =>
          entry.id === id ? { id, settings: { ...entry.settings, appliedAt: at } } : entry,
        ),
      });
      return;
    }
    if (this.removals().some((entry) => entry.id === id)) {
      this.write({
        removals: this.removals().map((entry) => (entry.id === id ? { id, at } : entry)),
      });
    }
  }

  remove(id: string): void {
    this.write({
      applications: this.applications().filter((entry) => entry.id !== id),
      removals: this.removals().filter((entry) => entry.id !== id),
    });
  }

  /** Drops every apply and wash-off stamp. */
  clear(): void {
    if (this.applications().length === 0 && this.removals().length === 0) {
      return;
    }
    this.setState({ ...EMPTY_SUNSCREEN_STATE });
  }

  adoptApplicationsIfEmpty(applications: readonly SunscreenApplication[]): void {
    if (this.applications().length > 0 || applications.length === 0) {
      return;
    }
    this.write({ applications: [...applications] });
  }

  adoptRemovalsIfEmpty(removals: readonly SunscreenRemoval[]): void {
    if (this.removals().length > 0 || removals.length === 0) {
      return;
    }
    this.write({ removals: [...removals] });
  }

  private applications = (): SunscreenApplication[] => this.getState().applications ?? [];

  private removals = (): SunscreenRemoval[] => this.getState().removals ?? [];

  private write = (patch: Partial<SunscreenState>): void => {
    this.setState({
      applications: patch.applications ?? this.applications(),
      removals: patch.removals ?? this.removals(),
    });
  };

  private nextId = (prefix: string, at: number): string => {
    this.seq += 1;
    return `${prefix}-${at}-${this.seq}`;
  };
}
