---
"app-builder-lib": patch
---

fix(linux): update the default `appimage` toolset to `1.2.1`, the license-corrected re-release of `1.2.0` (which was flagged for missing license files and is removed as a pin). Its `mksquashfs` (squashfs-tools 4.7.5) links a pinned static zstd 1.5.7, so Linux and macOS hosts now build byte-identical AppImages. Explicit `toolsets.appimage` pins (`0.0.0`, `1.0.3`, `1.1.0`) are unchanged. A `toolsets.appimage: "1.2.0"` pin (the v27.0.0-alpha.14 default) now fails as an unknown version; move it to `"1.2.1"` or `"latest"`
