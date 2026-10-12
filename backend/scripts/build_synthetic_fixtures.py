"""Build Mapbox-shaped fixtures for offline unit tests (no live network)."""

from __future__ import annotations

import json
from pathlib import Path

FIX = Path(__file__).resolve().parents[1] / "tests" / "fixtures"


def line(n: int, lng0: float, lat0: float, dlng: float, dlat: float) -> list[list[float]]:
    return [[lng0 + i * dlng, lat0 + i * dlat] for i in range(n)]


def route(
    coords: list[list[float]],
    distance_m: float,
    duration_s: float,
    *,
    mismatch: bool = False,
) -> dict:
    segs = len(coords) - 1
    dist_ann = [distance_m / segs] * segs
    if mismatch:
        dur_ann = [duration_s / max(1, segs - 2)] * max(1, segs - 2)
    else:
        dur_ann = [duration_s / segs] * segs
    return {
        "distance": distance_m,
        "duration": duration_s,
        "geometry": {"type": "LineString", "coordinates": coords},
        "legs": [{"annotation": {"distance": dist_ann, "duration": dur_ann}}],
    }


def save(name: str, payload: object) -> None:
    FIX.mkdir(parents=True, exist_ok=True)
    path = FIX / name
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {path}")


def main() -> None:
    c1 = line(21, -87.63, 41.88, 0.01, 0.02)
    c2 = line(21, -87.63, 41.88, 0.02, 0.015)
    c3 = line(21, -87.63, 41.88, 0.015, 0.01)

    save(
        "directions_three_routes.json",
        {
            "code": "Ok",
            "routes": [
                route(c1, 120_000, 7200),
                route(c2, 130_000, 7800),
                route(c3, 140_000, 8400),
            ],
            "waypoints": [],
        },
    )
    save(
        "directions_one_route.json",
        {"code": "Ok", "routes": [route(c1, 120_000, 7200)], "waypoints": []},
    )
    c_toll = line(21, -87.63, 41.88, 0.012, 0.018)
    save(
        "directions_toll_fallback.json",
        {"code": "Ok", "routes": [route(c_toll, 125_000, 7500)], "waypoints": []},
    )
    c_via1 = line(21, -87.63, 41.88, 0.008, 0.022)
    c_via2 = line(21, -87.63, 41.88, 0.022, 0.008)
    save(
        "directions_via_a.json",
        {"code": "Ok", "routes": [route(c_via1, 135_000, 8000)], "waypoints": []},
    )
    save(
        "directions_via_b.json",
        {"code": "Ok", "routes": [route(c_via2, 145_000, 8600)], "waypoints": []},
    )
    c_dup = [[lng + 0.0005, lat + 0.0005] for lng, lat in c1]
    save(
        "directions_near_duplicate.json",
        {"code": "Ok", "routes": [route(c_dup, 121_000, 7300)], "waypoints": []},
    )
    save(
        "directions_annotation_mismatch.json",
        {
            "code": "Ok",
            "routes": [route(c1, 120_000, 7200, mismatch=True)],
            "waypoints": [],
        },
    )
    save("directions_no_route.json", {"code": "NoRoute", "message": "No route found", "routes": []})
    save(
        "geocode_chicago.json",
        {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "place.chicago",
                    "geometry": {"type": "Point", "coordinates": [-87.6298, 41.8781]},
                    "properties": {
                        "mapbox_id": "place.chicago",
                        "name": "Chicago",
                        "place_formatted": "Illinois, United States",
                        "full_address": "Chicago, Illinois, United States",
                    },
                },
                {
                    "type": "Feature",
                    "id": "place.chicago-heights",
                    "geometry": {"type": "Point", "coordinates": [-87.6359, 41.5061]},
                    "properties": {
                        "mapbox_id": "place.chicago-heights",
                        "name": "Chicago Heights",
                        "place_formatted": "Illinois, United States",
                        "full_address": "Chicago Heights, Illinois, United States",
                    },
                },
            ],
        },
    )


if __name__ == "__main__":
    main()
