import { describe, expect, it } from "vitest";
import { asSunscreenState, latestApplication, resolveTimeDraft } from "@/features/sunscreen/model";
import { createMinutes, createMsSinceEpoch, createSpf } from "@/shared/domain";

const NOW = createMsSinceEpoch(Date.UTC(2026, 7, 15, 13, 20));

describe("resolveTimeDraft", () => {
  it("returns absolute drafts unchanged — the instant is already fixed", () => {
    const at = createMsSinceEpoch(Date.UTC(2026, 7, 14, 8, 45));
    expect(resolveTimeDraft({ kind: "absolute", atMs: at }, NOW)).toBe(at);
  });

  it("resolves relative intents against the given instant", () => {
    expect(resolveTimeDraft({ kind: "relative", offset: createMinutes(0) }, NOW)).toBe(NOW);
    expect(resolveTimeDraft({ kind: "relative", offset: createMinutes(30) }, NOW)).toBe(
      Date.UTC(2026, 7, 15, 12, 50),
    );
    expect(resolveTimeDraft({ kind: "relative", offset: createMinutes(60) }, NOW)).toBe(
      Date.UTC(2026, 7, 15, 12, 20),
    );
  });

  it("crosses midnight into yesterday instead of clamping", () => {
    const justAfterMidnight = createMsSinceEpoch(Date.UTC(2026, 7, 15, 0, 15));
    expect(
      resolveTimeDraft({ kind: "relative", offset: createMinutes(60) }, justAfterMidnight),
    ).toBe(Date.UTC(2026, 7, 14, 23, 15));
  });
});

describe("asSunscreenState", () => {
  it("accepts an application list", () => {
    const appliedAt = Date.UTC(2026, 7, 15, 8, 45);
    expect(
      asSunscreenState({
        applications: [{ id: "a", settings: { spf: 30, appliedAt, degree: "light" } }],
      }),
    ).toEqual({
      applications: [
        {
          id: "a",
          settings: {
            spf: createSpf(30),
            appliedAt: createMsSinceEpoch(appliedAt),
            degree: "light",
          },
        },
      ],
      removals: [],
    });
  });

  it("migrates a notApplied state to an empty list", () => {
    expect(asSunscreenState({ status: "notApplied" })).toEqual({ applications: [], removals: [] });
  });

  it("migrates a valid applied state and brands its fields", () => {
    const appliedAt = Date.UTC(2026, 7, 15, 8, 45);
    const state = asSunscreenState({
      status: "applied",
      settings: { spf: 30, appliedAt, degree: "light" },
    });
    expect(state?.applications).toHaveLength(1);
    expect(state?.applications[0]?.settings).toEqual({
      spf: createSpf(30),
      appliedAt: createMsSinceEpoch(appliedAt),
      degree: "light",
    });
    expect(state?.removals).toEqual([]);
  });

  it("defaults an unknown degree to typical", () => {
    const state = asSunscreenState({
      status: "applied",
      settings: { spf: 30, appliedAt: 1000, degree: "generous" },
    });
    expect(state?.applications[0]?.settings.degree).toBe("typical");
  });

  it("drops corrupt applications and keeps the rest of the list", () => {
    const appliedAt = Date.UTC(2026, 7, 15, 8, 45);
    expect(
      asSunscreenState({
        applications: [
          { id: "a", settings: { spf: 30, appliedAt, degree: "light" } },
          { id: "bad", settings: { spf: "lots", appliedAt: 1000 } },
        ],
      }),
    ).toEqual({
      applications: [
        {
          id: "a",
          settings: {
            spf: createSpf(30),
            appliedAt: createMsSinceEpoch(appliedAt),
            degree: "light",
          },
        },
      ],
      removals: [],
    });
  });

  it("rejects non-objects and unknown statuses; invalid applied settings become empty", () => {
    expect(asSunscreenState(null)).toBeNull();
    expect(asSunscreenState("applied")).toBeNull();
    expect(asSunscreenState({ status: "sometimes" })).toBeNull();
    expect(asSunscreenState({ status: "applied" })).toEqual({ applications: [], removals: [] });
    expect(
      asSunscreenState({ status: "applied", settings: { spf: "lots", appliedAt: 1000 } }),
    ).toEqual({ applications: [], removals: [] });
    expect(asSunscreenState({ status: "applied", settings: { spf: 30, appliedAt: -1 } })).toEqual({
      applications: [],
      removals: [],
    });
    expect(asSunscreenState({ foo: 1 })).toBeNull();
    expect(asSunscreenState({ applications: { id: "a" } })).toEqual({
      applications: [],
      removals: [],
    });
    expect(
      asSunscreenState({
        applications: [null, { id: "", settings: { spf: 30, appliedAt: 1000, degree: "light" } }],
      }),
    ).toEqual({ applications: [], removals: [] });
    expect(
      asSunscreenState({
        applications: [{ id: "a", settings: null }],
      }),
    ).toEqual({ applications: [], removals: [] });
    expect(
      asSunscreenState({
        applications: [{ id: "a", settings: { spf: 30, appliedAt: 1000 } }],
      }),
    ).toEqual({
      applications: [
        {
          id: "a",
          settings: {
            spf: createSpf(30),
            appliedAt: createMsSinceEpoch(1000),
            degree: "typical",
          },
        },
      ],
      removals: [],
    });
  });
});

describe("latestApplication", () => {
  it("returns the application with the latest appliedAt", () => {
    const a = {
      id: "a",
      settings: {
        spf: createSpf(15),
        appliedAt: createMsSinceEpoch(1000),
        degree: "light" as const,
      },
    };
    const b = {
      id: "b",
      settings: {
        spf: createSpf(30),
        appliedAt: createMsSinceEpoch(2000),
        degree: "typical" as const,
      },
    };
    expect(latestApplication([a, b])?.id).toBe("b");
    expect(latestApplication([b, a])?.id).toBe("b");
    expect(latestApplication([])).toBeUndefined();
    expect(latestApplication(undefined)).toBeUndefined();
  });
});

describe("asSunscreenState removals", () => {
  it("keeps valid wash-offs and drops corrupt ones", () => {
    expect(
      asSunscreenState({
        applications: [],
        removals: [{ id: "r", at: 1_000 }, { id: "bad" }],
      }),
    ).toEqual({
      applications: [],
      removals: [{ id: "r", at: createMsSinceEpoch(1_000) }],
    });
    expect(asSunscreenState({ applications: [], removals: null })).toEqual({
      applications: [],
      removals: [],
    });
    expect(
      asSunscreenState({
        applications: [],
        removals: [null, { id: "", at: 1 }, { id: "x", at: -1 }],
      }),
    ).toEqual({ applications: [], removals: [] });
  });

  it("fails closed when reading status throws", () => {
    expect(
      asSunscreenState({
        get status() {
          throw new Error("corrupt");
        },
      }),
    ).toBeNull();
  });
});
