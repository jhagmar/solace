/**
 * Sunscreen domain model.
 *
 * The store holds two editable lists: applications (Spf, amount, instant)
 * and wash-offs (instant). Both are first-class stamps. The simulation log
 * is compiled from those lists; deleting a stamp rewrites the log rather
 * than appending a compensating jump.
 *
 * The instant is branded epoch-ms — not a time of day — because a stamp
 * can belong to a previous day and the day may have been spent in another
 * time zone.
 */

import { createMsSinceEpoch, createSpf, type MsSinceEpoch, type Spf } from "@/shared/domain";

export type { TimeDraft } from "@/shared/time";
export { resolveTimeDraft } from "@/shared/time";

export type ApplicationDegree = "light" | "typical" | "recommended";

export interface SunscreenSettings {
  spf: Spf;
  /** Exact instant of application (epoch ms) */
  appliedAt: MsSinceEpoch;
  degree: ApplicationDegree;
}

/** One editable application in the schedule. */
export interface SunscreenApplication {
  id: string;
  settings: SunscreenSettings;
}

/** One wash-off stamp: cream left the skin at `at`. */
export interface SunscreenRemoval {
  id: string;
  at: MsSinceEpoch;
}

/** The editable lists of apply and wash-off stamps. */
export interface SunscreenState {
  applications: SunscreenApplication[];
  removals: SunscreenRemoval[];
}

export const EMPTY_SUNSCREEN_STATE: SunscreenState = {
  applications: [],
  removals: [],
};

const APPLICATION_DEGREES: readonly ApplicationDegree[] = ["light", "typical", "recommended"];

/** Narrows untrusted persisted JSON to valid sunscreen settings, or null */
export function asSunscreenSettings(value: unknown): SunscreenSettings | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  try {
    const settings = value as { spf: unknown; appliedAt: unknown; degree: unknown };
    return {
      spf: createSpf(settings.spf as number),
      appliedAt: createMsSinceEpoch(settings.appliedAt as number),
      degree: APPLICATION_DEGREES.includes(settings.degree as ApplicationDegree)
        ? (settings.degree as ApplicationDegree)
        : "typical",
    };
  } catch {
    return null;
  }
}

function asSunscreenApplication(value: unknown): SunscreenApplication | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = value as { id?: unknown; settings?: unknown };
  if (typeof raw.id !== "string" || raw.id.length === 0) {
    return null;
  }
  const settings = asSunscreenSettings(raw.settings);
  if (!settings) {
    return null;
  }
  return { id: raw.id, settings };
}

function asSunscreenRemoval(value: unknown): SunscreenRemoval | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = value as { id?: unknown; at?: unknown };
  if (typeof raw.id !== "string" || raw.id.length === 0) {
    return null;
  }
  try {
    return { id: raw.id, at: createMsSinceEpoch(raw.at as number) };
  } catch {
    return null;
  }
}

function applicationsFromUnknown(value: unknown): SunscreenApplication[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const applications: SunscreenApplication[] = [];
  for (const entry of value) {
    const application = asSunscreenApplication(entry);
    if (application) {
      applications.push(application);
    }
  }
  return applications;
}

function removalsFromUnknown(value: unknown): SunscreenRemoval[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const removals: SunscreenRemoval[] = [];
  for (const entry of value) {
    const removal = asSunscreenRemoval(entry);
    if (removal) {
      removals.push(removal);
    }
  }
  return removals;
}

/**
 * Narrows untrusted persisted JSON. Accepts the stamp lists, and the
 * previous `{ status, settings }` shape. Corrupt entries in a list are
 * dropped; the rest of the schedule is kept. Missing `removals` is `[]`.
 */
export function asSunscreenState(value: unknown): SunscreenState | null {
  try {
    if (typeof value !== "object" || value === null) {
      return null;
    }
    if ("applications" in value) {
      return {
        applications: applicationsFromUnknown(value.applications),
        removals: removalsFromUnknown("removals" in value ? value.removals : []),
      };
    }
    if (!("status" in value)) {
      return null;
    }
    if (value.status === "notApplied") {
      return { ...EMPTY_SUNSCREEN_STATE };
    }
    if (value.status === "applied") {
      const settings = "settings" in value ? asSunscreenSettings(value.settings) : null;
      if (!settings) {
        return { ...EMPTY_SUNSCREEN_STATE };
      }
      return {
        applications: [{ id: `migrated-${settings.appliedAt}`, settings }],
        removals: [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** The application with the latest `appliedAt`, if any. */
export function latestApplication(
  applications: readonly SunscreenApplication[] | undefined,
): SunscreenApplication | undefined {
  if (!applications || applications.length === 0) {
    return undefined;
  }
  return applications.reduce((latest, entry) =>
    entry.settings.appliedAt >= latest.settings.appliedAt ? entry : latest,
  );
}
