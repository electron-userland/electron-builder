Auto updates are enabled by the `electron-updater` package. Ideally, auto updates are configured to run in a CI pipeline to automatically provision new releases. See [publish configuration](./publish.md) for information on how to configure your local or CI environment for automated deployments.

Auto updates work as follows:

- You configure the package to build release metadata (`latest.yml`)
- Electron builder uploads the actual release targets and metadata files to the configured target (except for generic server, where you have to upload manually)
- You configure the Electron application to use auto-updates, which queries the publish server for possible new releases

Read the remainder of this guide to configure everything.

!!! info "Code signing is required on macOS"
    macOS application must be [signed](code-signing.md) in order for auto updating to work.

## Auto-updatable Targets

* macOS: DMG.
* Linux: AppImage, DEB, Pacman (beta) and RPM.
* Windows: NSIS.

All these targets are default, custom configuration is not required. (Though it is possible to [pass in additional configuration, e.g. request headers](#custom-options-instantiating-updater-directly).)

!!! info 
    1. **Squirrel.Windows is not supported.** Simplified auto-update is supported on Windows if you use the default NSIS target, but is not supported for Squirrel.Windows.
    You can [easily migrate to NSIS](https://github.com/electron-userland/electron-builder/issues/837#issuecomment-355698368).
    2. `zip` target for macOS is **required** for Squirrel.Mac, otherwise `latest-mac.yml` cannot be created, which causes `autoUpdater` error. Default [target](./mac.md#MacOptions-target) for macOS is `dmg`+`zip`, so there is no need to explicitly specify target.

## Differences between electron-updater and built-in autoUpdater

The `electron-updater` package offers a different functionality compared to Electron's built-in auto-updater. Here are the differences:

* A dedicated release server is not required.
* Code signature validation not only on macOS, but also on Windows.
* All required metadata files and artifacts are produced and published automatically.
* Download progress and [staged rollouts](#staged-rollouts) supported on all platforms.
* Different providers supported out of the box: ([GitHub Releases](https://help.github.com/articles/about-releases/), [Amazon S3](https://aws.amazon.com/s3/), [DigitalOcean Spaces](https://www.digitalocean.com/community/tutorials/an-introduction-to-digitalocean-spaces), [Keygen](https://keygen.sh/docs/api/#auto-updates-electron) and generic HTTP(s) server).
* You need only 2 lines of code to make it work.

## Quick Setup Guide

1. Install [electron-updater](https://yarn.pm/electron-updater) as an app dependency.

2. Configure the [`publish`](./publish.md) options depending on where you want to host your release files.

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

!!! note
    Do not call [setFeedURL](#appupdatersetfeedurloptions). electron-builder automatically creates `app-update.yml` file for you on build in the `resources` (this file is internal, you don't need to be aware of it).

## Examples

!!! example "Example in TypeScript using system notifications"
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

* A [complete example](https://github.com/iffy/electron-updater-example) showing how to use.
* An [encapsulated manual update via menu](https://github.com/electron-userland/electron-builder/blob/7f6c3fea6fea8cffa00a43413f5335097aca94b0/pages/encapsulated%20manual%20update%20via%20menu.js).

### Custom Options instantiating updater Directly

If you want to more control over the updater configuration (e.g. request header for authorization purposes), you can instantiate the updater directly.

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

## Debugging

You don't need to listen all events to understand what's wrong. Just set `logger`.
[electron-log](https://github.com/megahertz/electron-log) is recommended (it is an additional dependency that you can install if needed).

```js
autoUpdater.logger = require("electron-log")
autoUpdater.logger.transports.file.level = "info"
```

Note that in order to develop/test UI/UX of updating without packaging the application you need to have a file named `dev-app-update.yml` in the root of your project, which matches your `publish` setting from electron-builder config (but in [yaml](https://www.json2yaml.com) format). But it is not recommended, better to test auto-update for installed application (especially on Windows). [Minio](https://github.com/electron-userland/electron-builder/issues/3053#issuecomment-401001573) is recommended as a local server for testing updates.

## Compatibility

Generated metadata files format changes from time to time, but compatibility preserved up to version 1. If you start a new project, recommended to set `electronUpdaterCompatibility` to current latest format version (`>= 2.16`).

Option `electronUpdaterCompatibility` set the electron-updater compatibility semver range. Can be specified per platform.

e.g. `>= 2.16`, `>=1.0.0`. Defaults to `>=2.15`

* `1.0.0` latest-mac.json
* `2.15.0` path
* `2.16.0` files

## Staged Rollouts

Staged rollouts allow you to distribute the latest version of your app to a subset of users that you can increase over time, similar to rollouts on platforms like Google Play.

Staged rollouts are controlled by manually editing your `latest.yml` / `latest-mac.yml` (channel update info file).

```yml
version: 1.1.0
path: TestApp Setup 1.1.0.exe
sha512: Dj51I0q8aPQ3ioaz9LMqGYujAYRbDNblAQbodDRXAMxmY6hsHqEl3F6SvhfJj5oPhcqdX1ldsgEvfMNXGUXBIw==
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


!!! warning
    Private GitHub provider only for [very special](https://github.com/electron-userland/electron-builder/issues/1393#issuecomment-288191885) cases — not intended and not suitable for all users.

!!! note
    The GitHub API currently has a rate limit of 5000 requests per user per hour. An update check uses up to 3 requests per check.

## Events

The `autoUpdater` object emits the following events:

#### Event: `error`

* `error` Error

Emitted when there is an error while updating.

#### Event: `checking-for-update`

Emitted when checking if an update has started.

#### Event: `update-available`

* `info` [UpdateInfo](#updateinfo) (for generic and github providers) | [VersionInfo](#VersionInfo) (for Bintray provider)

Emitted when there is an available update. The update is downloaded automatically if `autoDownload` is `true`.

#### Event: `update-not-available`

Emitted when there is no available update.

* `info` [UpdateInfo](#updateinfo) (for generic and github providers) | [VersionInfo](#VersionInfo) (for Bintray provider)

#### Event: `download-progress`
* `progress` ProgressInfo
  * `bytesPerSecond`
  * `percent`
  * `total`
  * `transferred`

Emitted on progress.

#### Event: `update-downloaded`

* `info` [UpdateInfo](#updateinfo) — for generic and github providers. [VersionInfo](#VersionInfo) for Bintray provider.

## UpdateInfo

  {!./electron-updater.Interface.UpdateInfo.md!}
