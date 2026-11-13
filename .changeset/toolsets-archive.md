---
"app-builder-lib": minor
---

feat(toolsets): add the `archive` toolset (`xz`, `lzip`, GNU `tar`/`ar` and `bsdtar` on Linux x64/arm64/ia32 and macOS arm64/x64, plus `rpmbuild` from rpm 6.1.0 on Linux x64/arm64 and macOS arm64), put first on fpm's `PATH` on macOS and Linux and used for `tar.lz`. It replaces `toolsets.linuxToolsMac`; Intel macOS and 32-bit Linux build `rpm` with the host `rpmbuild`. A leftover `toolsets.linuxToolsMac` key fails config validation; remove it or use `toolsets.archive`
