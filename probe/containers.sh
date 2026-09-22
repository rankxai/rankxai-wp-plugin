# wp-env names its containers after the checkout directory, so a hardcoded name
# stops resolving the moment the folder is renamed — and a probe that has lost
# its oracle reports passes against nothing. Derive it, and refuse to run without.

rankxai_container() {
  suffix="$1"
  docker ps --format '{{.Names}}' 2>/dev/null | tr -d '\r' | while read -r name; do
    case "$name" in
      wp-env-*-tests-*) ;;
      wp-env-*"$suffix") printf '%s\n' "$name" ;;
    esac
  done | head -1
}

rankxai_require_container() {
  name=$(rankxai_container "$1")
  if [ -z "$name" ]; then
    echo "No running wp-env container matching '$1'. Run: npx @wordpress/env start" >&2
    exit 1
  fi
  printf '%s' "$name"
}
