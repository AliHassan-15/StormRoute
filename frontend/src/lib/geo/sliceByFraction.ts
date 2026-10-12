import { lineString } from "@turf/helpers";
import length from "@turf/length";
import lineSliceAlong from "@turf/line-slice-along";

export type LineStringGeometry = {
  type: "LineString";
  coordinates: [number, number][];
};

/**
 * Slice a LineString by fraction of its own length (Turf geodesic).
 * Fractions are clamped to [0, 1]. Units: fractions are unitless.
 */
export function sliceByFraction(
  geometry: LineStringGeometry,
  startFrac: number,
  endFrac: number,
): LineStringGeometry {
  const coords = geometry.coordinates;
  if (coords.length < 2) return geometry;

  const line = lineString(coords);
  const totalKm = length(line, { units: "kilometers" });
  if (!(totalKm > 0)) return geometry;

  let a = Number.isFinite(startFrac) ? startFrac : 0;
  let b = Number.isFinite(endFrac) ? endFrac : 1;
  a = Math.min(1, Math.max(0, a));
  b = Math.min(1, Math.max(0, b));
  if (a > b) [a, b] = [b, a];

  if (a <= 0 && b >= 1) {
    return { type: "LineString", coordinates: coords.map((c) => [c[0], c[1]]) };
  }

  // Avoid zero-length slices from float edges.
  if (b - a < 1e-9) {
    const d = a * totalKm;
    const tiny = lineSliceAlong(
      line,
      Math.max(0, d - 1e-6),
      Math.min(totalKm, d + 1e-6),
      { units: "kilometers" },
    );
    return tiny.geometry as LineStringGeometry;
  }

  const sliced = lineSliceAlong(line, a * totalKm, b * totalKm, {
    units: "kilometers",
  });
  return sliced.geometry as LineStringGeometry;
}

/** Length of a LineString in kilometers (Turf geodesic). */
export function lineLengthKm(geometry: LineStringGeometry): number {
  if (geometry.coordinates.length < 2) return 0;
  return length(lineString(geometry.coordinates), { units: "kilometers" });
}
