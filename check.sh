#!/usr/bin/env bash
# Everything CI checks, before you push. There is no PHP on this workstation,
# so without a local runner CI ends up being used as the linter.

set -euo pipefail

IMAGE="${RANKXAI_PHP_IMAGE:-php:8.3-cli}"
# `pwd -W` gives Git Bash the Windows path Docker needs; plain `pwd` elsewhere.
HOST_DIR="$(pwd -W 2>/dev/null || pwd)"

run_php() {
  MSYS_NO_PATHCONV=1 docker run --rm -v "${HOST_DIR}":/app -w /app "$IMAGE" "$@"
}

if ! docker ps >/dev/null 2>&1; then
  echo "Docker is not running. Start it — CI is not a substitute for a local check." >&2
  exit 1
fi

echo "== php -l =="
# Necessary and NOT sufficient; see the header. It catches a broken file, which
# PHPCS would also catch, and it is fast enough to fail early.
run_php sh -c 'set -e; for f in *.php includes/*.php; do [ -e "$f" ] || continue; php -l "$f"; done'

echo
echo "== PHPCS =="
run_php php vendor/bin/phpcs --standard=phpcs.xml.dist

echo
echo "== Guardrails =="
# A pure source scan — no Docker, no WordPress — over the shipped PHP tree.
# The cheapest check here, and the one whose failure is most expensive.
node probe/verify-guardrails.mjs

echo
echo "== What the release archive would contain =="
# CI's third job inspects the release ARCHIVE, not the repository. A developer
# file that is not export-ignored ships to customers and fails it.
ARCHIVE_FILES=$(git archive --format=tar HEAD | tar -t 2>/dev/null | grep -v '/$' || true)
if [ -z "$ARCHIVE_FILES" ]; then
  echo "Could not list the archive contents — is anything committed?" >&2
  exit 1
fi
echo "$ARCHIVE_FILES" | sed 's/^/  /'

# Anything that is plainly a development artefact rather than plugin code.
STRAYS=$(echo "$ARCHIVE_FILES" | grep -iE '\.(sh|mjs|cjs|ya?ml|dist|lock|json)$|^probe/|^\.' | grep -v '^readme\.txt$' || true)
if [ -n "$STRAYS" ]; then
  echo
  echo "These would ship to customers and should not:" >&2
  echo "$STRAYS" | sed 's/^/  /' >&2
  echo
  echo "Add each to .gitattributes as export-ignore, or delete it." >&2
  exit 1
fi


# `build-zip.mjs` refuses a dirty tree, which covers building too EARLY but not
# never building at all. A stale archive is a stale plugin on a live site, and
# the only clue is inside the zip.
plugin_version() { grep -m1 'Version:' | awk '{ print $NF }' | tr -d '[:space:]'; }
SRC_VERSION=$(plugin_version < rankxai.php)
if [ -f dist/rankxai.zip ]; then
  ZIP_VERSION=$(unzip -p dist/rankxai.zip rankxai/rankxai.php 2>/dev/null | plugin_version)
  if [ "$ZIP_VERSION" != "$SRC_VERSION" ]; then
    echo
    echo "dist/rankxai.zip contains $ZIP_VERSION but the source is $SRC_VERSION." >&2
    echo "That archive is what an owner uploads to a live site. Rebuild it:" >&2
    echo "  node build-zip.mjs" >&2
    exit 1
  fi
  echo
  echo "dist/rankxai.zip is $ZIP_VERSION, matching the source."
else
  echo
  echo "dist/rankxai.zip is not built (dist/ is gitignored). Run: node build-zip.mjs"
fi

echo
echo "php -l, PHPCS, the guardrails and the archive contents are clean."
echo
# Plugin Check proper needs a whole WordPress, which is not worth standing up on
# every push. Name what is not covered rather than claiming "safe to push".
echo "NOT covered here: WordPress Plugin Check itself, which CI runs against a"
echo "real WordPress. The stray-file class it catches IS covered above."
