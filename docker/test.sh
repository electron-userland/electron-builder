#!/bin/sh
set -e

npm install
npm prune
npm test