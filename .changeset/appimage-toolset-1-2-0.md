---
"app-builder-lib": patch
---

fix(linux): update the default `appimage` toolset to `1.2.0`. Its `mksquashfs` (squashfs-tools 4.7.5) links a pinned static zstd 1.5.7, so Linux and macOS hosts now build byte-identical AppImages. Explicit `toolsets.appimage` pins (`0.0.0`, `1.0.3`, `1.1.0`) are unchanged
