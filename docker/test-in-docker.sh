#!/usr/bin/env bash

set -ex

npm i -g corepack bun

corepack enable

# node-modules-docker is mounted from the host and may have been installed on a
# different platform (e.g. macOS). --force makes pnpm re-evaluate and install
# platform-specific optional deps (e.g. @rollup/rollup-linux-x64-gnu) for the
# current platform. Deleting .modules.yaml alone is not sufficient because pnpm
# treats absent optional packages as acceptable in its "up to date" check.
rm -f /project/node_modules/.modules.yaml
pnpm install --force
pnpm compile

pnpm ci:test # also generates test/src/generated at runtime

# Restore ownership of files we wrote as root back to the host user so the host runner can clean
# them up — and, for the snap core24 job, run its NATIVE `pnpm ci:test` pass into the same workspace —
# in subsequent steps without EACCES. This container runs as root (snapcraft --privileged, npm i -g,
# etc.), so test/src/generated plus the per-shard report dirs (test-results, .vitest-reports, coverage)
# all land root-owned. We derive the host UID:GID from .git, which the host user creates before the
# workspace is mounted into this container.
HOST_OWNER=$(stat -c '%u:%g' /project/.git 2>/dev/null || echo "")
if [ -n "$HOST_OWNER" ]; then
  for dir in test/src/generated test-results .vitest-reports coverage; do
    if [ -e "/project/$dir" ]; then
      chown -R "$HOST_OWNER" "/project/$dir"
    fi
  done
fi
# Note: An alternative approach would be to pass `--user $(id -u):$(id -g)` to Docker
# It would prevent all root-owned file leakage, but would break Docker-internal
# operations that need root (snapcraft's --privileged/overlayfs, npm install -g, etc.).