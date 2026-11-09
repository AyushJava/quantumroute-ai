#!/usr/bin/env bash
# QuantumRoute AI — cross-service smoke test.
# Exercises: health -> register -> login -> workspace -> scenario -> job -> result.
#
# Prerequisites: docker compose stack running (db, optimizer, backend).
#   Required env: JWT_SECRET must be set for the backend container.
#   JSON parsing uses python3 (no jq dependency).
#
# Usage:  ./scripts/smoke-e2e.sh [backend_base_url] [optimizer_base_url]
# Defaults: http://localhost:8081  http://localhost:8000

set -euo pipefail

BACKEND="${1:-http://localhost:8081}"
OPTIMIZER="${2:-http://localhost:8000}"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  PASS  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL  $1"; }

die()  { echo "ERROR: $1" >&2; exit 1; }

command -v curl >/dev/null || die "curl is required"

# JSON parsing needs a Python interpreter. Override with QR_PYTHON if needed.
# Each candidate is probe-tested because Windows "App execution alias" stubs
# (python/python3) exist on PATH but fail when actually run.
PY=""
for cand in "${QR_PYTHON:-}" python3 python "py -3"; do
  [ -z "$cand" ] && continue
  if $cand -c "import sys" >/dev/null 2>&1; then PY="$cand"; break; fi
done
[ -n "$PY" ] || die "python3/python/py required for JSON parsing (or set QR_PYTHON)"

jget() { $PY -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1"; }

api() { # method path [json-body] [token]
  local method="$1" path="$2" body="${3:-}" token="${4:-}"
  local args=(-s -o /tmp/qr_resp.json -w "%{http_code}" -X "$method"
              -H "Content-Type: application/json")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(-d "$body")
  curl "${args[@]}" "$BACKEND$path"
}

echo "== QuantumRoute AI smoke test =="
echo "backend:   $BACKEND"
echo "optimizer: $OPTIMIZER"

# --- health ---------------------------------------------------------------
echo "-- health checks --"
code=$(curl -s -o /dev/null -w "%{http_code}" "$OPTIMIZER/api/health" || true)
[ "$code" = "200" ] && ok "optimizer /api/health" \
  || die "optimizer not reachable at $OPTIMIZER (HTTP $code) — start the stack first"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND/actuator/health" 2>/dev/null || true)
if [ "$code" != "200" ]; then
  # fall back to any 2xx/3xx or a known API endpoint
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND/api/v1/auth/login" -X POST -H 'Content-Type: application/json' -d '{}' || true)
fi
[ "$code" != "000" ] && ok "backend reachable" \
  || die "backend not reachable at $BACKEND — start the stack first"

# --- register + login ------------------------------------------------------
echo "-- auth --"
EMAIL="smoke-$(date +%s)-$RANDOM@example.com"
USER_PW="SmokeTest-$(date +%s)"
code=$(api POST /api/v1/auth/register \
  "{\"email\":\"$EMAIL\",\"password\":\"$USER_PW\",\"displayName\":\"Smoke\"}")
[ "$code" = "201" ] && ok "register $EMAIL" || { cat /tmp/qr_resp.json; bad "register ($code)"; exit 1; }

code=$(api POST /api/v1/auth/login "{\"email\":\"$EMAIL\",\"password\":\"$USER_PW\"}")
[ "$code" = "200" ] && ok "login" || { cat /tmp/qr_resp.json; bad "login ($code)"; exit 1; }
TOKEN=$(jget "['accessToken']" < /tmp/qr_resp.json)
[ -n "$TOKEN" ] && ok "JWT acquired" || die "no accessToken in login response"

# --- workspace -------------------------------------------------------------
echo "-- workspace --"
code=$(api POST /api/v1/workspaces '{"name":"smoke-ws"}' "$TOKEN")
[ "$code" = "201" ] && ok "workspace created" || { cat /tmp/qr_resp.json; bad "workspace ($code)"; exit 1; }
WS_ID=$(jget "['id']" < /tmp/qr_resp.json)

# --- scenario (small deterministic graph) ----------------------------------
echo "-- scenario --"
GRAPH='{"name":"smoke-graph","directed":false,"nodes":[{"id":"A","lat":12.9,"lon":77.6},{"id":"B","lat":13.0,"lon":77.7},{"id":"C","lat":13.1,"lon":77.8}],"edges":[{"id":"e1","source":"A","target":"B","length_m":1000,"speed_kmh":50,"cost":1.0,"congestion":0.1,"closed":false},{"id":"e2","source":"B","target":"C","length_m":2000,"speed_kmh":60,"cost":2.0,"congestion":0.2,"closed":false},{"id":"e3","source":"A","target":"C","length_m":9000,"speed_kmh":80,"cost":9.0,"congestion":0.5,"closed":true}]}'
SC_BODY=$($PY -c "import json;print(json.dumps({'name':'smoke-sc','graph':json.loads('''$GRAPH''')}))")
code=$(api POST "/api/v1/workspaces/$WS_ID/scenarios" "$SC_BODY" "$TOKEN")
[ "$code" = "201" ] && ok "scenario created" || { cat /tmp/qr_resp.json; bad "scenario ($code)"; exit 1; }
SC_ID=$(jget "['id']" < /tmp/qr_resp.json)

# --- job --------------------------------------------------------------------
echo "-- optimization job --"
JOB_BODY='{"algorithm":"DIJKSTRA","sourceNodeId":"A","targetNodeId":"C","parameters":{}}'
code=$(api POST "/api/v1/scenarios/$SC_ID/jobs" "$JOB_BODY" "$TOKEN")
[ "$code" = "202" ] && ok "job submitted (202)" || { cat /tmp/qr_resp.json; bad "job submit ($code)"; exit 1; }
JOB_ID=$(jget "['id']" < /tmp/qr_resp.json)
STATUS=$(jget "['status']" < /tmp/qr_resp.json)
echo "     job $JOB_ID status=$STATUS"

# --- poll -------------------------------------------------------------------
echo "-- polling job status --"
FINAL=""
for i in $(seq 1 60); do
  code=$(api GET "/api/v1/jobs/$JOB_ID" "" "$TOKEN")
  [ "$code" = "200" ] || { sleep 1; continue; }
  STATUS=$(jget "['status']" < /tmp/qr_resp.json)
  case "$STATUS" in
    COMPLETED|FAILED|TIMEOUT) FINAL="$STATUS"; break;;
  esac
  sleep 1
done
[ -n "$FINAL" ] && ok "job reached $FINAL" || die "job did not finish within 60s"
[ "$FINAL" = "COMPLETED" ] || { echo "     job failed/timed out — check backend logs"; exit 1; }

# --- result -----------------------------------------------------------------
echo "-- result --"
code=$(api GET "/api/v1/jobs/$JOB_ID/result" "" "$TOKEN")
[ "$code" = "200" ] && ok "result retrieved" || { cat /tmp/qr_resp.json; bad "result ($code)"; exit 1; }
FEASIBLE=$(jget "['feasible']" < /tmp/qr_resp.json)
NODES=$(jget "['route']['nodeIds']" < /tmp/qr_resp.json)
echo "     feasible=$FEASIBLE route=$NODES"
[ "$FEASIBLE" = "True" ] && ok "route feasible" || bad "route infeasible"
case "$NODES" in
  *A*B*C*|*A*C*) ok "route contains expected nodes";;
  *) bad "unexpected route: $NODES";;
esac
DIST=$(jget "['metrics']['distanceMeters']" < /tmp/qr_resp.json)
echo "     distanceMeters=$DIST"

echo ""
echo "== smoke test: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
