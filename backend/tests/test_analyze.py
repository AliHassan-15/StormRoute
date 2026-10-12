"""POST /api/analyze integration tests (requests-mock only)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse

import pytest
import requests_mock
from django.core.cache import cache
from freezegun import freeze_time
from requests_mock import ANY
from rest_framework.test import APIClient

from core.weather_client import clear_weather_cache
from tests.analyze_helpers import (
    DEST,
    ORIGIN,
    assert_analyze_schema,
    assert_miles_invariant,
    load_fixture,
    mock_upstream,
    weather_for_request,
)


@pytest.fixture(autouse=True)
def _clear(settings) -> None:
    """
    Clear caches and disable DRF throttles under freezegun.

    freezegun replaces time.time such that SimpleRateThrottle.timer looked up on
    an instance becomes bound and is called as timer(self) -> TypeError.
    """
    cache.clear()
    clear_weather_cache()
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        "DEFAULT_THROTTLE_CLASSES": [],
    }
    yield
    cache.clear()
    clear_weather_cache()


@freeze_time("2026-10-12T12:00:00Z")
def test_analyze_happy_path_three_routes(requests_mock: requests_mock.Mocker) -> None:
    departure = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
    mock_upstream(
        requests_mock,
        directions=load_fixture("directions_three_routes.json"),
        weather_start=departure - timedelta(hours=2),
        wind=12.0,
    )
    client = APIClient()
    response = client.post(
        "/api/analyze",
        {
            "origin": ORIGIN,
            "destination": DEST,
            "departure_time": departure.isoformat().replace("+00:00", "Z"),
            "load_lb": 20000,
            "interval": "auto",
        },
        format="json",
    )
    assert response.status_code == 200, response.content
    body = response.json()
    assert_analyze_schema(body)
    assert_miles_invariant(body)
    assert len(body["routes"]) == 3
    recommended = [r for r in body["routes"] if r["is_recommended"]]
    assert len(recommended) == 1
    assert body["recommendation"]["route_id"] == recommended[0]["id"]
    assert body["recommendation"]["all_blocked"] is False
    assert body["input"]["interval_used_mi"] in (10, 25, 50)


@freeze_time("2026-10-12T12:00:00Z")
def test_analyze_two_routes_with_notice(requests_mock: requests_mock.Mocker) -> None:
    departure = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
    payloads = [
        load_fixture("directions_one_route.json"),
        load_fixture("directions_toll_fallback.json"),
        {"code": "Ok", "routes": []},
        {"code": "Ok", "routes": []},
    ]

    def router(request, context):
        if "api.mapbox.com" in urlparse(request.url).netloc:
            idx = router.calls
            router.calls += 1
            return payloads[min(idx, len(payloads) - 1)]
        return weather_for_request(request, start=departure - timedelta(hours=2))

    router.calls = 0
    requests_mock.get(ANY, json=router)

    client = APIClient()
    response = client.post(
        "/api/analyze",
        {
            "origin": ORIGIN,
            "destination": DEST,
            "departure_time": departure.isoformat().replace("+00:00", "Z"),
            "load_lb": 10000,
            "interval": 25,
        },
        format="json",
    )
    assert response.status_code == 200, response.content
    body = response.json()
    assert_analyze_schema(body)
    assert len(body["routes"]) >= 1
    if len(body["routes"]) < 3:
        assert body["notices"]


@freeze_time("2026-10-12T12:00:00Z")
def test_analyze_all_weather_missing_unknown(requests_mock: requests_mock.Mocker) -> None:
    departure = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
    mock_upstream(
        requests_mock,
        directions=load_fixture("directions_three_routes.json"),
        weather_start=departure - timedelta(hours=2),
        null_weather=True,
    )
    client = APIClient()
    response = client.post(
        "/api/analyze",
        {
            "origin": ORIGIN,
            "destination": DEST,
            "departure_time": departure.isoformat().replace("+00:00", "Z"),
            "load_lb": 0,
            "interval": 50,
        },
        format="json",
    )
    assert response.status_code == 200
    body = response.json()
    assert_analyze_schema(body)
    assert_miles_invariant(body)
    for route in body["routes"]:
        assert route["metrics"]["miles_by_level"]["UNKNOWN"] > 0
        for cp in route["checkpoints"]:
            assert cp["level_name"] == "UNKNOWN"


@freeze_time("2026-10-12T12:00:00Z")
def test_analyze_invalid_inputs_field_errors() -> None:
    client = APIClient()
    response = client.post(
        "/api/analyze",
        {
            "origin": ORIGIN,
            "destination": ORIGIN,
            "departure_time": "2026-10-12T14:00:00",
            "load_lb": -5,
            "interval": 7,
        },
        format="json",
    )
    assert response.status_code == 400, response.content
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    details = body["error"]["details"]
    assert any(k in details for k in ("load_lb", "departure_time", "interval", "destination"))


@freeze_time("2026-10-12T12:00:00Z")
def test_analyze_departure_near_horizon_out_of_range(
    requests_mock: requests_mock.Mocker,
) -> None:
    """
    Departure at the D14 horizon (14 days). Weather mock only covers 'now',
    so checkpoint ETAs are out_of_range and a notice is returned.

    A literal +15 day departure is rejected by D14 validation (separate test).
    """
    departure = datetime(2026, 10, 12, 12, 0, tzinfo=UTC) + timedelta(days=14)
    directions = load_fixture("directions_one_route.json")

    def router(request, context):
        if "api.mapbox.com" in urlparse(request.url).netloc:
            return directions
        return weather_for_request(
            request,
            start=datetime(2026, 10, 12, 0, 0, tzinfo=UTC),
            hours=24,
            wind=8.0,
        )

    requests_mock.get(ANY, json=router)
    client = APIClient()
    response = client.post(
        "/api/analyze",
        {
            "origin": ORIGIN,
            "destination": DEST,
            "departure_time": departure.isoformat().replace("+00:00", "Z"),
            "load_lb": 5000,
            "interval": 50,
        },
        format="json",
    )
    assert response.status_code == 200, response.content
    body = response.json()
    assert_analyze_schema(body)
    statuses = {
        cp["weather_status"] for route in body["routes"] for cp in route["checkpoints"]
    }
    assert "out_of_range" in statuses
    assert body["notices"]


@freeze_time("2026-10-12T12:00:00Z")
def test_analyze_departure_15_days_validation() -> None:
    client = APIClient()
    departure = datetime(2026, 10, 12, 12, 0, tzinfo=UTC) + timedelta(days=15)
    response = client.post(
        "/api/analyze",
        {
            "origin": ORIGIN,
            "destination": DEST,
            "departure_time": departure.isoformat().replace("+00:00", "Z"),
            "load_lb": 5000,
            "interval": "auto",
        },
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "departure_time" in response.json()["error"]["details"]


def test_analyze_throttling_typed_429(
    requests_mock: requests_mock.Mocker,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Throttle test without freezegun (DRF timer + freezegun is incompatible)."""
    from rest_framework.throttling import AnonRateThrottle

    from api.views import AnalyzeView

    class OncePerMinute(AnonRateThrottle):
        rate = "1/min"

    monkeypatch.setattr(AnalyzeView, "throttle_classes", [OncePerMinute])

    departure = datetime.now(tz=UTC).replace(microsecond=0) + timedelta(hours=2)
    directions = load_fixture("directions_one_route.json")

    def router(request, context):
        if "api.mapbox.com" in urlparse(request.url).netloc:
            return directions
        return weather_for_request(request, start=departure - timedelta(hours=2))

    requests_mock.get(ANY, json=router)
    client = APIClient()
    body = {
        "origin": ORIGIN,
        "destination": DEST,
        "departure_time": departure.isoformat().replace("+00:00", "Z"),
        "load_lb": 1000,
        "interval": 50,
    }
    first = client.post("/api/analyze", body, format="json")
    assert first.status_code == 200, first.content
    second = client.post("/api/analyze", {**body, "load_lb": 1001}, format="json")
    assert second.status_code == 429, second.content
    assert second.json()["error"]["code"] == "UPSTREAM_RATE_LIMIT"
