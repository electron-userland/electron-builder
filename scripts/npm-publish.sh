#!/usr/bin/env bash
set -e

ln -f README.md packages/electron-builder/README.md

npm publish packages/asar-integrity || true
npm publish packages/builder-util-runtime || true
npm publish packages/dmg-builder || true
npm publish packages/builder-util || true
npm publish packages/electron-publish || true
npm publish packages/electron-publisher-s3 || true
npm publish packages/electron-builder || true
npm publish packages/electron-builder-squirrel-windows || true
npm publish packages/electron-updater || true

npm publish packages/electron-forge-maker-appimage || true
npm publish packages/electron-forge-maker-snap || true
npm publish packages/electron-forge-maker-nsis || true
npm publish packages/electron-forge-maker-nsis-web || true