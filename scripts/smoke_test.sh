#!/usr/bin/env bash
# End-to-end smoke test: log in, check seeded data, exercise key endpoints.
# Assumes the dev stack is up on http://localhost (nginx -> backend).
set -euo pipefail

BASE="${BASE_URL:-http://localhost/api}"
USERNAME="${SMOKE_USER:-admin}"
PASSWORD="${SMOKE_PASS:-Admin!pass123}"

log() { printf "\033[36m[smoke]\033[0m %s\n" "$*"; }
fail() { printf "\033[31m[smoke]\033[0m %s\n" "$*"; exit 1; }

log "1. /health"
curl -fsS "$BASE/health" > /dev/null || fail "health failed"

log "2. login as $USERNAME"
TOKEN=$(curl -fsS -X POST "$BASE/auth/login" \
  -F "username=$USERNAME" -F "password=$PASSWORD" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
test -n "$TOKEN" || fail "no access token"

AUTH="Authorization: Bearer $TOKEN"

log "3. /users/me"
curl -fsS -H "$AUTH" "$BASE/users/me" | grep -q '"role"' || fail "me endpoint"

log "4. /dashboard/stats"
curl -fsS -H "$AUTH" "$BASE/dashboard/stats" | grep -q 'total_contract_value' || fail "dashboard stats"

log "5. /projects (expect at least 1 seeded)"
COUNT=$(curl -fsS -H "$AUTH" "$BASE/projects" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')
test "$COUNT" -gt 0 || fail "no seeded projects"

log "6. /contracts list"
curl -fsS -H "$AUTH" "$BASE/contracts" | grep -q 'contract_number' || fail "contracts"

log "7. /historical-invoices list"
curl -fsS -H "$AUTH" "$BASE/historical-invoices" | grep -q 'invoice_number' || fail "historical invoices"

log "8. /health/ready (may 503 if Ollama hasn't pulled yet)"
curl -sS "$BASE/health/ready" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(json.dumps(d,indent=2))' || true

log "OK — smoke test green"
