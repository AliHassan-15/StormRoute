#!/usr/bin/env bash
# StormRoute production smoke test.
# Usage:
#   API_BASE=https://stormroute-api.onrender.com ./scripts/smoke_prod.sh
# Requires: curl, jq
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:8000}"
API_BASE="${API_BASE%/}"

echo "==> Health: ${API_BASE}/api/health"
health="$(curl -fsS "${API_BASE}/api/health")"
echo "${health}" | jq .
status="$(echo "${health}" | jq -r .status)"
if [[ "${status}" != "ok" ]]; then
  echo "FAIL: health status is '${status}', expected 'ok'" >&2
  exit 1
fi

# Denver → Boulder (~30 mi). Departure = now + 2h (ISO-8601 with offset).
if date -u -d '+2 hours' +"%Y-%m-%dT%H:%M:%S+00:00" >/dev/null 2>&1; then
  DEPARTURE="$(date -u -d '+2 hours' +"%Y-%m-%dT%H:%M:%S+00:00")"
else
  # macOS / BSD date
  DEPARTURE="$(date -u -v+2H +"%Y-%m-%dT%H:%M:%S+00:00")"
fi

echo "==> Analyze Denver → Boulder @ ${DEPARTURE}"
payload="$(jq -n \
  --arg dep "${DEPARTURE}" \
  '{
    origin: { label: "Denver, CO", lat: 39.7392, lng: -104.9903 },
    destination: { label: "Boulder, CO", lat: 40.015, lng: -105.2705 },
    departure_time: $dep,
    load_lb: 0,
    interval: "auto"
  }')"

tmp="$(mktemp)"
trap 'rm -f "${tmp}"' EXIT
http_code="$(curl -sS -o "${tmp}" -w "%{http_code}" \
  -X POST "${API_BASE}/api/analyze" \
  -H "Content-Type: application/json" \
  -d "${payload}")"

if [[ "${http_code}" != "200" ]]; then
  echo "FAIL: analyze HTTP ${http_code}" >&2
  cat "${tmp}" >&2
  exit 1
fi

jq . "${tmp}" >/dev/null

route_count="$(jq '.routes | length' "${tmp}")"
if (( route_count < 1 || route_count > 3 )); then
  echo "FAIL: expected 1..3 routes, got ${route_count}" >&2
  exit 1
fi

all_blocked="$(jq -r '.recommendation.all_blocked // false' "${tmp}")"
rec_id="$(jq -r '.recommendation.route_id // empty' "${tmp}")"
rec_count="$(jq '[.routes[] | select(.is_recommended == true)] | length' "${tmp}")"

if [[ "${all_blocked}" == "true" ]]; then
  if [[ -n "${rec_id}" ]]; then
    echo "FAIL: all_blocked but recommendation.route_id is set" >&2
    exit 1
  fi
  if (( rec_count != 0 )); then
    echo "FAIL: all_blocked but ${rec_count} routes marked recommended" >&2
    exit 1
  fi
else
  if [[ -z "${rec_id}" ]]; then
    echo "FAIL: expected a recommended route_id" >&2
    exit 1
  fi
  if (( rec_count != 1 )); then
    echo "FAIL: expected exactly one recommended route, got ${rec_count}" >&2
    exit 1
  fi
fi

# Miles by level sum to distance within 0.01 mi
jq -e '
  .routes | all(
    (.metrics.miles_by_level | to_entries | map(.value) | add) as $sum
    | (($sum - .distance_mi) | fabs) <= 0.01
  )
' "${tmp}" >/dev/null \
  || { echo "FAIL: miles_by_level does not sum to distance_mi within 0.01" >&2; exit 1; }

# ETAs strictly increasing along each route
jq -e '
  .routes | all(
    (.checkpoints | map(.eta_utc)) as $etas
    | ($etas | length) < 2
      or ([range(0; ($etas|length)-1) | select($etas[.] >= $etas[. + 1])] | length) == 0
  )
' "${tmp}" >/dev/null \
  || { echo "FAIL: checkpoint ETAs are not strictly increasing" >&2; exit 1; }

echo "OK: smoke passed (${route_count} routes, all_blocked=${all_blocked})"
