#!/usr/bin/env bash
pip3 install pipenv
pipenv install
echo "Installing deps"
pnpm install
echo "Building site docs"
pnpm docs:build
mkdocs build