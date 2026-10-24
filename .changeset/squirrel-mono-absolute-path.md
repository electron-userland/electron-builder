---
"app-builder-lib": patch
"electron-builder-squirrel-windows": patch
---

Squirrel.Windows on macOS and Linux starts Mono by absolute path, only from its install locations (the Mono framework, Homebrew and MacPorts on macOS; `/usr/bin/mono`, `/usr/local/bin/mono` and Homebrew on Linux), never from `PATH`. A Mono installed elsewhere is configured with `squirrelWindows.monoPath: "/absolute/path/to/mono"`.
