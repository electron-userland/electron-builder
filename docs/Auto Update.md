See the [Publishing Artifacts](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts) section of the [Wiki](https://github.com/electron-userland/electron-builder/wiki) for more information on how to configure your CI environment for automated deployments.

Real project [example](https://github.com/develar/onshape-desktop-shell/blob/master/src/AppUpdater.ts).

Simplified auto-update is not supported for Squirrel.Windows.

## Quick Setup Guide

1. Install `electron-updater` as an app dependency.

2. [Configure publish](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts#PublishConfiguration).

3. Use `autoUpdater` from `electron-updater` instead of `electron`, e.g. (ES 6):

    ```js
    import {autoUpdater} from "electron-updater"
    ```    

4. Do not call `setFeedURL`. electron-builder automatically creates `app-update.yml` file for you on build in the `resources` (this file is internal, you don't need to be aware of it). 
   
   But if need, you can — for example, to explicitly configure Bintray provider: 
    ```js
    {
      provider: "bintray",
      owner: "actperepo",
      package: "no-versions"
    }
    ```

Currently, [generic](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts#GenericServerOptions) (any HTTPS web server), [github](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts#GithubOptions) and [bintray](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts#BintrayOptions) are supported.
`latest.yml` (or `latest-mac.json` for macOS) will be generated in addition to installer for `generic` and `github` and must be uploaded also (in short: only `bintray` doesn't use `latest.yml` and this file must be not uploaded on Bintray).

**NOTICE**: Bintray provider doesn't support [macOS auto-update](https://github.com/electron/electron/blob/master/docs/api/auto-updater.md#macos) currently. If need, please file issue.

## Debugging

You don't need to listen all events to understand what's wrong. Just set `logger`.
[electron-log](https://github.com/megahertz/electron-log) is recommended (it is an additional dependency that you can install if needed).

```js
autoUpdater.logger = require("electron-log")
autoUpdater.logger.transports.file.level = "info"
```

## Options

Name                | Default                 | Description
--------------------|-------------------------|------------
autoDownload        | `true`                  | Automatically download an update when it is found.
logger              | `console`               | The logger. You can pass [electron-log](https://github.com/megahertz/electron-log), [winston](https://github.com/winstonjs/winston) or another logger with the following interface: `{ info(), warn(), error() }`. Set it to `null` if you would like to disable a logging feature.

## Events

The `autoUpdater` object emits the following events:

### Event: `error`

Returns:

* `error` Error

Emitted when there is an error while updating.

### Event: `checking-for-update`

Emitted when checking if an update has started.

### Event: `update-available`

Emitted when there is an available update. The update is downloaded automatically if `autoDownload` is not set to `false`.

### Event: `update-not-available`

Emitted when there is no available update.

### Event: `download-progress`

Returns:

* `bytesPerSecond`
* `percent`
* `total`
* `transferred`

Emitted on progress.

### Event: `update-downloaded`

Returns:

* `event` Event

Emitted when an update has been downloaded.

## Methods

The `autoUpdater` object has the following methods:

### `autoUpdater.setFeedURL(options)`

* `options` GenericServerOptions | BintrayOptions | GithubOptions | string — if you want to override configuration in the `app-update.yml`.

Sets the `options`. If value is `string`, `GenericServerOptions` will be set with value as `url`.

### `autoUpdater.checkForUpdates(): Promise<UpdateCheckResult>`

Asks the server whether there is an update.

### `autoUpdater.quitAndInstall()`

Restarts the app and installs the update after it has been downloaded. It
should only be called after `update-downloaded` has been emitted.

**Note:** `autoUpdater.quitAndInstall()` will close all application windows first and only emit `before-quit` event on `app` after that.
This is different from the normal quit event sequence.