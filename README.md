# electron-builder [![npm version](https://img.shields.io/npm/v/electron-builder.svg?label=latest)](https://yarn.pm/electron-builder) [![downloads per month](https://img.shields.io/npm/dm/electron-builder.svg)](https://yarn.pm/electron-builder) [![donate](https://img.shields.io/badge/Donate-Donorbox-green.svg)](https://www.electron.build/donate)
A complete solution to package and build a ready for distribution [Electron](https://electronjs.org), [Proton Native](https://proton-native.js.org/) or [Muon](https://github.com/brave/muon) app for macOS, Windows and Linux with “auto update” support out of the box.

See documentation on [electron.build](https://www.electron.build).

* NPM packages management:
    * [Native application dependencies](https://electron.atom.io/docs/tutorial/using-native-node-modules/) compilation (including [Yarn](http://yarnpkg.com/) support).
    * Development dependencies are never included. You don't need to ignore them explicitly.
    * [Two package.json structure](https://www.electron.build/tutorials/two-package-structure) is supported, but you are not forced to use it even if you have native production dependencies.
* [Code Signing](https://www.electron.build/code-signing) on a CI server or development machine.
* [Auto Update](https://www.electron.build/auto-update) ready application packaging.
* Numerous target formats:
    * All platforms: `7z`, `zip`, `tar.xz`, `tar.7z`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir` (unpacked directory).
    * [macOS](https://www.electron.build/configuration/mac): `dmg`, `pkg`, `mas`.
    * [Linux](https://www.electron.build/configuration/linux): [AppImage](http://appimage.org), [snap](http://snapcraft.io), debian package (`deb`), `rpm`, `freebsd`, `pacman`, `p5p`, `apk`.
    * [Windows](https://www.electron.build/configuration/win): `nsis` (Installer), `nsis-web` (Web installer), `portable` (portable app without installation), AppX (Windows Store), MSI, Squirrel.Windows.
* [Publishing artifacts](https://www.electron.build/configuration/publish) to GitHub Releases, Amazon S3, DigitalOcean Spaces and Bintray.
* Advanced building:
    * Pack in a distributable format [already packaged app](https://www.electron.build/#pack-only-in-a-distributable-format).
    * Separate [build steps](https://github.com/electron-userland/electron-builder/issues/1102#issuecomment-271845854).
    * Build and publish in parallel, using hard links on CI server to reduce IO and disk space usage.
    * [electron-compile](https://github.com/electron/electron-compile) support (compile for release-time on the fly on build).
* [Docker](https://www.electron.build/multi-platform-build#docker) images to build Electron app for Linux or Windows on any platform.
* [Proton Native](https://www.electron.build/configuration/configuration/#proton-native) and [Muon](https://github.com/brave/muon) support.
* Downloads all required tools files on demand automatically (e.g. to code sign windows application, to make AppX), no need to setup.

| Question | Answer |
|----------|-------|
| “I want to configure electron-builder” | [See options](https://electron.build/configuration/configuration) |
| “I have a question” | [Open an issue](https://github.com/electron-userland/electron-builder/issues) or [join the chat](https://slackin.electron.build) |
| “I found a bug” | [Open an issue](https://github.com/electron-userland/electron-builder/issues/new) |
| “I want to support development” | [Donate](https://www.electron.build/donate) |

Real project example — [onshape-desktop-shell](https://github.com/develar/onshape-desktop-shell).

## Installation
[Yarn](http://yarnpkg.com/) is [strongly](https://github.com/electron-userland/electron-builder/issues/1147#issuecomment-276284477) recommended instead of npm.

`yarn add electron-builder --dev`

## Quick Setup Guide

[electron-webpack-quick-start](https://github.com/electron-userland/electron-webpack-quick-start) is a recommended way to create a new Electron application. See [Boilerplates](https://www.electron.build/#boilerplates).

1. Specify the standard fields in the application `package.json` — [name](https://electron.build/configuration/configuration#Metadata-name), `description`, `version` and [author](https://docs.npmjs.com/files/package.json#people-fields-author-contributors).

2. Specify the [build](https://electron.build/configuration/configuration#build) configuration in the `package.json` as follows:
    ```json
    "build": {
      "appId": "your.id",
      "mac": {
        "category": "your.app.category.type"
      }
    }
    ```
   See [all options](https://www.electron.build/configuration/configuration). Option [files](https://www.electron.build/configuration/contents#files) to indicate which files should be packed in the final application, including the entry file, maybe required.

3. Add [icons](https://www.electron.build/icons).

4. Add the [scripts](https://docs.npmjs.com/cli/run-script) key to the development `package.json`:
    ```json
    "scripts": {
      "pack": "electron-builder --dir",
      "dist": "electron-builder"
    }
    ```
    Then you can run `yarn dist` (to package in a distributable format (e.g. dmg, windows installer, deb package)) or `yarn pack` (only generates the package directory without really packaging it. This is useful for testing purposes).

    To ensure your native dependencies are always matched electron version, simply add script `"postinstall": "electron-builder install-app-deps"` to your `package.json`.

5. If you have native addons of your own that are part of the application (not as a dependency), set [nodeGypRebuild](https://www.electron.build/configuration/configuration#Configuration-nodeGypRebuild) to `true`.

Please note that everything is packaged into an asar archive [by default](https://electron.build/configuration/configuration#Configuration-asar).

For an app that will be shipped to production, you should sign your application. See [Where to buy code signing certificates](https://www.electron.build/code-signing#where-to-buy-code-signing-certificate).

## Donate

We do this open source work in our free time. If you'd like us to invest more time on it, please [donate](https://www.electron.build/donate). Donation can be used to increase some issue priority.

## Sponsors

<a href="https://workflowy.com"><img src="https://workflowy.com/media/i/wf-icon-android.png" alt="WorkFlowy" title="WorkFlowy" width="75" height="75"/></a>
<a href="https://tidepool.org"><img src="https://www.electron.build/sponsor-logos/Tidepool_Logo_Light.svg" alt="Tidepool" title="Tidepool" /></a>
