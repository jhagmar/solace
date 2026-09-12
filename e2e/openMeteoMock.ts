import type { Page } from "@playwright/test";

const OSLO = {
  id: 3143244,
  name: "Oslo",
  latitude: 59.9139,
  longitude: 10.7522,
  feature_code: "PPLC",
  country_code: "NO",
  timezone: "Europe/Oslo",
  country: "Norway",
  admin1: "Oslo",
};

function hourlyUv(): { time: string[]; uv_index: number[] } {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 1);
  start.setUTCHours(0, 0, 0, 0);
  const time: string[] = [];
  const uv_index: number[] = [];
  for (let hour = 0; hour < 72; hour += 1) {
    const instant = new Date(start.getTime() + hour * 3_600_000);
    time.push(instant.toISOString().slice(0, 16));
    const utcHour = instant.getUTCHours();
    uv_index.push(utcHour >= 10 && utcHour <= 16 ? 6 : 0.4);
  }
  return { time, uv_index };
}

const jsonHeaders = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
};

/** Stubs Open-Meteo geocoding and UV forecast so e2e never hits the network. */
export async function mockOpenMeteo(page: Page): Promise<void> {
  // Host globs must not overlap: `api.open-meteo.com` is a substring of
  // `geocoding-api.open-meteo.com`, so a naive `/api\.open-meteo/` regex
  // would steal geocoding requests and fulfill them as forecasts.
  await page.route("https://geocoding-api.open-meteo.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: jsonHeaders,
      body: JSON.stringify({ results: [OSLO] }),
    });
  });

  const hourly = hourlyUv();
  await page.route("https://api.open-meteo.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        latitude: OSLO.latitude,
        longitude: OSLO.longitude,
        generationtime_ms: 0.1,
        utc_offset_seconds: 0,
        timezone: "GMT",
        timezone_abbreviation: "GMT",
        elevation: 1,
        hourly_units: { time: "iso8601", uv_index: "" },
        hourly,
      }),
    });
  });
}
