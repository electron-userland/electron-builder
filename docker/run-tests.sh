#!/usr/bin/env bash

set -e

docker run --rm \
  -e CI="${CI:-false}" \
  -e DEBUG="${DEBUG:-}" \
  -e VITEST_SHARD_INDEX="${VITEST_SHARD_INDEX:-}" \
  -e VITEST_SHARD_COUNT="${VITEST_SHARD_COUNT:-}" \
  -e UPDATE_SNAPSHOT="${UPDATE_SNAPSHOT:-false}" \
  -e UPDATE_LOCKFILE_FIXTURES="${UPDATE_LOCKFILE_FIXTURES:-false}" \
  -e TEST_FILES="${TEST_FILES:-}" \
  -w /project \
  -v "$(pwd):/project" \
  -v "$(pwd)/node-modules-docker:/project/node_modules" \
  -v "${ELECTRON_CACHE_PATH:-$HOME/Library/Caches/electron}:/root/.cache/electron" \
  -v "${ELECTRON_BUILDER_CACHE_PATH:-$HOME/Library/Caches/electron-builder}:/root/.cache/electron-builder" \
  ${ADDITIONAL_DOCKER_ARGS} \
  "${TEST_RUNNER_IMAGE_TAG:-electronuserland/builder:22-wine-mono}" \
  /bin/bash -c "bash ./docker/test-in-docker.sh"
