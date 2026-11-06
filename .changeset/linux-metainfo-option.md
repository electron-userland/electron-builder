---
"app-builder-lib": minor
---

feat(linux): add `linux.metainfo` option for shipping a user-supplied AppStream metainfo XML file. The file is installed to `/usr/share/metainfo` for deb/rpm/pacman, staged into `usr/share/metainfo` inside AppImages and `share/metainfo` for flatpak, and validated at build time (structure hard-checks, reverse-DNS/launchable warnings, plus an optional non-fatal `appstreamcli validate --no-net` run when the tool is available). Validation can be skipped with `linux.disableMetainfoValidation`. The snap target ignores the option.
