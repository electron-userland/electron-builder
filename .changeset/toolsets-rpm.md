---
"app-builder-lib": minor
---

feat(rpm): `toolsets.rpm` — the `rpm` target builds with a portable `rpmbuild` (rpm 6.1.0, `rpm@1.0.0` from electron-builder-binaries) by default instead of the host one, so the package format and contents no longer depend on the build host's rpm version or macros. `"latest"` (the default) and `"1.0.0"` select the bundle, `"system"` keeps the host `rpmbuild` on `PATH`, and a `ToolsetCustom` object supplies a custom bundle. The bundle ships for Linux x64/arm64 (glibc 2.28+, not musl) and macOS arm64 (15+); other hosts (Intel macOS, 32-bit Linux, musl, older macOS) should set `toolsets.rpm: "system"` and install `rpmbuild` themselves.
