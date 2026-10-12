"""API URL routes."""

from __future__ import annotations

from django.urls import path

from api.views import (
    AnalyzeView,
    GeocodeView,
    HealthView,
    HeatmapView,
    MetaView,
    RoutesView,
)

urlpatterns = [
    path("health", HealthView.as_view(), name="health"),
    path("meta", MetaView.as_view(), name="meta"),
    path("geocode", GeocodeView.as_view(), name="geocode"),
    path("routes", RoutesView.as_view(), name="routes"),
    path("analyze", AnalyzeView.as_view(), name="analyze"),
    path("heatmap", HeatmapView.as_view(), name="heatmap"),
]
