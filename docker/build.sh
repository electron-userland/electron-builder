#!/usr/bin/env bash
set -e

docker build -t electronuserland/builder:base docker/base

docker build -t electronuserland/builder:8 -t electronuserland/builder:latest docker/8
docker build -t electronuserland/builder:6 docker/6

docker build -t electronuserland/builder:wine docker/wine
docker build -t electronuserland/builder:wine-mono docker/wine-mono
docker build -t electronuserland/builder:wine-chrome docker/wine-chrome