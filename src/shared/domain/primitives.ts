/**
 * Branded primitives. Values that carry domain meaning (durations, timestamps,
 * UV index, SPF) are branded so TypeScript will not mix them at compile time.
 * They are only constructible through the `create*` constructors, which
 * validate input.
 */

declare const brand: unique symbol;
/** Brands a primitive so it cannot be mixed with a bare `number` / `string`. */
export type Brand<T, TBrand> = T & { readonly [brand]: TBrand };

/** Duration in milliseconds (never unitless). */
export type Milliseconds = Brand<number, "Milliseconds">;
export type Seconds = Brand<number, "Seconds">;
export type Minutes = Brand<number, "Minutes">;
/** Instant as milliseconds since the Unix epoch. */
export type MsSinceEpoch = Brand<number, "MsSinceEpoch">;
export type UvIndex = Brand<number, "UvIndex">;
export type Latitude = Brand<number, "Latitude">;
export type Longitude = Brand<number, "Longitude">;
/** Sun protection factor of a sunscreen product. */
export type Spf = Brand<number, "Spf">;
/** Remaining erythemal load related to SED — not CIE cumulative SED. */
export type ErythemaLoad = Brand<number, "ErythemaLoad">;
/** IANA time zone name (e.g. "Europe/Stockholm"). */
export type TimeZone = Brand<string, "TimeZone">;

export function createMilliseconds(ms: number): Milliseconds {
  if (ms < 0.0) {
    throw new Error(`Invalid duration: ${ms}. Must be greater than or equal to zero.`);
  }
  return ms as Milliseconds;
}

export function createSeconds(value: number): Seconds {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid seconds: ${value}. Must be a finite number.`);
  }
  return value as Seconds;
}

export function createMinutes(value: number): Minutes {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid minutes: ${value}. Must be a finite, non-negative number.`);
  }
  return value as Minutes;
}

export function createMsSinceEpoch(value: number): MsSinceEpoch {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid timestamp: ${value}. Must be a finite, non-negative number.`);
  }
  return value as MsSinceEpoch;
}

export function createUvIndex(value: number): UvIndex {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid UV index: ${value}. Must be a finite, non-negative number.`);
  }
  return value as UvIndex;
}

export function createSpf(value: number): Spf {
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`Invalid SPF: ${value}. Must be a finite number greater than or equal to 1.`);
  }
  return value as Spf;
}

export function createErythemaLoad(value: number): ErythemaLoad {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid erythema load: ${value}. Must be a finite, non-negative number.`);
  }
  return value as ErythemaLoad;
}

export function createTimeZone(value: string): TimeZone {
  try {
    // Throws RangeError for names the browser's IANA database doesn't know
    new Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    throw new Error(`Invalid time zone: "${value}". Must be an IANA time zone name.`);
  }
  return value as TimeZone;
}

/** Narrows untrusted data (geocoding, persisted JSON) to a valid time zone, or null. */
export function asTimeZone(value: unknown): TimeZone | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    return createTimeZone(value);
  } catch {
    return null;
  }
}

export function createLatitude(val: number): Latitude {
  if (!Number.isFinite(val) || val < -90 || val > 90) {
    throw new Error(`Invalid latitude: ${val}. Must be between -90 and 90.`);
  }
  return val as Latitude;
}

export function createLongitude(val: number): Longitude {
  if (!Number.isFinite(val) || val < -180 || val > 180) {
    throw new Error(`Invalid longitude: ${val}. Must be between -180 and 180.`);
  }
  return val as Longitude;
}
