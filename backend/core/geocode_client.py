"""
Mapbox Geocoding v6 forward client.

GET https://api.mapbox.com/search/geocode/v6/forward
Parameters verified against official docs: q, access_token, autocomplete, limit, country.
Coordinates are parsed from geometry.coordinates [lng, lat] (D20).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import requests

from core.errors import (
    GeocodeFailedError,
    UpstreamBadGatewayError,
    UpstreamRateLimitError,
    UpstreamTimeoutError,
)
from core.geo import LatLng

GEOCODE_URL = "https://api.mapbox.com/search/geocode/v6/forward"
REQUEST_TIMEOUT_S = 10.0


@dataclass(frozen=True)
class GeocodeResult:
    """One forward-geocode hit for the API response."""

    id: str
    label: str
    lat: float
    lng: float


def normalize_geocode_query(query: str) -> str:
    """Normalise a geocode query for cache keys (trim + casefold + collapse space)."""
    return " ".join(query.strip().casefold().split())


def _feature_label(properties: dict[str, Any]) -> str:
    full = properties.get("full_address")
    if isinstance(full, str) and full.strip():
        return full.strip()
    name = str(properties.get("name") or "").strip()
    place = str(properties.get("place_formatted") or "").strip()
    if name and place:
        return f"{name}, {place}"
    return name or place or "Unknown location"


def parse_geocode_response(payload: dict[str, Any]) -> list[GeocodeResult]:
    """Parse a Geocoding v6 FeatureCollection into GeocodeResult rows."""
    features = payload.get("features") or []
    results: list[GeocodeResult] = []
    for feature in features:
        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates")
        if not isinstance(coordinates, list | tuple) or len(coordinates) < 2:
            continue
        lng, lat = float(coordinates[0]), float(coordinates[1])
        LatLng(lat=lat, lng=lng)  # validate ranges
        properties = feature.get("properties") or {}
        feature_id = str(feature.get("id") or properties.get("mapbox_id") or "")
        if not feature_id:
            continue
        results.append(
            GeocodeResult(
                id=feature_id,
                label=_feature_label(properties),
                lat=lat,
                lng=lng,
            )
        )
    return results


def forward_geocode(
    query: str,
    *,
    token: str,
    country: str = "us",
    session: requests.Session | None = None,
    limit: int = 5,
) -> list[GeocodeResult]:
    """
    Forward-geocode query via Mapbox Geocoding v6.

    country empty string means worldwide (omit the country parameter).
    """
    q = query.strip()
    if len(q) < 3:
        from core.errors import ValidationAppError

        raise ValidationAppError("Query must be at least 3 characters.")

    params: dict[str, Any] = {
        "q": q,
        "access_token": token,
        "autocomplete": "true",
        "limit": str(limit),
    }
    if country:
        params["country"] = country

    http = session or requests.Session()
    try:
        response = http.get(GEOCODE_URL, params=params, timeout=REQUEST_TIMEOUT_S)
    except requests.Timeout as exc:
        raise UpstreamTimeoutError() from exc
    except requests.RequestException as exc:
        raise GeocodeFailedError("Geocoding request failed.") from exc

    if response.status_code == 429:
        raise UpstreamRateLimitError()
    if response.status_code >= 500:
        raise UpstreamBadGatewayError(
            "Upstream geocoding service error.",
            details={"status": response.status_code},
        )
    if response.status_code >= 400:
        raise GeocodeFailedError(
            "Geocoding request was rejected.",
            details={"status": response.status_code},
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise GeocodeFailedError("Invalid JSON from geocoding API.") from exc

    try:
        return parse_geocode_response(payload)
    except (TypeError, ValueError) as exc:
        raise GeocodeFailedError("Unable to parse geocoding response.") from exc
