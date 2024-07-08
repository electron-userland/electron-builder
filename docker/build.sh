#!/usr/bin/env bash

set -ex

DATE=$(date +%m.%y)

docker build -t devalexandria/builder:base -t "devalexandria/builder:base-$DATE" docker/base

## NOTE: Order the latest to oldest versions. The most recent node LTS should be tagged as the latest image

# Node 20
docker build --build-arg NODE_VERSION=20.9.0 --build-arg IMAGE_VERSION=base-$DATE -t devalexandria/builder:20 -t "devalexandria/builder:20-$DATE" -t devalexandria/builder:latest docker/node

docker build --build-arg IMAGE_VERSION=20-$DATE -t devalexandria/builder:20-wine -t "devalexandria/builder:20-wine-$DATE" -t devalexandria/builder:wine docker/wine
docker build --build-arg IMAGE_VERSION=20-wine-$DATE -t devalexandria/builder:20-wine-mono -t "devalexandria/builder:20-wine-mono-$DATE" -t devalexandria/builder:wine-mono docker/wine-mono
docker build --build-arg IMAGE_VERSION=20-wine-$DATE -t devalexandria/builder:20-wine-chrome -t "devalexandria/builder:20-wine-chrome-$DATE" -t devalexandria/builder:wine-chrome docker/wine-chrome

# Node 18
docker build --build-arg NODE_VERSION=18.18.2 --build-arg IMAGE_VERSION=base-$DATE -t devalexandria/builder:18 -t "devalexandria/builder:18-$DATE" -t devalexandria/builder:latest docker/node

docker build --build-arg IMAGE_VERSION=18-$DATE -t devalexandria/builder:18-wine -t "devalexandria/builder:18-wine-$DATE" -t devalexandria/builder:wine docker/wine
docker build --build-arg IMAGE_VERSION=18-wine-$DATE -t devalexandria/builder:18-wine-mono -t "devalexandria/builder:18-wine-mono-$DATE" -t devalexandria/builder:wine-mono docker/wine-mono
docker build --build-arg IMAGE_VERSION=18-wine-$DATE -t devalexandria/builder:18-wine-chrome -t "devalexandria/builder:18-wine-chrome-$DATE" -t devalexandria/builder:wine-chrome docker/wine-chrome

# Node 16
docker build --build-arg NODE_VERSION=16.20.2 --build-arg IMAGE_VERSION=base-$DATE -t devalexandria/builder:16 -t "devalexandria/builder:16-$DATE" docker/node

docker build --build-arg IMAGE_VERSION=16-$DATE -t devalexandria/builder:16-wine -t "devalexandria/builder:16-wine-$DATE" docker/wine
docker build --build-arg IMAGE_VERSION=16-wine-$DATE -t devalexandria/builder:16-wine-mono -t "devalexandria/builder:16-wine-mono-$DATE" docker/wine-mono
docker build --build-arg IMAGE_VERSION=16-wine-$DATE -t devalexandria/builder:16-wine-chrome -t "devalexandria/builder:16-wine-chrome-$DATE" docker/wine-chrome

# Node 14
docker build --build-arg NODE_VERSION=14.21.3 --build-arg IMAGE_VERSION=base-$DATE -t devalexandria/builder:14 -t "devalexandria/builder:14-$DATE" docker/node

docker build --build-arg IMAGE_VERSION=14-$DATE -t devalexandria/builder:14-wine -t "devalexandria/builder:14-wine-$DATE" docker/wine
docker build --build-arg IMAGE_VERSION=14-wine-$DATE -t devalexandria/builder:14-wine-mono -t "devalexandria/builder:14-wine-mono-$DATE" docker/wine-mono
docker build --build-arg IMAGE_VERSION=14-wine-$DATE -t devalexandria/builder:14-wine-chrome -t "devalexandria/builder:14-wine-chrome-$DATE" docker/wine-chrome
