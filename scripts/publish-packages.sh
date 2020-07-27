#!/usr/bin/env bash
set -e

ln -f README.md packages/electron-builder/README.md
(cd packages/app-builder-lib && yarn pack --out /tmp/p.tgz && npm publish /tmp/p.tgz ; unlink /tmp/p.tgz) || true
(cd packages/builder-util && yarn pack --out /tmp/p.tgz && npm publish /tmp/p.tgz ; unlink /tmp/p.tgz) || true
(cd packages/builder-util-runtime && yarn pack --out /tmp/p.tgz && npm publish /tmp/p.tgz ; unlink /tmp/p.tgz) || true
(cd packages/dmg-builder && yarn pack --out /tmp/p.tgz && npm publish /tmp/p.tgz ; unlink /tmp/p.tgz) || true

(cd packages/electron-builder && yarn pack --out /tmp/p.tgz && npm publish /tmp/p.tgz --tag next; unlink /tmp/p.tgz) || true

(cd packages/dmg-builder && yarn pack --out /tmp/p.tgz && npm publish /tmp/p.tgz ; unlink /tmp/p.tgz) || true
(cd packages/electron-builder-squirrel-windows && yarn pack --out /tmp/p.tgz && npm publish /tmp/p.tgz ; unlink /tmp/p.tgz) || true
(cd packages/electron-forge-maker-appimage && yarn pack --out /tmp/p.tgz && npm publish /tmp/p.tgz ; unlink /tmp/p.tgz) || true
(cd packages/electron-forge-maker-nsis && yarn pack --out /tmp/p.tgz && npm publish /tmp/p.tgz ; unlink /tmp/p.tgz) || true
(cd packages/electron-forge-maker-nsis-web && yarn pack --out /tmp/p.tgz && npm publish /tmp/p.tgz ; unlink /tmp/p.tgz) || true
(cd packages/electron-forge-maker-snap && yarn pack --out /tmp/p.tgz && npm publish /tmp/p.tgz ; unlink /tmp/p.tgz) || true
(cd packages/electron-publish && yarn pack --out /tmp/p.tgz && npm publish /tmp/p.tgz ; unlink /tmp/p.tgz) || true

(cd packages/electron-updater && yarn pack --out /tmp/p.tgz && npm publish /tmp/p.tgz --tag next; unlink /tmp/p.tgz) || true
