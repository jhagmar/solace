import { describe, expect, it } from "vitest";
import { asActiveLocationState } from "@/features/location/model";
import { createLocation } from "@/shared/domain";

const paris = createLocation({
  id: "paris",
  name: "Paris",
  firstAdministrativeDivision: undefined,
  countryName: undefined,
  latitude: 48.85,
  longitude: 2.35,
  timezone: "Europe/Paris",
});

describe("asActiveLocationState", () => {
  it("keeps empty and a valid set location", () => {
    expect(asActiveLocationState({ status: "empty" })).toEqual({ status: "empty" });
    expect(
      asActiveLocationState({
        status: "set",
        location: {
          id: paris.id,
          name: paris.name,
          coordinates: paris.coordinates,
          timezone: paris.timezone,
        },
      }),
    ).toEqual({ status: "set", location: paris });
  });

  it("turns an invalid set location into empty", () => {
    expect(asActiveLocationState({ status: "set", location: { id: 1 } })).toEqual({
      status: "empty",
    });
  });

  it("unwraps a search to its fallback, or empty", () => {
    expect(
      asActiveLocationState({
        status: "searching",
        fallback: {
          status: "set",
          location: {
            id: paris.id,
            name: paris.name,
            coordinates: paris.coordinates,
            timezone: paris.timezone,
          },
        },
      }),
    ).toEqual({ status: "set", location: paris });
    expect(asActiveLocationState({ status: "searching" })).toEqual({ status: "empty" });
    expect(asActiveLocationState({ status: "searching", fallback: { status: "nope" } })).toEqual({
      status: "empty",
    });
  });

  it("rejects unknown shapes", () => {
    expect(asActiveLocationState(null)).toBeNull();
    expect(asActiveLocationState({ status: "offline" })).toBeNull();
  });
});
