See [publish configuration](configuration/publish.md) for information on how to configure your local or CI environment for automated deployments.

!!! info "Code signing is required on macOS"
    macOS application must be [signed](code-signing.md) in order for auto updating to work.

## Auto-updatable Targets

* macOS: DMG.
* Linux: AppImage.
* Windows: NSIS.

All these targets are default, custom configuration is not required. (Though it is possible to [pass in additional configuration, e.g. request headers](#custom-options-instantiating-updater-directly).)

!!! info "Squirrel.Windows is not supported"
    Simplified auto-update is supported on Windows if you use the default NSIS target, but is not supported for Squirrel.Windows.
    You can [easily migrate to NSIS](https://github.com/electron-userland/electron-builder/issues/837#issuecomment-355698368).

## Differences between electron-updater and built-in autoUpdater

* Dedicated release server is not required.
* Code signature validation not only on macOS, but also on Windows.
* All required metadata files and artifacts are produced and published automatically.
* Download progress and [staged rollouts](#staged-rollouts) supported on all platforms.
* Different providers supported out of the box ([GitHub Releases](https://help.github.com/articles/about-releases/), [Amazon S3](https://aws.amazon.com/s3/), [DigitalOcean Spaces](https://www.digitalocean.com/community/tutorials/an-introduction-to-digitalocean-spaces), [Bintray](https://bintray.com) and generic HTTP(s) server).
* You need only 2 lines of code to make it work.

## Quick Setup Guide

1. Install [electron-updater](https://yarn.pm/electron-updater) as an app dependency.

2. [Configure publish](configuration/publish.md).

3. Use `autoUpdater` from `electron-updater` instead of `electron`:

    ```js tab="JavaScript"
    const { autoUpdater } = require("electron-updater")
    ```

    ```js tab="ES2015"
    import { autoUpdater } from "electron-updater"
    ```

4. Call `autoUpdater.checkForUpdatesAndNotify()`. Or, if you need custom behaviour, implement `electron-updater` events, check examples below.

!!! note
    1. Do not call [setFeedURL](#appupdatersetfeedurloptions). electron-builder automatically creates `app-update.yml` file for you on build in the `resources` (this file is internal, you don't need to be aware of it).
    2. `zip` target for macOS is **required** for Squirrel.Mac, otherwise `latest-mac.yml` cannot be created, which causes `autoUpdater` error. Default [target](configuration/mac.md#MacOptions-target) for macOS is `dmg`+`zip`, so there is no need to explicitly specify target.

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
* An [encapsulated manual update via menu](https://github.com/electron-userland/electron-builder/blob/docs/encapsulated%20manual%20update%20via%20menu.js).

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
                Authorization: 'Basic AUTH_CREDS_VALUE'
            },
            provider: 'generic',
            url: 'https://example.com/auto-updates'
        }

        const autoUpdater = new NsisUpdater(options)
        autoUpdater.checkForUpdatesAndNotify()
    }
}
```

Note: When you use autoUpdater from electron-updater there is some logic there to select which updater to use, you could mimic that logic to support multiple platforms. For example, checking the value of `process.platform`:

```typescript
import { AppImageUpdater, MacUpdater, NsisUpdater } from "electron-updater"

const options = { … }

if (process.platform === "win32") {
    autoUpdater = new NsisUpdater(options)
}
else if (process.platform === "darwin") {
    autoUpdater = new MacUpdater(options)
}
else {
    autoUpdater = new AppImageUpdater(options)
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

* `info` [UpdateInfo](#UpdateInfo) (for generic and github providers) | [VersionInfo](#VersionInfo) (for Bintray provider)

Emitted when there is an available update. The update is downloaded automatically if `autoDownload` is `true`.

#### Event: `update-not-available`

Emitted when there is no available update.

* `info` [UpdateInfo](#UpdateInfo) (for generic and github providers) | [VersionInfo](#VersionInfo) (for Bintray provider)

#### Event: `download-progress`
* `progress` ProgressInfo
  * `bytesPerSecond`
  * `percent`
  * `total`
  * `transferred`

Emitted on progress.

#### Event: `update-downloaded`

* `info` [UpdateInfo](#UpdateInfo) — for generic and github providers. [VersionInfo](#VersionInfo) for Bintray provider.

<!-- do not edit. start of generated block -->
## API

* [AppUpdater](#AppUpdater) ⇐ [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)
* [Logger](#Logger)
* [UpdateInfo](#UpdateInfo)
* [UpdateCheckResult](#UpdateCheckResult)
* [UpdaterSignal](#UpdaterSignal)

<a name="AppUpdater"></a>
#### AppUpdater ⇐ <code>[EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)</code>
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>[EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)</code>
**Properties**

* <code id="AppUpdater-autoDownload">autoDownload</code> = `true` Boolean - Whether to automatically download an update when it is found.
* <code id="AppUpdater-autoInstallOnAppQuit">autoInstallOnAppQuit</code> = `true` Boolean - Whether to automatically install a downloaded update on app quit (if `quitAndInstall` was not called before).

    Applicable only on Windows and Linux.

* <code id="AppUpdater-allowPrerelease">allowPrerelease</code> = `false` Boolean - *GitHub provider only.* Whether to allow update to pre-release versions. Defaults to `true` if application version contains prerelease components (e.g. `0.12.1-alpha.1`, here `alpha` is a prerelease component), otherwise `false`.

    If `true`, downgrade will be allowed (`allowDowngrade` will be set to `true`).

* <code id="AppUpdater-fullChangelog">fullChangelog</code> = `false` Boolean - *GitHub provider only.* Get all release notes (from current version to latest), not just the latest.
* <code id="AppUpdater-allowDowngrade">allowDowngrade</code> = `false` Boolean - Whether to allow version downgrade (when a user from the beta channel wants to go back to the stable channel).

    Taken in account only if channel differs (pre-release version component in terms of semantic versioning).

* <code id="AppUpdater-currentVersion">currentVersion</code> SemVer - The current application version.
* <code id="AppUpdater-channel">channel</code> String - Get the update channel. Not applicable for GitHub. Doesn't return `channel` from the update configuration, only if was previously set.
* <code id="AppUpdater-requestHeaders">requestHeaders</code> [key: string]: string - The request headers.
* <code id="AppUpdater-logger">logger</code> [Logger](#Logger) - The logger. You can pass [electron-log](https://github.com/megahertz/electron-log), [winston](https://github.com/winstonjs/winston) or another logger with the following interface: `{ info(), warn(), error() }`. Set it to `null` if you would like to disable a logging feature.
* <code id="AppUpdater-signals">signals</code> = `new UpdaterSignal(this)` [UpdaterSignal](#UpdaterSignal) - For type safety you can use signals, e.g. `autoUpdater.signals.updateDownloaded(() => {})` instead of `autoUpdater.on('update-available', () => {})`

**Methods**

* [.AppUpdater](#AppUpdater) ⇐ <code>[EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)</code>
    * [`.checkForUpdates()`](#module_electron-updater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.checkForUpdatesAndNotify(downloadNotification)`](#module_electron-updater.AppUpdater+checkForUpdatesAndNotify) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.downloadUpdate(cancellationToken)`](#module_electron-updater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;Array&lt;string&gt;&gt;</code>
    * [`.getFeedURL()`](#module_electron-updater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
    * [`.setFeedURL(options)`](#module_electron-updater.AppUpdater+setFeedURL)
    * [`.quitAndInstall(isSilent, isForceRunAfter)`](#module_electron-updater.AppUpdater+quitAndInstall)

<a name="module_electron-updater.AppUpdater+checkForUpdates"></a>
**`appUpdater.checkForUpdates()` ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>**

Asks the server whether there is an update.

<a name="module_electron-updater.AppUpdater+checkForUpdatesAndNotify"></a>
**`appUpdater.checkForUpdatesAndNotify(downloadNotification)` ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>**

Asks the server whether there is an update, download and notify if update available.

 - downloadNotification <code>{ body: string, title: string }</code>

<a name="module_electron-updater.AppUpdater+downloadUpdate"></a>
**`appUpdater.downloadUpdate(cancellationToken)` ⇒ <code>Promise&lt;Array&lt;string&gt;&gt;</code>**

Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.

**Returns**: <code>Promise&lt;Array&lt;string&gt;&gt;</code> - Where the first item in the list is guaranteed to be the path to downloaded file.

- cancellationToken <code>CancellationToken</code>

<a name="module_electron-updater.AppUpdater+getFeedURL"></a>
**`appUpdater.getFeedURL()` ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>**
<a name="module_electron-updater.AppUpdater+setFeedURL"></a>
**`appUpdater.setFeedURL(options)`**

Configure update provider. If value is `string`, [GenericServerOptions](configuration/publish.md#genericserveroptions) will be set with value as `url`.

- options <code>[PublishConfiguration](configuration/publish.md#publishconfiguration)</code> | <code>String</code> | <code>[GithubOptions](configuration/publish.md#githuboptions)</code> | <code>[S3Options](configuration/publish.md#s3options)</code> | <code>[SpacesOptions](configuration/publish.md#spacesoptions)</code> | <code>[GenericServerOptions](configuration/publish.md#genericserveroptions)</code> | <code>[BintrayOptions](configuration/publish.md#bintrayoptions)</code> - If you want to override configuration in the `app-update.yml`.

<a name="module_electron-updater.AppUpdater+channel"></a>
**`appUpdater.channel` (getter and setter)**

Define the channel which the Auto-Updater will follow (see [the auto-update with channels tutorial](tutorials/release-using-channels.md#release_using_channels)) using `appUpdater.channel = 'beta'` or get the current channel with `currentChannel = appUpdater.channel`.

Please note that if you update this property then `allowDowngrade` will automatically be set to `true`. If you do not want this behaviour then you can change `allowDowngrade` after the `channel` property is set.

<a name="module_electron-updater.AppUpdater+quitAndInstall"></a>
**`appUpdater.quitAndInstall(isSilent, isForceRunAfter)`**

Restarts the app and installs the update after it has been downloaded.
It should only be called after `update-downloaded` has been emitted.

**Note:** Like Electron's built-in [<code>quitAndInstall</code>](https://www.electronjs.org/docs/api/auto-updater#autoupdaterquitandinstall) method, `autoUpdater.quitAndInstall()` will close all application windows first and only emit `before-quit` event on `app` after that. This is different from the normal quit event sequence (i.e. not during an update). As a result you should listen to Electron's [<code>before-quit-for-update</code>](https://www.electronjs.org/docs/api/auto-updater#event-before-quit-for-update) event (on `electron.autoUpdater`) if you wish to perform actions before the windows are closed while a process is quitting, as well as listening to `before-quit`. However, that is not the case for the (Windows) NSIS or (Linux) AppImage targets. The `before-quit-for-update` event is not emitted. The `before-quit` event is emitted first, then windows will be closed.

* isSilent <code>Boolean</code> - *windows-only* Runs the installer in silent mode. Defaults to `false`.
* isForceRunAfter <code>Boolean</code> - Run the app after finish even on silent install. Not applicable for macOS. Ignored if `isSilent` is set to `false`.

---

#### `Logger`
**Kind**: interface of [<code>electron-updater</code>](#module_electron-updater)<br/>

<a name="module_electron-updater.Logger+debug"></a>
**`logger.debug(message)`**

- message <code>String</code>

<a name="module_electron-updater.Logger+error"></a>
**`logger.error(message)`**

- message <code>any</code>

<a name="module_electron-updater.Logger+info"></a>
**`logger.info(message)`**

- message <code>any</code>

<a name="module_electron-updater.Logger+warn"></a>
**`logger.warn(message)`**

- message <code>any</code>

---

#### `UpdateInfo`
**Kind**: interface of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Properties**

* **<code id="UpdateInfo-version">version</code>** String - The version.
* **<code id="UpdateInfo-files">files</code>** Array&lt;module:builder-util-runtime.UpdateFileInfo&gt;
* **<code id="UpdateInfo-path">path</code>** String - Deprecated: {tag.description}
* **<code id="UpdateInfo-sha512">sha512</code>** String - Deprecated: {tag.description}
* <code id="UpdateInfo-releaseName">releaseName</code> String - The release name.
* <code id="UpdateInfo-releaseNotes">releaseNotes</code> String | Array&lt;module:builder-util-runtime.ReleaseNoteInfo&gt; - The release notes. List if `updater.fullChangelog` is set to `true`, `string` otherwise.
* **<code id="UpdateInfo-releaseDate">releaseDate</code>** String - The release date.
* <code id="UpdateInfo-stagingPercentage">stagingPercentage</code> Number - The [staged rollout](auto-update.md#staged-rollouts) percentage, 0-100.

---

#### `UpdateCheckResult`
**Kind**: interface of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Properties**

* **<code id="UpdateCheckResult-updateInfo">updateInfo</code>** module:builder-util-runtime.UpdateInfo
* <code id="UpdateCheckResult-downloadPromise">downloadPromise</code> Promise&lt;Array&lt;String&gt;&gt;
* <code id="UpdateCheckResult-cancellationToken">cancellationToken</code> CancellationToken
* **<code id="UpdateCheckResult-versionInfo">versionInfo</code>** module:builder-util-runtime.UpdateInfo - Deprecated: {tag.description}

---

#### `UpdaterSignal`

<code id="UpdaterSignal+login">**`updaterSignal.login(handler)`**</code>

Emitted when an authenticating proxy is [asking for user credentials](https://github.com/electron/electron/blob/master/docs/api/client-request.md#event-login).

* handler - callback

<code id="UpdaterSignal+progress">**updaterSignal.progress(handler)**</code>

* handler - callback

<code id="UpdaterSignal+updateCancelled">**`updaterSignal.updateCancelled(handler)`**</code>

* handler - callback

<code id="UpdaterSignal+updateDownloaded">**`updaterSignal.updateDownloaded(handler)`**</code>

* `handler` - callback


<!-- end of generated block -->
