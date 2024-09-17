#!/usr/bin/env bash
pip3 install pipenv
pipenv install
echo "Installing deps"
pnpm install
echo "Building site docs"
pnpm compile
node scripts/renderer/out/typedoc2html.js
mkdocs build