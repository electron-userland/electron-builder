To benefit from auto updates, you have to implement and configure Electron's [`autoUpdater`](http://electron.atom.io/docs/latest/api/auto-updater/) module ([example](https://github.com/develar/onshape-desktop-shell/blob/master/src/AppUpdater.ts)).

See the [Publishing Artifacts](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts) section of the [Wiki](https://github.com/electron-userland/electron-builder/wiki) for more information on how to configure your CI environment for automated deployments.


**NOTICE**: [macOS auto-update](https://github.com/electron/electron/blob/master/docs/api/auto-updater.md#macos) is not yet simplified. Update providers supported only on Windows.

## Quick Setup Guide

1. Install `electron-auto-updater` as app dependency.

2. [Configure publish](https://github.com/electron-userland/electron-builder/wiki/Options#buildpublish).

3. Use `autoUpdater` from `electron-auto-updater` instead of `electron`, e.g. (ES 6):

    ```js
    import {autoUpdater} from "electron-auto-updater"
    ```
    
    `electron-auto-updater` works in the same way as electron bundled, it allows you to avoid conditional statements and use the same API across platforms.

4. Do not call `setFeedURL` on Windows. electron-builder automatically creates `app-update.yml` file for you on build in the `resources` (this file is internal, you don't need to be aware of it). But if need, you can — for example, to explicitly set `BintrayOptions`: 
    ```js
    {
      provider: "bintray",
      owner: "actperepo",
      package: "no-versions",
    }
    ```

Currently, `generic` (any HTTPS web server), `github` and `bintray` are supported. `latest.yml` will be generated in addition to installer for `generic` and `github` and must be uploaded also (in short: only `bintray` doesn't use `latest.yml` and this file must be not uploaded on Bintray).

## Options

Name                | Default                 | Description
--------------------|-------------------------|------------
autoDownload        | true                    | Automatically download an update when it is found.

## Methods

The `autoUpdater` object has the following methods:

### `autoUpdater.setFeedURL(options)`

* `options` GenericServerOptions | BintrayOptions | GithubOptions — if you want to override configuration in the `app-update.yml`.

Sets the `options`. Windows-only for now. On macOS please refer [electron setFeedURL reference](https://github.com/electron/electron/blob/master/docs/api/auto-updater.md#autoupdatersetfeedurlurl-requestheaders).

### `autoUpdater.checkForUpdates(): Promise<UpdateCheckResult>`

Asks the server whether there is an update. On macOS you must call `setFeedURL` before using this API.

### `autoUpdater.quitAndInstall()`

Restarts the app and installs the update after it has been downloaded. It
should only be called after `update-downloaded` has been emitted.

**Note:** `autoUpdater.quitAndInstall()` will close all application windows first and only emit `before-quit` event on `app` after that.
This is different from the normal quit event sequence.