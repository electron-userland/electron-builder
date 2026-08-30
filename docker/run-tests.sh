#!/usr/bin/env bash

set -e

# On macOS the default electron cache lives under Library/Caches; on Linux it follows XDG (~/.cache).
if [[ "$(uname -s)" = "Darwin" ]]; then
  _ELECTRON_CACHE_DEFAULT="$HOME/Library/Caches/electron"
  _ELECTRON_BUILDER_CACHE_DEFAULT="$HOME/Library/Caches/electron-builder"
else
  _ELECTRON_CACHE_DEFAULT="$HOME/.cache/electron"
  _ELECTRON_BUILDER_CACHE_DEFAULT="$HOME/.cache/electron-builder"
fi

_IMAGE="${TEST_RUNNER_IMAGE_TAG:-electronuserland/builder:22-wine-mono}"

# Pull with retries so transient registry timeouts don't fail the whole run.
# Skip the pull entirely if the image is already present locally (e.g. a locally-built test image).
if ! docker image inspect "$_IMAGE" > /dev/null 2>&1; then
  _PULL_ATTEMPTS=3
  _PULL_DELAY=30
  for _i in $(seq 1 $_PULL_ATTEMPTS); do
    docker pull "$_IMAGE" && break
    if [[ $_i -lt $_PULL_ATTEMPTS ]]; then
      echo "docker pull failed (attempt $_i/$_PULL_ATTEMPTS), retrying in ${_PULL_DELAY}s…" >&2
      sleep $_PULL_DELAY
    else
      echo "docker pull failed after $_PULL_ATTEMPTS attempts" >&2
      exit 1
    fi
  done
fi

docker run --rm \
  -e CI="${CI:-false}" \
  -e DEBUG="${DEBUG:-}" \
  -e VITEST_SHARD_INDEX="${VITEST_SHARD_INDEX:-}" \
  -e VITEST_SHARD_COUNT="${VITEST_SHARD_COUNT:-}" \
  -e UPDATE_SNAPSHOT="${UPDATE_SNAPSHOT:-}" \
  -e UPDATE_LOCKFILE_FIXTURES="${UPDATE_LOCKFILE_FIXTURES:-false}" \
  -e TEST_FILES="${TEST_FILES:-}" \
  -e TEST_SEQUENTIAL_FILES="${TEST_SEQUENTIAL_FILES:-}" \
  -w /project \
  -v "$(pwd):/project" \
  -v "$(pwd)/node-modules-docker:/project/node_modules" \
  -v "${ELECTRON_CACHE_PATH:-$_ELECTRON_CACHE_DEFAULT}:/root/.cache/electron" \
  -v "${ELECTRON_BUILDER_CACHE_PATH:-$_ELECTRON_BUILDER_CACHE_DEFAULT}:/root/.cache/electron-builder" \
  ${ADDITIONAL_DOCKER_ARGS} \
  "$_IMAGE" \
  /bin/bash -c "bash ./docker/test-in-docker.sh"
