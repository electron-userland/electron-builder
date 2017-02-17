#!/usr/bin/env bash
set -e

ln -f README.md packages/electron-builder/README.md

npm publish packages/electron-builder-http || true
npm publish packages/electron-builder-core || true
npm publish packages/electron-builder-util || true
npm publish packages/electron-publish || true
npm publish packages/electron-publisher-s3 || true
npm publish packages/electron-builder || true
npm publish packages/electron-builder-squirrel-windows || true
npm publish packages/electron-updater || true