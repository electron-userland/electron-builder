# electron-builder [![npm version](https://img.shields.io/npm/v/electron-builder.svg?label=latest)](https://www.npmjs.com/package/electron-builder) [![downloads per month](https://img.shields.io/npm/dm/electron-builder.svg)](https://yarn.pm/electron-builder) [![donate](https://img.shields.io/badge/donate-donorbox-brightgreen.svg)](https://www.electron.build/donate)
A complete solution to package and build a ready for distribution [Electron](https://electronjs.org), [Proton Native](https://proton-native.js.org/) app for macOS, Windows and Linux with “auto update” support out of the box. :shipit:

Always looking for community contributions! 👀 Setting up a [dev environment](https://github.com/electron-userland/electron-builder/blob/master/CONTRIBUTING.md) is easy to do 🪩

## Sponsors

<table>
   <tr align="center">
      <td>
         <a href="https://workflowy.com">
            <div>
               <img src="https://workflowy.com/media/i/icon-28x28.png" alt="WorkFlowy" title="WorkFlowy" style="height: 50px;" height="50"/>
            </div>
            Notes, Tasks, Projects.<br>All in a Single Place.
         </a>
         <br>
      </td>
   </tr>
   <tr align="center">
      <td>
         <br>
         <a href="https://tidepool.org">
            <div>
               <img src="https://www.electron.build/sponsor-logos/Tidepool_Logo_Light.svg" alt="Tidepool" title="Tidepool" style="height: 75px;" height="75" />
            </div>
            Your gateway to understanding your diabetes data
         </a>
         <br>
      </td>
      <td>
         <br>
         <a href="https://keygen.sh/?via=electron-builder">
            <div>
               <img src="https://keygen.sh/images/logo-pill.png" alt="Keygen" title="Keygen" style="height: 75px;" height="75" />
            </div>
            An open, source-available software licensing and distribution API
         </a>
         <br>
      </td>
   </tr>
   <tr align="center">
      <td>
         <br>
         <a href="https://www.todesktop.com/electron?utm_source=electron-builder">
            <div>
               <img src="https://www.todesktop.com/new-logo/todesktop-logo.png" alt="ToDesktop" title="ToDesktop" style="height: 75px;" height="75" />
            </div>
            ToDesktop: An all-in-one platform for building and releasing Electron apps
         </a>
         <br>
      </td>
      <td>
         <br>
         <a href="https://www.dashcam.io/?ref=electron_builder">
            <div>
               <img src="https://user-images.githubusercontent.com/318295/226675216-ab6aad0c-526c-4a45-a0a8-3906ac614b8b.png" alt="Dashcam" title="Dashcam" style="height: 75px;" height="75" />
            </div>
            Dashcam: Capture the steps to reproduce any bug with video crash reports for Electron.
         </a>
         <br>
      </td>
   </tr>
</table>


## Documentation

See the full documentation on [electron.build](https://www.electron.build).

* NPM packages management:
    * [Native application dependencies](https://electron.atom.io/docs/tutorial/using-native-node-modules/) compilation (including [Yarn](http://yarnpkg.com/) support).
    * Development dependencies are never included. You don't need to ignore them explicitly.
    * [Two package.json structure](https://www.electron.build/tutorials/two-package-structure) is supported, but you are not forced to use it even if you have native production dependencies.
* [Code Signing](https://www.electron.build/code-signing) on a CI server or development machine.
* [Auto Update](https://www.electron.build/auto-update) ready application packaging.
* Numerous target formats:
    * All platforms: `7z`, `zip`, `tar.xz`, `tar.7z`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir` (unpacked directory).
    * [macOS](https://www.electron.build/mac): `dmg`, `pkg`, `mas`.
    * [Linux](https://www.electron.build/linux): [AppImage](http://appimage.org), [snap](http://snapcraft.io), debian package (`deb`), `rpm`, `freebsd`, `pacman`, `p5p`, `apk`.
    * [Windows](https://www.electron.build/win): `nsis` (Installer), `nsis-web` (Web installer), `portable` (portable app without installation), AppX (Windows Store), MSI, Squirrel.Windows.
* [Publishing artifacts](https://www.electron.build/publish) to GitHub Releases, Amazon S3, DigitalOcean Spaces and Bintray.
* Advanced building:
    * Pack in a distributable format [already packaged app](https://www.electron.build/#pack-only-in-a-distributable-format).
    * Separate [build steps](https://github.com/electron-userland/electron-builder/issues/1102#issuecomment-271845854).
    * Build and publish in parallel, using hard links on CI server to reduce IO and disk space usage.
    * [electron-compile](https://github.com/electron/electron-compile) support (compile for release-time on the fly on build).
* [Docker](https://www.electron.build/multi-platform-build#docker) images to build Electron app for Linux or Windows on any platform.
* [Proton Native](https://www.electron.build/configuration/#proton-native) support.
* Downloads all required tools files on demand automatically (e.g. to code sign windows application, to make AppX), no need to setup.

| Question                               | Answer                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| “I want to configure electron-builder” | [See options](https://electron.build/configuration)                 |
| “I found a bug or I have a question”   | [Open an issue](https://github.com/electron-userland/electron-builder/issues/new) |
| “I want to support development”        | [Donate](https://www.electron.build/donate)                                       |

## Installation
[Yarn](http://yarnpkg.com/) is [strongly](https://github.com/electron-userland/electron-builder/issues/1147#issuecomment-276284477) recommended instead of npm.

`yarn add electron-builder --dev`

### Note for Yarn 3

Yarn 3 use PnP by default, but electron-builder still need node-modules(ref: [yarnpkg/berry#4804](https://github.com/yarnpkg/berry/issues/4804#issuecomment-1234407305)). Add configuration in the `.yarnrc.yaml` as follows:
```
nodeLinker: "node-modules"
```
will declare to use node-modules instead of PnP.

## Quick Setup Guide

[electron-webpack-quick-start](https://github.com/electron-userland/electron-webpack-quick-start) is a recommended way to create a new Electron application. See [Boilerplates](https://www.electron.build/#boilerplates).

1. Specify the standard fields in the application `package.json` — [name](https://electron.build./configuration.md#metadata), `description`, `version` and [author](https://docs.npmjs.com/files/package.json#people-fields-author-contributors).

2. Specify the [build](https://electron.build./configuration.md#build) configuration in the `package.json` as follows:
    ```json
    "build": {
      "appId": "your.id",
      "mac": {
        "category": "your.app.category.type"
      }
    }
    ```
   See [all options](https://www.electron.build/configuration). Option [files](https://www.electron.build/contents#files) to indicate which files should be packed in the final application, including the entry file, maybe required.
   You can also use separate configuration files, such as `js`, `ts`, `yml`, and `json`/`json5`. See [read-config-file](https://www.npmjs.com/package/read-config-file) for supported extensions. [JS Example for programmatic API](https://www.electron.build/api/programmatic-usage)

3. Add [icons](https://www.electron.build/icons).

4. Add the [scripts](https://docs.npmjs.com/cli/run-script) key to the development `package.json`:
    ```json
    "scripts": {
      "app:dir": "electron-builder --dir",
      "app:dist": "electron-builder"
    }
    ```
    Then you can run `yarn app:dist` (to package in a distributable format (e.g. dmg, windows installer, deb package)) or `yarn app:dir` (only generates the package directory without really packaging it. This is useful for testing purposes).

    To ensure your native dependencies are always matched electron version, simply add script `"postinstall": "electron-builder install-app-deps"` to your `package.json`.

5. If you have native addons of your own that are part of the application (not as a dependency), set [nodeGypRebuild](https://www.electron.build./configuration.md#nodeGypRebuild) to `true`.

Please note that everything is packaged into an asar archive [by default](https://electron.build./configuration.md#asar).

For an app that will be shipped to production, you should sign your application. See [Where to buy code signing certificates](https://www.electron.build/code-signing#where-to-buy-code-signing-certificate).

## Programmatic Usage
See `node_modules/electron-builder/out/index.d.ts`. Typings for TypeScript are provided and also can be found [here](./electron-builder.md).

Code snippet provided below is also shown "in action" [here](./programmatic-usage.md) as well.
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

## Boilerplates

* [electron-webpack-quick-start](https://github.com/electron-userland/electron-webpack-quick-start) — A bare minimum project structure to get started developing with [electron-webpack](https://github.com/electron-userland/electron-webpack). Recommended.
* [electron-react-boilerplate](https://github.com/chentsulin/electron-react-boilerplate) A boilerplate for scalable cross-platform desktop apps.
* [electron-react-redux-boilerplate](https://github.com/jschr/electron-react-redux-boilerplate) A minimal boilerplate to get started with Electron, React and Redux.
* [electron-boilerplate](https://github.com/szwacz/electron-boilerplate) A minimalistic yet comprehensive boilerplate application.
* [Vue CLI 3 plugin for Electron](https://nklayman.github.io/vue-cli-plugin-electron-builder) A Vue CLI 3 plugin for Electron with no required configuration.
* [electron-vue-vite](https://github.com/caoxiemeihao/electron-vue-vite) A real simple Electron + Vue3 + Vite5 boilerplate.
* [vite-electron-builder](https://github.com/cawa-93/vite-electron-builder) Secure boilerplate for Electron app based on Vite. Supports multiple frameworks.
* [electronjs-with-nextjs](https://github.com/saulotarsobc/electronjs-with-nextjs) ElectronJS application with NextJS and TypeScript.

## Debug

Set the `DEBUG` environment variable to debug what electron-builder is doing:
```bash
DEBUG=electron-builder
```

`FPM_DEBUG` env to add more details about building linux targets (except snap and appimage).

`DEBUG_DMG=true` env var to add more debugging/verbosity from `hdiutil` (macOS).

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

## Donate

We do this open source work in our free time. If you'd like us to invest more time on it, please [donate](https://www.electron.build/donate).
