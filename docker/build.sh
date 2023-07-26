#!/usr/bin/env bash

set -ex

DATE=$(date +%m.%y)

docker build -t electronuserland/builder:base -t "electronuserland/builder:base-$DATE" docker/base

## NOTE: Order the latest to oldest versions. The most recent node LTS should be tagged as the latest image

# Node 18
docker build --build-arg NODE_VERSION=18.15.0 --build-arg IMAGE_VERSION=base-$DATE -t electronuserland/builder:18 -t "electronuserland/builder:18-$DATE" -t electronuserland/builder:latest docker/node

docker build --build-arg IMAGE_VERSION=18-$DATE -t electronuserland/builder:18-wine -t "electronuserland/builder:18-wine-$DATE" -t electronuserland/builder:wine docker/wine
docker build --build-arg IMAGE_VERSION=18-wine-$DATE -t electronuserland/builder:18-wine-mono -t "electronuserland/builder:18-wine-mono-$DATE" -t electronuserland/builder:wine-mono docker/wine-mono
docker build --build-arg IMAGE_VERSION=18-wine-$DATE -t electronuserland/builder:18-wine-chrome -t "electronuserland/builder:18-wine-chrome-$DATE" -t electronuserland/builder:wine-chrome docker/wine-chrome

# Node 16
docker build --build-arg NODE_VERSION=16.20.0 --build-arg IMAGE_VERSION=base-$DATE -t electronuserland/builder:16 -t "electronuserland/builder:16-$DATE" docker/node

docker build --build-arg IMAGE_VERSION=16-$DATE -t electronuserland/builder:16-wine -t "electronuserland/builder:16-wine-$DATE" docker/wine
docker build --build-arg IMAGE_VERSION=16-wine-$DATE -t electronuserland/builder:16-wine-mono -t "electronuserland/builder:16-wine-mono-$DATE" docker/wine-mono
docker build --build-arg IMAGE_VERSION=16-wine-$DATE -t electronuserland/builder:16-wine-chrome -t "electronuserland/builder:16-wine-chrome-$DATE" docker/wine-chrome

# Node 14
docker build --build-arg NODE_VERSION=14.21.3 --build-arg IMAGE_VERSION=base-$DATE -t electronuserland/builder:14 -t "electronuserland/builder:14-$DATE" docker/node

docker build --build-arg IMAGE_VERSION=14-$DATE -t electronuserland/builder:14-wine -t "electronuserland/builder:14-wine-$DATE" docker/wine
docker build --build-arg IMAGE_VERSION=14-wine-$DATE -t electronuserland/builder:14-wine-mono -t "electronuserland/builder:14-wine-mono-$DATE" docker/wine-mono
docker build --build-arg IMAGE_VERSION=14-wine-$DATE -t electronuserland/builder:14-wine-chrome -t "electronuserland/builder:14-wine-chrome-$DATE" docker/wine-chrome
