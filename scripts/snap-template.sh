#!/usr/bin/env bash

cd ~ || exit
rm -rf ~/squashfs-root
unsquashfs /media/psf/ramdisk/electron-builder-test/dist/__snap-x64/se-wo-template_1.1.0_amd64.snap
rm -rf ~/squashfs-root/app ~/squashfs-root/snap ~/squashfs-root/meta ~/squashfs-root/command.sh
# cannot be removed as part of snapcraft yaml because not clear, maybe these dirs requried for custom stage packages
rm -rf ~/squashfs-root/etc ~/squashfs-root/var

#rm -f /home/develar/snap-template-electron-4.0.tar.7z && cd ~/squashfs-root && tar cf - . | zstd -22 --ultra --long  -o ~/snap-template-electron-4.0.tar.zstd
rm -f /home/develar/snap-template-electron-4.0.tar.7z && cd ~/squashfs-root && tar cf - . | 7za a -mx=9 -mfb=64 -si ~/snap-template-electron-4.0-2.tar.7z

zip -yX9 -r ~/snap-template-electron-4.0-2.zip .

#rm -f /home/develar/snap-template-electron-4.0.tar.7z && cd ~/squashfs-root && tar cf - . | 7za a -mx=9 -mfb=64 -si ~/snap-template-electron-4.0-1-arm.tar.7z

mv ~/snap-template-electron-4.0.tar.7z /media/psf/ramdisk/snap-template-electron-4.0.tar.7z
shasum -a 512 /Volumes/ramdisk/snap-template-electron-4.0-2.tar.7z | xxd -r -p | base64