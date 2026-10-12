"""Pytest bootstrap for StormRoute backend tests."""

from __future__ import annotations

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
os.environ.setdefault("DJANGO_TESTING", "1")
os.environ.setdefault("MAPBOX_TOKEN", "test-mapbox-token")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("DEBUG", "false")
