#!/usr/bin/env bash
set -e

docker build -t electronuserland/builder:base -t electronuserland/builder:base-01.19 docker/base

docker build -t electronuserland/builder:11 -t electronuserland/builder:latest -t electronuserland/builder:11-01.19 docker/11

docker build -t electronuserland/builder:wine docker/wine
docker build -t electronuserland/builder:wine-mono docker/wine-mono
docker build -t electronuserland/builder:wine-chrome docker/wine-chrome