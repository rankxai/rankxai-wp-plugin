#!/usr/bin/env bash
# Records which SEO output filters fire, and which sentinels reach the rendered
# <head>, with no SEO plugin and then with each of five alone.
# Run: bash probe/run-filter-matrix.sh
set -u

. "$(dirname "$0")/containers.sh"

CLI="${CLI_CONTAINER:-$(rankxai_require_container -cli-1)}"
WP="${WP_CONTAINER:-$(rankxai_require_container -wordpress-1)}"
URL="${POST_URL:-http://localhost:8888/2026/09/21/plan-80-probe-post/}"
OUT="${OUT_DIR:-./probe/results}"
ALL="wordpress-seo seo-by-rank-math wp-seopress all-in-one-seo-pack autodescription"

mkdir -p "$OUT"
wpcli() { docker exec -u 33 "$CLI" wp "$@" 2>/dev/null; }
dex()   { MSYS_NO_PATHCONV=1 docker exec "$WP" "$@"; }

# The sentinels replace every page's title, so they are on only for this run.
wpcli option update rankxai_probe_sentinels 1 >/dev/null
trap 'wpcli option delete rankxai_probe_sentinels >/dev/null' EXIT

report() { # $1 = json file
  node -e '
    const fs=require("fs");
    let j; try { j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); }
    catch(e){ console.log("  probe json     : UNREADABLE ("+e.message.slice(0,40)+")"); process.exit(0); }
    console.log("  detected verdict: "+j.seoPluginVerdict+"  active="+JSON.stringify(j.activeSeoPlugins));
    console.log("  filters FIRED   : "+(Object.keys(j.filtersFired||{}).join(" ")||"(none)"));
    if ((j.redirectTables||[]).length) console.log("  redirect tables : "+j.redirectTables.join(" "));
    if (j.aioseoModelClass || j.aioseoFn) console.log("  aioseo api      : model="+j.aioseoModelClass+" fn="+j.aioseoFn);
  ' "$1"
}

for scenario in none wordpress-seo seo-by-rank-math wp-seopress all-in-one-seo-pack autodescription; do
  echo "================ $scenario ================"
  # shellcheck disable=SC2086
  wpcli plugin deactivate $ALL >/dev/null
  if [ "$scenario" != "none" ]; then
    wpcli plugin activate "$scenario" >/dev/null
    # Rank Math's filters do not run until its setup wizard is marked done.
    if [ "$scenario" = "seo-by-rank-math" ]; then
      wpcli option update rank_math_wizard_completed 1 >/dev/null
      wpcli option patch insert rank_math_modules 0 redirections >/dev/null 2>&1
    fi
  fi

  dex rm -f /tmp/rankxai-probe.json 2>/dev/null
  HTML=$(curl -sS --max-time 60 "$URL")
  printf '%s' "$HTML" > "$OUT/$scenario.html"
  dex cat /tmp/rankxai-probe.json > "$OUT/$scenario.json" 2>/dev/null

  report "$OUT/$scenario.json"
  LANDED=$(printf '%s' "$HTML" | grep -o 'RANKXAI_SENTINEL_[A-Z0-9_]*' | sort -u | tr '\n' ' ')
  echo "  sentinels LANDED: ${LANDED:-(none)}"
done
echo "================ done; artefacts in $OUT ================"
