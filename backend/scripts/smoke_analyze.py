#!/usr/bin/env python
"""
Run three REAL analyze trips and print compact per-route tables.

Usage (from backend/, with a real MAPBOX_TOKEN):
  python scripts/smoke_analyze.py
"""

from __future__ import annotations

import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402
from django.test import Client  # noqa: E402

TRIPS = [
    (
        "Denver -> Boulder",
        {"label": "Denver, CO", "lat": 39.7392, "lng": -104.9903},
        {"label": "Boulder, CO", "lat": 40.0150, "lng": -105.2705},
    ),
    (
        "Dallas -> Houston",
        {"label": "Dallas, TX", "lat": 32.7767, "lng": -96.7970},
        {"label": "Houston, TX", "lat": 29.7604, "lng": -95.3698},
    ),
    (
        "Los Angeles -> Chicago",
        {"label": "Los Angeles, CA", "lat": 34.0522, "lng": -118.2437},
        {"label": "Chicago, IL", "lat": 41.8781, "lng": -87.6298},
    ),
]


def _token_ok() -> bool:
    token = (settings.MAPBOX_TOKEN or "").strip()
    if not token or "your_mapbox" in token.lower() or token.startswith("test-"):
        return False
    return token.startswith("pk.") or token.startswith("sk.")


def _assert_invariants(body: dict, name: str) -> None:
    routes = body["routes"]
    assert routes, f"{name}: no routes"
    for route in routes:
        miles = sum(route["metrics"]["miles_by_level"].values())
        assert abs(miles - route["distance_mi"]) <= 0.01, f"{name}: miles sum"
        etas = [cp["eta_utc"] for cp in route["checkpoints"]]
        assert etas == sorted(etas), f"{name}: ETAs not increasing on {route['id']}"

    rec = body["recommendation"]
    recommended = [r for r in routes if r["is_recommended"]]
    if rec["all_blocked"]:
        assert rec["route_id"] is None
        assert not recommended
    else:
        assert len(recommended) == 1
        assert rec["route_id"] == recommended[0]["id"]
        assert recommended[0]["rank"] == 1


def main() -> None:
    if not _token_ok():
        raise SystemExit(
            "MAPBOX_TOKEN must be a real pk.*/sk.* token in backend/.env"
        )

    client = Client()
    departure = datetime.now(tz=UTC).replace(minute=0, second=0, microsecond=0) + timedelta(
        hours=2
    )
    departure_s = departure.isoformat().replace("+00:00", "Z")

    for name, origin, destination in TRIPS:
        response = client.post(
            "/api/analyze",
            data={
                "origin": origin,
                "destination": destination,
                "departure_time": departure_s,
                "load_lb": 40000,
                "interval": "auto",
            },
            content_type="application/json",
        )
        if response.status_code != 200:
            raise SystemExit(f"{name}: HTTP {response.status_code} {response.content!r}")
        body = response.json()
        _assert_invariants(body, name)

        print(f"\n=== {name} ===")
        print(
            f"rec={body['recommendation']['route_id']} "
            f"blocked={body['recommendation']['all_blocked']} "
            f"interval={body['input']['interval_used_mi']} mi"
        )
        print(
            f"{'id':>4} {'rank':>4} {'dur_h':>6} {'avg':>5} "
            f"{'LOW':>6} {'MOD':>6} {'HIGH':>6} {'SEV':>6} {'NT':>6} {'UNK':>6}"
        )
        for route in body["routes"]:
            m = route["metrics"]["miles_by_level"]
            avg = route["metrics"]["avg_risk"]
            avg_s = "  —  " if avg is None else f"{avg:5.2f}"
            print(
                f"{route['id']:>4} {route['rank']:4d} "
                f"{route['duration_s']/3600:6.1f} "
                f"{avg_s} "
                f"{m['LOW']:6.1f} {m['MODERATE']:6.1f} {m['HIGH']:6.1f} "
                f"{m['SEVERE']:6.1f} {m['NO_TRAVEL']:6.1f} {m['UNKNOWN']:6.1f}"
            )
        if body["notices"]:
            for notice in body["notices"]:
                print(f" notice: {notice}")

    print("\nAll smoke trips passed invariants.")


if __name__ == "__main__":
    main()
