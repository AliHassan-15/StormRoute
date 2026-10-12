"""Shared helpers for POST /api/analyze integration tests."""

from __future__ import annotations

import json
import math
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests_mock
from jsonschema import Draft202012Validator
from requests_mock import ANY

FIXTURES = Path(__file__).parent / "fixtures"
SCHEMA = Path(__file__).resolve().parents[2] / "docs" / "analyze_response.schema.json"
ORIGIN = {"label": "Chicago, IL", "lat": 41.8781, "lng": -87.6298}
DEST = {"label": "Milwaukee, WI", "lat": 43.0389, "lng": -87.9065}


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def one_location_weather(
    *,
    start: datetime,
    hours: int = 48,
    wind: float = 10.0,
    rain: float = 0.0,
    snow: float = 0.0,
    null_weather: bool = False,
) -> dict:
    times = [int((start + timedelta(hours=i)).timestamp()) for i in range(hours)]
    n = len(times)
    if null_weather:
        winds = rains = showers = snows = gusts = [None] * n
    else:
        winds = [wind] * n
        rains = [rain] * n
        showers = [0.0] * n
        snows = [snow] * n
        gusts = [wind + 2] * n
    return {
        "hourly": {
            "time": times,
            "wind_speed_10m": winds,
            "wind_gusts_10m": gusts,
            "rain": rains,
            "showers": showers,
            "snowfall": snows,
        }
    }


def weather_for_request(
    request,
    *,
    start: datetime,
    hours: int = 48,
    wind: float = 10.0,
    null_weather: bool = False,
) -> dict | list:
    """Return Open-Meteo list shape when multiple latitudes are requested."""
    qs = parse_qs(urlparse(request.url).query)
    lats = qs.get("latitude", ["0"])[0].split(",")
    payload = one_location_weather(
        start=start,
        hours=hours,
        wind=wind,
        null_weather=null_weather,
    )
    if len(lats) == 1:
        return payload
    return [payload for _ in lats]


def assert_no_nonfinite(value) -> None:
    if isinstance(value, float):
        assert math.isfinite(value)
    elif isinstance(value, dict):
        for item in value.values():
            assert_no_nonfinite(item)
    elif isinstance(value, list):
        for item in value:
            assert_no_nonfinite(item)


def assert_analyze_schema(body: dict) -> None:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    Draft202012Validator(schema).validate(body)
    assert_no_nonfinite(body)


def assert_miles_invariant(body: dict) -> None:
    for route in body["routes"]:
        total = sum(route["metrics"]["miles_by_level"].values())
        assert abs(total - route["distance_mi"]) <= 0.01


def mock_upstream(
    mocker: requests_mock.Mocker,
    *,
    directions: dict,
    weather_start: datetime,
    null_weather: bool = False,
    wind: float = 10.0,
    hours: int = 48,
) -> None:
    def callback(request, context):
        host = urlparse(request.url).netloc
        if "api.mapbox.com" in host:
            return directions
        return weather_for_request(
            request,
            start=weather_start,
            hours=hours,
            wind=wind,
            null_weather=null_weather,
        )

    mocker.get(ANY, json=callback)
