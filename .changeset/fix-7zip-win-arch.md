---
"app-builder-lib": patch
---

fix: update the 7-Zip toolset to `7zip@1.0.1`, which ships correct per-arch Windows binaries. `7zip@1.0.0` bundled the 32-bit `7za.exe` for every Windows arch, capping 7-Zip's memory at 1.75 GiB and breaking LZMA2 multithreading on win-x64/win-arm64 hosts (electron-userland/electron-builder-binaries#222). Checksums for all platform bundles are updated to the new release assets.
