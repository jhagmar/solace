import { describe, expect, it } from "vitest";
import { isTypedLocationQuery } from "@/features/location/searchInput";

describe("isTypedLocationQuery", () => {
  it("is true only for typing and paste", () => {
    expect(isTypedLocationQuery("input-change")).toBe(true);
    expect(isTypedLocationQuery("input-paste")).toBe(true);
  });

  it("ignores selection, clear, blur, and missing reasons", () => {
    expect(isTypedLocationQuery("item-press")).toBe(false);
    expect(isTypedLocationQuery("none")).toBe(false);
    expect(isTypedLocationQuery("input-clear")).toBe(false);
    expect(isTypedLocationQuery("clear-press")).toBe(false);
    expect(isTypedLocationQuery("input-blur")).toBe(false);
    expect(isTypedLocationQuery(undefined)).toBe(false);
  });
});
