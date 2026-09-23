---
"app-builder-lib": minor
"electron-updater": minor
---

feat(nsis): self-identify install method via `resources/package-type` so nsis-web installs default `disableWebInstaller` to `false`

NSIS installers now write a `resources/package-type` marker (`nsis` or `nsis-web`) at install time, mirroring the existing Linux `package-type` mechanism. electron-updater's `NsisUpdater` reads this marker and, for `nsis-web` installs, pre-seeds `disableWebInstaller = false` so web-installer auto-updates keep working without the app wiring the flag by hand.

This is a default only: an explicit `autoUpdater.disableWebInstaller = …` set by the app still wins, and a plain `nsis` marker leaves the secure `?? true` default (and the v27 grace-period warning) untouched. The marker is written by the installer script — the only build artifact that differs between `nsis` and `nsis-web` (the app payload is byte-identical, since both targets share one app archive). Only go-forward installs carry the marker; existing deployments are unaffected.
