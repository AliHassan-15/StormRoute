# StormRoute API

Typed errors follow D18: `{ "error": { "code", "message", "details?" } }`.

Codes: `VALIDATION_ERROR`, `GEOCODE_FAILED`, `NO_ROUTE`, `UPSTREAM_TIMEOUT`,
`UPSTREAM_RATE_LIMIT`, `FORECAST_UNAVAILABLE`, `INTERNAL`.

Coordinates at API boundaries are GeoJSON order `[lng, lat]` inside geometries.
Place objects use named `{ lat, lng }` fields (D20). JSON never contains `NaN`
or `Infinity`.

## GET /api/health

Liveness: `{ status, version, time_utc }`.

## GET /api/meta

Risk thresholds and load rules from `core.risk` (D16).

## GET /api/geocode?q=

Forward geocode. Returns `[{ id, label, lat, lng }]`.

## POST /api/routes

Body: `{ origin: {lat,lng}, destination: {lat,lng} }`.

Response: `{ routes: RouteSummary[], notice: string|null }` where geometry is a
display-simplified GeoJSON LineString.

## POST /api/analyze

Full trip analysis: routes → checkpoints → weather → risk → score → rank.

### Request

```ts
{
  origin: { label: string, lat: number, lng: number },
  destination: { label: string, lat: number, lng: number },
  departure_time: string, // ISO-8601 WITH timezone offset (Z or ±HH:MM)
  load_lb: number,        // 0 .. 200000
  interval: "auto" | 10 | 25 | 50
}
```

Validation (D14):

- `load_lb` in `[0, 200000]`
- `departure_time` between now−1h and now+14 days (converted to UTC)
- origin/destination at least 1 mile apart
- `interval` in `{auto,10,25,50}`

Field-level failures return `VALIDATION_ERROR` with `details` keyed by field.

### Response (`AnalyzeResponse`)

```ts
{
  request_id: string,
  generated_at_utc: string, // ISO-8601 UTC
  input: {
    origin: { label: string, lat: number, lng: number },
    destination: { label: string, lat: number, lng: number },
    departure_time_utc: string,
    load_lb: number,
    interval_requested: "auto" | 10 | 25 | 50,
    interval_used_mi: number
  },
  routes: Route[],
  recommendation: {
    route_id: string | null,
    explanation: string,
    all_blocked: boolean
  },
  notices: string[]
}
```

```ts
type Route = {
  id: string,
  label: string,
  rank: number,              // 1 = best
  is_recommended: boolean,
  is_blocked: boolean,
  distance_mi: number,
  duration_s: number,
  delay_vs_fastest_s: number,
  arrival_utc: string,
  arrival_local: string,
  geometry: { type: "LineString", coordinates: [number, number][] }, // [lng,lat]
  metrics: {
    miles_by_level: {
      LOW: number,
      MODERATE: number,
      HIGH: number,
      SEVERE: number,
      NO_TRAVEL: number,
      UNKNOWN: number
    },
    severe_miles: number,
    high_miles: number,
    no_travel_miles: number,
    avg_risk: number | null,
    worst_level: "LOW"|"MODERATE"|"HIGH"|"SEVERE"|"NO_TRAVEL"|null
  },
  checkpoints: Checkpoint[]
}
```

```ts
type Checkpoint = {
  index: number,
  mile: number,
  lat: number,
  lng: number,
  eta_utc: string,
  eta_local: string,
  tz: string,                 // IANA name
  coverage_from_mi: number,
  coverage_to_mi: number,
  weather: {
    wind_mph: number,
    gust_mph: number | null,
    rain_in_hr: number,
    snow_in_hr: number
  } | null,
  weather_status: "ok" | "missing" | "out_of_range",
  level: 1 | 2 | 3 | 4 | 5 | null,
  level_name: string,         // LOW..NO_TRAVEL or UNKNOWN
  condition_levels: { wind: string, rain: string, snow: string } | null,
  reasons: string[]
}
```

Caching: full analysis response cached 10 minutes keyed by the full input body.
Successful analyze also seeds the routes cache (10 min) for heatmap reuse.
Rate limiting uses the existing anonymous throttle.

## POST /api/heatmap

Corridor weather heatmap for the forecast slider (D12, D15). Routes are taken
from the cached `/api/routes` payload when present; otherwise Mapbox is fetched.

### Request

```ts
{
  origin: { label?: string, lat: number, lng: number },
  destination: { label?: string, lat: number, lng: number },
  departure_time: string, // ISO-8601 WITH timezone offset
  load_lb: number         // 0 .. 200000
}
```

### Response

```ts
{
  t0_utc: string,       // hour 0 = departure rounded to nearest hour (ties up)
  frame_count: 49,      // hours 0..48 inclusive
  points: Array<{
    lat: number,
    lng: number,
    wind: Array<number | null>,  // mph, 1 decimal
    rain: Array<number | null>,  // in/hr, 3 decimals
    snow: Array<number | null>,  // in/hr, 3 decimals
    risk: Array<number | null>   // 1..5 integers; null when forecast missing
  }>,
  notices: string[]
}
```

Caching: 15 minutes keyed by origin/destination/departure/load. GZip enabled.

Machine-readable schema: [`analyze_response.schema.json`](./analyze_response.schema.json).
