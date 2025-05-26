#!/bin/bash
set -ex

CWD=$(dirname "$0")

docker build --platform=linux/amd64 -f $CWD/Dockerfile-archlinux . -t archlinux-updater-test
docker build --platform=linux/amd64 -f $CWD/Dockerfile-rpm . -t rpm-updater-test
docker build --platform=linux/amd64 -f $CWD/Dockerfile-debian . -t debian-updater-test
# appimage only installs on same-arch systems, so we need to build it on the same arch (e.g. without --platform flag)
docker build -f $CWD/Dockerfile-appimage . -t appimage-updater-test

export TEST_FILES="blackboxUpdateTest,linuxUpdaterTest"
export DEBUG="electron-updater:*,electron-builder:*"

TEST_RUNNER_IMAGE_TAG="appimage-updater-test" ADDITIONAL_DOCKER_ARGS="-e RUN_APP_IMAGE_TEST=true" pnpm test-linux
TEST_RUNNER_IMAGE_TAG="rpm-updater-test" TEST_FILES="linuxUpdaterTest" pnpm test-linux
TEST_RUNNER_IMAGE_TAG="debian-updater-test" pnpm test-linux
TEST_RUNNER_IMAGE_TAG="archlinux-updater-test" pnpm test-linux
