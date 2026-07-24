---
"electron-updater": major
---

feat(updater)!: install-on-next-launch mode, OS session-end guard, object-form `quitAndInstall`, and `autoInstallEvent` enum

**BREAKING:** `quitAndInstall` now takes a single destructured options object instead of positional booleans, so v27 migrators discover the new deferred-install flag and can never swap arguments silently. Defaults are unchanged; there is no backward-compat shim.

```ts
// Before (v26)
autoUpdater.quitAndInstall(true, false)

// After (v27)
autoUpdater.quitAndInstall({ isSilent: true, isForceRunAfter: false })
```

**BREAKING:** the `autoInstallOnAppQuit` boolean is replaced by an `autoInstallEvent: "manual" | "onQuit" | "onNextLaunch"` enum (default `"onQuit"`, which preserves prior behavior). There is no compat alias — a single boolean cannot express the three states.

```ts
// Before (v26)
autoUpdater.autoInstallOnAppQuit = false

// After (v27)
autoUpdater.autoInstallEvent = "manual"
```

Installing an update while the app quits spawns a detached installer process; when the quit is caused by the OS session ending (shutdown/reboot/log off on Windows), the OS can kill that installer mid-install and leave the app uninstalled but not re-installed (#7807). Two mitigations, both implemented in `BaseUpdater` so NSIS, AppImage, deb, rpm and pacman targets all inherit them:

- **Session-end guard (always on):** when the OS session is ending, the on-quit install is skipped with a warning and the downloaded update stays cached for the next quit. Detection is best-effort: `powerMonitor` `shutdown` on macOS/Linux, `BrowserWindow` `session-end` on Windows (windowless apps cannot be covered on Windows).
- **`autoInstallEvent: "onNextLaunch"` (opt-in; default is `"onQuit"`):** any app quit persists the downloaded update as pending instead of spawning the installer. On the next launch the updater re-validates the cached installer against freshly fetched update info (checksum, code signature on Windows, and an installable-change version check — newer, or a downgrade when `allowDowngrade` is set — as a loop guard) and installs it silently, restarting the app. A single quit can be deferred via the new `quitAndInstall({ waitUntilNextLaunch: true })` option.

The automatic install at startup is restricted to targets that install without an elevation prompt: **NSIS (per-user installs) and AppImage only**. deb/rpm/pacman always elevate via pkexec/sudo to install — an authentication dialog at app launch is not acceptable — so they keep the pending update and log why; per-machine NSIS installs (UAC) are skipped the same way. For those targets, call the new `installPendingUpdateIfAvailable()` explicitly at a moment the app controls.

`autoInstallEvent: "onNextLaunch"` is opt-in in v27 and is planned to become the DEFAULT in v28 to resolve this class of session-end corruption once and for all. macOS is unaffected: Squirrel.Mac natively stages downloaded updates and applies them on relaunch (there `"onQuit"` and `"onNextLaunch"` behave identically).
