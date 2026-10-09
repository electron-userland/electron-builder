---
"app-builder-lib": patch
---

fix(snap): pack legacy-base (core18/core20/core22) template snaps with the `mksquashfs` from `toolsets.appimage` instead of the hardwired legacy `"0.0.0"` bundle, whose mksquashfs supports only gzip/xz, so `compression: "lzo"` (and `linux.compression: "store"`, which maps to lzo) builds again (#7013); a `toolsets.appimage: "0.0.0"` pin combined with `lzo` now fails early with an `InvalidConfigurationError` instead of inside `mksquashfs`
