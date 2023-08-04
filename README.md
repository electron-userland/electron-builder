# electron-builder [![npm version](https://img.shields.io/npm/v/electron-builder.svg?label=latest)](https://www.npmjs.com/package/electron-builder) [![downloads per month](https://img.shields.io/npm/dm/electron-builder.svg)](https://yarn.pm/electron-builder) [![donate](https://img.shields.io/badge/donate-donorbox-brightgreen.svg)](https://www.electron.build/donate) [![project discussions](https://img.shields.io/badge/discuss-on_github-blue.svg)](https://github.com/electron-userland/electron-builder/discussions)

A complete solution to package and build a ready for distribution [Electron](https://electronjs.org), [Proton Native](https://proton-native.js.org/) app for macOS, Windows and Linux with “auto update” support out of the box. :shipit:

:large_orange_diamond: - Looking for additional maintainers!

**We condemn Russia’s military aggression against Ukraine. We stand with the people of Ukraine.**

## Sponsors

<table>
   <tr align="center">
      <td>
         <a href="https://workflowy.com">
            <div>
               <img src="https://workflowy.com/media/i/icon-28x28.png" alt="WorkFlowy" title="WorkFlowy" height="50" align="middle"/>
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
               <img src="https://www.electron.build/sponsor-logos/Tidepool_Logo_Light.svg" alt="Tidepool" title="Tidepool" height="75" align="middle"/>
            </div>
            Your gateway to understanding your diabetes data
         </a>
         <br>
      </td>
      <td>
         <br>
         <a href="https://keygen.sh/?via=electron-builder">
            <div>
               <img src="https://keygen.sh/images/logo-pill.png" alt="Keygen" title="Keygen" height="75" align="middle"/>
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
               <img src="https://www.todesktop.com/new-logo/todesktop-logo.png" alt="ToDesktop" title="ToDesktop" height="75" align="middle"/>
            </div>
            ToDesktop: An all-in-one platform for building and releasing Electron apps
         </a>
         <br>
      </td>
      <td>
         <br>
         <a href="https://www.dashcam.io/?ref=electron_builder">
            <div>
               <img src="https://user-images.githubusercontent.com/318295/226675216-ab6aad0c-526c-4a45-a0a8-3906ac614b8b.png" alt="Dashcam" title="Dashcam" height="75" align="middle"/>
            </div>
            Dashcam: Capture the steps to reproduce any bug with video crash reports for Electron.
         </a>
         <br>
      </td>
   </tr>
</table>


## Documentation

See the full documentation on [electron.build](https://www.electron.build).

- NPM packages management:
  - [Native application dependencies](https://electron.atom.io/docs/tutorial/using-native-node-modules/) compilation (including [Yarn](http://yarnpkg.com/) support).
  - Development dependencies are never included. You don't need to ignore them explicitly.
  - [Two package.json structure](https://www.electron.build/tutorials/two-package-structure) is supported, but you are not forced to use it even if you have native production dependencies.
- [Code Signing](https://www.electron.build/code-signing) on a CI server or development machine.
- [Auto Update](https://www.electron.build/auto-update) ready application packaging.
- Numerous target formats:
  - All platforms: `7z`, `zip`, `tar.xz`, `tar.7z`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir` (unpacked directory).
  - [macOS](https://www.electron.build/configuration/mac): `dmg`, `pkg`, `mas`.
  - [Linux](https://www.electron.build/configuration/linux): [AppImage](http://appimage.org), [snap](http://snapcraft.io), debian package (`deb`), `rpm`, `freebsd`, `pacman`, `p5p`, `apk`.
  - [Windows](https://www.electron.build/configuration/win): `nsis` (Installer), `nsis-web` (Web installer), `portable` (portable app without installation), AppX (Windows Store), MSI, Squirrel.Windows.
- [Publishing artifacts](https://www.electron.build/configuration/publish) to GitHub Releases, Amazon S3, DigitalOcean Spaces and Bintray.
- Advanced building:
  - Pack in a distributable format [already packaged app](https://www.electron.build/#pack-only-in-a-distributable-format).
  - Separate [build steps](https://github.com/electron-userland/electron-builder/issues/1102#issuecomment-271845854).
  - Build and publish in parallel, using hard links on CI server to reduce IO and disk space usage.
  - [electron-compile](https://github.com/electron/electron-compile) support (compile for release-time on the fly on build).
- [Docker](https://www.electron.build/multi-platform-build#docker) images to build Electron app for Linux or Windows on any platform.
- [Proton Native](https://www.electron.build/configuration/configuration/#proton-native) support.
- Downloads all required tools files on demand automatically (e.g. to code sign windows application, to make AppX), no need to setup.

| Question                               | Answer                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| “I want to configure electron-builder” | [See options](https://electron.build/configuration/configuration)                         |
| “I have a question”                    | [Join the discussions](https://github.com/electron-userland/electron-builder/discussions) |
| “I found a bug”                        | [Open an issue](https://github.com/electron-userland/electron-builder/issues/new)         |
| “I want to support development”        | [Donate](https://www.electron.build/donate)                                               |

## Installation

[Yarn](http://yarnpkg.com/) is [strongly](https://github.com/electron-userland/electron-builder/issues/1147#issuecomment-276284477) recommended instead of npm.

`yarn add electron-builder --dev`

### Note for PNPM

In order to use with `pnpm`, you'll need to adjust your `.npmrc` to use any one the following approaches in order for your dependencies to be bundled correctly (ref: [#6389](https://github.com/electron-userland/electron-builder/issues/6289#issuecomment-1042620422)):

```
node-linker=hoisted
```

```
public-hoist-pattern=*
```

```
shamefully-hoist=true
```

Note: Setting shamefully-hoist to true is the same as setting public-hoist-pattern to *.

### Note for Yarn 3

Yarn 3 use PnP by default, but electron-builder still need node-modules(ref: [yarnpkg/berry#4804](https://github.com/yarnpkg/berry/issues/4804#issuecomment-1234407305)). Add configuration in the `.yarnrc.yaml` as follows:
```
nodeLinker: "node-modules"
```
will declare to use node-modules instead of PnP.

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

5. If you have native addons of your own that are part of the application (not as a dependency), set [nodeGypRebuild](https://www.electron.build/configuration/configuration#Configuration-nodeGypRebuild) to `true`.

Please note that everything is packaged into an asar archive [by default](https://electron.build/configuration/configuration#Configuration-asar).

For an app that will be shipped to production, you should sign your application. See [Where to buy code signing certificates](https://www.electron.build/code-signing#where-to-buy-code-signing-certificate).

## Donate

We do this open source work in our free time. If you'd like us to invest more time on it, please [donate](https://www.electron.build/donate).
