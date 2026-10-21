---
"electron-updater": patch
---

fix(updater): pass the NSIS install directory (`installDirectory`, `/D=`) as the last installer argument, after `--package-file`
