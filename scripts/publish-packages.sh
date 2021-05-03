#!/usr/bin/env bash
set -e

ln -f README.md packages/electron-builder/README.md
(cd packages/app-builder-lib && pnpm publish --no-git-checks) || true
(cd packages/builder-util-runtime && pnpm publish --no-git-checks) || true
(cd packages/builder-util && pnpm publish --no-git-checks) || true
(cd packages/dmg-builder && pnpm publish --no-git-checks) || true

(cd packages/electron-publish && pnpm publish --no-git-checks) || true

(cd packages/electron-builder && pnpm publish --no-git-checks --tag next) || true

(cd packages/electron-builder-squirrel-windows && pnpm publish --no-git-checks) || true
(cd packages/electron-forge-maker-appimage && pnpm publish --no-git-checks) || true
(cd packages/electron-forge-maker-nsis && pnpm publish --no-git-checks) || true
(cd packages/electron-forge-maker-nsis-web && pnpm publish --no-git-checks) || true
(cd packages/electron-forge-maker-snap && pnpm publish --no-git-checks) || true

(cd packages/electron-updater && pnpm publish --no-git-checks --tag next) || true
