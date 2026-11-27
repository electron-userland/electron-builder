#!/usr/bin/env bash

set -ex

NODE_VERSION=$1
NODE_TAG=$(cut -d '.' -f 1 <<< "$NODE_VERSION")
# the version of the docker package (docker/package.json, bumped by changesets): every image gets a tag
# <image>-<version> next to its moving tag <image>. The deploy never overwrites a versioned tag (deploy-docker.yml)
VERSION=$(node -p 'require("./docker/package.json").version')
# a Docker tag is [A-Za-z0-9_.-] only: a semver build suffix (+…) cannot be one
if [[ ! "$VERSION" =~ ^[0-9A-Za-z][0-9A-Za-z_.-]*$ ]]; then
  echo "docker/package.json has version '$VERSION', which is not a valid Docker tag suffix" >&2
  exit 1
fi

# --provenance=false requires Docker 23.0+ / BuildKit 0.10+. It prevents OCI manifest-list creation
# (caused by BuildKit provenance attestation) which blocks locally built images from being resolved
# as bases in subsequent builds when using Docker Desktop's containerd image store.
docker build --provenance=false -t ghcr.io/electron-userland/builder:base -t "ghcr.io/electron-userland/builder:base-$VERSION" docker/base

docker build \
  --provenance=false \
  --build-arg NODE_VERSION="$NODE_VERSION" \
  --build-arg IMAGE_VERSION="base-$VERSION" \
  -t "ghcr.io/electron-userland/builder:$NODE_TAG" \
  -t "ghcr.io/electron-userland/builder:$NODE_TAG-$VERSION" \
  docker/node

docker build \
  --provenance=false \
  --build-arg IMAGE_VERSION="$NODE_TAG-$VERSION" \
  -t "ghcr.io/electron-userland/builder:$NODE_TAG-wine" \
  -t "ghcr.io/electron-userland/builder:$NODE_TAG-wine-$VERSION" \
  docker/wine

docker build \
  --provenance=false \
  --build-arg IMAGE_VERSION="$NODE_TAG-wine-$VERSION" \
  -t "ghcr.io/electron-userland/builder:$NODE_TAG-wine-chrome" \
  -t "ghcr.io/electron-userland/builder:$NODE_TAG-wine-chrome-$VERSION" \
  docker/wine-chrome

# We also use this image for running our unit tests
docker build \
  --provenance=false \
  --build-arg IMAGE_VERSION="$NODE_TAG-wine-$VERSION" \
  -t "ghcr.io/electron-userland/builder:$NODE_TAG-wine-mono" \
  -t "ghcr.io/electron-userland/builder:$NODE_TAG-wine-mono-$VERSION" \
  docker/wine-mono

# Generate report
docker images --filter=reference="ghcr.io/electron-userland/builder:*"
