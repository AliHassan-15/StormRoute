# StormRoute Locked Decisions

These decisions override preferences. Paste is verbatim from the assessment master brief (D1–D20).

D1 Boundaries, evaluated on UNROUNDED values:
  Wind mph: LOW x<25; MODERATE 25<=x<35; HIGH 35<=x<45; SEVERE 45<=x<55; NO_TRAVEL x>=55.
  Rain in/hr: LOW x<0.10; MODERATE 0.10<=x<0.25; HIGH 0.25<=x<0.50; SEVERE 0.50<=x<=1.00; NO_TRAVEL x>1.00.
  Snow in/hr: LOW x<0.5; MODERATE 0.5<=x<1.0; HIGH 1.0<=x<2.0; SEVERE 2.0<=x<=3.0; NO_TRAVEL x>3.0.
  (Lower bound inclusive where the table is ambiguous; rain exactly 1.00 and snow exactly 3.0 are SEVERE because the brief says NO_TRAVEL is strictly greater.)
D2 Load rules run AFTER base classification and can only RAISE the level. Strict inequalities: load > 30,000 and load > 40,000. 'Wind 45-54' means 45<=wind<55; 'wind 35-44' means 35<=wind<45.
D3 Checkpoint final level = worst of wind, rain, snow levels after load rules.
D4 Rain rate = Open-Meteo rain + showers (in/hr). Snow = Open-Meteo snowfall (inches of snow per hour). Wind = sustained wind_speed_10m in mph. Gusts are displayed but NOT classified.
D5 Weather lookup uses the hourly slot NEAREST the checkpoint ETA. If the ETA is more than 30 minutes outside the available series, status = out_of_range. Null values -> status = missing. Missing or out-of-range is NEVER treated as Low; it is 'unknown' and shown as such.
D6 Checkpoints: interval 'auto' (route <=150 mi -> 10; <=500 mi -> 25; else 50) or user-chosen 10/25/50. Origin and destination are always checkpoints. Drop the last regular checkpoint if it is within 0.25*interval of the destination. Max 150 checkpoints per route (raise the interval and tell the user).
D7 Distance along route is haversine over the FULL-resolution geometry, scaled so the total equals the API-reported distance. ETA uses per-segment durations from the routing API (fallback: proportional to distance). ETA assumes continuous driving (no breaks, no traffic): a documented limitation.
D8 Coverage: each checkpoint represents half the distance to each neighbour (origin: 0 to midpoint; destination: midpoint to end). Miles by level must sum exactly to route distance.
D9 Average risk = distance-weighted mean of level numbers (LOW=1, MODERATE=2, HIGH=3, SEVERE=4, NO_TRAVEL=5), excluding unknown checkpoints.
D10 Ranking key, ascending: (has_no_travel, no_travel_miles, severe_miles, high_miles, avg_risk, duration). For comparison round miles to the nearest 1 mile, avg_risk to 2 decimals, duration to the nearest minute. A route with any NO_TRAVEL is 'blocked' and ranks below every unblocked route. If all are blocked, recommendation is null with a clear message. The explanation text must always state the time cost versus the fastest route.
D11 Routing: Mapbox Directions 'driving' with alternatives. If fewer than 3 distinct routes come back, try fallbacks (exclude=toll, then perpendicular via-point routes); drop routes that overlap >85% with an existing one or are >1.5x the fastest duration. NEVER fabricate routes: if fewer than 3 distinct exist, return fewer plus a notice. Mapbox 'driving' is a car profile; truck restrictions (height, weight, hazmat) are not modelled: documented limitation.
D12 Weather fetch: coordinates snapped to 0.05 degrees, deduplicated, batched <=50 per request, timezone=GMT, timeformat=unixtime, units mph and inch, only the date window needed (start_date/end_date). Cache per snapped point and date window for 30 min.
D13 Local time per checkpoint via timezonefinder + zoneinfo. API returns ISO-8601 with offset and the IANA timezone name.
D14 Validation: load 0-200,000 lb (UI shows a soft warning above 80,000); departure between now-1h and now+14 days; origin and destination at least 1 mile apart; interval in {auto,10,25,50}.
D15 Heatmap: hour 0 = departure time rounded to the nearest hour; slider 0..48 inclusive (49 frames); layers Wind, Rain, Snow, Overall Risk (Overall uses the load).
D16 Thresholds live ONLY in backend core/risk.py and are exposed at GET /api/meta; the frontend legend and 'How risk is calculated' modal read from /api/meta.
D17 No mock data in product code paths. Fixtures only in tests.
D18 All API errors are typed: {error:{code,message,details?}} with codes VALIDATION_ERROR, GEOCODE_FAILED, NO_ROUTE, UPSTREAM_TIMEOUT, UPSTREAM_RATE_LIMIT, FORECAST_UNAVAILABLE, INTERNAL.
D19 Stateless backend: no database models, caching only. Gunicorn runs 1 worker with 8 threads so the in-process cache is shared.
D20 Coordinates: GeoJSON order [lng, lat] at all API boundaries; internal Python uses explicit (lat, lng) named fields. Never use bare tuples across module boundaries.
