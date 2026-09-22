#!/usr/bin/env bash
# End-to-end verification of the SEO capability, on the real credential.
# For every scenario (no SEO plugin, then each of the five alone) this:
set -u

. "$(dirname "$0")/containers.sh"

CLI="${CLI_CONTAINER:-$(rankxai_require_container -cli-1)}"
URL="${POST_URL:-http://localhost:8888/2026/09/21/plan-80-probe-post/}"
POST_ID="${POST_ID:-4}"
AUTH="${WP_AUTH:?set WP_AUTH=user:app-password}"
API="http://localhost:8888/wp-json/rankxai/v1"
ALL="wordpress-seo seo-by-rank-math wp-seopress all-in-one-seo-pack autodescription"

pass=0; fail=0
ok()   { echo "    PASS  $1"; pass=$((pass+1)); }
bad()  { echo "    FAIL  $1"; fail=$((fail+1)); }
wpcli(){ MSYS_NO_PATHCONV=1 docker exec -u 33 "$CLI" wp "$@" 2>/dev/null; }

for scenario in none wordpress-seo seo-by-rank-math wp-seopress all-in-one-seo-pack autodescription; do
  echo "================ $scenario ================"
  # shellcheck disable=SC2086
  wpcli plugin deactivate $ALL >/dev/null
  [ "$scenario" != "none" ] && wpcli plugin activate "$scenario" >/dev/null

  TITLE="RXTITLE-${scenario}-$$"
  DESC="RXDESC-${scenario}-$$"

  MANIFEST=$(curl -sS -u "$AUTH" "$API/manifest")
  VERDICT=$(printf '%s' "$MANIFEST" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).seo.verdict' 2>/dev/null)
  EXPECT=$([ "$scenario" = "none" ] && echo none || echo "$(
    case "$scenario" in
      wordpress-seo) echo yoast;; seo-by-rank-math) echo rankmath;;
      wp-seopress) echo seopress;; all-in-one-seo-pack) echo aioseo;;
      autodescription) echo tsf;;
    esac)")
  [ "$VERDICT" = "$EXPECT" ] && ok "manifest verdict = $VERDICT" || bad "manifest verdict: got '$VERDICT' want '$EXPECT'"

  WROTE=$(curl -sS -u "$AUTH" -X POST -H 'Content-Type: application/json' \
    -d "{\"fields\":{\"title\":\"$TITLE\",\"description\":\"$DESC\"}}" "$API/seo/$POST_ID")
  printf '%s' "$WROTE" | grep -q '"written"' && ok "write accepted" || bad "write rejected: $(printf '%s' "$WROTE" | head -c 160)"

  READ=$(curl -sS -u "$AUTH" "$API/seo/$POST_ID")
  printf '%s' "$READ" | grep -q "$TITLE" && ok "read back from our store" || bad "read back missing title"

  if [ "$scenario" != "none" ] && [ "$scenario" != "seo-by-rank-math" ]; then
    printf '%s' "$READ" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);process.exit(Object.keys(j.pluginStored||{}).length?0:1)})' \
      && ok "rung 1 mirrored into ${scenario}" || bad "rung 1 mirror empty for ${scenario}"
  fi

  HTML=$(curl -sS --max-time 60 "$URL")
  printf '%s' "$HTML" | grep -q "$TITLE" && ok "TITLE in rendered <head>" || bad "TITLE absent from rendered page"
  printf '%s' "$HTML" | grep -q "$DESC"  && ok "DESCRIPTION in rendered <head>" || bad "DESCRIPTION absent from rendered page"

  if [ "$scenario" = "none" ]; then
    printf '%s' "$HTML" | grep -q '<!-- RankX AI -->' && ok "own-head block present (rung 3)" || bad "own-head block missing"
  else
    printf '%s' "$HTML" | grep -q '<!-- RankX AI -->' && bad "own-head block LEAKED while ${scenario} active" || ok "own-head correctly silent"
  fi
done

echo "================================================"
echo "PASSED $pass   FAILED $fail"
[ "$fail" -eq 0 ] || exit 1
