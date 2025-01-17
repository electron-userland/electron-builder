#!/usr/bin/env bash

set -ex

NODE_VERSION=$1
NODE_TAG=$(cut -d '.' -f 1 <<< "$NODE_VERSION")
DATE=$(date +%m.%y)

docker build -t electronuserland/builder:base -t "electronuserland/builder:base-$DATE" docker/base

## NOTE: Order the latest to oldest versions. The most recent node LTS should be tagged as the latest image

# # Node 22
# docker build --build-arg NODE_VERSION=22.13.0 --build-arg IMAGE_VERSION=base-$DATE -t electronuserland/builder:22 -t "electronuserland/builder:22-$DATE" -t electronuserland/builder:latest docker/node

# docker build --build-arg IMAGE_VERSION=22-$DATE -t electronuserland/builder:22-wine -t "electronuserland/builder:22-wine-$DATE" -t electronuserland/builder:wine docker/wine
# docker build --build-arg IMAGE_VERSION=22-wine-$DATE -t electronuserland/builder:22-wine-mono -t "electronuserland/builder:22-wine-mono-$DATE" -t electronuserland/builder:wine-mono docker/wine-mono
# docker build --build-arg IMAGE_VERSION=22-wine-$DATE -t electronuserland/builder:22-wine-chrome -t "electronuserland/builder:22-wine-chrome-$DATE" -t electronuserland/builder:wine-chrome docker/wine-chrome

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
  -t "test-runner:$NODE_TAG" \
  docker/wine-mono

# Generate report
docker images --filter=reference="electronuserland/builder:*"
