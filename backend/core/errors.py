"""Domain-level typed errors for StormRoute (D18)."""

from __future__ import annotations

from typing import Any


class StormRouteError(Exception):
    """Typed application error mapped to {error:{code,message,details?}}."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status: int = 500,
        details: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details


class ValidationAppError(StormRouteError):
    """Client provided invalid input."""

    def __init__(self, message: str, *, details: Any | None = None) -> None:
        super().__init__("VALIDATION_ERROR", message, status=400, details=details)


class GeocodeFailedError(StormRouteError):
    """Upstream geocoding failed or returned unusable data."""

    def __init__(self, message: str, *, details: Any | None = None) -> None:
        super().__init__("GEOCODE_FAILED", message, status=502, details=details)


class NoRouteError(StormRouteError):
    """No routable path between the given points."""

    def __init__(self, message: str = "No route found.", *, details: Any | None = None) -> None:
        super().__init__("NO_ROUTE", message, status=404, details=details)


class UpstreamTimeoutError(StormRouteError):
    """Upstream HTTP call timed out."""

    def __init__(self, message: str = "Upstream request timed out.") -> None:
        super().__init__("UPSTREAM_TIMEOUT", message, status=504)


class UpstreamRateLimitError(StormRouteError):
    """Upstream rate limit (HTTP 429)."""

    def __init__(self, message: str = "Upstream rate limit exceeded.") -> None:
        super().__init__("UPSTREAM_RATE_LIMIT", message, status=429)


class UpstreamBadGatewayError(StormRouteError):
    """Upstream 5xx or otherwise unusable response."""

    def __init__(
        self,
        message: str = "Upstream service error.",
        *,
        details: Any | None = None,
    ) -> None:
        super().__init__("INTERNAL", message, status=502, details=details)


class ForecastUnavailableError(StormRouteError):
    """Weather forecast could not be retrieved."""

    def __init__(
        self,
        message: str = "Weather forecast unavailable.",
        *,
        details: Any | None = None,
    ) -> None:
        super().__init__("FORECAST_UNAVAILABLE", message, status=502, details=details)
