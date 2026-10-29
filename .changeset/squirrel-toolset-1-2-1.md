---
"electron-builder-squirrel-windows": patch
"app-builder-lib": patch
---

fix(squirrel-windows): update the default `squirrel` toolset to `1.2.1`. It bundles a pinned, checksum-verified 7-Zip 26.05 (now with native `7z-arm64`, selected only on arm64 Windows hosts; macOS and Linux hosts keep the x64 `7z.exe`, which Squirrel runs under Wine) and `nuget.exe` 7.9.0. An explicit `toolsets.squirrel: "1.1.1"` pin is unchanged
