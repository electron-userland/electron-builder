#!/usr/bin/env bash
#
# build-versioned-site.sh — build the fully composed, multi-version docs site
# in one shot.
#
# 1. Builds the website of the current checkout at DOCS_BASE_URL (default "/").
# 2. For every ref listed in RELEASE_TAGS (a comma- and/or space-separated list
#    of branches or tags; default "release/v26"), materializes that ref's tree
#    in an ephemeral workdir, installs + compiles it, builds its website at
#    "/<version>/", and copies the output into the main build under that
#    sub-path. Set RELEASE_TAGS="" to build only the current checkout.
#
#    ref → sub-path derivation (deliberately simple):
#      - strip a leading "release/" or "electron-builder@"  release/v26 → v26
#      - prefix "v" when the result starts with a digit         26.0.12 → v26.0.12
#      - remaining "/" become "-"
#
# A ref's tree is obtained, in order of preference: from the local git checkout
# (tag / local branch / origin/<ref>), by fetching <ref> from origin, or by
# shallow-cloning DOCS_CLONE_URL (defaults to the upstream GitHub repo). Any
# failure aborts the whole build — a listed version that cannot be built must
# never yield a silently partial site.
#
# Runs inside the docs container (`pnpm docs:all` / `docs:build`, see
# website/dockerfile) or directly on any host with git, node and
# corepack-enabled pnpm.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/website/build"
CLONE_URL="${DOCS_CLONE_URL:-https://github.com/electron-userland/electron-builder.git}"
# ${var-default}: unset → default; explicitly empty → no extra versions.
RELEASE_TAGS="${RELEASE_TAGS-release/v26}"

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

log() { printf '\n=== [build-versioned-site] %s ===\n' "$*"; }
die() {
  printf '\n!!! [build-versioned-site] ERROR: %s\n' "$*" >&2
  exit 1
}

# The repo is usually volume-mounted into the container and owned by another
# uid; let git read it (the container's global git config is ephemeral).
if [ -e "$ROOT/.git" ] && ! git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  git config --global --add safe.directory "$ROOT" || true
fi

ref_to_path() {
  local slug="$1"
  slug="${slug#release/}"
  slug="${slug#electron-builder@}"
  case "$slug" in
    [0-9]*) slug="v$slug" ;;
  esac
  slug="${slug//\//-}"
  [ -n "$slug" ] || die "cannot derive a path segment from ref '$1'"
  printf '%s' "$slug"
}

# materialize_ref <ref> <dest-dir>: extract the ref's tree into dest-dir.
materialize_ref() {
  local ref="$1" dest="$2" sha=""
  mkdir -p "$dest"
  if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    sha="$(
      git -C "$ROOT" rev-parse --verify --quiet "refs/tags/$ref^{commit}" ||
        git -C "$ROOT" rev-parse --verify --quiet "refs/heads/$ref^{commit}" ||
        git -C "$ROOT" rev-parse --verify --quiet "refs/remotes/origin/$ref^{commit}" ||
        true
    )"
    if [ -z "$sha" ]; then
      log "ref '$ref' not present locally — fetching from origin"
      if git -C "$ROOT" fetch --depth 1 origin "$ref"; then
        sha="$(git -C "$ROOT" rev-parse --verify FETCH_HEAD)"
      fi
    fi
    if [ -n "$sha" ]; then
      log "materializing '$ref' ($sha) via git archive"
      git -C "$ROOT" archive --format=tar "$sha" | tar -x -C "$dest"
      return 0
    fi
  fi
  log "shallow-cloning '$ref' from $CLONE_URL"
  git clone --depth 1 --branch "$ref" "$CLONE_URL" "$dest"
}

# build_tree <dir> <base-url>: install, compile and build <dir>'s website.
build_tree() {
  local dir="$1" base_url="$2"
  (
    cd "$dir"
    log "pnpm install --frozen-lockfile ($dir)"
    pnpm install --frozen-lockfile
    log "pnpm compile ($dir)"
    pnpm compile
    log "docusaurus build ($dir, baseUrl=$base_url)"
    cd website
    DOCS_BASE_URL="$base_url" pnpm build
  )
}

# --- 1. current checkout at DOCS_BASE_URL (default "/") ----------------------
log "building current checkout at ${DOCS_BASE_URL:-/}"
build_tree "$ROOT" "${DOCS_BASE_URL:-/}"

# --- 2. extra versions from RELEASE_TAGS -------------------------------------
WORK="${DOCS_VERSIONS_WORKDIR:-$(mktemp -d)}"
for ref in $(printf '%s' "$RELEASE_TAGS" | tr ',' ' '); do
  path_seg="$(ref_to_path "$ref")"
  src="$WORK/$path_seg"
  log "building '$ref' → /$path_seg/"
  rm -rf "$src"
  materialize_ref "$ref" "$src" || die "could not materialize ref '$ref'"
  build_tree "$src" "/$path_seg/" || die "build failed for ref '$ref'"
  [ -d "$src/website/build" ] || die "ref '$ref' produced no website/build output"
  mkdir -p "$OUT/$path_seg"
  cp -R "$src/website/build/." "$OUT/$path_seg/"
done

log "done — composed site at $OUT"
