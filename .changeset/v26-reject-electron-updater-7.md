---
"app-builder-lib": patch
---

fix: fail the build when the app's electron-updater can be 7 or later (the 7.0.0 prereleases included): an installed electron-updater 7, or, when none is installed yet, a version declared in `dependencies` whose range allows 7 (e.g. `>=6`). electron-updater 7 rejects the update configuration electron-builder 26 writes (on Windows, every update is rejected), so installs of such a build could never update. Build with electron-builder 27, or pin electron-updater to `^6`. See https://www.electron.build/docs/migration/v26-to-v27
