#!/usr/bin/env bash
set -e

npm publish packages/electron-builder-http || true
npm publish packages/electron-builder-core || true
npm publish packages/electron-builder-util || true
npm publish packages/electron-builder || true
npm publish packages/electron-builder-squirrel-windows || true
npm publish packages/electron-auto-updater || true