#!/usr/bin/env bash
set -e

docker build -t electronuserland/builder:base -t electronuserland/builder:base-03.18 docker/base

docker build -t electronuserland/builder:9 -t electronuserland/builder:latest -t electronuserland/builder:9-03.18 docker/9

docker build -t electronuserland/builder:wine docker/wine
docker build -t electronuserland/builder:wine-mono docker/wine-mono
docker build -t electronuserland/builder:wine-chrome docker/wine-chrome

docker build -t electronuserland/snapcraft-electron:2 docker/snapcraft-electron2