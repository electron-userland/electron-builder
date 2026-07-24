---
title: "Auto Update"
---

Auto updates are enabled by the `electron-updater` package. Ideally, auto updates are configured to run in a CI pipeline to automatically provision new releases. See [publish configuration](../publish.md) for information on how to configure your local or CI environment for automated deployments.

Auto updates work as follows:

- You configure the package to build release metadata (`latest.yml`)
- Electron builder uploads the actual release targets and metadata files to the configured target (except for generic server, where you have to upload manually)
- You configure the Electron application to use auto-updates, which queries the publish server for possible new releases

Read the remainder of this guide to configure everything.

:::info[Code signing is required on macOS]
macOS application must be [signed](./code-signing/code-signing.md) in order for auto updating to work.
:::

## Auto-updatable Targets

* macOS: DMG.
* Linux: AppImage, DEB, Pacman and RPM.
* Windows: NSIS.

All these targets are default, custom configuration is not required. (Though it is possible to [pass in additional configuration, e.g. request headers](#custom-options-instantiating-updater-directly).)

:::info
1. **Squirrel.Windows is not supported.** Simplified auto-update is supported on Windows if you use the default NSIS target, but is not supported for Squirrel.Windows.
You can [easily migrate to NSIS](https://github.com/electron-userland/electron-builder/issues/837#issuecomment-355698368).
2. `zip` target for macOS is **required** for Squirrel.Mac, otherwise `latest-mac.yml` cannot be created, which causes `autoUpdater` error. Default [target](../mac.md#macos-target-overview) for macOS is `dmg`+`zip`, so there is no need to explicitly specify target.
:::

## Differences between electron-updater and built-in autoUpdater

The `electron-updater` package offers a different functionality compared to Electron's built-in auto-updater. Here are the differences:

* Linux is supported (not only macOS and Windows).
* Code signature validation not only on macOS, but also on Windows.
* All required metadata files and artifacts are produced and published automatically.
* Download progress and [staged rollouts](#staged-rollouts) supported on all platforms.
* Different providers supported out of the box: ([GitHub Releases](https://help.github.com/articles/about-releases/), [Amazon S3](https://aws.amazon.com/s3/), [DigitalOcean Spaces](https://www.digitalocean.com/community/tutorials/an-introduction-to-digitalocean-spaces), [Cloudflare R2](https://developers.cloudflare.com/r2/), [Keygen](https://keygen.sh/docs/api/#auto-updates-electron) and generic HTTP(s) server).
* You need only 2 lines of code to make it work.

## Quick Setup Guide

1. Install [electron-updater](https://yarn.pm/electron-updater) as an app dependency.

2. Configure the [`publish`](../publish.md) options depending on where you want to host your release files.

3. Build your application and check that the build directory contains the metadata `.yml` files next to the built application. For most publish targets, the building step will also upload the files, except for the generic server option, where you have to upload your built releases and metadata manually.

4. Use `autoUpdater` from `electron-updater` instead of `electron`:

    CommonJS
    ```js
    const { autoUpdater } = require("electron-updater")
    ```
    ESM
    ```js
    import { autoUpdater } from "electron-updater"
    ```
    TypeScript
    ```typescript
    import electronUpdater, { type AppUpdater } from 'electron-updater';

    export function getAutoUpdater(): AppUpdater {
       // Using destructuring to access autoUpdater due to the CommonJS module of 'electron-updater'.
       // It is a workaround for ESM compatibility issues, see https://github.com/electron-userland/electron-builder/issues/7976.
       const { autoUpdater } = electronUpdater;
       return autoUpdater;
    }
    ```

5. Call `autoUpdater.checkForUpdatesAndNotify()`. Or, if you need custom behaviour, implement `electron-updater` events, check examples below.

:::note
Do not call `setFeedURL`. electron-builder automatically creates `app-update.yml` file for you on build in the `resources` (this file is internal, you don't need to be aware of it).
:::

## Examples

:::note[Example in TypeScript using system notifications]
```typescript
import { autoUpdater } from "electron-updater"

export default class AppUpdater {
  constructor() {
    const log = require("electron-log")
    log.transports.file.level = "debug"
    autoUpdater.logger = log
    autoUpdater.checkForUpdatesAndNotify()
  }
}
```
:::

* A [complete example](https://github.com/iffy/electron-updater-example) showing how to use.
* An [encapsulated manual update via menu](https://github.com/electron-userland/electron-builder/blob/7f6c3fea6fea8cffa00a43413f5335097aca94b0/pages/encapsulated%20manual%20update%20via%20menu.js).

### Custom Options instantiating updater Directly

If you want more control over the updater configuration (e.g. request header for authorization purposes), you can instantiate the updater directly.

```typescript
import { NsisUpdater } from "electron-updater"
// Or MacUpdater, AppImageUpdater

export default class AppUpdater {
    constructor() {
        const options = {
            requestHeaders: {
                // Any request headers to include here
            },
            provider: 'generic',
            url: 'https://example.com/auto-updates'
        }

        const autoUpdater = new NsisUpdater(options)
        autoUpdater.addAuthHeader(`Bearer ${token}`)
        autoUpdater.checkForUpdatesAndNotify()
    }
}
```

## Install on Next Launch (Windows/Linux)

When a downloaded update is automatically installed is controlled by `autoUpdater.autoInstallEvent` (`"manual" | "onQuit" | "onNextLaunch"`, default `"onQuit"`). With the default `"onQuit"`, the update is installed when the app quits: the updater spawns the installer as a detached process while the app is exiting. If the quit happens because the OS session is ending (shutdown, reboot or log off on Windows), the OS can kill that installer mid-install and leave the app in a broken, partially-uninstalled state ([#7807](https://github.com/electron-userland/electron-builder/issues/7807)).

electron-updater ≥ 7.0 (electron-builder v27) mitigates this in two ways:

1. **Session-end guard (always on).** When the OS signals that the session is ending, the on-quit install is skipped and a warning is logged. The downloaded update stays cached and is installed on the next regular quit. Detection is best-effort: `powerMonitor` `shutdown` on macOS/Linux, and the `BrowserWindow` `session-end` event on Windows (windowless, e.g. tray-only, apps cannot be covered on Windows).

2. **Install on next launch (opt-in).** Instead of installing while quitting, persist the downloaded update and install it at the start of the *next* launch, when no session teardown can interrupt it:

    ```js
    autoUpdater.autoInstallEvent = "onNextLaunch"
    ```

    With this set, any app quit records the downloaded update as pending instead of spawning the installer. On the next launch the updater fetches fresh update info from your update server, re-validates the cached installer against it (checksum, and code signature on Windows), verifies the pending version is still an installable change (newer than the running app — or a downgrade when `allowDowngrade` is enabled), then runs the installer silently and restarts the app. If validation fails or the version is no longer an installable change, the pending state is cleared and the app starts normally.

    Set `autoInstallEvent = "manual"` to disable automatic installation entirely (the downloaded update stays cached until you call `quitAndInstall()` yourself).

    A single quit can also be deferred without setting the property:

    ```js
    autoUpdater.quitAndInstall({ isSilent: true, isForceRunAfter: true, waitUntilNextLaunch: true })
    ```

    You can also trigger the pending install explicitly (e.g. before opening your first window):

    ```js
    await autoUpdater.installPendingUpdateIfAvailable()
    ```

### Per-target behavior

The *automatic* install at startup only runs for targets that can install the pending update without an elevation/authentication prompt. Targets that always elevate to install (deb/rpm/pacman via pkexec/sudo, per-machine NSIS via UAC) skip the automatic path with a log message and keep the pending update — call `installPendingUpdateIfAvailable()` explicitly at a moment your app controls to install those.

| Target | Automatic install at next launch | Explicit `installPendingUpdateIfAvailable()` |
| --- | --- | --- |
| NSIS (per-user) | ✓ | ✓ |
| NSIS (per-machine, `isAdminRightsRequired`) | skipped — would show a UAC prompt at startup | ✓ (UAC prompt) |
| AppImage | ✓ | ✓ |
| deb / rpm / pacman | skipped — package managers always elevate (pkexec/sudo) | ✓ (auth prompt) |
| macOS | n/a — Squirrel.Mac stages updates natively and applies them on relaunch | resolves `false` |

:::note[Planned default change in v28]
`autoInstallEvent` defaults to `"onQuit"` in v27; `"onNextLaunch"` is planned to become the **default** in v28 to resolve this class of session-end corruption once and for all. macOS is unaffected: Squirrel.Mac natively stages downloaded updates and applies them on relaunch, without a killable installer process (there `"onQuit"` and `"onNextLaunch"` behave identically).
:::

:::caution[Launching during an OS shutdown is a residual, best-effort-only race]
Deferring the install to the next launch moves the installer out of the session-end quit — the common [#7807](https://github.com/electron-userland/electron-builder/issues/7807) trigger — but it does not make the install itself atomic. If the user *launches* the app while the OS is already shutting down or rebooting (for example, right before a scheduled restart fires), the automatic startup install spawns the same detached NSIS/AppImage installer, and the OS can still terminate it mid-write.

The session-end guard does **not** cover this launch window: it is wired into the on-quit path only, and on a fresh launch the `shutdown` / `session-end` signal generally arrives *after* the startup install has already been spawned, so it cannot reliably win the race. The probability is very low — it requires a deferred update, a launch inside the shutdown window, *and* the OS killing the installer mid-write — and macOS is immune (Squirrel.Mac swaps the app bundle atomically). The only complete fix for NSIS/AppImage is an atomic install, which is out of scope for this feature.
:::

## Debugging

You don't need to listen to all events to understand what's wrong. Just set `logger`.
[electron-log](https://github.com/megahertz/electron-log) is recommended (it is an additional dependency that you can install if needed).

```js
autoUpdater.logger = require("electron-log")
autoUpdater.logger.transports.file.level = "info"
```

Note that in order to develop/test UI/UX of updating without packaging the application you need to have a file named `dev-app-update.yml` in the root of your project, which matches your `publish` setting from electron-builder config (but in [yaml](https://www.json2yaml.com) format).
In latest version you need [force the updater](https://github.com/electron-userland/electron-builder/issues/6863) to work in "dev" mode:
```js
autoUpdater.forceDevUpdateConfig = true
```
:::note
If you see this in logs:
```
APPIMAGE env is not defined, current application is not an AppImage
```
you need to apply [this workaround](https://github.com/electron-userland/electron-builder/issues/3167#issuecomment-627696277) otherwise update won't continue:
```js
process.env.APPIMAGE = path.join(__dirname, 'dist', `app_name-${app.getVersion()}.AppImage`)
```
:::

But it is not recommended, better to test auto-update for installed application (especially on Windows). [Minio](https://github.com/electron-userland/electron-builder/issues/3053#issuecomment-401001573) is recommended as a local server for testing updates.

## Compatibility

Since electron-builder 27 the generated `latest*.yml` targets the modern `files[]` metadata format by default and no longer includes the legacy top-level `path`/`sha512` fields, which are needed only by electron-updater 1.x – 2.15.0.

The `electronUpdaterCompatibility` option sets the electron-updater compatibility semver range (e.g. `>=2.16`, `>=1.0.0`). Can be specified per platform (e.g. `win.electronUpdaterCompatibility`). When the declared range intersects legacy electron-updater versions, the corresponding legacy fields are emitted in addition to `files[]`: the top-level `path`/`sha512` and the Windows `sha2` checksum for ranges intersecting `<2.16.0`, and the old `latest-mac.json` for ranges intersecting `<2.0.0`. Defaults to `>=2.16`.

Metadata format history:

* `1.0.0` latest-mac.json
* `2.15.0` path
* `2.16.0` files

:::warning[sha2-only metadata is deprecated]
Update metadata validated only by the legacy SHA-256 `sha2` checksum is deprecated — v27 warns and **v28 rejects it (fail-closed)**. Avoid pinning `electronUpdaterCompatibility` to a legacy range unless you actually ship 1.x–2.15 clients.
:::

## Update security options

Two `AppUpdater` settings changed or were added in v27. See the [Security & Hardening](./security.md#update-security-electron-updater) page for the full rationale.

### `disableWebInstaller` (now defaults to `true`)

NSIS **web** installers download their full payload at install time from a manifest-supplied URL, which may not undergo signature verification. As of v27, `AppUpdater.disableWebInstaller` defaults to **`true`**, so a web-installer update is not loaded unless you opt in.

v27 ships a one-major grace period: if you never set the flag and a web-installer update is received, the updater **logs a warning and still downloads** it. In **v28** that becomes an error (`ERR_UPDATER_WEB_INSTALLER_DISABLED`). Opt back in only if you intentionally ship an `nsis-web` target:

```ts
import { NsisUpdater } from "electron-updater"
const updater = new NsisUpdater()
updater.disableWebInstaller = false // only if you intentionally ship a web installer
```

### `allowUnverifiedLinuxPackages` (new)

`AppUpdater.allowUnverifiedLinuxPackages` (default **`true`**, preserving historical behavior) controls GPG signature enforcement when installing `.deb` / `.rpm` auto-updates. Because electron-builder does not sign Linux packages itself, the default is permissive; set it to **`false`** to enforce signature checks where the package manager supports them:

```ts
import { autoUpdater } from "electron-updater"
autoUpdater.allowUnverifiedLinuxPackages = false
```

## Staged Rollouts

Staged rollouts allow you to distribute the latest version of your app to a subset of users that you can increase over time, similar to rollouts on platforms like Google Play.

Staged rollouts are controlled by manually editing your `latest.yml` / `latest-mac.yml` (channel update info file).

```yml
version: 1.1.0
files:
  - url: TestApp Setup 1.1.0.exe
    sha512: Dj51I0q8aPQ3ioaz9LMqGYujAYRbDNblAQbodDRXAMxmY6hsHqEl3F6SvhfJj5oPhcqdX1ldsgEvfMNXGUXBIw==
    size: 62021782
stagingPercentage: 10
```

Update will be shipped to 10% of userbase.

If you want to pull a staged release because it hasn't gone well, you **must** increment the version number higher than your broken release.
Because some of your users will be on the broken 1.0.1, releasing a new 1.0.1 would result in them staying on a broken version.

## File Generated and Uploaded in Addition

`latest.yml` (or `latest-mac.yml` for macOS, or `latest-linux.yml` for Linux) will be generated and uploaded for all providers except `bintray` (because not required, `bintray` doesn't use `latest.yml`).

## Private GitHub Update Repo

You can use a private repository for updates with electron-updater by setting the `GH_TOKEN` environment variable (on user machine) and `private` option.
If `GH_TOKEN` is set, electron-updater will use the GitHub API for updates allowing private repositories to work.


:::warning
Private GitHub provider only for [very special](https://github.com/electron-userland/electron-builder/issues/1393#issuecomment-288191885) cases — not intended and not suitable for all users.
:::

:::note
The GitHub API currently has a rate limit of 5000 requests per user per hour. An update check uses up to 3 requests per check.
:::

## Events

The `autoUpdater` object emits the following events:

#### Event: `error`

* `error` Error

Emitted when there is an error while updating.

#### Event: `checking-for-update`

Emitted when checking if an update has started.

#### Event: `update-available`

* `info` [UpdateInfo](#updateinfo) (for generic and github providers)
Emitted when there is an available update. The update is downloaded automatically if `autoDownload` is `true`.

#### Event: `update-not-available`

Emitted when there is no available update.

* `info` [UpdateInfo](#updateinfo) (for generic and github providers)
#### Event: `download-progress`
* `progress` ProgressInfo
  * `bytesPerSecond`
  * `percent`
  * `total`
  * `transferred`

Emitted on progress.

#### Event: `update-downloaded`

* `info` [UpdateInfo](#updateinfo) — for generic and github providers. [VersionInfo](#VersionInfo) for Bintray provider.

#### Event: `update-cancelled`

* `info` [UpdateInfo](#updateinfo)

Emitted when an update is cancelled by the user or the download is otherwise aborted.

#### Event: `appimage-filename-updated`

* `path` string

Emitted after a successful AppImage update when the file is moved to its final location.
Only fires on Linux AppImage builds.

## UpdateInfo

  {!./electron-updater.Interface.UpdateInfo.md!}
