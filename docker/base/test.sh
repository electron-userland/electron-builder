#!/usr/bin/env bash
set -e

npm install
npm prune
npm test