#!/bin/bash -ex

CWD=$(dirname "$0")

docker build --platform=linux/amd64 -f $CWD/Dockerfile-archlinux . -t archlinux-updater-test
docker build --platform=linux/amd64 -f $CWD/Dockerfile-rpm . -t rpm-updater-test
docker build --platform=linux/amd64 -f $CWD/Dockerfile-debian . -t debian-updater-test

TEST_RUNNER_IMAGE_TAG=archlinux-updater-test TEST_FILES=linuxUpdaterTest pnpm -w test-linux
TEST_RUNNER_IMAGE_TAG=rpm-updater-test TEST_FILES=linuxUpdaterTest pnpm -w test-linux
TEST_RUNNER_IMAGE_TAG=debian-updater-test TEST_FILES=linuxUpdaterTest pnpm -w test-linux
