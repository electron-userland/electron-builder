#!/usr/bin/env bash

set -ex

NODE_VERSION=$1
NODE_TAG=$(cut -d '.' -f 1 <<< "$NODE_VERSION")
DATE=$(date +%m.%y)

docker build -t electronuserland/builder:base -t "electronuserland/builder:base-$DATE" docker/base

docker build \
  --build-arg NODE_VERSION="$NODE_VERSION" \
  --build-arg IMAGE_VERSION="base-$DATE" \
  -t "electronuserland/builder:$NODE_TAG" \
  -t "electronuserland/builder:$NODE_TAG-$DATE" \
  docker/node

docker build \
  --build-arg IMAGE_VERSION="$NODE_TAG-$DATE" \
  -t "electronuserland/builder:$NODE_TAG-wine" \
  -t "electronuserland/builder:$NODE_TAG-wine-$DATE" \
  docker/wine

docker build \
  --build-arg IMAGE_VERSION="$NODE_TAG-wine-$DATE" \
  -t "electronuserland/builder:$NODE_TAG-wine-chrome" \
  -t "electronuserland/builder:$NODE_TAG-wine-chrome-$DATE" \
  docker/wine-chrome

# We also use this image for running our unit tests
docker build \
  --build-arg IMAGE_VERSION="$NODE_TAG-wine-$DATE" \
  -t "electronuserland/builder:$NODE_TAG-wine-mono" \
  -t "electronuserland/builder:$NODE_TAG-wine-mono-$DATE" \
  docker/wine-mono

# Generate report
docker images --filter=reference="electronuserland/builder:*"
