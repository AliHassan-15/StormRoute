"""Tests for GET /api/health."""

from __future__ import annotations

from freezegun import freeze_time
from rest_framework.test import APIClient


@freeze_time("2026-10-12T12:00:00Z")
def test_health_returns_ok_payload() -> None:
    """Health endpoint reports ok status, version, and frozen UTC time."""
    client = APIClient()
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"
    assert body["time_utc"] in (
        "2026-10-12T12:00:00Z",
        "2026-10-12T12:00:00+00:00",
    )
