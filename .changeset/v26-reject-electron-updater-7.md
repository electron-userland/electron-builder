---
"app-builder-lib": patch
---

fix: fail the build when the app depends on electron-updater 7 (including the 7.0.0 prereleases). electron-updater 7 rejects the update configuration electron-builder 26 writes (on Windows, every update is rejected), so installs of such a build could never update. Build with electron-builder 27, or keep electron-updater 6. See https://www.electron.build/docs/migration/v26-to-v27
