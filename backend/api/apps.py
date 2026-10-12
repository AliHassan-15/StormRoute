"""Django app config for the API layer."""

from __future__ import annotations

from django.apps import AppConfig


class ApiConfig(AppConfig):
    """Application configuration for api."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "api"
