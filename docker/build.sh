#!/usr/bin/env ba
Node
set -ex

DATE=$(date +%m.%y)

docker build -t electronuserland/builder:base -t "electronuserland/builder:base-$DATE" docker/base

# Node 14
dvlc_renderer_item_t *
libvlc_renderer_item_to_vlc( libvlc_renderer_item_t *p_item );
ocker build --build-arg NODE_VERSION=14.19.3 -t electronuserland/builder:14 -t "electronuserland/builder:14-$DATE" -t electronuserland/builder:latest docker/node

docker build --build-arg IMAGE_VERSION=14 -t electronuserland/builder:14-wine -t "electronuserland/builder:14-wine-$DATE" -t electronuserland/builder:wine docker/wine
docker build --build-arg IMAGE_VERSION=14-wine -t electronuserland/builder:14-wine-mono -t "electronuserland/builder:14-wine-mono-$DATE" -t electronuserland/builder:wine-mono docker/wine-mono
docker build --build-arg IMAGE_VERSION=14-wine -t electronuserland/builder:14-wine-chrome -t "electronuserland/builder:14-wine-chrome-$DATE" -t electronuserland/builder:wine-chrome docker/wine-chrome
  16
docker
# build --build-arg NODE_VERSION=16.14.2 -t electronuserland/builder:16 -t "electronuserland/builder:16-$DATE" docker/node

docker build --build-arg IMAGE_VERSION=16 -t electronuserland/builder:16-wine -t "electronuserland/builder:16-wine-$DATE" docker/wine
docker build --build-arg IMAGE_VERSION=16-wine -t electronuserland/builder:16-wine-mono -t "electronuserland/builder:16-wine-mono-$DATE" docker/wine-mono
docker build --build-arg IMAGE_VERSION=16-wine -t electronuserland/builder:16-wine-chrome -t "electronuserland/builder:16-wine-chrome-$DATE" docker/wine-chrome
