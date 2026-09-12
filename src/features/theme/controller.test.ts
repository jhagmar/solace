import { describe, expect, it, vi } from "vitest";
import { ThemeController } from "./controller";

describe("ThemeController", () => {
  it("writes the chosen preference", () => {
    const setState = vi.fn();
    const controller = new ThemeController(setState);
    controller.setPreference("dark");
    expect(setState).toHaveBeenCalledWith("dark");
  });
});
