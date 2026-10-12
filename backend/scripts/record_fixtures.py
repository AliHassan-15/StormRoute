#!/usr/bin/env python
"""
Record real Mapbox Geocoding + Directions responses for unit-test fixtures.

Reads MAPBOX_TOKEN from the environment (or backend/.env). Strips the token
from saved JSON URLs/params and writes tests/fixtures/*.json.

Usage (from backend/):
  python scripts/record_fixtures.py
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures"
TOKEN_RE = re.compile(r"(access_token=)[^&\"']+", re.IGNORECASE)


def _load_token() -> str:
    token = os.environ.get("MAPBOX_TOKEN", "").strip()
    if token:
        return token
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("MAPBOX_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("MAPBOX_TOKEN is required to record fixtures.")


def _scrub(text: str) -> str:
    return TOKEN_RE.sub(r"\1REDACTED", text)


def _save(name: str, payload: object) -> None:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    path = FIXTURES / name
    raw = json.dumps(payload, indent=2)
    path.write_text(_scrub(raw) + "\n", encoding="utf-8")
    print(f"wrote {path}")


def main() -> None:
    token = _load_token()
    if token.startswith("pk.your_"):
        raise SystemExit("MAPBOX_TOKEN looks like a placeholder; refusing to record.")

    session = requests.Session()

    geocode = session.get(
        "https://api.mapbox.com/search/geocode/v6/forward",
        params={
            "q": "Chicago",
            "access_token": token,
            "autocomplete": "true",
            "limit": 5,
            "country": "us",
        },
        timeout=20,
    )
    geocode.raise_for_status()
    _save("geocode_chicago.json", geocode.json())

    # Chicago -> Milwaukee corridor often returns alternatives.
    directions = session.get(
        "https://api.mapbox.com/directions/v5/mapbox/driving/"
        "-87.6298,41.8781;-87.9065,43.0389",
        params={
            "access_token": token,
            "alternatives": "true",
            "geometries": "geojson",
            "overview": "full",
            "annotations": "distance,duration",
            "steps": "false",
        },
        timeout=20,
    )
    directions.raise_for_status()
    payload = directions.json()
    _save("directions_three_routes.json", payload)

    # Short urban hop that often yields a single primary route.
    single = session.get(
        "https://api.mapbox.com/directions/v5/mapbox/driving/"
        "-87.6298,41.8781;-87.6244,41.8765",
        params={
            "access_token": token,
            "alternatives": "true",
            "geometries": "geojson",
            "overview": "full",
            "annotations": "distance,duration",
            "steps": "false",
        },
        timeout=20,
    )
    single.raise_for_status()
    _save("directions_one_route.json", single.json())

    print("done")


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT))
    main()
