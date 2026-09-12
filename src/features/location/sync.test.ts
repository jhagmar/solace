import { describe, expect, it, vi } from "vitest";
import { createLocation, createLocationQuery } from "@/shared/domain";
import { renderHook } from "@/test/renderHook";
import { useActiveLocationStore } from "./activeStore";
import { useLocationSearch } from "./sync";

const locationSearch = vi.hoisted(() => ({
  handleSearchInput: vi.fn(),
  setLocation: vi.fn(),
  cancelSearch: vi.fn(),
  unsetLocation: vi.fn(),
}));

vi.mock("@/app/compose/location", () => ({ locationSearch }));

const paris = createLocation({
  id: "paris",
  name: "Paris",
  firstAdministrativeDivision: undefined,
  countryName: undefined,
  latitude: 48.85,
  longitude: 2.35,
  timezone: "Europe/Paris",
});

describe("useLocationSearch", () => {
  it("reads the active location and forwards actions to the machine", () => {
    useActiveLocationStore.setState({
      activeLocation: { status: "set", location: paris },
    });
    const { result, unmount } = renderHook(() => useLocationSearch());
    expect(result.current.state).toEqual({ status: "set", location: paris });

    result.current.search("par");
    expect(locationSearch.handleSearchInput).toHaveBeenCalledWith(createLocationQuery("par"));

    result.current.select(paris);
    expect(locationSearch.setLocation).toHaveBeenCalledWith(paris);

    result.current.cancel();
    expect(locationSearch.cancelSearch).toHaveBeenCalled();

    result.current.unset();
    expect(locationSearch.unsetLocation).toHaveBeenCalled();
    unmount();
  });
});
