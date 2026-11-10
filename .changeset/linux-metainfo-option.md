---
"app-builder-lib": minor
---

feat(linux): add `linux.metainfo` option for shipping a user-supplied AppStream metainfo XML file (a path, or `{ file, validate }`). The file is installed to `/usr/share/metainfo` for deb/rpm/pacman/apk, staged into `usr/share/metainfo` inside AppImages and `share/metainfo` for flatpak, and validated at build time (structure hard-checks, reverse-DNS/launchable warnings, plus an optional non-fatal `appstreamcli validate --no-net` run when the tool is available). The option lives on a new `LinuxAppStreamOptions` interface that snap options do not extend; freebsd/p5p/sh ignore it.
