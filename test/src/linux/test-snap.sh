#!/bin/bash
# Run snap heavy tests using Canonical's purpose-built snapcraft rock images.
#
# Two images are used so each core is tested against the snapcraft version that
# Canonical officially supports for it:
#
#   dockerfile-snapcraft-legacy  →  ghcr.io/canonical/snapcraft:7_core22
#     Tests: core18, core20, core22
#
#   dockerfile-snapcraft          →  ghcr.io/canonical/snapcraft:8_core24
#     Tests: core24  (snapcraft 8 is also backward-compatible with older bases)
#
# Both containers build with SNAPCRAFT_BUILD_ENVIRONMENT=host (destructive mode)
# so no LXD or Multipass daemon is required.  --privileged is needed for
# overlayfs access during the snapcraft prime stage.
#
# Usage
# ─────
#   # Build both images and run all cores
#   ./test/src/linux/test-snap.sh
#
#   # Run a single core (useful for CI matrix jobs)
#   SNAP_CORE=core24  ./test/src/linux/test-snap.sh
#   SNAP_CORE=core22  ./test/src/linux/test-snap.sh
#   SNAP_CORE=core20  ./test/src/linux/test-snap.sh
#   SNAP_CORE=core18  ./test/src/linux/test-snap.sh
#
#   # Skip one pass while running the other (legacy flags, still supported)
#   SKIP_LEGACY=1  ./test/src/linux/test-snap.sh   # core24 only
#   SKIP_CORE24=1  ./test/src/linux/test-snap.sh   # core18/20/22 only
#
#   # Pass extra docker flags (e.g. a proxy)
#   ADDITIONAL_DOCKER_ARGS="-e http_proxy=http://..." ./test/src/linux/test-snap.sh
#
# Prerequisites
# ─────────────
#   docker   — daemon must be running and support --privileged
#   pnpm     — installed in the host environment

set -e

# Dump snapcraft logs from a host-mounted directory on failure.
# The volume mount -v SNAPCRAFT_LOG_DIR:/root/.local/state/snapcraft/log is added
# to every docker run so logs survive container removal (--rm).
dump_snapcraft_logs() {
  local log_dir="$1"
  if compgen -G "${log_dir}/*.log" >/dev/null 2>&1; then
    echo "--- snapcraft logs ---" >&2
    for f in "${log_dir}"/*.log; do
      echo "=== $f ===" >&2
      cat "$f" >&2
    done
    echo "--- end snapcraft logs ---" >&2
  fi
}

CWD=$(dirname "$0")
# Resolve absolute repo root (three levels up: linux/ → src/ → test/ → .)
REPO_ROOT=$(cd "$CWD/../../.." && pwd)

export TEST_FILES="${TEST_FILES:-snapTest,snapHeavyTest}"
export DEBUG="${DEBUG:-electron-builder}"
export SKIPPED_TESTS="${SKIPPED_TESTS:-none}"

# Common docker flags forwarded to every test run.
#
#   RUN_SNAP_TESTS=true
#     Activates the test guard in snapHeavyTest.ts even when the snapd client
#     ("snap") is absent — these images have snapcraft but not snapd.
#
#   SNAPCRAFT_BUILD_ENVIRONMENT=host
#     Standard snapcraft env-var that selects destructive / host-build mode
#     without needing LXD or Multipass inside the container.
#
#   --privileged
#     overlayfs / bind-mount access required during snapcraft's prime stage.
# Temp dir on the host for snapcraft logs; mounted into every container so
# logs survive container exit (docker run --rm removes the container but not
# host-mounted volumes).
SNAPCRAFT_LOG_DIR=$(mktemp -d)
trap 'rm -rf "$SNAPCRAFT_LOG_DIR"' EXIT

COMMON_DOCKER_ARGS="--privileged \
  -e RUN_SNAP_TESTS=true \
  -e SNAPCRAFT_BUILD_ENVIRONMENT=host \
  -e XDG_RUNTIME_DIR=/run/user/0 \
  -e "SKIPPED_TESTS=${SKIPPED_TESTS:-}" \
  -v "${SNAPCRAFT_LOG_DIR}":/root/.local/state/snapcraft/log \
  ${ADDITIONAL_DOCKER_ARGS:-}"

# ── helpers ───────────────────────────────────────────────────────────────────

run_pass() {
  local cores="$1"       # e.g. "core18,core20,core22" or "core24"
  local dockerfile="$2"  # e.g. "dockerfile-snapcraft-legacy"
  local image_tag="$3"   # e.g. "snapcraft-legacy-test"

  docker build \
    --platform=linux/amd64 \
    -f "$CWD/$dockerfile" \
    -t "$image_tag" \
    "$REPO_ROOT"

  TEST_RUNNER_IMAGE_TAG="$image_tag" \
    ADDITIONAL_DOCKER_ARGS="$COMMON_DOCKER_ARGS -e SNAP_TEST_CORES=$cores" \
    pnpm test-linux \
  || { dump_snapcraft_logs "$SNAPCRAFT_LOG_DIR"; exit 1; }
}

# ── dispatch ──────────────────────────────────────────────────────────────────
# Set SNAP_CORE to test a single core (ideal for CI matrix jobs).
# Leave unset (or "all") to run every pass sequentially.

case "${SNAP_CORE:-all}" in
  core18|core20|core22)
    run_pass "${SNAP_CORE}" "dockerfile-snapcraft-legacy" "snapcraft-legacy-test"
    ;;
  core24)
    run_pass "core24" "dockerfile-snapcraft" "snapcraft-core24-test"
    ;;
  all)
    [[ -z "${SKIP_LEGACY:-}" ]] && \
      run_pass "core18,core20,core22" "dockerfile-snapcraft-legacy" "snapcraft-legacy-test"
    [[ -z "${SKIP_CORE24:-}" ]] && \
      run_pass "core24" "dockerfile-snapcraft" "snapcraft-core24-test"
    ;;
  *)
    echo "Unknown SNAP_CORE=${SNAP_CORE}. Valid values: core18 core20 core22 core24 (or unset for all)." >&2
    exit 1
    ;;
esac
