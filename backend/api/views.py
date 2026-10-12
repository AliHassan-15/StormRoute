"""Thin API views. Domain logic belongs in core/."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from api.route_cache import route_data_from_cached_payload, routes_cache_key
from api.serializers import (
    AnalyzeRequestSerializer,
    HealthSerializer,
    HeatmapRequestSerializer,
    RoutesRequestSerializer,
)
from core.analyze import run_analyze, validate_analyze_input
from core.analyze_input import parse_departure
from core.errors import ValidationAppError
from core.geo import LatLng, haversine_mi
from core.geocode_client import forward_geocode, normalize_geocode_query
from core.heatmap import build_heatmap
from core.risk import meta_payload
from core.routing_client import fetch_routes, route_to_api_dict

GEOCODE_CACHE_S = 24 * 60 * 60
ROUTES_CACHE_S = 10 * 60
ANALYZE_CACHE_S = 10 * 60
HEATMAP_CACHE_S = 15 * 60


class HealthView(APIView):
    """Liveness probe for StormRoute."""

    authentication_classes: list = []
    permission_classes: list = []
    throttle_classes: list = []

    def get(self, request: Request) -> Response:
        """Return service status, version, and current UTC time."""
        payload = {
            "status": "ok",
            "version": settings.APP_VERSION,
            "time_utc": timezone.now(),
        }
        serializer = HealthSerializer(payload)
        return Response(serializer.data)


class MetaView(APIView):
    """Expose risk thresholds and load rules from core.risk (D16)."""

    authentication_classes: list = []
    permission_classes: list = []
    throttle_classes: list = []

    def get(self, request: Request) -> Response:
        """Return levels, thresholds, load rules, units, and version."""
        return Response(meta_payload())


class GeocodeView(APIView):
    """Forward geocode via Mapbox Geocoding v6."""

    authentication_classes: list = []
    permission_classes: list = []

    def get(self, request: Request) -> Response:
        """GET /api/geocode?q=... -> [{id,label,lat,lng}]."""
        query = str(request.query_params.get("q", ""))
        if len(query.strip()) < 3:
            raise ValidationAppError("Query must be at least 3 characters.")

        cache_key = f"geocode:v1:{normalize_geocode_query(query)}:{settings.GEOCODE_COUNTRY}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        results = forward_geocode(
            query,
            token=settings.MAPBOX_TOKEN,
            country=settings.GEOCODE_COUNTRY,
        )
        payload = [
            {"id": item.id, "label": item.label, "lat": item.lat, "lng": item.lng}
            for item in results
        ]
        cache.set(cache_key, payload, GEOCODE_CACHE_S)
        return Response(payload)


class RoutesView(APIView):
    """Fetch distinct driving routes between two coordinates."""

    authentication_classes: list = []
    permission_classes: list = []

    def post(self, request: Request) -> Response:
        """POST /api/routes -> {routes, notice}."""
        serializer = RoutesRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            origin = LatLng(lat=data["origin"]["lat"], lng=data["origin"]["lng"])
            destination = LatLng(
                lat=data["destination"]["lat"],
                lng=data["destination"]["lng"],
            )
        except ValueError as exc:
            raise ValidationAppError(str(exc)) from exc

        if haversine_mi(origin, destination) < 1.0:
            raise ValidationAppError("Origin and destination must be at least 1 mile apart.")

        cache_key = routes_cache_key(origin, destination)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        result = fetch_routes(origin, destination, token=settings.MAPBOX_TOKEN)
        payload = {
            "routes": [route_to_api_dict(route) for route in result.routes],
            "notice": result.notice,
        }
        cache.set(cache_key, payload, ROUTES_CACHE_S)
        return Response(payload)


def _analyze_cache_key(body: dict) -> str:
    raw = json.dumps(body, sort_keys=True, separators=(",", ":"), default=str)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"analyze:v1:{digest}"


class AnalyzeView(APIView):
    """Full trip analysis: routes, weather, risk, recommendation."""

    authentication_classes: list = []
    permission_classes: list = []

    def post(self, request: Request) -> Response:
        """POST /api/analyze -> AnalyzeResponse (see docs/API.md)."""
        serializer = AnalyzeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Use datetime.now(UTC) (not django.utils.timezone.now) for freezegun
        # compatibility under pytest on Windows.
        validated = validate_analyze_input(
            origin=data["origin"],
            destination=data["destination"],
            departure_time=data["departure_time"],
            load_lb=data["load_lb"],
            interval=data["interval"],
            now_utc=datetime.now(UTC),
        )

        cache_body = {
            "origin": data["origin"],
            "destination": data["destination"],
            "departure_time": data["departure_time"],
            "load_lb": data["load_lb"],
            "interval": data["interval"],
        }
        cache_key = _analyze_cache_key(cache_body)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        origin = LatLng(lat=validated.origin.lat, lng=validated.origin.lng)
        destination = LatLng(
            lat=validated.destination.lat,
            lng=validated.destination.lng,
        )
        routes_result = fetch_routes(origin, destination, token=settings.MAPBOX_TOKEN)
        routes_payload = {
            "routes": [route_to_api_dict(route) for route in routes_result.routes],
            "notice": routes_result.notice,
        }
        cache.set(routes_cache_key(origin, destination), routes_payload, ROUTES_CACHE_S)

        payload = run_analyze(
            validated,
            token=settings.MAPBOX_TOKEN,
            routes_result=routes_result,
        )
        cache.set(cache_key, payload, ANALYZE_CACHE_S)
        return Response(payload)


class HeatmapView(APIView):
    """Corridor weather heatmap frames for the map slider (D15)."""

    authentication_classes: list = []
    permission_classes: list = []

    def post(self, request: Request) -> Response:
        """POST /api/heatmap -> {t0_utc, frame_count, points, notices}."""
        serializer = HeatmapRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            origin = LatLng(lat=data["origin"]["lat"], lng=data["origin"]["lng"])
            destination = LatLng(
                lat=data["destination"]["lat"],
                lng=data["destination"]["lng"],
            )
        except ValueError as exc:
            raise ValidationAppError(str(exc)) from exc

        if haversine_mi(origin, destination) < 1.0:
            raise ValidationAppError(
                "Origin and destination must be at least 1 mile apart."
            )

        load_lb = float(data["load_lb"])
        if load_lb < 0 or load_lb > 200_000:
            raise ValidationAppError("load_lb must be between 0 and 200000.")

        try:
            departure = parse_departure(data["departure_time"])
        except Exception as exc:
            raise ValidationAppError(str(exc)) from exc

        cache_body = {
            "origin": {"lat": origin.lat, "lng": origin.lng},
            "destination": {"lat": destination.lat, "lng": destination.lng},
            "departure_time": data["departure_time"],
            "load_lb": load_lb,
        }
        raw = json.dumps(cache_body, sort_keys=True, separators=(",", ":"), default=str)
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        heat_key = f"heatmap:v1:{digest}"
        cached = cache.get(heat_key)
        if cached is not None:
            return Response(cached)

        routes_key = routes_cache_key(origin, destination)
        cached_routes = cache.get(routes_key)
        if cached_routes is not None:
            routes = route_data_from_cached_payload(cached_routes)
        else:
            result = fetch_routes(origin, destination, token=settings.MAPBOX_TOKEN)
            routes_payload = {
                "routes": [route_to_api_dict(route) for route in result.routes],
                "notice": result.notice,
            }
            cache.set(routes_key, routes_payload, ROUTES_CACHE_S)
            routes = result.routes

        if not routes:
            raise ValidationAppError("No routes available for heatmap.")

        payload = build_heatmap(routes, departure, load_lb)
        cache.set(heat_key, payload, HEATMAP_CACHE_S)
        return Response(payload)
