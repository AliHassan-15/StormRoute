"""Open-Meteo weather client tests — fixtures / requests-mock only (D5, D12)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from urllib.parse import parse_qs, urlparse

import pytest
import requests_mock
from requests_mock import ANY

import core.weather_client as weather_mod
from core.errors import UpstreamRateLimitError
from core.geo import LatLng
from core.risk import RiskLevel, Weather, assess
from core.sampling import Checkpoint
from core.weather_client import (
    WeatherSeries,
    attach_weather,
    clear_weather_cache,
    fetch_hourly,
    normalize_open_meteo_response,
    snap_point,
    value_at,
)


def _series(
    times: list[datetime],
    wind: list[float | None],
    rain: list[float | None],
    snow: list[float | None],
    gust: list[float | None] | None = None,
) -> WeatherSeries:
    gusts = gust if gust is not None else [None] * len(times)
    return WeatherSeries(
        times_utc=tuple(times),
        wind_mph=tuple(wind),
        gust_mph=tuple(gusts),
        rain_in_hr=tuple(rain),
        snow_in_hr=tuple(snow),
    )


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    clear_weather_cache()
    weather_mod._sleep = lambda _s: None
    yield
    clear_weather_cache()
    weather_mod._sleep = __import__("time").sleep


def test_value_at_nearest_and_tie_and_bounds() -> None:
    times = [
        datetime(2026, 10, 14, 12, 0, tzinfo=UTC),
        datetime(2026, 10, 14, 13, 0, tzinfo=UTC),
        datetime(2026, 10, 14, 14, 0, tzinfo=UTC),
    ]
    series = _series(times, [1, 2, 3], [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [5, 6, 7])

    early = value_at(series, datetime(2026, 10, 14, 12, 29, 59, tzinfo=UTC))
    assert early.status == "ok"
    assert early.wind_mph == 1

    tie = value_at(series, datetime(2026, 10, 14, 12, 30, 0, tzinfo=UTC))
    assert tie.status == "ok"
    assert tie.wind_mph == 2  # later hour on tie

    edge = value_at(series, datetime(2026, 10, 14, 14, 30, 0, tzinfo=UTC))
    assert edge.status == "ok"
    assert edge.wind_mph == 3

    oor = value_at(series, datetime(2026, 10, 14, 14, 30, 1, tzinfo=UTC))
    assert oor.status == "out_of_range"


def test_value_at_null_wind_missing_null_gust_ok() -> None:
    times = [datetime(2026, 10, 14, 12, 0, tzinfo=UTC)]
    missing = value_at(_series(times, [None], [0.0], [0.0], [10.0]), times[0])
    assert missing.status == "missing"

    ok = value_at(_series(times, [5.0], [0.0], [0.0], [None]), times[0])
    assert ok.status == "ok"
    assert ok.gust_mph is None


def test_rain_plus_showers_moderate_via_risk() -> None:
    # rain 0.06 + showers 0.06 = 0.12 -> MODERATE
    result = assess(Weather(wind_mph=0.0, rain_in_hr=0.12, snow_in_hr=0.0), load_lb=0)
    assert result.final_level is RiskLevel.MODERATE


def test_normalize_single_and_list_responses() -> None:
    single = {
        "hourly": {
            "time": [1728907200],
            "wind_speed_10m": [5.0],
            "wind_gusts_10m": [8.0],
            "rain": [0.06],
            "showers": [0.06],
            "snowfall": [0.0],
        }
    }
    one = normalize_open_meteo_response(single)
    assert len(one) == 1
    assert one[0].rain_in_hr[0] == pytest.approx(0.12)

    many = normalize_open_meteo_response([single, single])
    assert len(many) == 2


def test_chunking_120_points_three_requests(requests_mock: requests_mock.Mocker) -> None:
    def callback(request, context):
        qs = parse_qs(urlparse(request.url).query)
        assert qs["wind_speed_unit"] == ["mph"]
        assert qs["precipitation_unit"] == ["inch"]
        assert qs["timezone"] == ["GMT"]
        assert qs["timeformat"] == ["unixtime"]
        assert "wind_speed_10m" in qs["hourly"][0]
        assert "rain" in qs["hourly"][0]
        assert "showers" in qs["hourly"][0]
        lats = qs["latitude"][0].split(",")
        return [
            {
                "hourly": {
                    "time": [1728907200],
                    "wind_speed_10m": [1.0],
                    "wind_gusts_10m": [2.0],
                    "rain": [0.0],
                    "showers": [0.0],
                    "snowfall": [0.0],
                }
            }
            for _ in lats
        ]

    requests_mock.get(ANY, json=callback)
    points = [LatLng(lat=40.0 + i * 0.1, lng=-105.0 - i * 0.1) for i in range(120)]
    result = fetch_hourly(
        points,
        date(2026, 10, 14),
        date(2026, 10, 15),
        max_workers=1,
    )
    # BATCH_SIZE=25 → 120 points = 5 requests
    assert requests_mock.call_count == 5
    assert len(result) == 120


def test_retry_on_429_then_success(requests_mock: requests_mock.Mocker) -> None:
    payload = {
        "hourly": {
            "time": [1728907200],
            "wind_speed_10m": [4.0],
            "wind_gusts_10m": [6.0],
            "rain": [0.0],
            "showers": [0.0],
            "snowfall": [0.0],
        }
    }
    requests_mock.get(
        ANY,
        [
            {"status_code": 429, "json": {"error": True}},
            {"status_code": 200, "json": payload},
        ],
    )
    out = fetch_hourly(
        [LatLng(40.0, -105.0)],
        date(2026, 10, 14),
        date(2026, 10, 14),
        max_workers=1,
    )
    assert len(out) == 1
    assert requests_mock.call_count == 2


def test_persistent_429_raises(requests_mock: requests_mock.Mocker) -> None:
    requests_mock.get(ANY, status_code=429, json={"error": True})
    with pytest.raises(UpstreamRateLimitError):
        fetch_hourly(
            [LatLng(40.0, -105.0)],
            date(2026, 10, 14),
            date(2026, 10, 14),
            max_workers=1,
        )
    assert requests_mock.call_count == 3


def test_snapping_dedupes_nearby_points(requests_mock: requests_mock.Mocker) -> None:
    payload = {
        "hourly": {
            "time": [1728907200],
            "wind_speed_10m": [3.0],
            "wind_gusts_10m": [4.0],
            "rain": [0.0],
            "showers": [0.0],
            "snowfall": [0.0],
        }
    }
    requests_mock.get(ANY, json=payload)
    a = LatLng(39.7400, -104.9900)
    b = LatLng(39.7450, -104.9850)  # ~0.4–0.5 mi; same 0.05° cell often
    assert snap_point(a) == snap_point(b)
    out = fetch_hourly([a, b], date(2026, 10, 14), date(2026, 10, 14), max_workers=1)
    assert requests_mock.call_count == 1
    assert len(out) == 1


def test_attach_weather_statuses() -> None:
    times = [
        datetime(2026, 10, 14, 12, 0, tzinfo=UTC),
        datetime(2026, 10, 14, 13, 0, tzinfo=UTC),
    ]
    series = _series(times, [10.0, 12.0], [0.0, 0.0], [0.0, 0.0], [15.0, 16.0])
    snapped = snap_point(LatLng(39.74, -104.99))
    cps = [
        Checkpoint(
            index=0,
            mile=0.0,
            lat=snapped.lat,
            lng=snapped.lng,
            eta_utc=times[0],
        ),
        Checkpoint(
            index=1,
            mile=10.0,
            lat=snapped.lat,
            lng=snapped.lng,
            eta_utc=datetime(2026, 10, 14, 18, 0, tzinfo=UTC),
        ),
    ]
    enriched = attach_weather(cps, {(snapped.lat, snapped.lng): series})
    assert enriched[0].weather_status == "ok"
    assert enriched[0].wind_mph == 10.0
    assert enriched[1].weather_status == "out_of_range"
