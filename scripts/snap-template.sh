#!/usr/bin/env bash

rm -rf ~/squashfs-root
unsquashfs /media/psf/test/electron-builder-test/dist/se-wo-template_1.1.0_amd64.snap
rm -rf ~/squashfs-root/app ~/squashfs-root/snap ~/squashfs-root/meta ~/squashfs-root/command.sh

rm -f /home/develar/snap-template-electron-2.3.tar.7z && cd ~/squashfs-root && tar cf - . | 7za a -mx=9 -mfb=64 -si /home/develar/snap-template-electron-2.3.tar.7z

shasum -a 512 /Volumes/test/electron-template-2.3.tar.7z | xxd -r -p | base64