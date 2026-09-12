import { describe, expect, it, vi } from "vitest";
import { createMsSinceEpoch, createSpf } from "@/shared/domain";
import { SunscreenController } from "./controller";
import type { SunscreenState } from "./model";

describe("SunscreenController", () => {
  const empty = (): SunscreenState => ({ applications: [], removals: [] });
  it("applies sunscreen at a resolved instant and assigns an id", () => {
    let state: SunscreenState = empty();
    const setState = vi.fn((next: SunscreenState) => {
      state = next;
    });
    const now = createMsSinceEpoch(1_700_000_000_000);
    const controller = new SunscreenController(
      () => state,
      setState,
      () => now,
    );
    const spf = createSpf(30);
    const id = controller.apply({
      spf,
      degree: "typical",
      time: { kind: "absolute", atMs: now },
    });
    expect(id).toMatch(/^s-/);
    expect(state.applications).toEqual([
      { id, settings: { spf, degree: "typical", appliedAt: now } },
    ]);
    expect(state.removals).toEqual([]);
  });

  it("adopts a reconstructed list only when empty", () => {
    let state: SunscreenState = empty();
    const controller = new SunscreenController(
      () => state,
      (next) => {
        state = next;
      },
      () => createMsSinceEpoch(0),
    );
    const adopted = {
      id: "from-log",
      settings: {
        spf: createSpf(15),
        appliedAt: createMsSinceEpoch(1000),
        degree: "light" as const,
      },
    };
    controller.adoptApplicationsIfEmpty([adopted]);
    expect(state.applications).toEqual([adopted]);
    controller.adoptApplicationsIfEmpty([{ ...adopted, id: "other" }]);
    expect(state.applications[0]?.id).toBe("from-log");
    controller.adoptRemovalsIfEmpty([{ id: "from-log-r", at: createMsSinceEpoch(2000) }]);
    expect(state.removals).toEqual([{ id: "from-log-r", at: createMsSinceEpoch(2000) }]);
    controller.adoptRemovalsIfEmpty([{ id: "other-r", at: createMsSinceEpoch(3000) }]);
    expect(state.removals[0]?.id).toBe("from-log-r");
  });

  it("updates and removes an application by id", () => {
    let state: SunscreenState = empty();
    const controller = new SunscreenController(
      () => state,
      (next) => {
        state = next;
      },
      () => createMsSinceEpoch(0),
    );
    const id = controller.apply({
      spf: createSpf(30),
      degree: "typical",
      time: { kind: "absolute", atMs: createMsSinceEpoch(1000) },
    });
    controller.update(id, {
      spf: createSpf(50),
      degree: "light",
      time: { kind: "absolute", atMs: createMsSinceEpoch(2000) },
    });
    expect(state.applications[0]?.settings.spf).toBe(50);
    const other = controller.apply({
      spf: createSpf(15),
      degree: "light",
      time: { kind: "absolute", atMs: createMsSinceEpoch(4000) },
    });
    controller.update(id, {
      spf: createSpf(50),
      degree: "light",
      time: { kind: "absolute", atMs: createMsSinceEpoch(2000) },
    });
    expect(state.applications.find((entry) => entry.id === other)?.settings.spf).toBe(15);
    controller.moveStamp(id, createMsSinceEpoch(3000));
    expect(state.applications[0]?.settings.appliedAt).toBe(3000);
    controller.remove(id);
    expect(state.applications.map((entry) => entry.id)).toEqual([other]);
  });

  it("records a wash-off without deleting applications", () => {
    let state: SunscreenState = empty();
    const controller = new SunscreenController(
      () => state,
      (next) => {
        state = next;
      },
      () => createMsSinceEpoch(0),
    );
    const applied = controller.apply({
      spf: createSpf(30),
      degree: "typical",
      time: { kind: "absolute", atMs: createMsSinceEpoch(1000) },
    });
    const washed = controller.washOff({ kind: "absolute", atMs: createMsSinceEpoch(2000) });
    expect(state.applications[0]?.id).toBe(applied);
    expect(state.removals).toEqual([{ id: washed, at: createMsSinceEpoch(2000) }]);
    controller.moveStamp(washed, createMsSinceEpoch(3000));
    expect(state.removals[0]?.at).toBe(3000);
    controller.remove(washed);
    expect(state.removals).toEqual([]);
    expect(state.applications).toHaveLength(1);
  });

  it("clear drops every stamp", () => {
    let state: SunscreenState = empty();
    const controller = new SunscreenController(
      () => state,
      (next) => {
        state = next;
      },
      () => createMsSinceEpoch(0),
    );
    controller.apply({
      spf: createSpf(30),
      degree: "typical",
      time: { kind: "absolute", atMs: createMsSinceEpoch(1000) },
    });
    controller.washOff({ kind: "absolute", atMs: createMsSinceEpoch(2000) });
    controller.clear();
    expect(state).toEqual(empty());
    controller.clear();
    expect(state).toEqual(empty());
  });

  it("updates a wash-off and ignores an unknown stamp move", () => {
    let state: SunscreenState = empty();
    const controller = new SunscreenController(
      () => state,
      (next) => {
        state = next;
      },
      () => createMsSinceEpoch(0),
    );
    const washed = controller.washOff({ kind: "absolute", atMs: createMsSinceEpoch(2000) });
    const extra = controller.washOff({ kind: "absolute", atMs: createMsSinceEpoch(2500) });
    controller.updateRemoval(washed, { kind: "absolute", atMs: createMsSinceEpoch(4000) });
    expect(state.removals.find((entry) => entry.id === washed)?.at).toBe(4000);
    expect(state.removals.find((entry) => entry.id === extra)?.at).toBe(2500);
    controller.moveStamp(washed, createMsSinceEpoch(4500));
    expect(state.removals.find((entry) => entry.id === washed)?.at).toBe(4500);
    expect(state.removals.find((entry) => entry.id === extra)?.at).toBe(2500);
    controller.moveStamp("missing", createMsSinceEpoch(5000));
    expect(state.removals.find((entry) => entry.id === washed)?.at).toBe(4500);
  });

  it("treats missing lists as empty when adopting", () => {
    let state = {} as SunscreenState;
    const controller = new SunscreenController(
      () => state,
      (next) => {
        state = next;
      },
      () => createMsSinceEpoch(0),
    );
    controller.adoptApplicationsIfEmpty([]);
    controller.adoptRemovalsIfEmpty([]);
    expect(state).toEqual({});
    controller.adoptApplicationsIfEmpty([
      {
        id: "a",
        settings: {
          spf: createSpf(15),
          appliedAt: createMsSinceEpoch(1000),
          degree: "light",
        },
      },
    ]);
    expect(state.applications).toHaveLength(1);
  });
});
