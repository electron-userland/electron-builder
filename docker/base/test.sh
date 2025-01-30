#!/usr/bin/env bash
set -ex

pnpm i
pnpm compile
pnpm ci:test