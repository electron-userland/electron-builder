#!/usr/bin/env bash
pip3 install pipenv
pipenv install
echo "Installing pnpm"
npx pnpm install --store=./node_modules/.pnpm-store
echo "Building site docs"
mkdocs build
