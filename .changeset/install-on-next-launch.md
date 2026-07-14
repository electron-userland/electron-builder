---
"electron-updater": major
---

feat(updater)!: opt-in install-on-next-launch mode, OS session-end guard, and object-form `quitAndInstall`

**BREAKING:** `quitAndInstall` now takes a single destructured options object instead of positional booleans, so v27 migrators discover the new deferred-install flag and can never swap arguments silently. Defaults are unchanged; there is no backward-compat shim.

```ts
// Before (v26)
autoUpdater.quitAndInstall(true, false)

// After (v27)
autoUpdater.quitAndInstall({ isSilent: true, isForceRunAfter: false })
```

Installing an update while the app quits spawns a detached installer process; when the quit is caused by the OS session ending (shutdown/reboot/log off on Windows), the OS can kill that installer mid-install and leave the app uninstalled but not re-installed (#7807). Two mitigations, both implemented in `BaseUpdater` so NSIS, AppImage, deb, rpm and pacman targets all inherit them:

- **Session-end guard (always on):** when the OS session is ending, the on-quit install is skipped with a warning and the downloaded update stays cached for the next quit. Detection is best-effort: `powerMonitor` `shutdown` on macOS/Linux, `BrowserWindow` `session-end` on Windows (windowless apps cannot be covered on Windows).
- **`autoInstallOnNextLaunch` (opt-in, default `false`):** any app quit persists the downloaded update as pending instead of spawning the installer. On the next launch the updater re-validates the cached installer against freshly fetched update info (checksum, code signature on Windows, and a strictly-newer version check as a loop guard) and installs it silently, restarting the app. A single quit can be deferred via the new `quitAndInstall({ waitUntilNextLaunch: true })` option.

The automatic install at startup is restricted to targets that install without an elevation prompt: **NSIS (per-user installs) and AppImage only**. deb/rpm/pacman always elevate via pkexec/sudo to install — an authentication dialog at app launch is not acceptable — so they keep the pending update and log why; per-machine NSIS installs (UAC) are skipped the same way. For those targets, call the new `installPendingUpdateIfAvailable()` explicitly at a moment the app controls.

`autoInstallOnNextLaunch` is opt-in in v27 and is planned to become the DEFAULT behavior in v28 to resolve this class of session-end corruption once and for all. macOS is unaffected: Squirrel.Mac natively stages downloaded updates and applies them on relaunch.
