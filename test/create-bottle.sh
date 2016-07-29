#!/usr/bin/env bash
set -e

cd /usr/local/Cellar
brew cleanup
brew prune
rm -f ~/wine.7z
7za a -m0=lzma2 -mx=9 -mfb=64 -md=64m -ms=on -xr!man -xr!doc ~/wine.7z fontconfig freetype gd gnutls jasper libgphoto2 libicns libtasn1 libusb libusb-compat little-cms2 nettle openssl sane-backends webp wine git-lfs gnu-tar dpkg graphicsmagick xz

SEC=`security find-generic-password -l BINTRAY_API_KEY -g 2>&1`
ACCOUNT=`echo "$SEC" | grep "acct" | cut -d \" -f 4`
API_KEY=`echo "$SEC" | grep "password" | cut -d \" -f 2`

curl --progress-bar -T ~/wine.7z -u${ACCOUNT}:${API_KEY} 'https://api.bintray.com/content/develar/bin/electron-builder-mac-test-bottle/1.0/wine.7z?override=1&publish=1' > /dev/null