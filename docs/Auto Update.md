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