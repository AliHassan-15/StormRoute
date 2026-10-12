#!/usr/bin/env python
"""
Run a Mapbox + Open-Meteo trip and print a checkpoint weather table.

Usage (from backend/, with MAPBOX_TOKEN set):
  python scripts/demo_checkpoints.py

Without a real MAPBOX_TOKEN, falls back to a synthetic Denver→SLC polyline
and still fetches live Open-Meteo weather so the table can be inspected.
"""

from __future__ import annotations

import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.geo import LatLng, cumulative_distance_mi, scale_to_total  # noqa: E402
from core.risk import Weather, assess  # noqa: E402
from core.routing_client import RouteData, fetch_routes  # noqa: E402
from core.sampling import auto_interval, build_checkpoints  # noqa: E402
from core.weather_client import (  # noqa: E402
    attach_weather,
    date_window_for_etas,
    fetch_hourly,
    snap_point,
)


def _looks_like_real_token(token: str) -> bool:
    """Reject empty / placeholder / pytest stub tokens."""
    if not token:
        return False
    lowered = token.lower()
    if "your_mapbox" in lowered or lowered.startswith("test-"):
        return False
    return token.startswith("pk.") or token.startswith("sk.")


def _token() -> str | None:
    candidates: list[str] = []
    env_token = os.environ.get("MAPBOX_TOKEN", "").strip()
    if env_token:
        candidates.append(env_token)
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("MAPBOX_TOKEN="):
                value = line.split("=", 1)[1].strip().strip('"').strip("'")
                if value:
                    candidates.append(value)
    for token in candidates:
        if _looks_like_real_token(token):
            return token
    return None


def _synthetic_denver_slc() -> RouteData:
    """Approximate Denver → Salt Lake City polyline when Mapbox is unavailable."""
    coords = [
        LatLng(39.7392, -104.9903),
        LatLng(39.75, -105.50),
        LatLng(39.80, -106.20),
        LatLng(39.65, -106.90),
        LatLng(39.55, -107.80),
        LatLng(39.50, -108.70),
        LatLng(39.70, -109.50),
        LatLng(40.10, -110.30),
        LatLng(40.40, -111.00),
        LatLng(40.60, -111.50),
        LatLng(40.7608, -111.8910),
    ]
    total_mi = 525.0
    duration_s = 8.5 * 3600.0
    cum = scale_to_total(cumulative_distance_mi(coords), total_mi)
    cum_dur = [duration_s * (d / total_mi) for d in cum]
    return RouteData(
        id="synthetic-den-slc",
        label="Denver -> Salt Lake City (synthetic)",
        coords=coords,
        cum_dist_mi=cum,
        cum_dur_s=cum_dur,
        distance_mi=total_mi,
        duration_s=duration_s,
    )


def main() -> None:
    token = _token()
    origin = LatLng(lat=39.7392, lng=-104.9903)  # Denver
    destination = LatLng(lat=40.7608, lng=-111.8910)  # Salt Lake City
    departure = datetime.now(tz=UTC).replace(minute=0, second=0, microsecond=0)

    if token:
        routes = fetch_routes(origin, destination, token=token)
        route = routes.routes[0]
        source = "Mapbox"
    else:
        print(
            "Note: no real MAPBOX_TOKEN; using synthetic Denver->SLC geometry "
            "+ live Open-Meteo.",
            file=sys.stderr,
        )
        route = _synthetic_denver_slc()
        source = "synthetic"

    interval = auto_interval(route.distance_mi)
    plan = build_checkpoints(route, interval, departure)

    start, end = date_window_for_etas([cp.eta_utc for cp in plan.checkpoints])
    # Open-Meteo forecast window is limited; clip end if needed (value_at marks OOR).
    max_end = (datetime.now(tz=UTC) + timedelta(days=15)).date()
    if end > max_end:
        end = max_end
    points = [LatLng(lat=cp.lat, lng=cp.lng) for cp in plan.checkpoints]
    series = fetch_hourly(points, start, end)
    enriched = attach_weather(plan.checkpoints, series)

    print(
        f"[{source}] Route {route.label}: {route.distance_mi:.1f} mi, "
        f"{route.duration_s / 3600:.1f} h | interval={plan.interval_used} mi"
    )
    if plan.notice:
        print(f"Notice: {plan.notice}")
    print(
        f"{'mile':>7} | {'lat,lng':>22} | {'ETA UTC':>20} | {'ETA local':>25} | "
        f"{'wind':>5} | {'rain':>6} | {'snow':>6} | {'status':>12} | {'level':>10}"
    )
    print("-" * 140)
    for cp in enriched:
        level = "—"
        if cp.weather_status == "ok" and cp.wind_mph is not None:
            risk = assess(
                Weather(
                    wind_mph=cp.wind_mph,
                    rain_in_hr=cp.rain_in_hr or 0.0,
                    snow_in_hr=cp.snow_in_hr or 0.0,
                    gust_mph=cp.gust_mph,
                ),
                load_lb=0,
            )
            level = risk.final_level.name
        snapped = snap_point(LatLng(cp.lat, cp.lng))
        print(
            f"{cp.mile:7.1f} | {cp.lat:8.4f},{cp.lng:9.4f} | "
            f"{cp.eta_utc.strftime('%Y-%m-%dT%H:%MZ'):>20} | "
            f"{cp.eta_local:>25} | "
            f"{'' if cp.wind_mph is None else f'{cp.wind_mph:5.1f}'} | "
            f"{'' if cp.rain_in_hr is None else f'{cp.rain_in_hr:6.3f}'} | "
            f"{'' if cp.snow_in_hr is None else f'{cp.snow_in_hr:6.3f}'} | "
            f"{cp.weather_status:>12} | {level:>10}  "
            f"(snap {snapped.lat:.2f},{snapped.lng:.2f} tz={cp.timezone})"
        )


if __name__ == "__main__":
    main()
