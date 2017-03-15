See the [Publishing Artifacts](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts) section of the [Wiki](https://github.com/electron-userland/electron-builder/wiki) for more information on how to configure your CI environment for automated deployments.

Simplified auto-update is not supported for Squirrel.Windows.

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

1. Do not call [setFeedURL](https://github.com/electron-userland/electron-builder/wiki/Auto-Update#autoupdatersetfeedurloptions). electron-builder automatically creates `app-update.yml` file for you on build in the `resources` (this file is internal, you don't need to be aware of it). 
2. Bintray provider doesn't support [macOS auto-update](https://github.com/electron-userland/electron-builder/issues/1172) currently.
3. `zip` target for macOS is **required** for Squirrel.Mac, whereas `latest-mac.json` cannot be created, which causes `autoUpdater` error.

### Examples

**Auto Update**

A [complete example](https://github.com/iffy/electron-updater-example) showing how to use.

**Manual Update**

The following code snippet gives another example, which illustrate an encapsulated manual update via menu.

```js
// updater.js
const { dialog } = require('electron')
const { autoUpdater } = require('electron-updater')


let updater
autoUpdater.autoDownload = false
autoUpdater.on('error', (event, error) => {
  dialog.showErrorBox('Error: ', error)
})
autoUpdater.on('update-available', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Found Updates',
    message: 'Found updates, do you want update now?',
    buttons: ['Sure', 'No']
  }, (buttonIndex) => {
    if (buttonIndex === 0) {
      autoUpdater.downloadUpdate()
    } else {
      updater.enabled = true
      updater = null
    }
  })
})
autoUpdater.on('update-not-available', () => {
  dialog.showMessageBox({
    title: 'No Updates', 
    message: 'Current version is up-to-date.'
  })
  updater.enabled = true
  updater = null
})
autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    title: 'Install Updates',
    message: 'Updates downloaded, application will be quit for update...'
  }, () => {
    autoUpdater.quitAndInstall()
  })
})


// export this to MenuItem click callback
function checkForUpdates (menuItem, focusedWindow, event) {
  updater = menuItem
  updater.enabled = false
  autoUpdater.checkForUpdates()
}
module.exports.checkForUpdates = checkForUpdates
```

Import steps:

1. create `updater.js` for the code snippet
2. require `updater.js` for menu implementation, and set `checkForUpdates` callback from `updater` for the click property of `Check Updates...` MenuItem.

## File Generated and Uploaded in Addition

`latest.yml` (or `latest-mac.json` for macOS) will be generated and uploaded for all providers except `bintray` (because not required, `bintray` doesn't use `latest.yml`).

## Private Update Repo

You can use a private repository for updates with electron-updater by setting the `GH_TOKEN` environment variable. If `GH_TOKEN` is set, electron-updater will use the GitHub API for updates allowing private repositories to work.

**Note:** The GitHub API currently has a rate limit of 5000 requests per user per hour. An update check uses up to 3 requests per check. If you are worried about hitting your rate limit, consider using [conditional requests](https://developer.github.com/v3/#conditional-requests) before checking for updates to reduce rate limit usage.

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
<dt><a href="#module_electron-updater">electron-updater</a></dt>
<dd></dd>
<dt><a href="#module_electron-updater/out/AppUpdater">electron-updater/out/AppUpdater</a></dt>
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
**Kind**: interface of <code>[electron-updater/out/api](#module_electron-updater/out/api)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **name**| <code>string</code> | 
| **url**| <code>string</code> | 
| sha2| <code>string</code> | 
| headers| <code>Object</code> | 

<a name="UpdateCheckResult"></a>

### `UpdateCheckResult`
**Kind**: interface of <code>[electron-updater/out/api](#module_electron-updater/out/api)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **versionInfo**| <code>[VersionInfo](Publishing-Artifacts#VersionInfo)</code> | 
| fileInfo| <code>[FileInfo](#FileInfo)</code> | 
| downloadPromise| <code>Promise&lt;any&gt;</code> \| <code>null</code> | 
| cancellationToken| <code>[CancellationToken](Developer-API#CancellationToken)</code> | 

<a name="Provider"></a>

### Provider
**Kind**: class of <code>[electron-updater/out/api](#module_electron-updater/out/api)</code>  

* [.Provider](#Provider)
    * [`.getLatestVersion()`](#module_electron-updater/out/api.Provider+getLatestVersion) ⇒ <code>Promise&lt;module:electron-updater/out/api.T&gt;</code>
    * [`.setRequestHeaders(value)`](#module_electron-updater/out/api.Provider+setRequestHeaders)
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/api.Provider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>

<a name="module_electron-updater/out/api.Provider+getLatestVersion"></a>

#### `provider.getLatestVersion()` ⇒ <code>Promise&lt;module:electron-updater/out/api.T&gt;</code>
**Kind**: instance method of <code>[Provider](#Provider)</code>  
<a name="module_electron-updater/out/api.Provider+setRequestHeaders"></a>

#### `provider.setRequestHeaders(value)`
**Kind**: instance method of <code>[Provider](#Provider)</code>  

| Param | Type |
| --- | --- |
| value | <code>[RequestHeaders](Developer-API#RequestHeaders)</code> &#124; <code>null</code> | 

<a name="module_electron-updater/out/api.Provider+getUpdateFile"></a>

#### `provider.getUpdateFile(versionInfo)` ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>
**Kind**: instance method of <code>[Provider](#Provider)</code>  

| Param | Type |
| --- | --- |
| versionInfo | <code>module:electron-updater/out/api.T</code> | 

<a name="UpdaterSignal"></a>

### UpdaterSignal
**Kind**: class of <code>[electron-updater/out/api](#module_electron-updater/out/api)</code>  

* [.UpdaterSignal](#UpdaterSignal)
    * [`.progress(handler)`](#module_electron-updater/out/api.UpdaterSignal+progress)
    * [`.updateCancelled(handler)`](#module_electron-updater/out/api.UpdaterSignal+updateCancelled)
    * [`.updateDownloaded(handler)`](#module_electron-updater/out/api.UpdaterSignal+updateDownloaded)

<a name="module_electron-updater/out/api.UpdaterSignal+progress"></a>

#### `updaterSignal.progress(handler)`
**Kind**: instance method of <code>[UpdaterSignal](#UpdaterSignal)</code>  

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 

<a name="module_electron-updater/out/api.UpdaterSignal+updateCancelled"></a>

#### `updaterSignal.updateCancelled(handler)`
**Kind**: instance method of <code>[UpdaterSignal](#UpdaterSignal)</code>  

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 

<a name="module_electron-updater/out/api.UpdaterSignal+updateDownloaded"></a>

#### `updaterSignal.updateDownloaded(handler)`
**Kind**: instance method of <code>[UpdaterSignal](#UpdaterSignal)</code>  

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 

<a name="module_electron-updater/out/api.formatUrl"></a>

### `electron-updater/out/api.formatUrl(url)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-updater/out/api](#module_electron-updater/out/api)</code>  

| Param | Type |
| --- | --- |
| url | <code>module:url.Url</code> | 

<a name="module_electron-updater/out/api.getChannelFilename"></a>

### `electron-updater/out/api.getChannelFilename(channel)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-updater/out/api](#module_electron-updater/out/api)</code>  

| Param | Type |
| --- | --- |
| channel | <code>string</code> | 

<a name="module_electron-updater/out/api.getCurrentPlatform"></a>

### `electron-updater/out/api.getCurrentPlatform()` ⇒ <code>any</code>
**Kind**: method of <code>[electron-updater/out/api](#module_electron-updater/out/api)</code>  
<a name="module_electron-updater/out/api.getCustomChannelName"></a>

### `electron-updater/out/api.getCustomChannelName(channel)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-updater/out/api](#module_electron-updater/out/api)</code>  

| Param | Type |
| --- | --- |
| channel | <code>string</code> | 

<a name="module_electron-updater/out/api.getDefaultChannelName"></a>

### `electron-updater/out/api.getDefaultChannelName()` ⇒ <code>string</code>
**Kind**: method of <code>[electron-updater/out/api](#module_electron-updater/out/api)</code>  
<a name="module_electron-updater"></a>

## electron-updater
<a name="module_electron-updater.autoUpdater"></a>

### `electron-updater.autoUpdater` : <code>[AppUpdater](#AppUpdater)</code>
**Kind**: constant of <code>[electron-updater](#module_electron-updater)</code>  
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
        * [`.getFeedURL()`](#module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> &#124; <code>null</code> &#124; <code>string</code>
        * [`.setFeedURL(options)`](#module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL)
        * [`.loadUpdateConfig()`](#module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.quitAndInstall()`](#module_electron-updater/out/AppUpdater.AppUpdater+quitAndInstall)
        * [`.computeRequestHeaders(fileInfo)`](#module_electron-updater/out/AppUpdater.AppUpdater+computeRequestHeaders) ⇒ <code>null</code> &#124; <code>[RequestHeaders](Developer-API#RequestHeaders)</code>
        * [`.dispatchError(e)`](#module_electron-updater/out/AppUpdater.AppUpdater+dispatchError)
        * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+doDownloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.onUpdateAvailable(versionInfo, fileInfo)`](#module_electron-updater/out/AppUpdater.AppUpdater+onUpdateAvailable)

<a name="Logger"></a>

### `Logger`
**Kind**: interface of <code>[electron-updater/out/AppUpdater](#module_electron-updater/out/AppUpdater)</code>  

* [`.Logger`](#Logger)
    * [`.error(message)`](#module_electron-updater/out/AppUpdater.Logger+error)
    * [`.info(message)`](#module_electron-updater/out/AppUpdater.Logger+info)
    * [`.warn(message)`](#module_electron-updater/out/AppUpdater.Logger+warn)

<a name="module_electron-updater/out/AppUpdater.Logger+error"></a>

#### `logger.error(message)`
**Kind**: instance method of <code>[Logger](#Logger)</code>  

| Param | Type |
| --- | --- |
| message | <code>any</code> | 

<a name="module_electron-updater/out/AppUpdater.Logger+info"></a>

#### `logger.info(message)`
**Kind**: instance method of <code>[Logger](#Logger)</code>  

| Param | Type |
| --- | --- |
| message | <code>any</code> | 

<a name="module_electron-updater/out/AppUpdater.Logger+warn"></a>

#### `logger.warn(message)`
**Kind**: instance method of <code>[Logger](#Logger)</code>  

| Param | Type |
| --- | --- |
| message | <code>any</code> | 

<a name="AppUpdater"></a>

### AppUpdater ⇐ <code>internal:EventEmitter</code>
**Kind**: class of <code>[electron-updater/out/AppUpdater](#module_electron-updater/out/AppUpdater)</code>  
**Extends**: <code>internal:EventEmitter</code>  

* [.AppUpdater](#AppUpdater) ⇐ <code>internal:EventEmitter</code>
    * [`.checkForUpdates()`](#module_electron-updater/out/AppUpdater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.downloadUpdate(cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getFeedURL()`](#module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> &#124; <code>null</code> &#124; <code>string</code>
    * [`.setFeedURL(options)`](#module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL)
    * [`.loadUpdateConfig()`](#module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.quitAndInstall()`](#module_electron-updater/out/AppUpdater.AppUpdater+quitAndInstall)
    * [`.computeRequestHeaders(fileInfo)`](#module_electron-updater/out/AppUpdater.AppUpdater+computeRequestHeaders) ⇒ <code>null</code> &#124; <code>[RequestHeaders](Developer-API#RequestHeaders)</code>
    * [`.dispatchError(e)`](#module_electron-updater/out/AppUpdater.AppUpdater+dispatchError)
    * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+doDownloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.onUpdateAvailable(versionInfo, fileInfo)`](#module_electron-updater/out/AppUpdater.AppUpdater+onUpdateAvailable)

<a name="module_electron-updater/out/AppUpdater.AppUpdater+checkForUpdates"></a>

#### `appUpdater.checkForUpdates()` ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
Asks the server whether there is an update.

**Kind**: instance method of <code>[AppUpdater](#AppUpdater)</code>  
<a name="module_electron-updater/out/AppUpdater.AppUpdater+downloadUpdate"></a>

#### `appUpdater.downloadUpdate(cancellationToken)` ⇒ <code>Promise&lt;any&gt;</code>
Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.

**Kind**: instance method of <code>[AppUpdater](#AppUpdater)</code>  
**Returns**: <code>Promise&lt;any&gt;</code> - Path to downloaded file.  

| Param | Type |
| --- | --- |
| cancellationToken | <code>[CancellationToken](Developer-API#CancellationToken)</code> | 

<a name="module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL"></a>

#### `appUpdater.getFeedURL()` ⇒ <code>undefined</code> &#124; <code>null</code> &#124; <code>string</code>
**Kind**: instance method of <code>[AppUpdater](#AppUpdater)</code>  
<a name="module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL"></a>

#### `appUpdater.setFeedURL(options)`
Configure update provider. If value is `string`, [module:electron-builder-http/out/publishOptions.GenericServerOptions](module:electron-builder-http/out/publishOptions.GenericServerOptions) will be set with value as `url`.

**Kind**: instance method of <code>[AppUpdater](#AppUpdater)</code>  

| Param | Type | Description |
| --- | --- | --- |
| options | <code>[PublishConfiguration](Publishing-Artifacts#PublishConfiguration)</code> &#124; <code>[GenericServerOptions](Publishing-Artifacts#GenericServerOptions)</code> &#124; <code>[S3Options](Publishing-Artifacts#S3Options)</code> &#124; <code>[BintrayOptions](Publishing-Artifacts#BintrayOptions)</code> &#124; <code>[GithubOptions](Publishing-Artifacts#GithubOptions)</code> &#124; <code>string</code> | If you want to override configuration in the `app-update.yml`. |

<a name="module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig"></a>

#### `appUpdater.loadUpdateConfig()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[AppUpdater](#AppUpdater)</code>  
<a name="module_electron-updater/out/AppUpdater.AppUpdater+quitAndInstall"></a>

#### `appUpdater.quitAndInstall()`
Restarts the app and installs the update after it has been downloaded. 
It should only be called after `update-downloaded` has been emitted.
*Note:** `autoUpdater.quitAndInstall()` will close all application windows first and only emit `before-quit` event on `app` after that.
This is different from the normal quit event sequence.

**Kind**: instance method of <code>[AppUpdater](#AppUpdater)</code>  
<a name="module_electron-updater/out/AppUpdater.AppUpdater+computeRequestHeaders"></a>

#### `appUpdater.computeRequestHeaders(fileInfo)` ⇒ <code>null</code> &#124; <code>[RequestHeaders](Developer-API#RequestHeaders)</code>
**Kind**: instance method of <code>[AppUpdater](#AppUpdater)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| fileInfo | <code>[FileInfo](#FileInfo)</code> | 

<a name="module_electron-updater/out/AppUpdater.AppUpdater+dispatchError"></a>

#### `appUpdater.dispatchError(e)`
**Kind**: instance method of <code>[AppUpdater](#AppUpdater)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| e | <code>Error</code> | 

<a name="module_electron-updater/out/AppUpdater.AppUpdater+doDownloadUpdate"></a>

#### `appUpdater.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[AppUpdater](#AppUpdater)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| versionInfo | <code>[VersionInfo](Publishing-Artifacts#VersionInfo)</code> | 
| fileInfo | <code>[FileInfo](#FileInfo)</code> | 
| cancellationToken | <code>[CancellationToken](Developer-API#CancellationToken)</code> | 

<a name="module_electron-updater/out/AppUpdater.AppUpdater+onUpdateAvailable"></a>

#### `appUpdater.onUpdateAvailable(versionInfo, fileInfo)`
**Kind**: instance method of <code>[AppUpdater](#AppUpdater)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| versionInfo | <code>[VersionInfo](Publishing-Artifacts#VersionInfo)</code> | 
| fileInfo | <code>[FileInfo](#FileInfo)</code> | 


<!-- end of generated block -->