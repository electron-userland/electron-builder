#!/usr/bin/env bash

dir=${PWD##*/}
rm -rf ../${dir}.7z
7za a -m0=lzma2 -mx=9 -mfb=64 -md=64m -ms=on ../winCodeSign.7z .
