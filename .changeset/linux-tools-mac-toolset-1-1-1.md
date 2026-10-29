---
"app-builder-lib": patch
---

fix(mac): update the default `linuxToolsMac` toolset to `1.1.1`. The bundle is trimmed to the tools electron-builder and fpm run on macOS (`gtar`, `lzip` and binutils 2.47 `ar`) plus their dylibs and license files, and still runs on macOS 15+. Explicit `toolsets.linuxToolsMac` pins (`1.0.0`, `1.0.1`) are unchanged
