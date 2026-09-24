#!/bin/sh
# Usage: apt-install-retry <package>...
#
# `apt-get update && apt-get install -y "$@"`, retried with fresh package lists.
#
# security.ubuntu.com / archive.ubuntu.com are round-robin pools whose nodes can be out of sync
# while an Ubuntu security update propagates. A build then fails at random with either a 404 on a
# pool file the index still lists, or "<pkg> is not installable" when a node serves an older index
# than the package version an earlier layer already installed (e.g. libexpat1 vs libexpat1-dev).
# Neither is retried by apt itself; re-running `apt-get update` usually lands on a consistent node.
set -u

attempts=5
n=1
until apt-get update && apt-get install -y "$@"; do
  if [ "$n" -ge "$attempts" ]; then
    echo "apt-install-retry: giving up after $n attempts: $*" >&2
    exit 1
  fi
  echo "apt-install-retry: attempt $n/$attempts failed, retrying in $((n * 10))s" >&2
  rm -rf /var/lib/apt/lists/*
  sleep $((n * 10))
  n=$((n + 1))
done
rm -rf /var/lib/apt/lists/*
