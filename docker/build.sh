#!/usr/bin/env bash
set -e

docker build -t electronuserland/electron-builder:base docker/base

docker build -t electronuserland/electron-builder:8 -t electronuserland/electron-builder:latest docker/8
docker build -t electronuserland/electron-builder:6 docker/6

docker build -t electronuserland/electron-builder:wine docker/wine