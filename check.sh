#!/usr/bin/env bash
# Everything CI checks, before you push.
# On 2026-09-21 this repository's CI went 6 failures in 14 runs — 43% — in a
# single day, every one of them "push, let CI find it, fix". There is no PHP on
# the workstation that produced them, so CI had become the linter: a shared,
# slow, public resource used as a local tool, leaving a wall of red on a repo
# that carries the product's name.

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
echo "== Guardrails (plan 80 §7) =="
# A pure source scan — no Docker, no WordPress — over the SHIPPED PHP tree.
# §7 lists eight rules and claimed four of them were "held by a source scan";
# none existed until 2026-09-22. It is here rather than only in CI because it is
# the cheapest check in this file and the one whose failure is most expensive:
node probe/verify-guardrails.mjs

echo
echo "== What the release archive would contain =="
# CI has THREE jobs and the first version of this script ran two, then printed
# "Safe to push". The push failed on the third — Plugin Check — because
# `check.sh` ITSELF was in the release archive: a developer script shipped to
# customers, flagged as `FILE: check.sh`. The checker written to stop CI
# failures caused one, by not checking the thing the third job inspects.
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


# `build-zip.mjs` already refuses a dirty tree, which covers building too EARLY.
# What nothing covered was never building at all: measured 2026-09-22,
# `dist/rankxai.zip` sat at 0.4.1 from commit 94095f92 while the source, both
# release notes and the plan's owner action all said 0.4.2. The owner action is
# "upload dist/rankxai.zip", so a stale file there is a stale plugin on a
# customer's live site, and the only clue is inside the zip.
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
# HONEST ABOUT ITS OWN BOUNDARY. Plugin Check proper runs wp-env — a whole
# WordPress — which is not worth standing up on every push. What is checked
# here is the failure it actually catches in this repo. Saying "safe to push"
# unqualified is what made the first version of this script wrong.
echo "NOT covered here: WordPress Plugin Check itself, which CI runs against a"
echo "real WordPress. The stray-file class it catches IS covered above."
