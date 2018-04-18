#!/usr/bin/env bash

rm -rf ~/squashfs-root
#unsquashfs /media/psf/test/electron-builder-test/dist/se-electron2_1.1.0_amd64.snap
unsquashfs /media/psf/test/electron-builder-test/dist/se-wo-template_1.1.0_amd64.snap
rm -rf ~/squashfs-root/app ~/squashfs-root/snap ~/squashfs-root/meta ~/squashfs-root/command.sh
#mksquashfs ~/squashfs-root /media/psf/test/electron-template-2.snap -comp xz -noappend -comp xz -no-xattrs -no-fragments -all-root
mksquashfs ~/squashfs-root /media/psf/test/electron-template-1.snap -comp xz -noappend -comp xz -no-xattrs -no-fragments -all-root

shasum -a 512 /Volumes/test/electron-template-2.snap | xxd -r -p | base64