See [publish configuration](/configuration/publish.md) for information on how to configure your local or CI environment for automated deployments.

Simplified auto-update is supported on Windows if you use the default NSIS target, but is not supported for Squirrel.Windows.

## Differences between electron-updater and built-in autoUpdater

* It doesn't require a dedicated release server.
* Code signature validation not only on macOS, but also on Windows.
* electron-builder produces and publishes all required metadata files and artifacts.
* Download progress supported on all platforms.
* [Staged rollouts](#staged-rollouts) supported on all platforms.
* Actually, built-in autoUpdater is used inside on macOS.
* Different providers supported out of the box ([GitHub Releases](https://help.github.com/articles/about-releases/), [Amazon S3](https://aws.amazon.com/s3/), [DigitalOcean Spaces](https://www.digitalocean.com/community/tutorials/an-introduction-to-digitalocean-spaces), [Bintray](https://bintray.com) and generic HTTP(s) server).
* You need only 2 lines of code to make it work.

## Quick Setup Guide

1. Install [electron-updater](https://yarn.pm/electron-updater) as an app dependency.

2. [Configure publish](/configuration/publish.md).

3. Use `autoUpdater` from `electron-updater` instead of `electron`:

    ```js
    import { autoUpdater } from "electron-updater"
    ```

    Or if you don't use ES6: `const autoUpdater = require("electron-updater").autoUpdater`

4. Call `autoUpdater.checkForUpdatesAndNotify()`. Or, if you need custom behaviour, implement `electron-updater` events, check examples below.

**NOTICE**:

1. Do not call [setFeedURL](#appupdatersetfeedurloptions). electron-builder automatically creates `app-update.yml` file for you on build in the `resources` (this file is internal, you don't need to be aware of it).
2. `zip` target for macOS is **required** for Squirrel.Mac, whereas `latest-mac.yml` cannot be created, which causes `autoUpdater` error. Default [target](configuration/mac.md#MacOptions-target) for macOS `dmg`+`zip`, you don't need to explicitly specify target.

### Examples

* [Example in Typescript](https://github.com/develar/onshape-desktop-shell/blob/master/src/AppUpdater.ts) using system notifications.
* A [complete example](https://github.com/iffy/electron-updater-example) showing how to use.
* An [encapsulated manual update via menu](https://github.com/electron-userland/electron-builder/blob/master/docs/encapsulated%20manual%20update%20via%20menu.js).

## Debugging

You don't need to listen all events to understand what's wrong. Just set `logger`.
[electron-log](https://github.com/megahertz/electron-log) is recommended (it is an additional dependency that you can install if needed).

```js
autoUpdater.logger = require("electron-log")
autoUpdater.logger.transports.file.level = "info"
```

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

Only for [very special](https://github.com/electron-userland/electron-builder/issues/1393#issuecomment-288191885) cases — not intended and not suitable for all users.

**Note:** The GitHub API currently has a rate limit of 5000 requests per user per hour. An update check uses up to 3 requests per check.

### Events

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

* [electron-updater](#module_electron-updater)
    * [.AppUpdater](#AppUpdater) ⇐ <code>[EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)</code>
        * [`.checkForUpdates()`](#module_electron-updater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
        * [`.checkForUpdatesAndNotify()`](#module_electron-updater.AppUpdater+checkForUpdatesAndNotify) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
        * [`.downloadUpdate(cancellationToken)`](#module_electron-updater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getFeedURL()`](#module_electron-updater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
        * [`.setFeedURL(options)`](#module_electron-updater.AppUpdater+setFeedURL)
        * [`.quitAndInstall(isSilent, isForceRunAfter)`](#module_electron-updater.AppUpdater+quitAndInstall)
    * [`.FileInfo`](#FileInfo)
    * [`.Logger`](#Logger)
        * [`.debug(message)`](#module_electron-updater.Logger+debug)
        * [`.error(message)`](#module_electron-updater.Logger+error)
        * [`.info(message)`](#module_electron-updater.Logger+info)
        * [`.warn(message)`](#module_electron-updater.Logger+warn)
    * [`.UpdateInfo`](#UpdateInfo)
    * [`.UpdateCheckResult`](#UpdateCheckResult)
    * [.UpdaterSignal](#UpdaterSignal)
        * [`.login(handler)`](#module_electron-updater.UpdaterSignal+login)
        * [`.progress(handler)`](#module_electron-updater.UpdaterSignal+progress)
        * [`.updateCancelled(handler)`](#module_electron-updater.UpdaterSignal+updateCancelled)
        * [`.updateDownloaded(handler)`](#module_electron-updater.UpdaterSignal+updateDownloaded)

<a name="AppUpdater"></a>
### AppUpdater ⇐ <code>[EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)</code>
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>[EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)</code>  
**Properties**
* <code id="AppUpdater-autoDownload">autoDownload</code> = `true` Boolean - Whether to automatically download an update when it is found.
* <code id="AppUpdater-allowPrerelease">allowPrerelease</code> = `false` Boolean - *GitHub provider only.* Whether to allow update to pre-release versions. Defaults to `true` if application version contains prerelease components (e.g. `0.12.1-alpha.1`, here `alpha` is a prerelease component), otherwise `false`.
  
  If `true`, downgrade will be allowed (`allowDowngrade` will be set to `true`).
* <code id="AppUpdater-fullChangelog">fullChangelog</code> = `false` Boolean - *GitHub provider only.* Get all release notes (from current version to latest), not just the latest.
* <code id="AppUpdater-allowDowngrade">allowDowngrade</code> = `false` Boolean - Whether to allow version downgrade (when a user from the beta channel wants to go back to the stable channel).
* <code id="AppUpdater-currentVersion">currentVersion</code> String - The current application version.
* <code id="AppUpdater-requestHeaders">requestHeaders</code> [key: string]: string - The request headers.
* <code id="AppUpdater-logger">logger</code> [Logger](#Logger) - The logger. You can pass [electron-log](https://github.com/megahertz/electron-log), [winston](https://github.com/winstonjs/winston) or another logger with the following interface: `{ info(), warn(), error() }`. Set it to `null` if you would like to disable a logging feature.
* <code id="AppUpdater-signals">signals</code> = `new UpdaterSignal(this)` [UpdaterSignal](#UpdaterSignal) - For type safety you can use signals, e.g. `autoUpdater.signals.updateDownloaded(() => {})` instead of `autoUpdater.on('update-available', () => {})`
* <code id="AppUpdater-configOnDisk">configOnDisk</code> = `new Lazy<any>(() => this.loadUpdateConfig())` Lazy&lt;any&gt;

**Methods**
* [.AppUpdater](#AppUpdater) ⇐ <code>[EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)</code>
    * [`.checkForUpdates()`](#module_electron-updater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.checkForUpdatesAndNotify()`](#module_electron-updater.AppUpdater+checkForUpdatesAndNotify) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.downloadUpdate(cancellationToken)`](#module_electron-updater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getFeedURL()`](#module_electron-updater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
    * [`.setFeedURL(options)`](#module_electron-updater.AppUpdater+setFeedURL)
    * [`.quitAndInstall(isSilent, isForceRunAfter)`](#module_electron-updater.AppUpdater+quitAndInstall)

<a name="module_electron-updater.AppUpdater+checkForUpdates"></a>
#### `appUpdater.checkForUpdates()` ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
Asks the server whether there is an update.

<a name="module_electron-updater.AppUpdater+checkForUpdatesAndNotify"></a>
#### `appUpdater.checkForUpdatesAndNotify()` ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
<a name="module_electron-updater.AppUpdater+downloadUpdate"></a>
#### `appUpdater.downloadUpdate(cancellationToken)` ⇒ <code>Promise&lt;any&gt;</code>
Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.

**Returns**: <code>Promise&lt;any&gt;</code> - Path to downloaded file.  

- cancellationToken <code>CancellationToken</code>

<a name="module_electron-updater.AppUpdater+getFeedURL"></a>
#### `appUpdater.getFeedURL()` ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
<a name="module_electron-updater.AppUpdater+setFeedURL"></a>
#### `appUpdater.setFeedURL(options)`
Configure update provider. If value is `string`, [GenericServerOptions](/configuration/publish.md#genericserveroptions) will be set with value as `url`.


- options <code>[PublishConfiguration](/configuration/publish.md#publishconfiguration)</code> | <code>String</code> | <code>[GithubOptions](/configuration/publish.md#githuboptions)</code> | <code>[S3Options](/configuration/publish.md#s3options)</code> | <code>[SpacesOptions](/configuration/publish.md#spacesoptions)</code> | <code>[GenericServerOptions](/configuration/publish.md#genericserveroptions)</code> | <code>[BintrayOptions](/configuration/publish.md#bintrayoptions)</code> - If you want to override configuration in the `app-update.yml`.

<a name="module_electron-updater.AppUpdater+quitAndInstall"></a>
#### `appUpdater.quitAndInstall(isSilent, isForceRunAfter)`
Restarts the app and installs the update after it has been downloaded.
It should only be called after `update-downloaded` has been emitted.

**Note:** `autoUpdater.quitAndInstall()` will close all application windows first and only emit `before-quit` event on `app` after that.
This is different from the normal quit event sequence.


- isSilent <code>Boolean</code> - *windows-only* Runs the installer in silent mode.
- isForceRunAfter <code>Boolean</code> - *windows-only* Run the app after finish even on silent install.

<a name="FileInfo"></a>
### `FileInfo`
**Kind**: interface of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Properties**
* **<code id="FileInfo-url">url</code>** String
* <code id="FileInfo-packageInfo">packageInfo</code> module:builder-util-runtime.PackageFileInfo
* <code id="FileInfo-sha2">sha2</code> String
* <code id="FileInfo-sha512">sha512</code> String
* <code id="FileInfo-headers">headers</code> [key: string]: string

<a name="Logger"></a>
### `Logger`
**Kind**: interface of [<code>electron-updater</code>](#module_electron-updater)<br/>

* [`.Logger`](#Logger)
    * [`.debug(message)`](#module_electron-updater.Logger+debug)
    * [`.error(message)`](#module_electron-updater.Logger+error)
    * [`.info(message)`](#module_electron-updater.Logger+info)
    * [`.warn(message)`](#module_electron-updater.Logger+warn)

<a name="module_electron-updater.Logger+debug"></a>
#### `logger.debug(message)`

- message <code>String</code>

<a name="module_electron-updater.Logger+error"></a>
#### `logger.error(message)`

- message <code>any</code>

<a name="module_electron-updater.Logger+info"></a>
#### `logger.info(message)`

- message <code>any</code>

<a name="module_electron-updater.Logger+warn"></a>
#### `logger.warn(message)`

- message <code>any</code>

<a name="UpdateInfo"></a>
### `UpdateInfo`
**Kind**: interface of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Properties**
* **<code id="UpdateInfo-version">version</code>** String - The version.
* **<code id="UpdateInfo-path">path</code>** String - Deprecated: {tag.description}
* **<code id="UpdateInfo-url">url</code>** String | Array&lt;String&gt;
* **<code id="UpdateInfo-sha512">sha512</code>** String
* <code id="UpdateInfo-githubArtifactName">githubArtifactName</code> String
* <code id="UpdateInfo-releaseName">releaseName</code> String - The release name.
* <code id="UpdateInfo-releaseNotes">releaseNotes</code> String | Array&lt;module:builder-util-runtime.ReleaseNoteInfo&gt; - The release notes. List if `updater.fullChangelog` is set to `true`, `string` otherwise.
* **<code id="UpdateInfo-releaseDate">releaseDate</code>** String - The release date.
* <code id="UpdateInfo-stagingPercentage">stagingPercentage</code> Number - The [staged rollout](auto-update.md#staged-rollouts) percentage, 0-100.

<a name="UpdateCheckResult"></a>
### `UpdateCheckResult`
**Kind**: interface of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Properties**
* **<code id="UpdateCheckResult-versionInfo">versionInfo</code>** module:builder-util-runtime.UpdateInfo - Deprecated: {tag.description}
* **<code id="UpdateCheckResult-updateInfo">updateInfo</code>** module:builder-util-runtime.UpdateInfo
* <code id="UpdateCheckResult-fileInfo">fileInfo</code> [FileInfo](#FileInfo)
* <code id="UpdateCheckResult-downloadPromise">downloadPromise</code> Promise&lt;Array&lt;String&gt;&gt;
* <code id="UpdateCheckResult-cancellationToken">cancellationToken</code> CancellationToken

<a name="UpdaterSignal"></a>
### UpdaterSignal
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>

* [.UpdaterSignal](#UpdaterSignal)
    * [`.login(handler)`](#module_electron-updater.UpdaterSignal+login)
    * [`.progress(handler)`](#module_electron-updater.UpdaterSignal+progress)
    * [`.updateCancelled(handler)`](#module_electron-updater.UpdaterSignal+updateCancelled)
    * [`.updateDownloaded(handler)`](#module_electron-updater.UpdaterSignal+updateDownloaded)

<a name="module_electron-updater.UpdaterSignal+login"></a>
#### `updaterSignal.login(handler)`
Emitted when an authenticating proxy is [asking for user credentials](https://github.com/electron/electron/blob/master/docs/api/client-request.md#event-login).


- handler <code>module:electron-updater.__type</code>

<a name="module_electron-updater.UpdaterSignal+progress"></a>
#### `updaterSignal.progress(handler)`

- handler <code>callback</code>

<a name="module_electron-updater.UpdaterSignal+updateCancelled"></a>
#### `updaterSignal.updateCancelled(handler)`

- handler <code>callback</code>

<a name="module_electron-updater.UpdaterSignal+updateDownloaded"></a>
#### `updaterSignal.updateDownloaded(handler)`

- handler <code>callback</code>


<!-- end of generated block -->
