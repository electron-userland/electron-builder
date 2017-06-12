See the [Publishing Artifacts](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts) section of the [Wiki](https://github.com/electron-userland/electron-builder/wiki) for more information on how to configure your CI environment for automated deployments.

Simplified auto-update is supported on Windows if you use the default NSIS setup, but is not supported for Squirrel.Windows.

## Differences between electron-updater and built-in autoUpdater

* It doesn't require a dedicated release server.
* Code signature validation not only on macOS, but also on Windows.
* electron-builder produces and publishes all required metadata files and artifacts.
* Download progress supported on all platforms, including macOS.
* Actually, built-in autoUpdater is used inside on macOS.
* Different providers supported out of the box (GitHub, Bintray, Amazon S3, generic HTTP(s) server).
* You need only 2 lines of code to make it work.

## Quick Setup Guide

1. Install [electron-updater](https://www.npmjs.com/package/electron-updater) as an app dependency.

2. [Configure publish](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts#PublishConfiguration).

3. Use `autoUpdater` from `electron-updater` instead of `electron`:

    ```js
    import { autoUpdater } from "electron-updater"
    ```
    
    Or if you don't use ES6: `const autoUpdater = require("electron-updater").autoUpdater`

4. Implement `electron-updater` events, check examples below.

**NOTICE**: 

1. Do not call [setFeedURL](#module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL). electron-builder automatically creates `app-update.yml` file for you on build in the `resources` (this file is internal, you don't need to be aware of it). 
2. `zip` target for macOS is **required** for Squirrel.Mac, whereas `latest-mac.json` cannot be created, which causes `autoUpdater` error. Default [target](https://github.com/electron-userland/electron-builder/wiki/Options#MacOptions-target) for macOS `dmg`+`zip`, you don't need to explicitly specify target.

### Examples

* A [complete example](https://github.com/iffy/electron-updater-example) showing how to use.
* [Example in Typescript](https://github.com/develar/onshape-desktop-shell/blob/master/src/AppUpdater.ts) using system notifications.
* An [encapsulated manual update via menu](https://github.com/electron-userland/electron-builder/blob/master/docs/encapsulated%20manual%20update%20via%20menu.js).

## File Generated and Uploaded in Addition

`latest.yml` (or `latest-mac.yml` for macOS) will be generated and uploaded for all providers except `bintray` (because not required, `bintray` doesn't use `latest.yml`).

## Private GitHub Update Repo

You can use a private repository for updates with electron-updater by setting the `GH_TOKEN` environment variable (on user machine) and `private` option.
If `GH_TOKEN` is set, electron-updater will use the GitHub API for updates allowing private repositories to work.

Only for [very special](https://github.com/electron-userland/electron-builder/issues/1393#issuecomment-288191885) cases — not intended and not suitable for all users.

**Note:** The GitHub API currently has a rate limit of 5000 requests per user per hour. An update check uses up to 3 requests per check.

## Debugging

You don't need to listen all events to understand what's wrong. Just set `logger`.
[electron-log](https://github.com/megahertz/electron-log) is recommended (it is an additional dependency that you can install if needed).

```js
autoUpdater.logger = require("electron-log")
autoUpdater.logger.transports.file.level = "info"
```

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

Emitted on progress. Only supported over Windows build, since `Squirrel.Mac` [does not provide](https://github.com/electron-userland/electron-builder/issues/1167) this data.

#### Event: `update-downloaded`

* `info` [UpdateInfo](#UpdateInfo) — for generic and github providers. [VersionInfo](#VersionInfo) for Bintray provider.

<!-- do not edit. start of generated block -->
## API

* [electron-updater](#module_electron-updater)
    * [.AppUpdater](#AppUpdater) ⇐ <code>internal:EventEmitter</code>
        * [`.checkForUpdates()`](#module_electron-updater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt;[UpdateCheckResult](electron-updater#UpdateCheckResult)&gt;</code>
        * [`.downloadUpdate(cancellationToken)`](#module_electron-updater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getFeedURL()`](#module_electron-updater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
        * [`.setFeedURL(options)`](#module_electron-updater.AppUpdater+setFeedURL)
        * [`.loadUpdateConfig()`](#module_electron-updater.AppUpdater+loadUpdateConfig) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.quitAndInstall(isSilent)`](#module_electron-updater.AppUpdater+quitAndInstall)
    * [.UpdaterSignal](#UpdaterSignal)
        * [`.login(handler)`](#module_electron-updater.UpdaterSignal+login)
        * [`.progress(handler)`](#module_electron-updater.UpdaterSignal+progress)
        * [`.updateCancelled(handler)`](#module_electron-updater.UpdaterSignal+updateCancelled)
        * [`.updateDownloaded(handler)`](#module_electron-updater.UpdaterSignal+updateDownloaded)

<a name="AppUpdater"></a>

### AppUpdater ⇐ <code>internal:EventEmitter</code>
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)  
**Extends**: <code>internal:EventEmitter</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| autoDownload = <code>true</code>| <code>Boolean</code> | <a name="AppUpdater-autoDownload"></a>Whether to automatically download an update when it is found. |
| allowPrerelease| <code>Boolean</code> | <a name="AppUpdater-allowPrerelease"></a>*GitHub provider only.* Whether to allow update to pre-release versions. Defaults to `true` if application version contains prerelease components (e.g. `0.12.1-alpha.1`, here `alpha` is a prerelease component), otherwise `false`.<br><br>If `true`, downgrade will be allowed (`allowDowngrade` will be set to `true`). |
| allowDowngrade| <code>Boolean</code> | <a name="AppUpdater-allowDowngrade"></a>Whether to allow version downgrade (when a user from the beta channel wants to go back to the stable channel). |
| requestHeaders| <code>[RequestHeaders](electron-builder-http#RequestHeaders)</code> \| <code>null</code> | <a name="AppUpdater-requestHeaders"></a>The request headers. |
| logger| <code>[Logger](electron-updater#Logger)</code> \| <code>null</code> | <a name="AppUpdater-logger"></a>The logger. You can pass [electron-log](https://github.com/megahertz/electron-log), [winston](https://github.com/winstonjs/winston) or another logger with the following interface: `{ info(), warn(), error() }`. Set it to `null` if you would like to disable a logging feature. |
| signals = <code>new UpdaterSignal(this)</code>| <code>[UpdaterSignal](#UpdaterSignal)</code> | <a name="AppUpdater-signals"></a>For type safety you can use signals, e.g. `autoUpdater.signals.updateDownloaded(() => {})` instead of `autoUpdater.on('update-available', () => {})` |


* [.AppUpdater](#AppUpdater) ⇐ <code>internal:EventEmitter</code>
    * [`.checkForUpdates()`](#module_electron-updater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt;[UpdateCheckResult](electron-updater#UpdateCheckResult)&gt;</code>
    * [`.downloadUpdate(cancellationToken)`](#module_electron-updater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getFeedURL()`](#module_electron-updater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
    * [`.setFeedURL(options)`](#module_electron-updater.AppUpdater+setFeedURL)
    * [`.loadUpdateConfig()`](#module_electron-updater.AppUpdater+loadUpdateConfig) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.quitAndInstall(isSilent)`](#module_electron-updater.AppUpdater+quitAndInstall)

<a name="module_electron-updater.AppUpdater+checkForUpdates"></a>

#### `appUpdater.checkForUpdates()` ⇒ <code>Promise&lt;[UpdateCheckResult](electron-updater#UpdateCheckResult)&gt;</code>
Asks the server whether there is an update.

**Kind**: instance method of [<code>AppUpdater</code>](#AppUpdater)  
<a name="module_electron-updater.AppUpdater+downloadUpdate"></a>

#### `appUpdater.downloadUpdate(cancellationToken)` ⇒ <code>Promise&lt;any&gt;</code>
Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.

**Kind**: instance method of [<code>AppUpdater</code>](#AppUpdater)  
**Returns**: <code>Promise&lt;any&gt;</code> - Path to downloaded file.  

| Param | Type |
| --- | --- |
| cancellationToken | <code>[CancellationToken](electron-builder-http#CancellationToken)</code> | 

<a name="module_electron-updater.AppUpdater+getFeedURL"></a>

#### `appUpdater.getFeedURL()` ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
**Kind**: instance method of [<code>AppUpdater</code>](#AppUpdater)  
<a name="module_electron-updater.AppUpdater+setFeedURL"></a>

#### `appUpdater.setFeedURL(options)`
Configure update provider. If value is `string`, [module:electron-builder-http/out/publishOptions.GenericServerOptions](module:electron-builder-http/out/publishOptions.GenericServerOptions) will be set with value as `url`.

**Kind**: instance method of [<code>AppUpdater</code>](#AppUpdater)  

| Param | Type | Description |
| --- | --- | --- |
| options | <code>[PublishConfiguration](Publishing-Artifacts#PublishConfiguration)</code> \| <code>[GenericServerOptions](Publishing-Artifacts#GenericServerOptions)</code> \| <code>[S3Options](Publishing-Artifacts#S3Options)</code> \| <code>[BintrayOptions](Publishing-Artifacts#BintrayOptions)</code> \| <code>[GithubOptions](Publishing-Artifacts#GithubOptions)</code> \| <code>String</code> | If you want to override configuration in the `app-update.yml`. |

<a name="module_electron-updater.AppUpdater+loadUpdateConfig"></a>

#### `appUpdater.loadUpdateConfig()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>AppUpdater</code>](#AppUpdater)  
<a name="module_electron-updater.AppUpdater+quitAndInstall"></a>

#### `appUpdater.quitAndInstall(isSilent)`
Restarts the app and installs the update after it has been downloaded.
It should only be called after `update-downloaded` has been emitted.

**Note:** `autoUpdater.quitAndInstall()` will close all application windows first and only emit `before-quit` event on `app` after that.
This is different from the normal quit event sequence.

**Kind**: instance method of [<code>AppUpdater</code>](#AppUpdater)  

| Param | Type | Description |
| --- | --- | --- |
| isSilent | <code>Boolean</code> | *windows-only* Runs the installer in silent mode. |

<a name="UpdaterSignal"></a>

### UpdaterSignal
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)  

* [.UpdaterSignal](#UpdaterSignal)
    * [`.login(handler)`](#module_electron-updater.UpdaterSignal+login)
    * [`.progress(handler)`](#module_electron-updater.UpdaterSignal+progress)
    * [`.updateCancelled(handler)`](#module_electron-updater.UpdaterSignal+updateCancelled)
    * [`.updateDownloaded(handler)`](#module_electron-updater.UpdaterSignal+updateDownloaded)

<a name="module_electron-updater.UpdaterSignal+login"></a>

#### `updaterSignal.login(handler)`
Emitted when an authenticating proxy is asking for user credentials.

**Kind**: instance method of [<code>UpdaterSignal</code>](#UpdaterSignal)  
**See**: [Electron docs](https://github.com/electron/electron/blob/master/docs/api/client-request.md#event-login)  

| Param | Type |
| --- | --- |
| handler | <code>module:electron-updater.__type</code> | 

<a name="module_electron-updater.UpdaterSignal+progress"></a>

#### `updaterSignal.progress(handler)`
**Kind**: instance method of [<code>UpdaterSignal</code>](#UpdaterSignal)  

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 

<a name="module_electron-updater.UpdaterSignal+updateCancelled"></a>

#### `updaterSignal.updateCancelled(handler)`
**Kind**: instance method of [<code>UpdaterSignal</code>](#UpdaterSignal)  

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 

<a name="module_electron-updater.UpdaterSignal+updateDownloaded"></a>

#### `updaterSignal.updateDownloaded(handler)`
**Kind**: instance method of [<code>UpdaterSignal</code>](#UpdaterSignal)  

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 


<!-- end of generated block -->
