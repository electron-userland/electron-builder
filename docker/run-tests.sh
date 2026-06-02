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

docker run --rm \
  -e CI="${CI:-false}" \
  -e DEBUG="${DEBUG:-}" \
  -e VITEST_SHARD_INDEX="${VITEST_SHARD_INDEX:-}" \
  -e VITEST_SHARD_COUNT="${VITEST_SHARD_COUNT:-}" \
  -e UPDATE_SNAPSHOT="${UPDATE_SNAPSHOT:-false}" \
  -e UPDATE_LOCKFILE_FIXTURES="${UPDATE_LOCKFILE_FIXTURES:-false}" \
  -e TEST_FILES="${TEST_FILES:-}" \
  -e TEST_SEQUENTIAL_FILES="${TEST_SEQUENTIAL_FILES:-}" \
  -w /project \
  -v "$(pwd):/project" \
  -v "$(pwd)/node-modules-docker:/project/node_modules" \
  -v "${ELECTRON_CACHE_PATH:-$_ELECTRON_CACHE_DEFAULT}:/root/.cache/electron" \
  -v "${ELECTRON_BUILDER_CACHE_PATH:-$_ELECTRON_BUILDER_CACHE_DEFAULT}:/root/.cache/electron-builder" \
  ${ADDITIONAL_DOCKER_ARGS} \
  "${TEST_RUNNER_IMAGE_TAG:-electronuserland/builder:22-wine-mono}" \
  /bin/bash -c "bash ./docker/test-in-docker.sh"
