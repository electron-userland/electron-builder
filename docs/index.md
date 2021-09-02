# electron-builder [![npm version](https://img.shields.io/npm/v/electron-builder.svg?label=latest)](https://yarn.pm/electron-builder) [![downloads per month](https://img.shields.io/npm/dm/electron-builder.svg)](https://yarn.pm/electron-builder) [![donate](https://img.shields.io/badge/donate-donorbox-green.svg)](https://www.electron.build/donate) [![project chat](https://img.shields.io/badge/chat-on_zulip-brightgreen.svg)](https://electron-builder.zulipchat.com)
A complete solution to package and build a ready for distribution Electron app for macOS, Windows and Linux with “auto update” support out of the box.

* NPM packages management:
    * [Native application dependencies](https://electron.atom.io/docs/tutorial/using-native-node-modules/) compilation (including [Yarn](http://yarnpkg.com/) support).
    * Development dependencies are never included. You don't need to ignore them explicitly.
    * [Two package.json structure](tutorials/two-package-structure.md) is supported, but you are not forced to use it even if you have native production dependencies.
* [Code Signing](code-signing.md) on a CI server or development machine.
* [Auto Update](auto-update.md) ready application packaging.
* Numerous target formats:
    * All platforms: `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir` (unpacked directory).
    * [macOS](configuration/mac.md#MacConfiguration-target): `dmg`, `pkg`, `mas`, `mas-dev`.
    * [Linux](configuration/linux.md#LinuxConfiguration-target): [AppImage](http://appimage.org), [snap](http://snapcraft.io), debian package (`deb`), `rpm`, `freebsd`, `pacman`, `p5p`, `apk`.
    * [Windows](configuration/win.md#WindowsConfiguration-target): `nsis` (Installer), `nsis-web` (Web installer), `portable` (portable app without installation), AppX (Windows Store), Squirrel.Windows.
* [Publishing artifacts](configuration/publish.md) to GitHub Releases, Amazon S3, DigitalOcean Spaces and Bintray.
* Advanced building:
    * Pack in a distributable format [already packaged app](#pack-only-in-a-distributable-format).
    * Separate [build steps](https://github.com/electron-userland/electron-builder/issues/1102#issuecomment-271845854).
    * Build and publish in parallel, using hard links on CI server to reduce IO and disk space usage.
    * [electron-compile](https://github.com/electron/electron-compile) support (compile for release-time on the fly on build).
* [Docker](multi-platform-build.md#docker) images to build Electron app for Linux or Windows on any platform.
* [Proton Native](https://proton-native.js.org/) support.
* Downloads all required tools files on demand automatically (e.g. to code sign windows application, to make AppX), no need to setup.

| Question | Answer |
|--------|-------|
| “I want to configure electron-builder” | [See options](configuration/configuration.md) |
| “I have a question” | [Open an issue](https://github.com/electron-userland/electron-builder/issues) or [join the chat](https://electron-builder.zulipchat.com/) |
| “I found a bug” | [Open an issue](https://github.com/electron-userland/electron-builder/issues/new) |
| “I want to support development” | [Donate](donate.md) |

## Installation
[Yarn](http://yarnpkg.com/) is [strongly](https://github.com/electron-userland/electron-builder/issues/1147#issuecomment-276284477) recommended instead of npm.

`yarn add electron-builder --dev`

## Boilerplates

* [electron-webpack-quick-start](https://github.com/electron-userland/electron-webpack-quick-start) — A bare minimum project structure to get started developing with [electron-webpack](https://github.com/electron-userland/electron-webpack). Recommended.
* [electron-react-boilerplate](https://github.com/chentsulin/electron-react-boilerplate) A boilerplate for scalable cross-platform desktop apps.
* [electron-react-redux-boilerplate](https://github.com/jschr/electron-react-redux-boilerplate) A minimal boilerplate to get started with Electron, React and Redux.
* [electron-boilerplate](https://github.com/szwacz/electron-boilerplate) A minimalistic yet comprehensive boilerplate application.
* [Vue CLI 3 plugin for Electron](https://nklayman.github.io/vue-cli-plugin-electron-builder) A Vue CLI 3 plugin for Electron with no required configuration.

## Quick Setup Guide

[electron-webpack-quick-start](https://github.com/electron-userland/electron-webpack-quick-start) is a recommended way to create a new Electron application.

1. Specify the standard fields in the application `package.json` — [name](configuration/configuration.md#Metadata-name), `description`, `version` and [author](https://docs.npmjs.com/files/package.json#people-fields-author-contributors).

2. Specify the [build](configuration/configuration.md#configuration) configuration in the `package.json` as follows:
    ```json
    "build": {
      "appId": "your.id",
      "mac": {
        "category": "your.app.category.type"
      }
    }
    ```
   See [all options](configuration/configuration.md#configuration). Option [files](configuration/contents.md#files) to indicate which files should be packed in the final application, including the entry file, maybe required.

3. Add [icons](icons.md).

4. Add the [scripts](https://docs.npmjs.com/cli/run-script) key to the development `package.json`:
    ```json
    "scripts": {
      "pack": "electron-builder --dir",
      "dist": "electron-builder"
    }
    ```
    Then you can run `yarn dist` (to package in a distributable format (e.g. dmg, windows installer, deb package)) or `yarn run pack` (only generates the package directory without really packaging it. This is useful for testing purposes).

    To ensure your native dependencies always matched the electron version, simply add script `"postinstall": "electron-builder install-app-deps"` to your `package.json`.

5. If you have native addons of your own that are part of the application (not as a dependency), set [nodeGypRebuild](/configuration/configuration#Configuration-nodeGypRebuild) to `true`.
   
Please note that everything is packaged into an asar archive [by default](configuration/configuration.md#Configuration-asar).

For an app that will be shipped to production, you should sign your application. See [Where to buy code signing certificates](code-signing.md#where-to-buy-code-signing-certificate).

## Programmatic Usage
See `node_modules/electron-builder/out/index.d.ts`. Typings for TypeScript is provided.

```js
"use strict"

const builder = require("electron-builder")
const Platform = builder.Platform

// Promise is returned
builder.build({
  targets: Platform.MAC.createTarget(),
  config: {
   "//": "build options, see https://goo.gl/QQXmcV"
  }
})
  .then(() => {
    // handle result
  })
  .catch((error) => {
    // handle error
  })
```

## Pack Only in a Distributable Format

You can use electron-builder only to pack your electron app in a AppImage, Snaps, Debian package, NSIS, macOS installer component package (`pkg`) 
and other distributable formats.

```
./node_modules/.bin/electron-builder --prepackaged <packed dir>
```

`--projectDir` (the path to project directory) option also can be useful.

## Debug

Set the `DEBUG` environment variable to debug what electron-builder is doing:
```bash
DEBUG=electron-builder
```

`FPM_DEBUG` env to add more details about building linux targets (except snap and appimage).

!!! tip "cmd"
    On [Windows](https://github.com/visionmedia/debug#windows-command-prompt-notes) the environment variable is set using the set command.
    ```bash
    set DEBUG=electron-builder
    ```
    
!!! tip "PowerShell"
    PowerShell uses different syntax to set environment variables.
    ```bash
    $env:DEBUG=electron-builder
    ```

## Community

[electron-builder](https://electron-builder.zulipchat.com/) on Zulip.