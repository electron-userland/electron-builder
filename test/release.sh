#!/usr/bin/env bash
set -e

if [ "$TRAVIS_BRANCH" == "master" && "$TRAVIS_PULL_REQUEST" == "false" && "$AUTO_PUBLISH" != "false" ]
then
  npm run semantic-release
fi