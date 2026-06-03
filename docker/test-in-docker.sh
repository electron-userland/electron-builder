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

# Restore ownership of generated files to the host user so the host runner
# can clean them up in subsequent steps without EACCES. We derive the host
# UID:GID from .git, which is always created by the host user before the
# workspace is mounted into this container.
HOST_OWNER=$(stat -c '%u:%g' /project/.git 2>/dev/null || echo "")
if [ -n "$HOST_OWNER" ] && [ -d /project/test/src/generated ]; then
  chown -R "$HOST_OWNER" /project/test/src/generated
fi
# Note: An alternative approach would be to pass `--user $(id -u):$(id -g)` to Docker
# It would prevent all root-owned file leakage, but would break Docker-internal
# operations that need root (snapcraft's --privileged/overlayfs, npm install -g, etc.).