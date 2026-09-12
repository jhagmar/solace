/**
 * Place on Earth: identity, name, coordinates, IANA zone.
 * Lat/lon is {@link Coordinates} — not the browser Geolocation API.
 */

import {
  asTimeZone,
  type Brand,
  createLatitude,
  createLongitude,
  type Latitude,
  type Longitude,
  type TimeZone,
} from "./primitives";

export type LocationId = Brand<string, "LocationId">;
export type LocationName = Brand<string, "LocationName">;
export type FirstAdministrativeDivision = Brand<string, "FirstAdministrativeDivision">;
export type CountryName = Brand<string, "CountryName">;

/** Branded search query. Only constructible via {@link createLocationQuery}. */
export type LocationQuery = Brand<{ name: string }, "LocationQuery">;

export type Coordinates = {
  latitude: Latitude;
  longitude: Longitude;
};

export type Location = {
  id: LocationId;
  name: LocationName;
  firstAdministrativeDivision: FirstAdministrativeDivision | undefined;
  countryName: CountryName | undefined;
  coordinates: Coordinates;
  /** IANA time zone; null when geocoding did not report one */
  timezone: TimeZone | null;
};

export function createLocationQuery(name: string): LocationQuery {
  return { name: name.trim() } as LocationQuery;
}

export function createLocation(value: {
  id: string | number;
  name: string;
  firstAdministrativeDivision: string | undefined;
  countryName: string | undefined;
  latitude: number;
  longitude: number;
  timezone: string | undefined;
}): Location {
  return {
    id: createLocationId(value.id),
    name: createLocationName(value.name),
    firstAdministrativeDivision: value.firstAdministrativeDivision
      ? createFirstAdministrativeDivision(value.firstAdministrativeDivision)
      : undefined,
    countryName: value.countryName ? createCountryName(value.countryName) : undefined,
    coordinates: createCoordinates(value.latitude, value.longitude),
    // An invalid zone must not sink an otherwise valid location
    timezone: value.timezone ? asTimeZone(value.timezone) : null,
  };
}

export function createLocationId(val: string | number): LocationId {
  return String(val) as LocationId;
}

export function createLocationName(val: string): LocationName {
  return val as LocationName;
}

export function createFirstAdministrativeDivision(val: string): FirstAdministrativeDivision {
  return val as FirstAdministrativeDivision;
}

export function createCountryName(val: string): CountryName {
  return val as CountryName;
}

export function createCoordinates(lat: number, lon: number): Coordinates {
  return {
    latitude: createLatitude(lat),
    longitude: createLongitude(lon),
  };
}

/** Narrows untrusted persisted JSON to a valid location, or null. */
export function asLocation(value: unknown): Location | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  try {
    const raw = value as {
      id: string | number;
      name: string;
      firstAdministrativeDivision: string | undefined;
      countryName: string | undefined;
      coordinates?: { latitude: number; longitude: number };
      geolocation?: { latitude: number; longitude: number };
      timezone: string | null;
    };
    const pair = raw.coordinates ?? raw.geolocation;
    if (!pair) {
      return null;
    }
    return createLocation({
      id: raw.id,
      name: raw.name,
      firstAdministrativeDivision: raw.firstAdministrativeDivision,
      countryName: raw.countryName,
      latitude: pair.latitude,
      longitude: pair.longitude,
      timezone: raw.timezone ?? undefined,
    });
  } catch {
    return null;
  }
}

/** Human-readable line, e.g. "Stockholm, Stockholm County, Sweden". */
export function createLocationDisplayString(location: Location): string {
  const parts = [location.name, location.firstAdministrativeDivision, location.countryName];
  const unique: string[] = [];
  for (const part of parts) {
    if (part === undefined || part.length === 0) {
      continue;
    }
    const previous = unique[unique.length - 1];
    if (previous !== undefined && previous.toLowerCase() === part.toLowerCase()) {
      continue;
    }
    unique.push(part);
  }
  return unique.join(", ");
}

/**
 * Case-insensitive substring match against the display string.
 * An empty (or whitespace-only) query returns all locations.
 */
export function filterLocationsByDisplayString(locations: Location[], query: string): Location[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return locations;
  }
  return locations.filter((location) =>
    createLocationDisplayString(location).toLowerCase().includes(normalizedQuery),
  );
}
