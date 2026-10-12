"""Django settings for StormRoute. Values come from environment variables."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    CORS_ALLOWED_ORIGINS=(list, ["http://localhost:5173", "http://127.0.0.1:5173"]),
    ANON_RATE_THROTTLE=(str, "60/min"),
    THROTTLE_RATE=(str, ""),
    REDIS_URL=(str, ""),
    MAPBOX_TOKEN=(str, ""),
    GEOCODE_COUNTRY=(str, "us"),
    SECRET_KEY=(str, "dev-insecure-change-me"),
    DJANGO_SECRET_KEY=(str, ""),
    APP_VERSION=(str, "0.1.0"),
    SECURE_SSL_REDIRECT=(bool, False),
)

environ.Env.read_env(os.path.join(BASE_DIR, ".env"))
environ.Env.read_env(os.path.join(REPO_ROOT, ".env"))

# Prefer DJANGO_SECRET_KEY (deploy) then SECRET_KEY (local).
SECRET_KEY = env("DJANGO_SECRET_KEY") or env("SECRET_KEY")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env("ALLOWED_HOSTS")
APP_VERSION = env("APP_VERSION")

TESTING = (
    os.environ.get("DJANGO_TESTING") == "1"
    or any(arg == "pytest" or arg.endswith("pytest") for arg in sys.argv)
    or "pytest" in sys.modules
)

# Django / pytest-django test client uses the Host "testserver".
if TESTING and "testserver" not in ALLOWED_HOSTS:
    ALLOWED_HOSTS = [*ALLOWED_HOSTS, "testserver"]

MAPBOX_TOKEN = env("MAPBOX_TOKEN")
GEOCODE_COUNTRY = env("GEOCODE_COUNTRY")
if not MAPBOX_TOKEN and not TESTING:
    raise ImproperlyConfigured(
        "MAPBOX_TOKEN is required. Set it in backend/.env (see backend/.env.example). "
        "Tests may omit it when DJANGO_TESTING=1."
    )

REDIS_URL = env("REDIS_URL")
THROTTLE_RATE = env("THROTTLE_RATE") or env("ANON_RATE_THROTTLE")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "api",
]

MIDDLEWARE = [
    "django.middleware.gzip.GZipMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES: list[dict] = []

WSGI_APPLICATION = "config.wsgi.application"

# SQLite is configured only so Django can boot; no models are used (D19).
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS")

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": THROTTLE_RATE,
    },
    "EXCEPTION_HANDLER": "api.exceptions.typed_exception_handler",
    "UNAUTHENTICATED_USER": None,
}

if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_URL,
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
            },
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "stormroute",
        }
    }

# Production hardening (Render / reverse proxies).
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

if not DEBUG and not TESTING:
    SECURE_SSL_REDIRECT = env("SECURE_SSL_REDIRECT")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31_536_000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
else:
    SECURE_SSL_REDIRECT = False
