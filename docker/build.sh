#!/usr/bin/env bash
set -e

docker build -t electronuserland/builder:base docker/base

docker build -t electronuserland/builder:9 -t electronuserland/builder:latest docker/9

docker build -t electronuserland/builder:wine docker/wine
docker build -t electronuserland/builder:wine-mono docker/wine-mono
docker build -t electronuserland/builder:wine-chrome docker/wine-chrome