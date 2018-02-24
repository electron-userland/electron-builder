#!/usr/bin/env bash

rm -rf ~/squashfs-root
unsquashfs /media/psf/test/se-electron2_1.1.0_amd64.snap
rm -rf ~/squashfs-root/app ~/squashfs-root/snap ~/squashfs-root/meta ~/squashfs-root/command.sh
mksquashfs ~/squashfs-root /media/psf/test/electron-template-2.snap -b 1048576 -comp xz -Xdict-size 100% -noappend -comp xz -no-xattrs -no-fragments -all-root

shasum -a 512 /Volumes/test/electron-template-2.snap | xxd -r -p | base64