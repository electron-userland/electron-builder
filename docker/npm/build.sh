#!/usr/bin/env bash

set -e

npm install -g npm_lazy

npm cache clean

npm_lazy & pids="${pids-} $!"
rm -rf node_modules
npm install --registry http://localhost:8080

kill $pids