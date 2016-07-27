#!/usr/bin/env bash

# docker run -ti --rm -v $PWD:/tmp/nsis buildpack-deps:trusty

mkdir -p /tmp/scons && curl -L http://prdownloads.sourceforge.net/scons/scons-local-2.5.0.tar.gz | tar -xz -C /tmp/scons
mkdir -p /tmp/nsis && curl -L https://sourceforge.net/projects/nsis/files/NSIS%203/3.0/nsis-3.0-src.tar.bz2/download | tar -xj -C /tmp/nsis --strip-components 1 && cd /tmp/nsis

python /tmp/scons/scons.py STRIP=0 SKIPSTUBS=all SKIPPLUGINS=all SKIPUTILS=all SKIPMISC=all NSIS_CONFIG_CONST_DATA_PATH=no makensis