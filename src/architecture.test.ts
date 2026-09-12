/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(path));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

function importedModules(source: string): string[] {
  const found: string[] = [];
  const re = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    found.push(match[1]);
  }
  return found;
}

function isTest(file: string): boolean {
  return /\.test\.(ts|tsx)$/.test(file);
}

const APP_CONSTRUCTORS =
  /\bnew\s+(LocationSearchStateMachine|ForecastStateMachine|SimulationStateMachine|ExposureStateMachine|SunscreenController|SkinToneController|ThemeController)\b/;

describe("architecture", () => {
  const files = walk(SRC);

  it("keeps shared/domain and shared/time free of app, features, React, and Zustand", () => {
    const banned = /zustand|from ["']react|from ["']@\/features|from ["']@\/app/;
    for (const file of files) {
      const rel = relative(SRC, file).replaceAll("\\", "/");
      if (!rel.startsWith("shared/domain/") && !rel.startsWith("shared/time/")) {
        continue;
      }
      if (isTest(file)) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      expect(source, rel).not.toMatch(banned);
    }
  });

  it("limits shared/platform @/ imports to shared/domain", () => {
    for (const file of files) {
      const rel = relative(SRC, file).replaceAll("\\", "/");
      if (!rel.startsWith("shared/platform/") || isTest(file)) {
        continue;
      }
      for (const spec of importedModules(readFileSync(file, "utf8"))) {
        if (spec.startsWith("@/") && !spec.startsWith("@/shared/domain")) {
          expect.fail(`${rel} imports ${spec}`);
        }
      }
    }
  });

  it("keeps shared/ui free of features and app", () => {
    for (const file of files) {
      const rel = relative(SRC, file).replaceAll("\\", "/");
      if (!rel.startsWith("shared/ui/") || isTest(file)) {
        continue;
      }
      for (const spec of importedModules(readFileSync(file, "utf8"))) {
        if (spec.startsWith("@/features") || spec.startsWith("@/app")) {
          expect.fail(`${rel} imports ${spec}`);
        }
      }
    }
  });

  it("routes cross-feature imports in features through public barrels", () => {
    for (const file of files) {
      const rel = relative(SRC, file).replaceAll("\\", "/");
      if (!rel.startsWith("features/") || isTest(file) || rel.endsWith("/index.ts")) {
        continue;
      }
      const current = rel.split("/")[1];
      for (const spec of importedModules(readFileSync(file, "utf8"))) {
        const match = spec.match(/^@\/features\/([^/]+)(?:\/(.*))?$/);
        if (!match) {
          continue;
        }
        const [, feature, rest] = match;
        if (feature === current) {
          continue;
        }
        if (rest && rest !== "index") {
          expect.fail(`${rel} imports ${spec}; use @/features/${feature}`);
        }
      }
    }
  });

  it("keeps UI and routes from importing ODE internals or writing stores", () => {
    for (const file of files) {
      const rel = relative(SRC, file).replaceAll("\\", "/");
      if (!/\/ui\//.test(rel) && !rel.startsWith("app/routes/")) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      for (const spec of importedModules(source)) {
        if (spec.includes("/ode/") || /\/(machine|controller)$/.test(spec)) {
          expect.fail(`${rel} imports ${spec}`);
        }
      }
      expect(source, rel).not.toMatch(/use\w+Store\.getState/);
      expect(source, rel).not.toMatch(/\.setState\s*\(/);
      expect(source, rel).not.toMatch(/\bsetSunscreenState\b/);
      expect(source, rel).not.toMatch(/\bsetThemePreference\b/);
      expect(source, rel).not.toMatch(/\bsetExposureState\b/);
    }
  });

  it("constructs application machines and controllers only in app/compose", () => {
    let composeHasConstructors = false;
    for (const file of files) {
      const rel = relative(SRC, file).replaceAll("\\", "/");
      if (isTest(file)) {
        continue;
      }
      const isCompose = rel === "app/compose.ts" || rel.startsWith("app/compose/");
      const source = readFileSync(file, "utf8");
      if (isCompose) {
        if (APP_CONSTRUCTORS.test(source)) {
          composeHasConstructors = true;
        }
        continue;
      }
      expect(source, rel).not.toMatch(APP_CONSTRUCTORS);
    }
    expect(composeHasConstructors).toBe(true);
  });

  it("keeps Date.now, setTimeout, and fetch in platform adapters", () => {
    const banned =
      /\bDate\.now\s*\(|\bfetch\s*\(|\b(?:window\.)?setTimeout\s*\(|\bsetInterval\s*\(/;
    for (const file of files) {
      const rel = relative(SRC, file).replaceAll("\\", "/");
      if (isTest(file)) {
        continue;
      }
      if (rel === "shared/platform/clock.ts" || rel === "shared/platform/http.ts") {
        continue;
      }
      const source = readFileSync(file, "utf8");
      expect(source, rel).not.toMatch(banned);
    }
  });
});
