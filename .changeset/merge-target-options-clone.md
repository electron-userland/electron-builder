---
"app-builder-lib": patch
---

fix: merging target-specific options (`config.flatpak`, `config.snapcraft`, `config.appx`, `config.msi`, ...) into the platform options no longer mutates the shared platform options object (`config.linux` / `config.win` / `config.mac`): a nested override such as `flatpak: { metainfo: { validate: false } }` was merged into `config.linux.metainfo` itself and leaked into every other target of the platform.
