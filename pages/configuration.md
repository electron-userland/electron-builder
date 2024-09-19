electron-builder [configuration](#configuration) can be defined

* in the `package.json` file of your project using the `build` key on the top level:
   ```json
   "build": {
     "appId": "com.example.app"
   }
   ```
* or through the `--config <path/to/yml-or-json5-or-toml-or-js>` option. Defaults to `electron-builder.yml`.
   ```yaml
   appId: "com.example.app"
   ```

    `json`, [json5](http://json5.org), [toml](https://github.com/toml-lang/toml) or `js`/`ts` (exported configuration or function that produces configuration) formats also supported.

    !!! tip
        If you want to use `js` file, do not name it `electron-builder.js`. It will [conflict](https://github.com/electron-userland/electron-builder/issues/6227) with `electron-builder` package name.

    !!! tip
        If you want to use [toml](https://en.wikipedia.org/wiki/TOML), please install `yarn add toml --dev`.

Most of the options accept `null` — for example, to explicitly set that DMG icon must be default volume icon from the OS and default rules must be not applied (i.e. use application icon as DMG icon), set `dmg.icon` to `null`.

## Artifact File Name Template

`${ext}` macro is supported in addition to [file macros](./file-patterns.md#file-macros).

## Environment Variables from File

Env file `electron-builder.env` in the current dir ([example](https://github.com/motdotla/dotenv-expand/blob/1cc80d02e1f8aa749253a04a2061c0fecb9bdb69/tests/.env)). Supported only for CLI usage.

## How to Read Docs

* Name of optional property is normal, **required** is bold.
* Type is specified after property name: `Array<String> | String`. Union like this means that you can specify or string (`**/*`), or array of strings (`["**/*", "!foo.js"]`).

### Common Configuration

{!./app-builder-lib.Interface.CommonConfiguration.md!}

---

## Overridable per Platform Options

Following options can be set also per platform (top-level keys [mac](mac.md), [linux](linux.md) and [win](win.md)) if need.

## Base Configuration

{!./app-builder-lib.Interface.PlatformSpecificBuildOptions.md!}

## Metadata
Some standard fields should be defined in the `package.json`.

{!./app-builder-lib.Interface.Metadata.md!}

## Proton Native

To package [Proton Native](https://proton-native.js.org/) app, set `protonNodeVersion` option to `current` or specific NodeJS version that you are packaging for.
Currently, only macOS and Linux supported.

## Build Version Management
`CFBundleVersion` (macOS) and `FileVersion` (Windows) will be set automatically to `version.build_number` on CI server (Travis, AppVeyor, CircleCI and Bamboo supported).

{!./hooks.md!}
