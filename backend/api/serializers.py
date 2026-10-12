"""DRF serializers for StormRoute API endpoints."""

from __future__ import annotations

from rest_framework import serializers


class HealthSerializer(serializers.Serializer):
    """Response shape for GET /api/health."""

    status = serializers.CharField()
    version = serializers.CharField()
    time_utc = serializers.DateTimeField()


class LatLngSerializer(serializers.Serializer):
    """API coordinate object using named lat/lng fields."""

    lat = serializers.FloatField()
    lng = serializers.FloatField()


class PlaceSerializer(serializers.Serializer):
    """Labeled place for analyze requests."""

    label = serializers.CharField(allow_blank=True, required=False, default="")
    lat = serializers.FloatField()
    lng = serializers.FloatField()


class RoutesRequestSerializer(serializers.Serializer):
    """POST /api/routes body."""

    origin = LatLngSerializer()
    destination = LatLngSerializer()


class AnalyzeRequestSerializer(serializers.Serializer):
    """POST /api/analyze body (field semantics enforced in core.analyze_input)."""

    origin = PlaceSerializer()
    destination = PlaceSerializer()
    departure_time = serializers.CharField()
    load_lb = serializers.FloatField()
    interval = serializers.JSONField()


class HeatmapRequestSerializer(serializers.Serializer):
    """POST /api/heatmap body (same place/load/departure shapes as analyze)."""

    origin = PlaceSerializer()
    destination = PlaceSerializer()
    departure_time = serializers.CharField()
    load_lb = serializers.FloatField()
