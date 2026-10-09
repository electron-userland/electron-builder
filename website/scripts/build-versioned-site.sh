#!/usr/bin/env bash
#
# build-versioned-site.sh — build the fully composed, multi-version docs site
# in one shot.
#
# The set of versions is declared once, in website/docs-versions.json, which is
# also what website/docusaurus.config.ts reads to render the navbar version
# dropdown — so refs, URL paths and dropdown labels cannot drift apart.
#
# 1. Builds the website of the current checkout at DOCS_BASE_URL, which defaults
#    to the `path` of the config's `current: true` entry ("/").
# 2. For every other entry, materializes that entry's `ref` in an ephemeral
#    workdir, installs + compiles it, builds its website at its `path`, and
#    copies the output into the main build under that sub-path.
#
# Which refs get built — RELEASE_TAGS overrides the config, in this order:
#   RELEASE_TAGS unset      → every non-current entry in docs-versions.json.
#   RELEASE_TAGS=""         → nothing extra; only the current checkout.
#   RELEASE_TAGS="a,b"      → exactly those refs (comma- and/or space-separated),
#                             which may include refs absent from the config. The
#                             sub-path comes from the matching config entry when
#                             there is one, otherwise it is derived from the ref:
#                               - strip a leading "release/" or "electron-builder@"
#                               - prefix "v" when the result starts with a digit
#                               - remaining "/" become "-"
#                             So release/v26 → /v26/, electron-builder@26.15.7 → /v26.15.7/.
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
CONFIG="${DOCS_VERSIONS_CONFIG:-$ROOT/website/docs-versions.json}"
CLONE_URL="${DOCS_CLONE_URL:-https://github.com/electron-userland/electron-builder.git}"

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

log() { printf '\n=== [build-versioned-site] %s ===\n' "$*"; }
die() {
  printf '\n!!! [build-versioned-site] ERROR: %s\n' "$*" >&2
  exit 1
}

[ -f "$CONFIG" ] || die "version config not found: $CONFIG"

# The repo is usually volume-mounted into the container and owned by another
# uid; let git read it (the container's global git config is ephemeral).
if [ -e "$ROOT/.git" ] && ! git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  git config --global --add safe.directory "$ROOT" || true
fi

# Reads docs-versions.json. Modes:
#   root-base-url        → the current entry's path (default "/")
#   extra                → "<ref>\t<path-segment>" per non-current entry
#   seg-for-ref <ref>    → that ref's path segment, or empty if not configured
CONFIG_READER='
const fs = require("node:fs")
const [cfgPath, mode, arg] = process.argv.slice(1)
let cfg
try {
  cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"))
} catch (e) {
  console.error("cannot parse " + cfgPath + ": " + e.message)
  process.exit(1)
}
const versions = Array.isArray(cfg.versions) ? cfg.versions : []
if (versions.length === 0) {
  console.error(cfgPath + " declares no \"versions\"")
  process.exit(1)
}
const seg = p => String(p == null ? "" : p).replace(/^\/+/, "").replace(/\/+$/, "")
if (mode === "root-base-url") {
  const current = versions.find(v => v.current)
  process.stdout.write(current && current.path ? current.path : "/")
} else if (mode === "extra") {
  for (const v of versions) {
    if (v.current) continue
    if (!v.ref || !seg(v.path)) {
      console.error("version entry needs a \"ref\" and a non-root \"path\": " + JSON.stringify(v))
      process.exit(1)
    }
    process.stdout.write(v.ref + "\t" + seg(v.path) + "\n")
  }
} else if (mode === "seg-for-ref") {
  const hit = versions.find(v => !v.current && v.ref === arg)
  process.stdout.write(hit ? seg(hit.path) : "")
}
'

config_read() { node -e "$CONFIG_READER" "$CONFIG" "$@"; }

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

# --- 1. resolve what to build (before anything expensive runs) ---------------
# ${RELEASE_TAGS+set}: distinguishes "unset" (use the config) from "set to
# empty" (explicitly build nothing extra).
ROOT_BASE_URL="${DOCS_BASE_URL:-$(config_read root-base-url)}"
BUILD_LIST=""
if [ -n "${RELEASE_TAGS+set}" ]; then
  log "RELEASE_TAGS override: '${RELEASE_TAGS}'"
  for ref in $(printf '%s' "$RELEASE_TAGS" | tr ',' ' '); do
    seg="$(config_read seg-for-ref "$ref")"
    [ -n "$seg" ] || seg="$(ref_to_path "$ref")"
    BUILD_LIST+="$ref"$'\t'"$seg"$'\n'
  done
else
  log "building the versions declared in $CONFIG"
  BUILD_LIST="$(config_read extra)"
fi

# --- 2. current checkout at the root path ------------------------------------
log "building current checkout at $ROOT_BASE_URL"
build_tree "$ROOT" "$ROOT_BASE_URL"

# --- 3. build each extra version and compose it into the output tree ---------
if [ -n "${DOCS_VERSIONS_WORKDIR:-}" ]; then
  WORK="$DOCS_VERSIONS_WORKDIR"
else
  # the script owns this temp dir, so clean it up on exit (a user-supplied
  # DOCS_VERSIONS_WORKDIR is left alone)
  WORK="$(mktemp -d)"
  trap 'rm -rf "$WORK"' EXIT
fi
while IFS=$'\t' read -r ref path_seg; do
  [ -n "$ref" ] || continue
  [ -n "$path_seg" ] || die "no output path resolved for ref '$ref'"
  src="$WORK/$path_seg"
  log "building '$ref' → /$path_seg/"
  rm -rf "$src"
  materialize_ref "$ref" "$src" || die "could not materialize ref '$ref'"
  # A tree that ignores DOCS_BASE_URL builds at baseUrl "/" and is silently
  # broken when served under /$path_seg/ — refuse to compose it.
  grep -q 'process\.env\.DOCS_BASE_URL' "$src/website/docusaurus.config.ts" 2>/dev/null ||
    die "ref '$ref': website/docusaurus.config.ts does not read DOCS_BASE_URL, so it cannot build at /$path_seg/. Merge the versioned-site config support into '$ref' first, or point this entry's ref at a branch that has it."
  build_tree "$src" "/$path_seg/" || die "build failed for ref '$ref'"
  [ -d "$src/website/build" ] || die "ref '$ref' produced no website/build output"
  mkdir -p "$OUT/$path_seg"
  cp -R "$src/website/build/." "$OUT/$path_seg/"
done <<< "$BUILD_LIST"

log "done — composed site at $OUT"
