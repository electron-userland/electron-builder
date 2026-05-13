#!/usr/bin/env bash

set -ex

NODE_VERSION=$1
NODE_TAG=$(cut -d '.' -f 1 <<< "$NODE_VERSION")
DATE=$(date +%m.%y)

# --provenance=false requires Docker 23.0+ / BuildKit 0.10+. It prevents OCI manifest-list creation
# (caused by BuildKit provenance attestation) which blocks locally built images from being resolved
# as bases in subsequent builds when using Docker Desktop's containerd image store.
docker build --provenance=false -t electronuserland/builder:base -t "electronuserland/builder:base-$DATE" docker/base

docker build \
  --provenance=false \
  --build-arg NODE_VERSION="$NODE_VERSION" \
  --build-arg IMAGE_VERSION="base-$DATE" \
  -t "electronuserland/builder:$NODE_TAG" \
  -t "electronuserland/builder:$NODE_TAG-$DATE" \
  docker/node

docker build \
  --provenance=false \
  --build-arg IMAGE_VERSION="$NODE_TAG-$DATE" \
  -t "electronuserland/builder:$NODE_TAG-wine" \
  -t "electronuserland/builder:$NODE_TAG-wine-$DATE" \
  docker/wine

docker build \
  --provenance=false \
  --build-arg IMAGE_VERSION="$NODE_TAG-wine-$DATE" \
  -t "electronuserland/builder:$NODE_TAG-wine-chrome" \
  -t "electronuserland/builder:$NODE_TAG-wine-chrome-$DATE" \
  docker/wine-chrome

# We also use this image for running our unit tests
docker build \
  --provenance=false \
  --build-arg IMAGE_VERSION="$NODE_TAG-wine-$DATE" \
  -t "electronuserland/builder:$NODE_TAG-wine-mono" \
  -t "electronuserland/builder:$NODE_TAG-wine-mono-$DATE" \
  docker/wine-mono

# Generate report
docker images --filter=reference="electronuserland/builder:*"
