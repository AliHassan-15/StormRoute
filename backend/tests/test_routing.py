"""Routing client and POST /api/routes tests (fixtures only; no live network)."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
import requests
import requests_mock
from django.core.cache import cache
from requests_mock import ANY
from rest_framework.test import APIClient

from core.errors import (
    NoRouteError,
    UpstreamBadGatewayError,
    UpstreamRateLimitError,
    UpstreamTimeoutError,
    ValidationAppError,
)
from core.geo import LatLng
from core.routing_client import fetch_routes, overlap_ratio, parse_route, sample_grid_cells

FIXTURES = Path(__file__).parent / "fixtures"
ORIGIN = LatLng(lat=41.8781, lng=-87.6298)
DEST = LatLng(lat=43.0389, lng=-87.9065)


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _assert_valid_route_arrays(route) -> None:
    assert len(route.coords) == len(route.cum_dist_mi) == len(route.cum_dur_s)
    assert abs(route.cum_dist_mi[-1] - route.distance_mi) <= 0.001
    assert abs(route.cum_dur_s[-1] - route.duration_s) <= 0.5
    assert all(
        route.cum_dist_mi[i] <= route.cum_dist_mi[i + 1] + 1e-9
        for i in range(len(route.cum_dist_mi) - 1)
    )
    assert all(
        route.cum_dur_s[i] <= route.cum_dur_s[i + 1] + 1e-9
        for i in range(len(route.cum_dur_s) - 1)
    )


def test_parse_three_route_fixture_sorted_and_scaled() -> None:
    payload = _load("directions_three_routes.json")
    parsed = [parse_route(raw) for raw in payload["routes"]]
    assert len(parsed) == 3
    for route in parsed:
        _assert_valid_route_arrays(route)


def test_annotation_length_mismatch_uses_proportional_fallback() -> None:
    payload = _load("directions_annotation_mismatch.json")
    route = parse_route(payload["routes"][0])
    _assert_valid_route_arrays(route)


def test_fetch_three_routes_labels_and_ids(requests_mock: requests_mock.Mocker) -> None:
    payload = _load("directions_three_routes.json")
    requests_mock.get(ANY, json=payload)
    result = fetch_routes(ORIGIN, DEST, token="test-token")
    assert len(result.routes) == 3
    assert result.notice is None
    assert [route.id for route in result.routes] == ["r1", "r2", "r3"]
    assert [route.label for route in result.routes] == [
        "Fastest",
        "Alternative A",
        "Alternative B",
    ]
    assert (
        result.routes[0].duration_s
        <= result.routes[1].duration_s
        <= result.routes[2].duration_s
    )
    for route in result.routes:
        _assert_valid_route_arrays(route)
    # Primary request used alternatives + annotations as required.
    first = requests_mock.request_history[0]
    qs = parse_qs(urlparse(first.url).query)
    assert qs.get("alternatives") == ["true"]
    assert qs.get("geometries") == ["geojson"]
    assert qs.get("overview") == ["full"]
    assert qs.get("annotations") == ["distance,duration"]
    assert qs.get("steps") == ["false"]


def test_one_route_invokes_fallbacks_and_caps_at_three(
    requests_mock: requests_mock.Mocker,
) -> None:
    one = _load("directions_one_route.json")
    toll = _load("directions_toll_fallback.json")
    via_a = _load("directions_via_a.json")
    via_b = _load("directions_via_b.json")
    seen: list[str] = []

    def _coord_path(url: str) -> str:
        # urllib.parse treats ';' as path-params, so rejoin path + params.
        parsed = urlparse(url)
        full_path = parsed.path if not parsed.params else f"{parsed.path};{parsed.params}"
        return full_path.rsplit("/", 1)[-1]

    def callback(request: requests.Request, context: object) -> str:
        seen.append(request.url)
        qs = parse_qs(urlparse(request.url).query)
        coords = _coord_path(request.url)
        if qs.get("exclude") == ["toll"]:
            return json.dumps(toll)
        if coords.count(";") >= 2:
            via_n = sum(1 for url in seen if _coord_path(url).count(";") >= 2)
            return json.dumps(via_a if via_n <= 1 else via_b)
        return json.dumps(one)

    requests_mock.get(
        ANY,
        text=callback,
        headers={"Content-Type": "application/json"},
    )

    result = fetch_routes(ORIGIN, DEST, token="test-token")
    assert any(parse_qs(urlparse(url).query).get("exclude") == ["toll"] for url in seen)
    assert any(_coord_path(url).count(";") >= 2 for url in seen)
    assert 1 <= len(result.routes) <= 3
    if len(result.routes) < 3:
        assert result.notice is not None
        assert "distinct route" in result.notice


def test_overlap_near_duplicate_is_high() -> None:
    base = parse_route(_load("directions_one_route.json")["routes"][0])
    near = parse_route(_load("directions_near_duplicate.json")["routes"][0])
    assert overlap_ratio(base, near) >= 0.85


def test_error_mapping_no_route(requests_mock: requests_mock.Mocker) -> None:
    requests_mock.get(ANY, json=_load("directions_no_route.json"))
    with pytest.raises(NoRouteError):
        fetch_routes(ORIGIN, DEST, token="test-token")


def test_error_mapping_429(requests_mock: requests_mock.Mocker) -> None:
    requests_mock.get(ANY, status_code=429, json={"message": "rate"})
    with pytest.raises(UpstreamRateLimitError):
        fetch_routes(ORIGIN, DEST, token="test-token")


def test_error_mapping_timeout(requests_mock: requests_mock.Mocker) -> None:
    requests_mock.get(ANY, exc=requests.Timeout())
    with pytest.raises(UpstreamTimeoutError):
        fetch_routes(ORIGIN, DEST, token="test-token")


def test_error_mapping_500(requests_mock: requests_mock.Mocker) -> None:
    requests_mock.get(ANY, status_code=500, text="oops")
    with pytest.raises(UpstreamBadGatewayError):
        fetch_routes(ORIGIN, DEST, token="test-token")


def test_error_mapping_invalid_json(requests_mock: requests_mock.Mocker) -> None:
    requests_mock.get(ANY, text="not-json", status_code=200)
    with pytest.raises(UpstreamBadGatewayError):
        fetch_routes(ORIGIN, DEST, token="test-token")


def test_fetch_rejects_short_separation() -> None:
    with pytest.raises(ValidationAppError):
        fetch_routes(ORIGIN, LatLng(lat=ORIGIN.lat + 0.001, lng=ORIGIN.lng), token="t")


def test_api_routes_validation_cases() -> None:
    cache.clear()
    client = APIClient()

    identical = client.post(
        "/api/routes",
        {"origin": {"lat": 41.0, "lng": -87.0}, "destination": {"lat": 41.0, "lng": -87.0}},
        format="json",
    )
    assert identical.status_code == 400
    assert identical.json()["error"]["code"] == "VALIDATION_ERROR"

    close = client.post(
        "/api/routes",
        {
            "origin": {"lat": 41.8781, "lng": -87.6298},
            "destination": {"lat": 41.8790, "lng": -87.6290},
        },
        format="json",
    )
    assert close.status_code == 400

    bad_lat = client.post(
        "/api/routes",
        {"origin": {"lat": 91.0, "lng": -87.0}, "destination": {"lat": 41.0, "lng": -87.5}},
        format="json",
    )
    assert bad_lat.status_code == 400

    # JSON null stands in for non-finite input at the HTTP boundary.
    nan = client.post(
        "/api/routes",
        {
            "origin": {"lat": None, "lng": -87.0},
            "destination": {"lat": 42.0, "lng": -88.0},
        },
        format="json",
    )
    assert nan.status_code == 400


def test_api_routes_success(requests_mock: requests_mock.Mocker) -> None:
    cache.clear()
    requests_mock.get(ANY, json=_load("directions_three_routes.json"))
    client = APIClient()
    response = client.post(
        "/api/routes",
        {
            "origin": {"lat": ORIGIN.lat, "lng": ORIGIN.lng},
            "destination": {"lat": DEST.lat, "lng": DEST.lng},
        },
        format="json",
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["routes"]) == 3
    assert body["routes"][0]["id"] == "r1"
    assert body["routes"][0]["geometry"]["type"] == "LineString"
    assert body["notice"] is None


def test_latlng_nan_rejected_in_domain() -> None:
    with pytest.raises(ValueError):
        LatLng(lat=float("nan"), lng=-87.0)


def test_sample_grid_non_empty() -> None:
    route = parse_route(_load("directions_one_route.json")["routes"][0])
    assert sample_grid_cells(route)
