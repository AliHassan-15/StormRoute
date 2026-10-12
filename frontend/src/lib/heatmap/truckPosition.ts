/**
 * Truck marker position along the selected route at heatmap slider time.
 * Interpolates by checkpoint ETA, then places the truck on the route geometry
 * (falls back to straight lat/lng lerp if geometry is unavailable).
 */

import length from "@turf/length";
import { lineString } from "@turf/helpers";
import lineSliceAlong from "@turf/line-slice-along";

export interface TruckCheckpoint {
  lat: number;
  lng: number;
  mile: number;
  eta_utc: string;
}

export interface TruckRouteEnds {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
}

export interface LngLat {
  lng: number;
  lat: number;
}

export interface TruckAlongOptions {
  /** Route LineString coordinates [lng, lat]. */
  coordinates?: [number, number][];
  /** API route distance in miles — used to scale Turf length. */
  distance_mi?: number;
}

function parseUtcMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

/** Point at `mile` along a LineString. Units: miles / WGS84 degrees. */
export function pointAtRouteMile(
  coordinates: [number, number][],
  mile: number,
  distanceMi?: number,
): LngLat {
  if (coordinates.length === 0) {
    return { lng: 0, lat: 0 };
  }
  if (coordinates.length === 1) {
    return { lng: coordinates[0]![0], lat: coordinates[0]![1] };
  }
  const line = lineString(coordinates);
  const turfMi = length(line, { units: "miles" });
  if (!(turfMi > 0)) {
    return { lng: coordinates[0]![0], lat: coordinates[0]![1] };
  }
  const scale =
    distanceMi != null && distanceMi > 0 ? turfMi / distanceMi : 1;
  const d = Math.min(Math.max(mile * scale, 0), turfMi);
  if (d <= 1e-6) {
    return { lng: coordinates[0]![0], lat: coordinates[0]![1] };
  }
  if (d >= turfMi - 1e-6) {
    const last = coordinates[coordinates.length - 1]!;
    return { lng: last[0], lat: last[1] };
  }
  const sliced = lineSliceAlong(line, 0, d, { units: "miles" });
  const pts = sliced.geometry.coordinates as [number, number][];
  const p = pts[pts.length - 1]!;
  return { lng: p[0], lat: p[1] };
}

function lerpLngLat(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
  u: number,
): LngLat {
  return {
    lng: a.lng + (b.lng - a.lng) * u,
    lat: a.lat + (b.lat - a.lat) * u,
  };
}

/**
 * Position of the truck at `atUtcMs` along checkpoints.
 * Before departure → origin; after arrival → destination; units: WGS84 degrees.
 */
export function truckPositionAtTime(
  checkpoints: TruckCheckpoint[],
  ends: TruckRouteEnds,
  atUtcMs: number,
  along?: TruckAlongOptions,
): LngLat | null {
  if (!Number.isFinite(atUtcMs)) return null;
  if (!checkpoints.length) {
    return { lng: ends.origin.lng, lat: ends.origin.lat };
  }

  const first = checkpoints[0]!;
  const last = checkpoints[checkpoints.length - 1]!;
  const t0 = parseUtcMs(first.eta_utc);
  const t1 = parseUtcMs(last.eta_utc);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;

  const place = (mile: number, fallback: LngLat): LngLat => {
    if (along?.coordinates && along.coordinates.length >= 2) {
      return pointAtRouteMile(
        along.coordinates,
        mile,
        along.distance_mi,
      );
    }
    return fallback;
  };

  if (atUtcMs <= t0) {
    return place(first.mile, {
      lng: ends.origin.lng,
      lat: ends.origin.lat,
    });
  }
  if (atUtcMs >= t1) {
    return place(last.mile, {
      lng: ends.destination.lng,
      lat: ends.destination.lat,
    });
  }

  for (let i = 0; i < checkpoints.length - 1; i++) {
    const a = checkpoints[i]!;
    const b = checkpoints[i + 1]!;
    const ta = parseUtcMs(a.eta_utc);
    const tb = parseUtcMs(b.eta_utc);
    if (!Number.isFinite(ta) || !Number.isFinite(tb) || tb <= ta) continue;
    if (atUtcMs >= ta && atUtcMs <= tb) {
      const u = (atUtcMs - ta) / (tb - ta);
      const mile = a.mile + (b.mile - a.mile) * u;
      return place(mile, lerpLngLat(a, b, u));
    }
  }

  return place(last.mile, {
    lng: ends.destination.lng,
    lat: ends.destination.lat,
  });
}

/** True when slider time is inside the trip (departure..arrival). */
export function isTruckVisible(
  checkpoints: TruckCheckpoint[],
  atUtcMs: number,
): boolean {
  if (!checkpoints.length || !Number.isFinite(atUtcMs)) return false;
  const t0 = parseUtcMs(checkpoints[0]!.eta_utc);
  const t1 = parseUtcMs(checkpoints[checkpoints.length - 1]!.eta_utc);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return false;
  return atUtcMs >= t0 && atUtcMs <= t1;
}
