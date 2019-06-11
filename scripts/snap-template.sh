#!/usr/bin/env bash

cd ~
rm -rf ~/squashfs-root
unsquashfs /media/psf/ramdisk/electron-builder-test/dist/__snap-x64/se-wo-template_1.1.0_amd64.snap
rm -rf ~/squashfs-root/app ~/squashfs-root/snap ~/squashfs-root/meta ~/squashfs-root/command.sh

rm -f /home/develar/snap-template-electron-4.0.tar.7z && cd ~/squashfs-root && tar cf - . | 7za a -mx=9 -mfb=64 -si ~/snap-template-electron-4.0.tar.7z

mv ~/snap-template-electron-4.0.tar.7z /media/psf/ramdisk/snap-template-electron-4.0.tar.7z
shasum -a 512 /Volumes/ramdisk/snap-template-electron-4.0.tar.7z | xxd -r -p | base64