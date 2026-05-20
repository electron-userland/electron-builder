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

pnpm ci:test