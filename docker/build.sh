#!/usr/bin/env bash
set -e

docker build -t electronuserland/builder:base -t electronuserland/builder:base-05.18 docker/base

docker build -t electronuserland/builder:11 -t electronuserland/builder:latest -t electronuserland/builder:11-05.18 docker/11

docker build -t electronuserland/builder:wine docker/wine
docker build -t electronuserland/builder:wine-mono docker/wine-mono
docker build -t electronuserland/builder:wine-chrome docker/wine-chrome