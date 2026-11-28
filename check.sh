#!/usr/bin/env bash
# Run the CI checks locally before pushing. PHP runs in Docker, so no local PHP is needed.

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
# Fails fast on a broken file. `find` rather than a glob, so subfolders are included.
run_php sh -c 'set -e; find . -name "*.php" -not -path "./vendor/*" -not -path "./probe/*" -not -path "./dist/*" -not -path "*/node_modules/*" | sort | while read -r f; do php -l "$f"; done'

echo
echo "== PHPCS =="
run_php php vendor/bin/phpcs --standard=phpcs.xml.dist

echo
echo "== Guardrails =="
# A source scan over the shipped PHP; needs neither Docker nor WordPress.
node probe/verify-guardrails.mjs

echo
echo "== What the release archive would contain =="
# A developer file that is not export-ignored would ship in the release.
ARCHIVE_FILES=$(git archive --format=tar HEAD | tar -t 2>/dev/null | grep -v '/$' || true)
if [ -z "$ARCHIVE_FILES" ]; then
  echo "Could not list the archive contents — is anything committed?" >&2
  exit 1
fi
echo "$ARCHIVE_FILES" | sed 's/^/  /'

# Development artefacts. The only .json files that ship are the store app
# source's package.json and tsconfig.json, so its build tools can be found.
STRAYS=$(echo "$ARCHIVE_FILES" | grep -iE '\.(sh|mjs|cjs|ya?ml|dist|lock|json)$|^probe/|^\.' | grep -v '^readme\.txt$' | grep -vxE 'admin-app/src/(package|tsconfig)\.json' || true)
# And inside admin-app/src, only the kinds of file the published source is made of.
STORE_STRAYS=$(echo "$ARCHIVE_FILES" | grep '^admin-app/' | grep -vE '\.(ts|tsx|css|webp)$|^admin-app/src/(package|tsconfig)\.json$|^admin-app/src/vite\.config\.js$|^admin-app/build/(assets/[^/]+\.(js|css|webp)|store-app\.asset\.php)$' || true)
# Only file types WordPress.org expects in a plugin (its review named a .mts file as not permitted), and no notes
# files: readme.txt is the only document besides the licences.
ODD_TYPES=$(echo "$ARCHIVE_FILES" | grep -viE '\.(php|js|css|txt|png|svg|jpe?g|gif|webp|json|woff2|ts|tsx)$' || true)
if [ -n "$ODD_TYPES" ]; then
  echo
  echo "File types WordPress.org does not expect in a plugin:" >&2
  echo "$ODD_TYPES" | sed 's/^/  /' >&2
  exit 1
fi
if [ -n "$STORE_STRAYS" ]; then
  echo
  echo "admin-app/ holds files the store app's published source is not made of:" >&2
  echo "$STORE_STRAYS" | sed 's/^/  /' >&2
  exit 1
fi
if [ -n "$STRAYS" ]; then
  echo
  echo "These would ship to customers and should not:" >&2
  echo "$STRAYS" | sed 's/^/  /' >&2
  echo
  echo "Add each to .gitattributes as export-ignore, or delete it." >&2
  exit 1
fi


# Catch a dist/rankxai.zip built from an older version.
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
# Plugin Check needs a full WordPress, so it runs in CI only.
echo "NOT covered here: WordPress Plugin Check itself, which CI runs against a"
echo "real WordPress. The stray-file class it catches IS covered above."
