import { describe, expect, it } from "vitest";

import { pointAtRouteMile, truckPositionAtTime } from "./truckPosition";

const ends = {
  origin: { lat: 0, lng: 0 },
  destination: { lat: 10, lng: 10 },
};

describe("truckPositionAtTime", () => {
  it("returns halfway coordinates between two checkpoints (lat/lng fallback)", () => {
    const checkpoints = [
      { lat: 0, lng: 0, mile: 0, eta_utc: "2026-10-12T12:00:00Z" },
      { lat: 2, lng: 4, mile: 100, eta_utc: "2026-10-12T14:00:00Z" },
    ];
    const mid = Date.parse("2026-10-12T13:00:00Z");
    const pos = truckPositionAtTime(checkpoints, ends, mid);
    expect(pos).toEqual({ lat: 1, lng: 2 });
  });

  it("returns origin before departure", () => {
    const checkpoints = [
      { lat: 1, lng: 1, mile: 0, eta_utc: "2026-10-12T12:00:00Z" },
      { lat: 2, lng: 2, mile: 10, eta_utc: "2026-10-12T14:00:00Z" },
    ];
    const pos = truckPositionAtTime(
      checkpoints,
      ends,
      Date.parse("2026-10-12T11:00:00Z"),
    );
    expect(pos).toEqual(ends.origin);
  });

  it("returns destination after arrival", () => {
    const checkpoints = [
      { lat: 1, lng: 1, mile: 0, eta_utc: "2026-10-12T12:00:00Z" },
      { lat: 2, lng: 2, mile: 10, eta_utc: "2026-10-12T14:00:00Z" },
    ];
    const pos = truckPositionAtTime(
      checkpoints,
      ends,
      Date.parse("2026-10-12T15:00:00Z"),
    );
    expect(pos).toEqual(ends.destination);
  });

  it("places the truck on the route geometry at the interpolated mile", () => {
    // Horizontal line 0→1 deg lng at lat 0 (~69 mi); treat distance_mi = turf length.
    const coordinates: [number, number][] = [
      [0, 0],
      [1, 0],
    ];
    const checkpoints = [
      { lat: 0, lng: 0, mile: 0, eta_utc: "2026-10-12T12:00:00Z" },
      { lat: 0, lng: 1, mile: 69.1, eta_utc: "2026-10-12T14:00:00Z" },
    ];
    const mid = Date.parse("2026-10-12T13:00:00Z");
    const pos = truckPositionAtTime(checkpoints, ends, mid, {
      coordinates,
      distance_mi: 69.1,
    });
    expect(pos).not.toBeNull();
    expect(pos!.lat).toBeCloseTo(0, 5);
    expect(pos!.lng).toBeCloseTo(0.5, 1);
  });
});

describe("pointAtRouteMile", () => {
  it("returns the start at mile 0", () => {
    const pos = pointAtRouteMile(
      [
        [-90, 30],
        [-89, 30],
      ],
      0,
    );
    expect(pos).toEqual({ lng: -90, lat: 30 });
  });
});
