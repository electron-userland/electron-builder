---
"app-builder-lib": patch
---

fix: fail the build when the app's electron-updater is 7 or later (the installed version, else the version declared in `dependencies`; the 7.0.0 prereleases included). electron-updater 7 rejects the update configuration electron-builder 26 writes (on Windows, every update is rejected), so installs of such a build could never update. Build with electron-builder 27, or keep electron-updater 6. See https://www.electron.build/docs/migration/v26-to-v27
