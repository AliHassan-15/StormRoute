"""
Open-Meteo hourly weather client (D4, D5, D12).

Fetches snapped/deduped/batched coordinates with caching. Units: mph and inch.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal

import requests

from core.errors import UpstreamBadGatewayError, UpstreamRateLimitError, UpstreamTimeoutError
from core.geo import LatLng
from core.sampling import Checkpoint, with_weather

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
REQUEST_TIMEOUT_S = 15.0
SNAP_DEG = 0.05
# Smaller batches + fewer workers: Open-Meteo free tier 400s under burst load
# right after /api/analyze weather fetches.
BATCH_SIZE = 25
MAX_WORKERS = 2
CACHE_TTL_S = 30 * 60
RETRY_BACKOFF_S = (0.5, 1.0, 2.0)
HOURLY_VARS = "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall"

WeatherStatus = Literal["ok", "missing", "out_of_range"]

_cache: dict[tuple[float, float, str, str], tuple[float, WeatherSeries]] = {}
_sleep: Callable[[float], None] = time.sleep


@dataclass(frozen=True)
class WeatherSeries:
    """Hourly weather series at one snapped location (UTC unix times)."""

    times_utc: tuple[datetime, ...]
    wind_mph: tuple[float | None, ...]
    gust_mph: tuple[float | None, ...]
    rain_in_hr: tuple[float | None, ...]
    snow_in_hr: tuple[float | None, ...]

    @property
    def first_slot(self) -> datetime | None:
        return self.times_utc[0] if self.times_utc else None

    @property
    def last_slot(self) -> datetime | None:
        return self.times_utc[-1] if self.times_utc else None


@dataclass(frozen=True)
class WeatherSample:
    """Nearest-slot weather lookup result for one ETA."""

    status: WeatherStatus
    wind_mph: float | None = None
    gust_mph: float | None = None
    rain_in_hr: float | None = None
    snow_in_hr: float | None = None


def snap_coord(value: float) -> float:
    """Snap a coordinate to the nearest 0.05 degree (D12)."""
    return round(value / SNAP_DEG) * SNAP_DEG


def snap_point(point: LatLng) -> LatLng:
    """Snap lat/lng to 0.05-degree grid."""
    return LatLng(lat=snap_coord(point.lat), lng=snap_coord(point.lng))


def cache_key(point: LatLng, start: date, end: date) -> tuple[float, float, str, str]:
    """Cache key for a snapped point and date window."""
    snapped = snap_point(point)
    return (snapped.lat, snapped.lng, start.isoformat(), end.isoformat())


def clear_weather_cache() -> None:
    """Clear the in-process weather cache (tests)."""
    _cache.clear()


def _combine_rain(
    rain: float | None,
    showers: float | None,
) -> float | None:
    """Rain rate = rain + showers; None if either input is None (D4)."""
    if rain is None or showers is None:
        return None
    return float(rain) + float(showers)


def _to_utc(ts: int | float) -> datetime:
    return datetime.fromtimestamp(float(ts), tz=UTC)


def _parse_location_payload(payload: dict[str, Any]) -> WeatherSeries:
    """Parse one Open-Meteo location object into WeatherSeries."""
    hourly = payload.get("hourly") or {}
    times_raw = hourly.get("time") or []
    winds = hourly.get("wind_speed_10m") or []
    gusts = hourly.get("wind_gusts_10m") or []
    rains = hourly.get("rain") or []
    showers = hourly.get("showers") or []
    snows = hourly.get("snowfall") or []

    n = len(times_raw)
    times = tuple(_to_utc(t) for t in times_raw)

    def col(values: list[Any]) -> tuple[float | None, ...]:
        out: list[float | None] = []
        for i in range(n):
            if i >= len(values) or values[i] is None:
                out.append(None)
            else:
                out.append(float(values[i]))
        return tuple(out)

    wind_col = col(winds)
    gust_col = col(gusts)
    rain_col = col(rains)
    shower_col = col(showers)
    snow_col = col(snows)
    rain_sum = tuple(_combine_rain(rain_col[i], shower_col[i]) for i in range(n))

    return WeatherSeries(
        times_utc=times,
        wind_mph=wind_col,
        gust_mph=gust_col,
        rain_in_hr=rain_sum,
        snow_in_hr=snow_col,
    )


def normalize_open_meteo_response(payload: Any) -> list[WeatherSeries]:
    """
    Normalize Open-Meteo response shapes to a list of WeatherSeries.

    Single-location responses are objects; multi-location responses are lists.
    """
    if isinstance(payload, list):
        return [_parse_location_payload(item) for item in payload]
    if isinstance(payload, dict):
        return [_parse_location_payload(payload)]
    raise UpstreamBadGatewayError("Unexpected Open-Meteo response shape.")


def value_at(series: WeatherSeries, eta_utc: datetime) -> WeatherSample:
    """
    Nearest hourly slot to eta_utc (D5).

    Ties round to the LATER hour. More than 30 minutes outside the series
    window -> out_of_range. Null wind/rain/snow -> missing. Null gust is OK.
    """
    if not series.times_utc:
        return WeatherSample(status="out_of_range")

    if eta_utc.tzinfo is None:
        eta_utc = eta_utc.replace(tzinfo=UTC)
    else:
        eta_utc = eta_utc.astimezone(UTC)

    first, last = series.times_utc[0], series.times_utc[-1]
    if eta_utc < first - timedelta(minutes=30) or eta_utc > last + timedelta(minutes=30):
        return WeatherSample(status="out_of_range")

    # Nearest slot; ties -> later hour.
    best_idx = 0
    best_key: tuple[float, float] | None = None
    for index, slot in enumerate(series.times_utc):
        delta_s = abs((slot - eta_utc).total_seconds())
        # Prefer smaller delta; on tie prefer later slot (larger timestamp).
        key = (delta_s, -slot.timestamp())
        if best_key is None or key < best_key:
            best_key = key
            best_idx = index

    wind = series.wind_mph[best_idx]
    gust = series.gust_mph[best_idx]
    rain = series.rain_in_hr[best_idx]
    snow = series.snow_in_hr[best_idx]

    if wind is None or rain is None or snow is None:
        return WeatherSample(
            status="missing",
            wind_mph=wind,
            gust_mph=gust,
            rain_in_hr=rain,
            snow_in_hr=snow,
        )
    return WeatherSample(
        status="ok",
        wind_mph=wind,
        gust_mph=gust,
        rain_in_hr=rain,
        snow_in_hr=snow,
    )


def date_window_for_etas(etas: list[datetime]) -> tuple[date, date]:
    """
    UTC date window [floor(min_eta - 1h), ceil(max_eta + 1h)] as calendar dates.

    Returned as start_date/end_date for Open-Meteo (inclusive dates).
    """
    if not etas:
        raise ValueError("etas must be non-empty")
    aware = [
        (e.replace(tzinfo=UTC) if e.tzinfo is None else e.astimezone(UTC))
        for e in etas
    ]
    start_dt = min(aware) - timedelta(hours=1)
    end_dt = max(aware) + timedelta(hours=1)
    # floor start to hour already implied; use calendar dates covering the window
    return start_dt.date(), end_dt.date()


def _upstream_reason(response: requests.Response) -> str:
    """Best-effort short reason string from an Open-Meteo error body."""
    try:
        payload = response.json()
        if isinstance(payload, dict):
            reason = payload.get("reason") or payload.get("error")
            if isinstance(reason, str) and reason.strip():
                return reason.strip()[:240]
    except ValueError:
        pass
    text = (response.text or "").strip().replace("\n", " ")
    return text[:240] if text else ""


def _request_batch(
    session: requests.Session,
    points: list[LatLng],
    start: date,
    end: date,
) -> list[WeatherSeries]:
    """Fetch one Open-Meteo batch (<=50 points) with retries on 429/4xx/5xx."""
    if not points:
        return []

    lats = ",".join(f"{p.lat:.2f}" for p in points)
    lngs = ",".join(f"{p.lng:.2f}" for p in points)
    params = {
        "latitude": lats,
        "longitude": lngs,
        "hourly": HOURLY_VARS,
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "GMT",
        "timeformat": "unixtime",
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    }

    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = session.get(OPEN_METEO_URL, params=params, timeout=REQUEST_TIMEOUT_S)
        except requests.Timeout as exc:
            raise UpstreamTimeoutError() from exc
        except requests.RequestException as exc:
            raise UpstreamBadGatewayError("Weather request failed.") from exc

        if response.status_code == 429 or response.status_code >= 500:
            if response.status_code == 429:
                last_error = UpstreamRateLimitError()
            else:
                last_error = UpstreamBadGatewayError(
                    "Upstream weather service error.",
                    details={
                        "status": response.status_code,
                        "reason": _upstream_reason(response),
                    },
                )
            if attempt < 2:
                _sleep(RETRY_BACKOFF_S[attempt])
                continue
            if response.status_code == 429:
                raise UpstreamRateLimitError()
            raise last_error

        if response.status_code >= 400:
            reason = _upstream_reason(response)
            # Large multi-location GETs intermittently 400 under load; split.
            if response.status_code == 400 and len(points) > 1:
                mid = max(1, len(points) // 2)
                left = _request_batch(session, points[:mid], start, end)
                right = _request_batch(session, points[mid:], start, end)
                return left + right
            if attempt < 2 and response.status_code in {400, 408, 425}:
                last_error = UpstreamBadGatewayError(
                    "Weather request was rejected.",
                    details={"status": response.status_code, "reason": reason},
                )
                _sleep(RETRY_BACKOFF_S[attempt])
                continue
            raise UpstreamBadGatewayError(
                "Weather request was rejected.",
                details={"status": response.status_code, "reason": reason},
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise UpstreamBadGatewayError("Invalid JSON from weather API.") from exc

        series_list = normalize_open_meteo_response(payload)
        if len(points) == 1 and len(series_list) == 1:
            return series_list
        if len(series_list) != len(points):
            # Multi-point: Open-Meteo may still return parallel arrays in one object
            # with list-valued lat/lng; handle list form primarily.
            if isinstance(payload, dict) and isinstance(payload.get("latitude"), list):
                # Split not available as separate objects — treat as mismatch.
                raise UpstreamBadGatewayError(
                    "Weather response location count mismatch.",
                    details={"expected": len(points), "got": len(series_list)},
                )
            if len(series_list) == 1 and len(points) == 1:
                return series_list
            # Mismatch on large batches: split and retry once.
            if len(points) > 1:
                mid = max(1, len(points) // 2)
                left = _request_batch(session, points[:mid], start, end)
                right = _request_batch(session, points[mid:], start, end)
                return left + right
            raise UpstreamBadGatewayError(
                "Weather response location count mismatch.",
                details={"expected": len(points), "got": len(series_list)},
            )
        return series_list

    assert last_error is not None
    raise last_error


def fetch_hourly(
    points: list[LatLng],
    start_date: date,
    end_date: date,
    *,
    session: requests.Session | None = None,
    max_workers: int = MAX_WORKERS,
) -> dict[tuple[float, float], WeatherSeries]:
    """
    Fetch hourly weather for points (D12).

    Snaps to 0.05°, dedupes, batches ≤50, up to 4 parallel requests, caches 30 min.
    Returns mapping of (snapped_lat, snapped_lng) -> WeatherSeries.
    """
    if end_date < start_date:
        raise ValueError("end_date must be >= start_date")

    http = session or requests.Session()
    unique: list[LatLng] = []
    seen: set[tuple[float, float]] = set()
    for point in points:
        snapped = snap_point(point)
        key = (snapped.lat, snapped.lng)
        if key not in seen:
            seen.add(key)
            unique.append(snapped)

    result: dict[tuple[float, float], WeatherSeries] = {}
    missing: list[LatLng] = []
    # Call via module attribute so freezegun patches apply safely.
    now = float(time.time())
    for point in unique:
        key = cache_key(point, start_date, end_date)
        cached = _cache.get(key)
        if cached and now - cached[0] <= CACHE_TTL_S:
            result[(point.lat, point.lng)] = cached[1]
        else:
            missing.append(point)

    if not missing:
        return result

    batches = [missing[i : i + BATCH_SIZE] for i in range(0, len(missing), BATCH_SIZE)]

    def run_batch(batch: list[LatLng]) -> list[tuple[LatLng, WeatherSeries]]:
        series_list = _request_batch(http, batch, start_date, end_date)
        return list(zip(batch, series_list, strict=True))

    workers = max(1, min(max_workers, len(batches)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(run_batch, batch) for batch in batches]
        for future in as_completed(futures):
            for point, series in future.result():
                result[(point.lat, point.lng)] = series
                _cache[cache_key(point, start_date, end_date)] = (time.time(), series)

    return result


def attach_weather(
    checkpoints: list[Checkpoint],
    series_by_point: dict[tuple[float, float], WeatherSeries],
) -> list[Checkpoint]:
    """
    Attach nearest-slot weather to each checkpoint (D5).

    Look up series by snapped checkpoint coordinates. Status in
    {ok, missing, out_of_range}.
    """
    enriched: list[Checkpoint] = []
    for cp in checkpoints:
        snapped = snap_point(LatLng(lat=cp.lat, lng=cp.lng))
        series = series_by_point.get((snapped.lat, snapped.lng))
        if series is None:
            enriched.append(with_weather(cp, status="missing"))
            continue
        sample = value_at(series, cp.eta_utc)
        enriched.append(
            with_weather(
                cp,
                status=sample.status,
                wind_mph=sample.wind_mph,
                gust_mph=sample.gust_mph,
                rain_in_hr=sample.rain_in_hr,
                snow_in_hr=sample.snow_in_hr,
            )
        )
    return enriched


