# StormRoute Architecture

Stub — filled in as phases land.

## Overview

StormRoute is a weather-aware truck routing web app: React (Vite) frontend + Django/DRF backend. Domain logic lives in `backend/core/` with no Django imports. The API layer in `backend/api/` stays thin.

## Runtime

- Backend: Gunicorn (1 worker, 8 threads), LocMemCache by default, Redis when `REDIS_URL` is set.
- Frontend: Vite SPA talking to `/api/*` via `VITE_API_BASE_URL`.
- Third parties: Mapbox (Directions, Geocoding, GL maps), Open-Meteo (forecast).

## Key packages

| Path | Role |
|------|------|
| `backend/core/` | Pure risk, geo, sampling, scoring, clients |
| `backend/api/` | DRF views, serializers, URLs, typed errors |
| `frontend/src/` | Planner UI, map, heatmap |

See `docs/DECISIONS.md` for locked product rules (D1–D20).
