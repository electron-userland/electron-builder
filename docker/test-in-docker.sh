#!/usr/bin/env bash

set -ex

apt-get update -yqq
apt-get install snapcraft -y
npm i -g corepack bun

corepack enable

pnpm install
pnpm compile

pnpm ci:test