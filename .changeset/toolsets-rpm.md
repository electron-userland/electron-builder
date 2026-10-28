---
"app-builder-lib": minor
---

feat(rpm): `toolsets.rpm` — the `rpm` target builds with a portable `rpmbuild` (rpm 6.1.0, `rpm@1.0.0` from electron-builder-binaries) by default instead of the host one, so the package format and contents are the same on every build host and rpm version: host and user rpm macros are ignored, and the bundle's macros pin the v4 package format and `_build_id_links none` (also passed as `rpmbuild` defines for every `toolsets.rpm` value, `"system"` included). `"latest"` (the default) and `"1.0.0"` select the bundle (Linux x64/arm64, macOS arm64), `"system"` keeps the host `rpmbuild` on `PATH`, and a `ToolsetCustom` object supplies a custom bundle. Intel macOS and 32-bit Linux have no bundle and must set `toolsets.rpm: "system"`; any other value fails the build with a configuration error. The default change is logged once per build with a link to the v27 migration notes.
