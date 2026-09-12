import { describe, expect, it } from "vitest";
import {
  asLocation,
  asTimeZone,
  createCoordinates,
  createErythemaLoad,
  createLatitude,
  createLocation,
  createLocationDisplayString,
  createLocationId,
  createLocationName,
  createLocationQuery,
  createLongitude,
  createMilliseconds,
  createMinutes,
  createMsSinceEpoch,
  createSeconds,
  createSpf,
  createTimeZone,
  createUvIndex,
  filterLocationsByDisplayString,
} from "@/shared/domain";

describe("Domain Types", () => {
  it("createMilliseconds creates valid duration", () => {
    expect(createMilliseconds(100)).toBe(100);
    expect(() => createMilliseconds(-1)).toThrow(
      "Invalid duration: -1. Must be greater than or equal to zero.",
    );
  });

  it("createSeconds creates valid seconds", () => {
    expect(createSeconds(7200)).toBe(7200);
    // Negative offsets are valid (e.g. UTC-4)
    expect(createSeconds(-14400)).toBe(-14400);
    expect(() => createSeconds(Number.NaN)).toThrow(
      "Invalid seconds: NaN. Must be a finite number.",
    );
    expect(() => createSeconds(Number.POSITIVE_INFINITY)).toThrow(
      "Invalid seconds: Infinity. Must be a finite number.",
    );
  });

  it("createMinutes creates valid minute counts", () => {
    expect(createMinutes(0)).toBe(0);
    expect(createMinutes(90)).toBe(90);
    expect(() => createMinutes(-1)).toThrow(
      "Invalid minutes: -1. Must be a finite, non-negative number.",
    );
    expect(() => createMinutes(Number.NaN)).toThrow(
      "Invalid minutes: NaN. Must be a finite, non-negative number.",
    );
  });

  it("createMsSinceEpoch creates valid timestamps", () => {
    expect(createMsSinceEpoch(0)).toBe(0);
    expect(createMsSinceEpoch(1755000000000)).toBe(1755000000000);
    expect(() => createMsSinceEpoch(-1)).toThrow(
      "Invalid timestamp: -1. Must be a finite, non-negative number.",
    );
    expect(() => createMsSinceEpoch(Number.NaN)).toThrow(
      "Invalid timestamp: NaN. Must be a finite, non-negative number.",
    );
  });

  it("createUvIndex creates valid UV index values", () => {
    expect(createUvIndex(0)).toBe(0);
    expect(createUvIndex(6.4)).toBe(6.4);
    expect(() => createUvIndex(-0.1)).toThrow(
      "Invalid UV index: -0.1. Must be a finite, non-negative number.",
    );
    expect(() => createUvIndex(Number.NaN)).toThrow(
      "Invalid UV index: NaN. Must be a finite, non-negative number.",
    );
  });

  it("createSpf creates valid Spf values", () => {
    expect(createSpf(1)).toBe(1);
    expect(createSpf(50)).toBe(50);
    expect(() => createSpf(0)).toThrow(
      "Invalid SPF: 0. Must be a finite number greater than or equal to 1.",
    );
    expect(() => createSpf(Number.NaN)).toThrow(
      "Invalid SPF: NaN. Must be a finite number greater than or equal to 1.",
    );
  });

  it("createErythemaLoad creates valid loads", () => {
    expect(createErythemaLoad(0)).toBe(0);
    expect(createErythemaLoad(2.5)).toBe(2.5);
    expect(() => createErythemaLoad(-0.1)).toThrow(
      "Invalid erythema load: -0.1. Must be a finite, non-negative number.",
    );
    expect(() => createErythemaLoad(Number.NaN)).toThrow(
      "Invalid erythema load: NaN. Must be a finite, non-negative number.",
    );
  });

  it("createTimeZone accepts IANA names and rejects garbage", () => {
    expect(createTimeZone("Europe/Stockholm")).toBe("Europe/Stockholm");
    expect(createTimeZone("UTC")).toBe("UTC");
    expect(() => createTimeZone("Not/AZone")).toThrow(
      'Invalid time zone: "Not/AZone". Must be an IANA time zone name.',
    );
  });

  it("asTimeZone narrows untrusted input without throwing", () => {
    expect(asTimeZone("Europe/Stockholm")).toBe("Europe/Stockholm");
    expect(asTimeZone("Not/AZone")).toBeNull();
    expect(asTimeZone(undefined)).toBeNull();
    expect(asTimeZone(42)).toBeNull();
  });

  it("createLatitude creates valid latitude", () => {
    expect(createLatitude(90)).toBe(90);
    expect(createLatitude(-90)).toBe(-90);
    expect(() => createLatitude(91)).toThrow("Invalid latitude: 91. Must be between -90 and 90.");
    expect(() => createLatitude(-91)).toThrow("Invalid latitude: -91. Must be between -90 and 90.");
    expect(() => createLatitude(Number.NaN)).toThrow("Invalid latitude");
    expect(() => createLatitude(Number.POSITIVE_INFINITY)).toThrow("Invalid latitude");
  });

  it("createLongitude creates valid longitude", () => {
    expect(createLongitude(180)).toBe(180);
    expect(createLongitude(-180)).toBe(-180);
    expect(() => createLongitude(181)).toThrow(
      "Invalid longitude: 181. Must be between -180 and 180.",
    );
    expect(() => createLongitude(-181)).toThrow(
      "Invalid longitude: -181. Must be between -180 and 180.",
    );
  });

  it("createLocationQuery trims the query", () => {
    const query = createLocationQuery("  Stockholm  ");
    expect(query.name).toBe("Stockholm");
  });

  it("createLocationId creates string id", () => {
    expect(createLocationId(123)).toBe("123");
    expect(createLocationId("456")).toBe("456");
  });

  it("createLocationName creates location name", () => {
    expect(createLocationName("Stockholm")).toBe("Stockholm");
  });

  it("createCoordinates creates geolocation", () => {
    const geo = createCoordinates(59.32, 18.06);
    expect(geo.latitude).toBe(59.32);
    expect(geo.longitude).toBe(18.06);
  });

  it("createLocation creates a fully branded location", () => {
    const location = createLocation({
      id: 2673730,
      name: "Stockholm",
      firstAdministrativeDivision: "Stockholm County",
      countryName: "Sweden",
      latitude: 59.32,
      longitude: 18.06,
      timezone: "Europe/Stockholm",
    });
    expect(location.id).toBe("2673730");
    expect(location.name).toBe("Stockholm");
    expect(location.firstAdministrativeDivision).toBe("Stockholm County");
    expect(location.countryName).toBe("Sweden");
    expect(location.coordinates.latitude).toBe(59.32);
    expect(location.coordinates.longitude).toBe(18.06);
    expect(location.timezone).toBe("Europe/Stockholm");
  });

  it("createLocation narrows a missing or invalid timezone to null instead of throwing", () => {
    const base = {
      id: 1,
      name: "Nowhere",
      firstAdministrativeDivision: undefined,
      countryName: undefined,
      latitude: 1,
      longitude: 2,
    };
    expect(createLocation({ ...base, timezone: undefined }).timezone).toBeNull();
    expect(createLocation({ ...base, timezone: "Not/AZone" }).timezone).toBeNull();
  });

  it("createLocation normalizes missing or empty optional fields to undefined", () => {
    const location = createLocation({
      id: 1,
      name: "Nowhere",
      firstAdministrativeDivision: "",
      countryName: undefined,
      latitude: 1,
      longitude: 2,
      timezone: undefined,
    });
    expect(location.firstAdministrativeDivision).toBeUndefined();
    expect(location.countryName).toBeUndefined();
  });

  it("createLocation validates coordinates", () => {
    expect(() =>
      createLocation({
        id: 1,
        name: "Nowhere",
        firstAdministrativeDivision: undefined,
        countryName: undefined,
        latitude: 91,
        longitude: 0,
        timezone: undefined,
      }),
    ).toThrow("Invalid latitude: 91. Must be between -90 and 90.");
  });

  it("createLocationDisplayString joins all available parts", () => {
    const full = createLocation({
      id: 1,
      name: "Stockholm",
      firstAdministrativeDivision: "Stockholm County",
      countryName: "Sweden",
      latitude: 59.32,
      longitude: 18.06,
      timezone: undefined,
    });
    expect(createLocationDisplayString(full)).toBe("Stockholm, Stockholm County, Sweden");

    const withoutAdmin = createLocation({
      id: 2,
      name: "Stockholm",
      firstAdministrativeDivision: undefined,
      countryName: "Sweden",
      latitude: 59.32,
      longitude: 18.06,
      timezone: undefined,
    });
    expect(createLocationDisplayString(withoutAdmin)).toBe("Stockholm, Sweden");

    const nameOnly = createLocation({
      id: 3,
      name: "Stockholm",
      firstAdministrativeDivision: undefined,
      countryName: undefined,
      latitude: 59.32,
      longitude: 18.06,
      timezone: undefined,
    });
    expect(createLocationDisplayString(nameOnly)).toBe("Stockholm");

    const repeatedRegion = createLocation({
      id: 4,
      name: "Oslo",
      firstAdministrativeDivision: "Oslo",
      countryName: "Norway",
      latitude: 59.91,
      longitude: 10.75,
      timezone: undefined,
    });
    expect(createLocationDisplayString(repeatedRegion)).toBe("Oslo, Norway");
  });

  it("filterLocationsByDisplayString matches case-insensitively against the display string", () => {
    const locations = [
      createLocation({
        id: 1,
        name: "Stockholm",
        firstAdministrativeDivision: "Stockholm County",
        countryName: "Sweden",
        latitude: 59.32,
        longitude: 18.06,
        timezone: undefined,
      }),
      createLocation({
        id: 2,
        name: "Oslo",
        firstAdministrativeDivision: undefined,
        countryName: "Norway",
        latitude: 59.91,
        longitude: 10.75,
        timezone: undefined,
      }),
    ];

    // Empty query returns everything
    expect(filterLocationsByDisplayString(locations, "")).toEqual(locations);
    expect(filterLocationsByDisplayString(locations, "   ")).toEqual(locations);

    // Matches name, administrative division, and country
    expect(filterLocationsByDisplayString(locations, "stock")).toEqual([locations[0]]);
    expect(filterLocationsByDisplayString(locations, "COUNTY")).toEqual([locations[0]]);
    expect(filterLocationsByDisplayString(locations, "norway")).toEqual([locations[1]]);

    // No match returns empty
    expect(filterLocationsByDisplayString(locations, "berlin")).toEqual([]);
  });

  it("asLocation accepts coordinates and rejects values without a lat/lon pair", () => {
    const stockholm = {
      id: "2673730",
      name: "Stockholm",
      firstAdministrativeDivision: "Stockholm County",
      countryName: "Sweden",
      coordinates: { latitude: 59.33, longitude: 18.07 },
      timezone: "Europe/Stockholm",
    };
    expect(asLocation(stockholm)).toEqual(
      createLocation({
        id: "2673730",
        name: "Stockholm",
        firstAdministrativeDivision: "Stockholm County",
        countryName: "Sweden",
        latitude: 59.33,
        longitude: 18.07,
        timezone: "Europe/Stockholm",
      }),
    );
    expect(asLocation({ id: "a", name: "Nowhere" })).toBeNull();
    expect(
      asLocation({ ...stockholm, coordinates: { latitude: Number.NaN, longitude: 0 } }),
    ).toBeNull();
    expect(asLocation(null)).toBeNull();
  });
});
