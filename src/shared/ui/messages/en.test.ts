import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, formatMessage, messages } from "./en";

describe("formatMessage", () => {
  it("interpolates named placeholders", () => {
    expect(formatMessage("Search failed: {reason}", { reason: "timeout" })).toBe(
      "Search failed: timeout",
    );
  });

  it("replaces a missing placeholder with an empty string", () => {
    expect(formatMessage("Hello {name}", {})).toBe("Hello ");
  });
});

describe("default catalog", () => {
  it("matches the static HTML footer beats", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8").replace(/\s+/g, " ");
    expect(html).toContain(`lang="${DEFAULT_LOCALE}"`);
    expect(html).toContain("Open-Meteo");
    expect(html).toContain(messages.footer.medical);
    expect(html).toContain(messages.footer.offline);
    expect(html).toContain('href="https://github.com/jhagmar/solace"');
  });
});
