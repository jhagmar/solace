import { describe, expect, it } from "vitest";
import { cn } from "@/shared/ui/cn";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("foo", "baz")).toBe("foo baz");
  });

  it("ignores falsy values", () => {
    expect(cn("foo", undefined, null, false, "baz")).toBe("foo baz");
  });

  it("resolves tailwind class conflicts, keeping the last one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
