See the [Publishing Artifacts](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts) section of the [Wiki](https://github.com/electron-userland/electron-builder/wiki) for more information on how to configure your CI environment for automated deployments.

A [complete example](https://github.com/iffy/electron-updater-example) showing how to use.

Simplified auto-update is not supported for Squirrel.Windows.

## Quick Setup Guide

1. Install [electron-updater](https://www.npmjs.com/package/electron-updater) as an app dependency.

2. [Configure publish](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts#PublishConfiguration).

3. Use `autoUpdater` from `electron-updater` instead of `electron`:

    ```js
    import { autoUpdater } from "electron-updater"
    ```
    
    Or if you don't use ES6: `const autoUpdater = require("electron-updater").autoUpdater`

4. Do not call [setFeedURL](https://github.com/electron-userland/electron-builder/wiki/Auto-Update#autoupdatersetfeedurloptions). electron-builder automatically creates `app-update.yml` file for you on build in the `resources` (this file is internal, you don't need to be aware of it). 

**NOTICE**: Bintray provider doesn't support [macOS auto-update](https://github.com/electron-userland/electron-builder/issues/1172) currently.

## File Generated and Uploaded in Addition

`latest.yml` (or `latest-mac.json` for macOS) will be generated and uploaded for all providers except `bintray` (because not required, `bintray` doesn't use `latest.yml`).

## Debugging

You don't need to listen all events to understand what's wrong. Just set `logger`.
[electron-log](https://github.com/megahertz/electron-log) is recommended (it is an additional dependency that you can install if needed).

```js
autoUpdater.logger = require("electron-log")
autoUpdater.logger.transports.file.level = "info"
```

## Class: AppUpdater
### Properties

Name                | Default           | Description
--------------------|-------------------|------------
`autoDownload`      | `true`            | Automatically download an update when it is found.
`logger`            | `console`         | The logger. You can pass [electron-log](https://github.com/megahertz/electron-log), [winston](https://github.com/winstonjs/winston) or another logger with the following interface: `{ info(), warn(), error() }`. Set it to `null` if you would like to disable a logging feature.
`requestHeaders`    | `null`            | The request headers.

### Events

The `autoUpdater` object emits the following events:

#### Event: `error`

* `error` Error

Emitted when there is an error while updating.

#### Event: `checking-for-update`

Emitted when checking if an update has started.

#### Event: `update-available`

* `info` [UpdateInfo](#updateinfo) (for generic and github providers) | [VersionInfo](#versioninfo) (for Bintray provider)

Emitted when there is an available update. The update is downloaded automatically if `autoDownload` is `true`.

#### Event: `update-not-available`

Emitted when there is no available update.

* `info` [UpdateInfo](#updateinfo) (for generic and github providers) | [VersionInfo](#versioninfo) (for Bintray provider)

#### Event: `download-progress`
* `progress` ProgressInfo
  * `bytesPerSecond`
  * `percent`
  * `total`
  * `transferred`

Emitted on progress. Only supported over Windows build, since `Squirrel.Mac` [does not provide](https://github.com/electron-userland/electron-builder/issues/1167) this data.

#### Event: `update-downloaded`

* `info` [UpdateInfo](#updateinfo) — for generic and github providers. [VersionInfo](#versioninfo) for Bintray provider.

Emitted when an update has been downloaded.

### Methods

The `autoUpdater` object has the following methods:

#### `autoUpdater.setFeedURL(options)`

* `options` GenericServerOptions | S3Options | BintrayOptions | GithubOptions | string — if you want to override configuration in the `app-update.yml`.

Sets the `options`. If value is `string`, `GenericServerOptions` will be set with value as `url`.

#### `autoUpdater.checkForUpdates(): Promise<UpdateCheckResult>`

Asks the server whether there is an update.

#### `autoUpdater.downloadUpdate(): Promise<any>`

Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.

#### `autoUpdater.quitAndInstall()`

Restarts the app and installs the update after it has been downloaded. It
should only be called after `update-downloaded` has been emitted.

**Note:** `autoUpdater.quitAndInstall()` will close all application windows first and only emit `before-quit` event on `app` after that.
This is different from the normal quit event sequence.

### VersionInfo

* `version` string — The version.

### UpdateInfo

Extends [VersionInfo](#versioninfo).

* `releaseDate` string — The release date.
* `releaseName` string (optional) — The release name.
* `releaseNotes` string (optional) — The release notes.

