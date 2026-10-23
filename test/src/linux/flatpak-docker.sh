#!/usr/bin/env bash
# Runs a command for the flatpak tests (the "Test Flatpak" job of .github/workflows/test.yaml) in a privileged
# container of the electronuserland/builder image, as the calling user rather than as root.
#
#   FLATPAK_TEST_IMAGE=electronuserland/builder:22-wine-chrome test/src/linux/flatpak-docker.sh pnpm ci:test
#
# Run it from the repository root, with the dependencies installed and compiled (pnpm install && pnpm compile): the
# container uses the workspace as it is. The flatpak user installation of the calling user (~/.local/share/flatpak), the
# electron caches and the corepack home (~/.cache/node/corepack, which .github/actions/pnpm caches) are mounted at the same
# place under the container user's HOME: the refs that one run of this script installs are there for the next, the caches
# that actions/cache restores on the runner are used, and pnpm starts without a download.
#
# --privileged gives the container /dev/fuse (flatpak-builder's rofiles-fuse) and lifts docker's seccomp and AppArmor profiles,
# which block the namespaces bubblewrap creates.
# Why not root: flatpak refuses to operate on a user installation that belongs to another user as root, and Electron does not
# start as root with its sandbox on, while the blackbox install suite starts the installed app. The calling user also owns the
# workspace and the mounted directories, so nothing is left owned by root.
# As that user, bubblewrap needs unprivileged user namespaces, which Ubuntu 24.04 restricts on the host via AppArmor:
# lift that on the host first (sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0). Installing an app (the base
# app, the test bundle) can look up parental controls on the system D-Bus, which the container does not have: dbus-run-session
# starts a bus that stands in for it.

set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "usage: FLATPAK_TEST_IMAGE=<image> $0 <command> [args...]" >&2
  exit 2
fi

_IMAGE="${FLATPAK_TEST_IMAGE:-electronuserland/builder:22-wine-chrome}"

# docker would create missing mount sources owned by root
mkdir -p "$HOME/.local/share/flatpak" "$HOME/.cache/electron" "$HOME/.cache/electron-builder" "$HOME/.cache/node/corepack"

exec docker run --rm --privileged \
  -e CI="${CI:-}" \
  -e DEBUG="${DEBUG:-}" \
  -e TEST_FILES="${TEST_FILES:-}" \
  -e VITEST_SMART_CACHE_FILE="${VITEST_SMART_CACHE_FILE:-}" \
  -e RESET_VITEST_SHARD_CACHE="${RESET_VITEST_SHARD_CACHE:-}" \
  -e VITEST_COVERAGE="${VITEST_COVERAGE:-}" \
  -e HOST_UID="$(id -u)" \
  -e HOST_GID="$(id -g)" \
  -v "$(pwd):/project" -w /project \
  -v "$HOME/.local/share/flatpak:/home/runner/.local/share/flatpak" \
  -v "$HOME/.cache/electron:/home/runner/.cache/electron" \
  -v "$HOME/.cache/electron-builder:/home/runner/.cache/electron-builder" \
  -v "$HOME/.cache/node/corepack:/home/runner/.cache/node/corepack" \
  ${ADDITIONAL_DOCKER_ARGS:-} \
  "$_IMAGE" \
  bash -c '
    set -e
    # pnpm 11 through the corepack that comes with Node.js in the image, from the mounted corepack home, as on the runner
    corepack enable
    groupadd -o -g "$HOST_GID" runner
    useradd -o -u "$HOST_UID" -g "$HOST_GID" -d /home/runner -M runner
    # the parents of the mounts were created for root
    chown runner: /home/runner /home/runner/.local /home/runner/.local/share /home/runner/.cache /home/runner/.cache/node
    install -d -m 700 -o runner -g runner "/run/user/$HOST_UID"
    # rofiles-fuse opens the device as the user; the device node keeps the mode it has on the host
    chmod 666 /dev/fuse
    exec runuser -u runner -- env XDG_RUNTIME_DIR="/run/user/$HOST_UID" dbus-run-session -- \
      sh -c "export DBUS_SYSTEM_BUS_ADDRESS=\"\$DBUS_SESSION_BUS_ADDRESS\" && exec \"\$@\"" sh "$@"
  ' bash "$@"
