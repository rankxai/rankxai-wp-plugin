#!/usr/bin/env bash
# Regression tests for the three write-path defects found in the 2026-09-21 audit.
# All three were proven against a live site BEFORE being fixed, which is the only
# reason they are known to be real. Each check below fails on the old behaviour.
set -u

API="${API:-http://localhost:8888/wp-json/rankxai/v1}"
AUTH="${WP_AUTH:?set WP_AUTH=user:app-password}"
POST_ID="${POST_ID:-4}"
CLI="${CLI_CONTAINER:-wp-env-rankxai-wordpress-plugin-599f954e-cli-1}"

pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass+1)); }
bad() { echo "  FAIL  $1"; fail=$((fail+1)); }
wpcli(){ MSYS_NO_PATHCONV=1 docker exec -u 33 "$CLI" wp "$@" 2>/dev/null; }
field(){ curl -sS -u "$AUTH" "$API/seo/$POST_ID" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).rankxai['$1'] || ''"; }
write(){ curl -sS -o /dev/null -w '%{http_code}' -u "$AUTH" -X POST -H 'Content-Type: application/json' -d "$1" "$API/seo/$POST_ID"; }

echo "=== seed a known-good record ==="
write '{"fields":{"title":"SAFE-TITLE","canonical":"https://example.com/safe"}}' >/dev/null
[ "$(field title)" = "SAFE-TITLE" ] && ok "seeded title" || bad "could not seed title"
[ "$(field canonical)" = "https://example.com/safe" ] && ok "seeded canonical" || bad "could not seed canonical"

echo "=== B2: an invalid canonical must be REFUSED and must not destroy the good one ==="
CODE=$(write '{"fields":{"canonical":"javascript:alert(1)"}}')
[ "$CODE" = "400" ] && ok "invalid canonical refused with 400 (was 200)" || bad "expected 400, got $CODE"
[ "$(field canonical)" = "https://example.com/safe" ] && ok "stored canonical SURVIVED" || bad "stored canonical was destroyed: '$(field canonical)'"

echo "=== B1: a non-string value must be REFUSED and must not destroy the good one ==="
CODE=$(write '{"fields":{"title":{"nested":"object"}}}')
[ "$CODE" = "400" ] && ok "non-string title refused with 400 (was 200)" || bad "expected 400, got $CODE"
[ "$(field title)" = "SAFE-TITLE" ] && ok "stored title SURVIVED" || bad "stored title was destroyed: '$(field title)'"

echo "=== all-or-nothing: one bad field must not let a good sibling through ==="
# NOTE: "not-a-url" is NOT a good test input — esc_url_raw() upgrades it to
# http://not-a-url, which is syntactically valid and correctly accepted. The
# first version of this check used it and failed against correct code. Use a
# value that is genuinely refusable.
MARKER="SHOULD-NOT-LAND-$-$RANDOM"
write '{"fields":{"description":""}}' >/dev/null
CODE=$(write "{\"fields\":{\"description\":\"$MARKER\",\"canonical\":\"javascript:void(0)\"}}")
[ "$CODE" = "400" ] && ok "mixed payload refused" || bad "expected 400, got $CODE"
[ "$(field description)" != "$MARKER" ] && ok "good sibling correctly NOT written" || bad "partial write landed"

echo "=== an explicit empty string must still CLEAR ==="
write '{"fields":{"canonical":""}}' >/dev/null
[ -z "$(field canonical)" ] && ok "explicit clear still works" || bad "explicit clear broken: '$(field canonical)'"

echo "=== B3: AIOSEO writableFields must report every field it can write ==="
wpcli plugin deactivate wordpress-seo seo-by-rank-math wp-seopress autodescription >/dev/null
wpcli plugin activate all-in-one-seo-pack >/dev/null
N=$(curl -sS -u "$AUTH" "$API/manifest" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).seo.writableFields.length")
[ "$N" -ge 7 ] && ok "AIOSEO reports $N writable fields (was 3)" || bad "AIOSEO reports only $N writable fields"
write '{"fields":{"twitter_title":"TW-AIOSEO"}}' >/dev/null
curl -sS -u "$AUTH" "$API/seo/$POST_ID" | grep -q 'TW-AIOSEO' && ok "a field it now claims actually writes" || bad "claimed field did not write"

echo "================================================"
echo "PASSED $pass   FAILED $fail"
[ "$fail" -eq 0 ] || exit 1
