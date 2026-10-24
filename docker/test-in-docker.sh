#!/usr/bin/env bash

set -ex

# Restore ownership of files we wrote as root back to the host user so the host runner can clean
# them up — and, for the snap core24 job, run its NATIVE `pnpm ci:test` pass into the same workspace —
# in subsequent steps without EACCES. This container runs as root (snapcraft --privileged, npm i -g,
# etc.), so test/src/generated plus the per-shard report dirs (test-results, vitest-blobs, coverage)
# all land root-owned. We derive the host UID:GID from .git, which the host user creates before the
# workspace is mounted into this container.
restore_ownership() {
  HOST_OWNER=$(stat -c '%u:%g' /project/.git 2>/dev/null || echo "")
  if [ -n "$HOST_OWNER" ]; then
    for dir in test/src/generated test-results vitest-blobs coverage; do
      if [ -e "/project/$dir" ]; then
        chown -R "$HOST_OWNER" "/project/$dir"
      fi
    done
    # the corepack home that run-tests.sh mounts from the host, should a download above have written to it
    if [ -d /root/.cache/node/corepack ]; then
      chown -R "$HOST_OWNER" /root/.cache/node/corepack
    fi
  fi
}
# On every exit, also when a step below fails and `set -e` ends the script: the reports of failed tests are the ones
# that get inspected. The script keeps the exit status of the step, unless the restore itself fails.
trap restore_ownership EXIT

npm i -g corepack bun

corepack enable
# Corepack downloads pnpm via Node's bundled undici, which can crash with an uncatchable `assert(!this.paused)`
# (nodejs/undici#5360). run-tests.sh mounts the runner's corepack home, so pnpm is usually there already and this makes
# no request; when it is not, retry the download like .github/actions/pnpm does on the runner.
for i in 1 2 3; do
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack install && break
  if [ "$i" -eq 3 ]; then
    echo "corepack install failed after 3 attempts" >&2
    exit 1
  fi
  echo "corepack install failed (attempt $i/3), retrying in 15s…" >&2
  sleep 15
done

# node-modules-docker is mounted from the host and may have been installed on a
# different platform (e.g. macOS). --force makes pnpm re-evaluate and install
# platform-specific optional deps (e.g. @rollup/rollup-linux-x64-gnu) for the
# current platform. Deleting .modules.yaml alone is not sufficient because pnpm
# treats absent optional packages as acceptable in its "up to date" check.
rm -f /project/node_modules/.modules.yaml
pnpm install --force
pnpm compile

pnpm ci:test # also generates test/src/generated at runtime

# Note: An alternative approach would be to pass `--user $(id -u):$(id -g)` to Docker
# It would prevent all root-owned file leakage, but would break Docker-internal
# operations that need root (snapcraft's --privileged/overlayfs, npm install -g, etc.).