import { act } from "react";
import { describe, expect, it } from "vitest";
import { createLocation } from "@/shared/domain";
import { renderHook } from "@/test/renderHook";
import { useActiveLocationStore } from "./activeStore";
import { useEffectiveLocation } from "./useEffectiveLocation";

const paris = createLocation({
  id: "paris",
  name: "Paris",
  firstAdministrativeDivision: undefined,
  countryName: undefined,
  latitude: 48.85,
  longitude: 2.35,
  timezone: "Europe/Paris",
});

describe("useEffectiveLocation", () => {
  it("follows set, searching fallback, and empty", () => {
    useActiveLocationStore.setState({ activeLocation: { status: "empty" } });
    const { result, unmount } = renderHook(() => useEffectiveLocation());
    expect(result.current).toBeNull();

    act(() => {
      useActiveLocationStore.setState({
        activeLocation: { status: "set", location: paris },
      });
    });
    expect(result.current).toEqual(paris);

    act(() => {
      useActiveLocationStore.setState({
        activeLocation: {
          status: "searching",
          remoteSearchState: { status: "paused" },
          fallback: { status: "set", location: paris },
        },
      });
    });
    expect(result.current).toEqual(paris);

    act(() => {
      useActiveLocationStore.setState({
        activeLocation: {
          status: "searching",
          remoteSearchState: { status: "paused" },
          fallback: { status: "empty" },
        },
      });
    });
    expect(result.current).toBeNull();
    unmount();
  });
});
