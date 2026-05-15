#!/bin/bash
set -ex

# Usage: ./test-specific-platforms.sh [dockerfile] [target]
#
#   dockerfile : archlinux | rpm | debian | appimage  (default: all)
#   target     : build | run                          (default: build+run)
#
# Examples:
#   ./test-specific-platforms.sh                  # build+run all
#   ./test-specific-platforms.sh debian           # build+run debian only
#   ./test-specific-platforms.sh debian build     # build debian image only
#   ./test-specific-platforms.sh debian run       # run debian tests (image must exist)

CWD=$(dirname "$0")
DOCKERFILE="${1:-all}"
TARGET="${2:-all}"

export TEST_FILES="blackboxUpdateTest,linuxUpdaterTest"
export DEBUG="electron-updater,electron-builder"

do_build() {
  local name=$1 tag=$2 extra_flags="${3:-}"
  [[ "$TARGET" == "run" ]] && return
  # shellcheck disable=SC2086
  docker build $extra_flags -f "$CWD/dockerfile-$name" . -t "$tag"
}

do_run() {
  local tag=$1
  [[ "$TARGET" == "build" ]] && return

  if [[ "$(uname)" == "Darwin" ]]; then
    ELECTRON_CACHE_PATH="$HOME/Library/Caches/electron"
    ELECTRON_BUILDER_CACHE_PATH="$HOME/Library/Caches/electron-builder"
  else
    ELECTRON_CACHE_PATH="${XDG_CACHE_HOME:-$HOME/.cache}/electron"
    ELECTRON_BUILDER_CACHE_PATH="${XDG_CACHE_HOME:-$HOME/.cache}/electron-builder"
  fi

  ELECTRON_CACHE_PATH="$ELECTRON_CACHE_PATH" \
    ELECTRON_BUILDER_CACHE_PATH="$ELECTRON_BUILDER_CACHE_PATH" \
    TEST_RUNNER_IMAGE_TAG="$tag" pnpm test-linux
}

run_archlinux() {
  do_build archlinux archlinux-updater-test "--platform=linux/amd64"
  do_run archlinux-updater-test
}

run_rpm() {
  do_build rpm rpm-updater-test "--platform=linux/amd64"
  do_run rpm-updater-test
}

run_debian() {
  do_build debian debian-updater-test "--platform=linux/amd64"
  do_run debian-updater-test
}

run_appimage() {
  # appimage must match host arch — no --platform flag
  do_build appimage appimage-updater-test ""
  export ADDITIONAL_DOCKER_ARGS="${ADDITIONAL_DOCKER_ARGS:+$ADDITIONAL_DOCKER_ARGS }-e RUN_APP_IMAGE_TEST=true"
  do_run appimage-updater-test
}

case "$DOCKERFILE" in
  archlinux) run_archlinux ;;
  rpm)       run_rpm ;;
  debian)    run_debian ;;
  appimage)  run_appimage ;;
  all)
    run_archlinux
    run_rpm
    run_debian
    run_appimage
    ;;
  *)
    echo "Unknown dockerfile: $DOCKERFILE"
    echo "Usage: $0 [archlinux|rpm|debian|appimage|all] [build|run]"
    exit 1
    ;;
esac
