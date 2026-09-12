import { describe, expect, it } from "vitest";
import { createLatitude, createLongitude } from "@/shared/domain";
import { openMeteoUvUrl } from "@/shared/platform/open-meteo/uvUrl";

describe("openMeteoUvUrl", () => {
  it("maps coordinates and an inclusive UTC date range onto the Open-Meteo forecast URL", () => {
    expect(
      openMeteoUvUrl({
        coordinates: { latitude: createLatitude(52.52), longitude: createLongitude(13.41) },
        startDate: "2026-08-22",
        endDate: "2026-08-24",
      }),
    ).toBe(
      "https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&hourly=uv_index&timezone=GMT&start_date=2026-08-22&end_date=2026-08-24",
    );
  });

  it("URI-encodes coordinates and dates", () => {
    const url = openMeteoUvUrl({
      coordinates: { latitude: createLatitude(-33.87), longitude: createLongitude(151.21) },
      startDate: "2026-08-01",
      endDate: "2026-08-14",
    });
    expect(url).toContain("latitude=-33.87");
    expect(url).toContain("longitude=151.21");
    expect(url).toContain("start_date=2026-08-01");
    expect(url).toContain("end_date=2026-08-14");
    expect(url).toContain("timezone=GMT");
  });
});
