#!/usr/bin/env bash
pip3 install pipenv
pipenv install
echo "Installing deps"
pnpm install
echo "Building docker image"
pnpm docs:prebuild
echo "Building site docs"
pnpm docs:build