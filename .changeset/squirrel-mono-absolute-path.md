---
"app-builder-lib": patch
"electron-builder-squirrel-windows": patch
---

Squirrel.Windows on macOS and Linux starts Mono by absolute path, only from its install locations, searched in the order of the default `PATH` (Homebrew, MacPorts and the Mono framework on macOS; Homebrew, `/usr/local/bin/mono` and `/usr/bin/mono` on Linux), never from `PATH` itself. A Mono installed elsewhere is configured with `squirrelWindows.monoPath: "/absolute/path/to/mono"`.
