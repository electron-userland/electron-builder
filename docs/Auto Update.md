See the [Publishing Artifacts](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts) section of the [Wiki](https://github.com/electron-userland/electron-builder/wiki) for more information on how to configure your CI environment for automated deployments.

Simplified auto-update is supported on Windows if you use the default NSIS setup, but is not supported for Squirrel.Windows.

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
2. Bintray provider doesn't support [macOS auto-update](https://github.com/electron-userland/electron-builder/issues/1172) currently.
3. `zip` target for macOS is **required** for Squirrel.Mac, whereas `latest-mac.json` cannot be created, which causes `autoUpdater` error. Default [target](https://github.com/electron-userland/electron-builder/wiki/Options#MacOptions-target) for macOS `dmg`+`zip`, you don't need to explicitly specify target.

### Examples

* A [complete example](https://github.com/iffy/electron-updater-example) showing how to use.
* [Example in Typescript](https://github.com/develar/onshape-desktop-shell/blob/master/src/AppUpdater.ts) using system notifications.
* An [encapsulated manual update via menu](https://github.com/electron-userland/electron-builder/blob/master/docs/encapsulated%20manual%20update%20via%20menu.js).

## File Generated and Uploaded in Addition

`latest.yml` (or `latest-mac.json` for macOS) will be generated and uploaded for all providers except `bintray` (because not required, `bintray` doesn't use `latest.yml`).

## Private GitHub Update Repo

You can use a private repository for updates with electron-updater by setting the `GH_TOKEN` environment variable (on user machine) and `private` option.
If `GH_TOKEN` is set, electron-updater will use the GitHub API for updates allowing private repositories to work.

Only for [very special](https://github.com/electron-userland/electron-builder/issues/1393#issuecomment-288191885) cases — not intended and not suitable for all users. Doesn't work [on macOs](https://github.com/electron-userland/electron-builder/issues/1370).

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

<dl>
<dt><a href="#module_electron-updater/out/api">electron-updater/out/api</a></dt>
<dd></dd>
<dt><a href="#module_electron-updater/out/AppUpdater">electron-updater/out/AppUpdater</a></dt>
<dd></dd>
<dt><a href="#module_electron-updater">electron-updater</a></dt>
<dd></dd>
</dl>

<a name="module_electron-updater/out/api"></a>

## electron-updater/out/api

* [electron-updater/out/api](#module_electron-updater/out/api)
    * [`.FileInfo`](#FileInfo)
    * [`.UpdateCheckResult`](#UpdateCheckResult)
    * [.Provider](#Provider)
        * [`.getLatestVersion()`](#module_electron-updater/out/api.Provider+getLatestVersion) ⇒ <code>Promise&lt;module:electron-updater/out/api.T&gt;</code>
        * [`.setRequestHeaders(value)`](#module_electron-updater/out/api.Provider+setRequestHeaders)
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/api.Provider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>
    * [.UpdaterSignal](#UpdaterSignal)
        * [`.login(handler)`](#module_electron-updater/out/api.UpdaterSignal+login)
        * [`.progress(handler)`](#module_electron-updater/out/api.UpdaterSignal+progress)
        * [`.updateCancelled(handler)`](#module_electron-updater/out/api.UpdaterSignal+updateCancelled)
        * [`.updateDownloaded(handler)`](#module_electron-updater/out/api.UpdaterSignal+updateDownloaded)
    * [`.formatUrl(url)`](#module_electron-updater/out/api.formatUrl) ⇒ <code>string</code>
    * [`.getChannelFilename(channel)`](#module_electron-updater/out/api.getChannelFilename) ⇒ <code>string</code>
    * [`.getCurrentPlatform()`](#module_electron-updater/out/api.getCurrentPlatform) ⇒ <code>any</code>
    * [`.getCustomChannelName(channel)`](#module_electron-updater/out/api.getCustomChannelName) ⇒ <code>string</code>
    * [`.getDefaultChannelName()`](#module_electron-updater/out/api.getDefaultChannelName) ⇒ <code>string</code>

<a name="FileInfo"></a>

### `FileInfo`
**Kind**: interface of [<code>electron-updater/out/api</code>](#module_electron-updater/out/api)  
**Properties**

| Name | Type |
| --- | --- |
| **name**| <code>string</code> | 
| **url**| <code>string</code> | 
| sha2| <code>string</code> | 
| headers| <code>Object</code> | 

<a name="UpdateCheckResult"></a>

### `UpdateCheckResult`
**Kind**: interface of [<code>electron-updater/out/api</code>](#module_electron-updater/out/api)  
**Properties**

| Name | Type |
| --- | --- |
| **versionInfo**| <code>[VersionInfo](Publishing-Artifacts#VersionInfo)</code> | 
| fileInfo| <code>[FileInfo](#FileInfo)</code> | 
| downloadPromise| <code>Promise&lt;any&gt;</code> \| <code>null</code> | 
| cancellationToken| <code>[CancellationToken](electron-builder-http#CancellationToken)</code> | 

<a name="Provider"></a>

### Provider
**Kind**: class of [<code>electron-updater/out/api</code>](#module_electron-updater/out/api)  
**Properties**

| Name | Type |
| --- | --- |
| requestHeaders| <code>[RequestHeaders](electron-builder-http#RequestHeaders)</code> \| <code>null</code> | 


* [.Provider](#Provider)
    * [`.getLatestVersion()`](#module_electron-updater/out/api.Provider+getLatestVersion) ⇒ <code>Promise&lt;module:electron-updater/out/api.T&gt;</code>
    * [`.setRequestHeaders(value)`](#module_electron-updater/out/api.Provider+setRequestHeaders)
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/api.Provider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>

<a name="module_electron-updater/out/api.Provider+getLatestVersion"></a>

#### `provider.getLatestVersion()` ⇒ <code>Promise&lt;module:electron-updater/out/api.T&gt;</code>
**Kind**: instance method of [<code>Provider</code>](#Provider)  
<a name="module_electron-updater/out/api.Provider+setRequestHeaders"></a>

#### `provider.setRequestHeaders(value)`
**Kind**: instance method of [<code>Provider</code>](#Provider)  

| Param | Type |
| --- | --- |
| value | <code>[RequestHeaders](electron-builder-http#RequestHeaders)</code> \| <code>null</code> | 

<a name="module_electron-updater/out/api.Provider+getUpdateFile"></a>

#### `provider.getUpdateFile(versionInfo)` ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>
**Kind**: instance method of [<code>Provider</code>](#Provider)  

| Param | Type |
| --- | --- |
| versionInfo | <code>module:electron-updater/out/api.T</code> | 

<a name="UpdaterSignal"></a>

### UpdaterSignal
**Kind**: class of [<code>electron-updater/out/api</code>](#module_electron-updater/out/api)  

* [.UpdaterSignal](#UpdaterSignal)
    * [`.login(handler)`](#module_electron-updater/out/api.UpdaterSignal+login)
    * [`.progress(handler)`](#module_electron-updater/out/api.UpdaterSignal+progress)
    * [`.updateCancelled(handler)`](#module_electron-updater/out/api.UpdaterSignal+updateCancelled)
    * [`.updateDownloaded(handler)`](#module_electron-updater/out/api.UpdaterSignal+updateDownloaded)

<a name="module_electron-updater/out/api.UpdaterSignal+login"></a>

#### `updaterSignal.login(handler)`
Emitted when an authenticating proxy is asking for user credentials.

**Kind**: instance method of [<code>UpdaterSignal</code>](#UpdaterSignal)  
**See**: [Electron docs](https://github.com/electron/electron/blob/master/docs/api/client-request.md#event-login)  

| Param | Type |
| --- | --- |
| handler | <code>module:electron-updater/out/api.__type</code> | 

<a name="module_electron-updater/out/api.UpdaterSignal+progress"></a>

#### `updaterSignal.progress(handler)`
**Kind**: instance method of [<code>UpdaterSignal</code>](#UpdaterSignal)  

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 

<a name="module_electron-updater/out/api.UpdaterSignal+updateCancelled"></a>

#### `updaterSignal.updateCancelled(handler)`
**Kind**: instance method of [<code>UpdaterSignal</code>](#UpdaterSignal)  

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 

<a name="module_electron-updater/out/api.UpdaterSignal+updateDownloaded"></a>

#### `updaterSignal.updateDownloaded(handler)`
**Kind**: instance method of [<code>UpdaterSignal</code>](#UpdaterSignal)  

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 

<a name="module_electron-updater/out/api.formatUrl"></a>

### `electron-updater/out/api.formatUrl(url)` ⇒ <code>string</code>
**Kind**: method of [<code>electron-updater/out/api</code>](#module_electron-updater/out/api)  

| Param | Type |
| --- | --- |
| url | <code>module:url.Url</code> | 

<a name="module_electron-updater/out/api.getChannelFilename"></a>

### `electron-updater/out/api.getChannelFilename(channel)` ⇒ <code>string</code>
**Kind**: method of [<code>electron-updater/out/api</code>](#module_electron-updater/out/api)  

| Param | Type |
| --- | --- |
| channel | <code>string</code> | 

<a name="module_electron-updater/out/api.getCurrentPlatform"></a>

### `electron-updater/out/api.getCurrentPlatform()` ⇒ <code>any</code>
**Kind**: method of [<code>electron-updater/out/api</code>](#module_electron-updater/out/api)  
<a name="module_electron-updater/out/api.getCustomChannelName"></a>

### `electron-updater/out/api.getCustomChannelName(channel)` ⇒ <code>string</code>
**Kind**: method of [<code>electron-updater/out/api</code>](#module_electron-updater/out/api)  

| Param | Type |
| --- | --- |
| channel | <code>string</code> | 

<a name="module_electron-updater/out/api.getDefaultChannelName"></a>

### `electron-updater/out/api.getDefaultChannelName()` ⇒ <code>string</code>
**Kind**: method of [<code>electron-updater/out/api</code>](#module_electron-updater/out/api)  
<a name="module_electron-updater/out/AppUpdater"></a>

## electron-updater/out/AppUpdater

* [electron-updater/out/AppUpdater](#module_electron-updater/out/AppUpdater)
    * [`.Logger`](#Logger)
        * [`.error(message)`](#module_electron-updater/out/AppUpdater.Logger+error)
        * [`.info(message)`](#module_electron-updater/out/AppUpdater.Logger+info)
        * [`.warn(message)`](#module_electron-updater/out/AppUpdater.Logger+warn)
    * [.AppUpdater](#AppUpdater) ⇐ <code>internal:EventEmitter</code>
        * [`.checkForUpdates()`](#module_electron-updater/out/AppUpdater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
        * [`.downloadUpdate(cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getFeedURL()`](#module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> \| <code>null</code> \| <code>string</code>
        * [`.setFeedURL(options)`](#module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL)
        * [`.loadUpdateConfig()`](#module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.quitAndInstall()`](#module_electron-updater/out/AppUpdater.AppUpdater+quitAndInstall)
        * [`.computeRequestHeaders(fileInfo)`](#module_electron-updater/out/AppUpdater.AppUpdater+computeRequestHeaders) ⇒ <code>null</code> \| <code>[RequestHeaders](electron-builder-http#RequestHeaders)</code>
        * [`.dispatchError(e)`](#module_electron-updater/out/AppUpdater.AppUpdater+dispatchError)
        * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+doDownloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.onUpdateAvailable(versionInfo, fileInfo)`](#module_electron-updater/out/AppUpdater.AppUpdater+onUpdateAvailable)

<a name="Logger"></a>

### `Logger`
**Kind**: interface of [<code>electron-updater/out/AppUpdater</code>](#module_electron-updater/out/AppUpdater)  

* [`.Logger`](#Logger)
    * [`.error(message)`](#module_electron-updater/out/AppUpdater.Logger+error)
    * [`.info(message)`](#module_electron-updater/out/AppUpdater.Logger+info)
    * [`.warn(message)`](#module_electron-updater/out/AppUpdater.Logger+warn)

<a name="module_electron-updater/out/AppUpdater.Logger+error"></a>

#### `logger.error(message)`
**Kind**: instance method of [<code>Logger</code>](#Logger)  

| Param | Type |
| --- | --- |
| message | <code>any</code> | 

<a name="module_electron-updater/out/AppUpdater.Logger+info"></a>

#### `logger.info(message)`
**Kind**: instance method of [<code>Logger</code>](#Logger)  

| Param | Type |
| --- | --- |
| message | <code>any</code> | 

<a name="module_electron-updater/out/AppUpdater.Logger+warn"></a>

#### `logger.warn(message)`
**Kind**: instance method of [<code>Logger</code>](#Logger)  

| Param | Type |
| --- | --- |
| message | <code>any</code> | 

<a name="AppUpdater"></a>

### AppUpdater ⇐ <code>internal:EventEmitter</code>
**Kind**: class of [<code>electron-updater/out/AppUpdater</code>](#module_electron-updater/out/AppUpdater)  
**Extends**: <code>internal:EventEmitter</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| autoDownload = <code>true</code>| <code>boolean</code> | <a name="AppUpdater-autoDownload"></a>Whether to automatically download an update when it is found. |
| allowPrerelease| <code>boolean</code> | <a name="AppUpdater-allowPrerelease"></a>*GitHub provider only.* Whether to allow update to pre-release versions. Defaults to `true` if application version contains prerelease components (e.g. `0.12.1-alpha.1`, here `alpha` is a prerelease component), otherwise `false`.<br><br>If `true`, downgrade will be allowed (`allowDowngrade` will be set to `true`). |
| allowDowngrade| <code>boolean</code> | <a name="AppUpdater-allowDowngrade"></a>Whether to allow version downgrade (when a user from the beta channel wants to go back to the stable channel). |
| requestHeaders| <code>[RequestHeaders](electron-builder-http#RequestHeaders)</code> \| <code>null</code> | <a name="AppUpdater-requestHeaders"></a>The request headers. |
| logger = <code>(&lt;any&gt;global).__test_app ? null : console</code>| <code>[Logger](#Logger)</code> \| <code>null</code> | <a name="AppUpdater-logger"></a>The logger. You can pass [electron-log](https://github.com/megahertz/electron-log), [winston](https://github.com/winstonjs/winston) or another logger with the following interface: `{ info(), warn(), error() }`. Set it to `null` if you would like to disable a logging feature. |
| signals = <code>new UpdaterSignal(this)</code>| <code>[UpdaterSignal](#UpdaterSignal)</code> | <a name="AppUpdater-signals"></a>For type safety you can use signals, e.g. `autoUpdater.signals.updateDownloaded(() => {})` instead of `autoUpdater.on('update-available', () => {})` |
| updateAvailable| <code>boolean</code> | <a name="AppUpdater-updateAvailable"></a> |
| app| <code>Electron:App</code> | <a name="AppUpdater-app"></a> |
| versionInfo| <code>[VersionInfo](Publishing-Artifacts#VersionInfo)</code> \| <code>null</code> | <a name="AppUpdater-versionInfo"></a> |


* [.AppUpdater](#AppUpdater) ⇐ <code>internal:EventEmitter</code>
    * [`.checkForUpdates()`](#module_electron-updater/out/AppUpdater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.downloadUpdate(cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getFeedURL()`](#module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> \| <code>null</code> \| <code>string</code>
    * [`.setFeedURL(options)`](#module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL)
    * [`.loadUpdateConfig()`](#module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.quitAndInstall()`](#module_electron-updater/out/AppUpdater.AppUpdater+quitAndInstall)
    * [`.computeRequestHeaders(fileInfo)`](#module_electron-updater/out/AppUpdater.AppUpdater+computeRequestHeaders) ⇒ <code>null</code> \| <code>[RequestHeaders](electron-builder-http#RequestHeaders)</code>
    * [`.dispatchError(e)`](#module_electron-updater/out/AppUpdater.AppUpdater+dispatchError)
    * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+doDownloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.onUpdateAvailable(versionInfo, fileInfo)`](#module_electron-updater/out/AppUpdater.AppUpdater+onUpdateAvailable)

<a name="module_electron-updater/out/AppUpdater.AppUpdater+checkForUpdates"></a>

#### `appUpdater.checkForUpdates()` ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
Asks the server whether there is an update.

**Kind**: instance method of [<code>AppUpdater</code>](#AppUpdater)  
<a name="module_electron-updater/out/AppUpdater.AppUpdater+downloadUpdate"></a>

#### `appUpdater.downloadUpdate(cancellationToken)` ⇒ <code>Promise&lt;any&gt;</code>
Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.

**Kind**: instance method of [<code>AppUpdater</code>](#AppUpdater)  
**Returns**: <code>Promise&lt;any&gt;</code> - Path to downloaded file.  

| Param | Type |
| --- | --- |
| cancellationToken | <code>[CancellationToken](electron-builder-http#CancellationToken)</code> | 

<a name="module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL"></a>

#### `appUpdater.getFeedURL()` ⇒ <code>undefined</code> \| <code>null</code> \| <code>string</code>
**Kind**: instance method of [<code>AppUpdater</code>](#AppUpdater)  
<a name="module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL"></a>

#### `appUpdater.setFeedURL(options)`
Configure update provider. If value is `string`, [module:electron-builder-http/out/publishOptions.GenericServerOptions](module:electron-builder-http/out/publishOptions.GenericServerOptions) will be set with value as `url`.

**Kind**: instance method of [<code>AppUpdater</code>](#AppUpdater)  

| Param | Type | Description |
| --- | --- | --- |
| options | <code>[PublishConfiguration](Publishing-Artifacts#PublishConfiguration)</code> \| <code>[GenericServerOptions](Publishing-Artifacts#GenericServerOptions)</code> \| <code>[S3Options](Publishing-Artifacts#S3Options)</code> \| <code>[BintrayOptions](Publishing-Artifacts#BintrayOptions)</code> \| <code>[GithubOptions](Publishing-Artifacts#GithubOptions)</code> \| <code>string</code> | If you want to override configuration in the `app-update.yml`. |

<a name="module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig"></a>

#### `appUpdater.loadUpdateConfig()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>AppUpdater</code>](#AppUpdater)  
<a name="module_electron-updater/out/AppUpdater.AppUpdater+quitAndInstall"></a>

#### `appUpdater.quitAndInstall()`
Restarts the app and installs the update after it has been downloaded. 
It should only be called after `update-downloaded` has been emitted.
*Note:** `autoUpdater.quitAndInstall()` will close all application windows first and only emit `before-quit` event on `app` after that.
This is different from the normal quit event sequence.

**Kind**: instance method of [<code>AppUpdater</code>](#AppUpdater)  
<a name="module_electron-updater/out/AppUpdater.AppUpdater+computeRequestHeaders"></a>

#### `appUpdater.computeRequestHeaders(fileInfo)` ⇒ <code>null</code> \| <code>[RequestHeaders](electron-builder-http#RequestHeaders)</code>
**Kind**: instance method of [<code>AppUpdater</code>](#AppUpdater)  
**Access**: protected  

| Param | Type |
| --- | --- |
| fileInfo | <code>[FileInfo](#FileInfo)</code> | 

<a name="module_electron-updater/out/AppUpdater.AppUpdater+dispatchError"></a>

#### `appUpdater.dispatchError(e)`
**Kind**: instance method of [<code>AppUpdater</code>](#AppUpdater)  
**Access**: protected  

| Param | Type |
| --- | --- |
| e | <code>Error</code> | 

<a name="module_electron-updater/out/AppUpdater.AppUpdater+doDownloadUpdate"></a>

#### `appUpdater.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>AppUpdater</code>](#AppUpdater)  
**Access**: protected  

| Param | Type |
| --- | --- |
| versionInfo | <code>[VersionInfo](Publishing-Artifacts#VersionInfo)</code> | 
| fileInfo | <code>[FileInfo](#FileInfo)</code> | 
| cancellationToken | <code>[CancellationToken](electron-builder-http#CancellationToken)</code> | 

<a name="module_electron-updater/out/AppUpdater.AppUpdater+onUpdateAvailable"></a>

#### `appUpdater.onUpdateAvailable(versionInfo, fileInfo)`
**Kind**: instance method of [<code>AppUpdater</code>](#AppUpdater)  
**Access**: protected  

| Param | Type |
| --- | --- |
| versionInfo | <code>[VersionInfo](Publishing-Artifacts#VersionInfo)</code> | 
| fileInfo | <code>[FileInfo](#FileInfo)</code> | 

<a name="module_electron-updater"></a>

## electron-updater
<a name="module_electron-updater.autoUpdater"></a>

### `electron-updater.autoUpdater` : <code>[AppUpdater](#AppUpdater)</code>
**Kind**: constant of [<code>electron-updater</code>](#module_electron-updater)  

<!-- end of generated block -->
