#!/usr/bin/env bash

set -ex

npm i -g corepack bun

corepack enable

pnpm install
pnpm compile

pnpm ci:test