"""DRF exception handler returning typed {error:{code,message,details?}} (D18)."""

from __future__ import annotations

from typing import Any

from rest_framework import status
from rest_framework.exceptions import APIException, Throttled, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler

from api.errors import INTERNAL, UPSTREAM_RATE_LIMIT, VALIDATION_ERROR
from core.errors import StormRouteError


def typed_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    """Map DRF/Django/domain exceptions to the StormRoute typed error envelope."""
    if isinstance(exc, StormRouteError):
        body: dict[str, Any] = {
            "error": {
                "code": exc.code,
                "message": exc.message,
            }
        }
        if exc.details is not None:
            body["error"]["details"] = exc.details
        return Response(body, status=exc.status)

    if isinstance(exc, ValidationError):
        return Response(
            {
                "error": {
                    "code": VALIDATION_ERROR,
                    "message": "Request validation failed.",
                    "details": exc.detail,
                }
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if isinstance(exc, Throttled):
        return Response(
            {
                "error": {
                    "code": UPSTREAM_RATE_LIMIT,
                    "message": "Rate limit exceeded. Please retry later.",
                    "details": {"wait_s": exc.wait},
                }
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    if isinstance(exc, APIException):
        code = getattr(exc, "default_code", INTERNAL)
        error_code = code.upper() if isinstance(code, str) else INTERNAL
        details = exc.detail if not isinstance(exc.detail, str) else None
        message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        payload: dict[str, Any] = {
            "error": {
                "code": error_code,
                "message": message,
            }
        }
        if details is not None:
            payload["error"]["details"] = details
        return Response(payload, status=exc.status_code)

    response = exception_handler(exc, context)
    if response is not None:
        return Response(
            {
                "error": {
                    "code": INTERNAL,
                    "message": "An unexpected error occurred.",
                    "details": response.data,
                }
            },
            status=response.status_code,
        )

    return Response(
        {
            "error": {
                "code": INTERNAL,
                "message": "An unexpected error occurred.",
            }
        },
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
