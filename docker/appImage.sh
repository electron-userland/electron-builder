#!/usr/bin/env bash
set -e

dir=${PWD##*/}
rm -rf ~/AppImage-09-07-16.7z
7za a -m0=lzma2 -mx=9 -mfb=64 -md=64m -ms=on ~/AppImage-09-07-16.7z .