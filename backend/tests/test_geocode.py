"""Geocoding client and GET /api/geocode tests (fixtures only)."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests_mock
from django.core.cache import cache
from requests_mock import ANY
from rest_framework.test import APIClient

from core.geocode_client import forward_geocode, parse_geocode_response

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_parse_geocode_fixture_lng_lat() -> None:
    results = parse_geocode_response(_load("geocode_chicago.json"))
    assert len(results) == 2
    assert results[0].label == "Chicago, Illinois, United States"
    assert abs(results[0].lng - (-87.6298)) < 1e-6
    assert abs(results[0].lat - 41.8781) < 1e-6


def test_forward_geocode_params(requests_mock: requests_mock.Mocker) -> None:
    requests_mock.get(ANY, json=_load("geocode_chicago.json"))
    results = forward_geocode("Chi", token="test-token", country="us")
    assert len(results) == 2
    qs = parse_qs(urlparse(requests_mock.request_history[0].url).query)
    assert qs["q"] == ["Chi"]
    assert qs["autocomplete"] == ["true"]
    assert qs["limit"] == ["5"]
    assert qs["country"] == ["us"]


def test_api_geocode_min_length() -> None:
    client = APIClient()
    response = client.get("/api/geocode", {"q": "ab"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_api_geocode_success_and_cache(requests_mock: requests_mock.Mocker) -> None:
    cache.clear()
    requests_mock.get(ANY, json=_load("geocode_chicago.json"))
    client = APIClient()
    first = client.get("/api/geocode", {"q": "Chicago"})
    second = client.get("/api/geocode", {"q": "Chicago"})
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()[0]["id"] == "place.chicago"
    assert first.json()[0]["lat"] == 41.8781
    assert first.json()[0]["lng"] == -87.6298
    assert requests_mock.call_count == 1
