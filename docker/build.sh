#!/usr/bin/env bash
set -e

docker build -t electronuserland/electron-builder:base docker/base

docker build -t electronuserland/electron-builder:6 -t electronuserland/electron-builder:latest docker/6
docker build -t electronuserland/electron-builder:4 docker/4

docker build -t electronuserland/electron-builder:wine docker/wine