# electron-builder [![npm version](https://img.shields.io/npm/v/electron-builder.svg)](https://npmjs.org/package/electron-builder) [![donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=W6V79R2RGCCHL)
A complete solution to package and build a ready for distribution Electron app for MacOS, Windows and Linux with “auto update” support out of the box.

* NPM packages management:
  * [Native application dependencies](http://electron.atom.io/docs/latest/tutorial/using-native-node-modules/) compilation (only if the [two-package.json project structure](#two-packagejson-structure) is used).
  * Development dependencies are never included. You don't need to ignore them explicitly.
* [Code Signing](https://github.com/electron-userland/electron-builder/wiki/Code-Signing) on a CI server or development machine.
* [Auto Update](#auto-update) ready application packaging.
* [Build version management](https://github.com/electron-userland/electron-builder/wiki/Options#build-version-management).
* Numerous target formats:
  * All platforms: `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`.
  * [MacOS](https://github.com/electron-userland/electron-builder/wiki/Options#MacOptions-target): `dmg`, `mas`.
  * [Linux](https://github.com/electron-userland/electron-builder/wiki/Options#LinuxBuildOptions-target): `AppImage`, `deb`, `rpm`, `freebsd`, `pacman`, `p5p`, `apk`.
  * [Windows](https://github.com/electron-userland/electron-builder/wiki/Options#WinBuildOptions-target): NSIS, Squirrel.Windows.
* [Publishing artifacts](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts) to GitHub Releases and Bintray.

[appdmg](https://github.com/LinusU/node-appdmg) are used under the hood.

_Note: `appdmg` (and the platform specific `7zip-bin-*` packages) are `optionalDependencies`, which may require manual install if you have npm configured to [not install optional deps by default](https://docs.npmjs.com/misc/config#optional)._

Real project example — [onshape-desktop-shell](https://github.com/develar/onshape-desktop-shell).

# Two package.json structure

We recommend to use two package.json files (it is not required, you can build your project with any structure).

1. For development (`./package.json`)

   The `package.json` resides in the root of your project. Here you declare the dependencies for your development environment and build scripts (`devDependencies`).

2. For your application (`./app/package.json`)

   The `package.json` resides in the `app` directory. Declare your application dependencies (`depencencies`) here. *Only this directory is distributed with the final, packaged application.*

Why?

1. Native npm modules (those written in C, not JavaScript) need to be compiled and here we have two different compilation targets for them. Those used within the application need to be compiled against the electron runtime and all `devDependencies` need to be compiled against your local node.js environment. Thanks to the two `package.json` structure, this is trivial (see [#39](https://github.com/electron-userland/electron-builder/issues/39)).
2. No need to specify which [files](https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-files) to include in the app (because development files reside outside the `app` directory).

Please see [Loading App Dependencies Manually](https://github.com/electron-userland/electron-builder/wiki/Loading-App-Dependencies-Manually) and [#379](https://github.com/electron-userland/electron-builder/issues/379#issuecomment-218503881).

# Configuration

See [options](https://github.com/electron-userland/electron-builder/wiki/Options) for a full reference but consider following the simple guide outlined below first.

For an app that will be shipped to production, you should sign your application. See [Where to buy code signing certificates](https://github.com/electron-userland/electron-builder/wiki/Code-Signing#where-to-buy-code-signing-certificate).

## Quick Setup Guide

1. Specify the standard fields in the application `package.json` — [name](https://github.com/electron-userland/electron-builder/wiki/Options#AppMetadata-name), `description`, `version` and [author](https://docs.npmjs.com/files/package.json#people-fields-author-contributors).

2. Specify the [build](https://github.com/electron-userland/electron-builder/wiki/Options#build) configuration in the development `package.json` as follows:
    ```json
    "build": {
      "appId": "your.id",
      "mac": {
        "category": "your.app.category.type",
      },
      "win": {
        "iconUrl": "(windows-only) https link to icon"
      }
    }
    ```
   See [all options](https://github.com/electron-userland/electron-builder/wiki/Options).

3. Create a directory [build](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) in the root of the project and save a `background.png` (macOS DMG background), `icon.icns` (macOS app icon) and `icon.ico` (Windows app icon) into it.

   <a id="user-content-linuxIcon" class="anchor" href="#linuxIcon" aria-hidden="true"></a>The Linux icon set will be generated automatically based on the macOS `icns` file (or you can put them into the `build/icons` directory if you want to specify them yourself. The filename must contain the size (e.g. `32x32.png`) of the icon).

4. Add the [scripts](https://docs.npmjs.com/cli/run-script) key to the development `package.json`:
    ```json
    "scripts": {
      "pack": "build --dir",
      "dist": "build"
    }
    ```
    Then you can run `npm run dist` (to package in a distributable format (e.g. dmg, windows installer, deb package)) or `npm run pack` (only generates the package directory without really packaging it. This is useful for testing purposes).

    If you use the [two-package.json project structure](#two-packagejson-structure), you'll only have your `devDependencies` in your development `package.json` and your `dependencies` in your app `package.json`. To ensure your dependencies are always updated based on both files, simply add `"postinstall": "install-app-deps"` to your development `package.json`. This will basically automatically trigger an `npm install` within your app directory so you don't have to do this work everytime you install/update your dependencies.
	

5. If you have native addons of your own that are part of the application (not as a dependency), add `"nodeGypRebuild": true` to the `build` section of your development `package.json`.  
   :bulb: Don't [use](https://github.com/electron-userland/electron-builder/issues/683#issuecomment-241214075) [npm](http://electron.atom.io/docs/tutorial/using-native-node-modules/#using-npm) (neither `.npmrc`) for configuring electron headers. Use [node-gyp-rebuild](https://github.com/electron-userland/electron-builder/issues/683#issuecomment-241488783) bin instead.

   
6. Installing the [required system packages](https://github.com/electron-userland/electron-builder/wiki/Multi-Platform-Build).

Please note that everything is packaged into an asar archive [by default](https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-asar).

# Auto Update
`electron-builder` produces all required artifacts:

* `.dmg`: macOS installer, required for the initial installation process on macOS.
* `-mac.zip`: required for Squirrel.Mac.
* `.exe` and `-ia32.exe`: Windows installer, required for the initial installation process on Windows. Please note that [your app must handle Squirrel.Windows events](https://github.com/electronjs/windows-installer#handling-squirrel-events). See [real world example](https://github.com/develar/onshape-desktop-shell/blob/master/src/WinSquirrelStartupEventHandler.ts).
* `.full-nupkg`: required for Squirrel.Windows.

To benefit from auto updates, you have to implement and configure Electron's [`autoUpdater`](http://electron.atom.io/docs/latest/api/auto-updater/) module ([example](https://github.com/develar/onshape-desktop-shell/blob/master/src/AppUpdater.ts)).
You also need to deploy your releases to a server.
Consider using [Nuts](https://github.com/GitbookIO/nuts) (uses GitHub as a backend to store the assets), [Electron Release Server](https://github.com/ArekSredzki/electron-release-server) or [Squirrel Updates Server](https://github.com/Aluxian/squirrel-updates-server).
See the [Publishing Artifacts](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts) section of the [Wiki](https://github.com/electron-userland/electron-builder/wiki) for more information on how to configure your CI environment for automated deployments.

For Windows consider only [distributing 64-bit versions](https://github.com/electron-userland/electron-builder/issues/359#issuecomment-214851130). Or use NSIS.

# CLI Usage
Execute `node_modules/.bin/build --help` to get the actual CLI usage guide.
```
Building:
  --mac, -m, -o, --osx, --macos  Build for MacOS, accepts target list (see
                                 https://goo.gl/HAnnq8).                 [array]
  --linux, -l                    Build for Linux, accepts target list (see
                                 https://goo.gl/O80IL2)                  [array]
  --win, -w, --windows           Build for Windows, accepts target list (see
                                 https://goo.gl/dL4i8i)                  [array]
  --x64                          Build for x64                         [boolean]
  --ia32                         Build for ia32                        [boolean]
  --dir                          Build unpacked dir. Useful to test.   [boolean]
  --extraMetadata, --em          Inject properties to application package.json

Publishing:
  --publish, -p  Publish artifacts (to GitHub Releases), see
                 https://goo.gl/WMlr4n
                           [choices: "onTag", "onTagOrDraft", "always", "never"]
  --draft        Create a draft (unpublished) release                  [boolean]
  --prerelease   Identify the release as a prerelease                  [boolean]

Deprecated:
  --platform  The target platform (preferred to use --mac, --win or --linux)
               [choices: "mac", "osx", "win", "linux", "darwin", "win32", "all"]
  --arch      The target arch (preferred to use --x64 or --ia32)
                                                 [choices: "ia32", "x64", "all"]

Other:
  --help     Show help                                                 [boolean]
  --version  Show version number                                       [boolean]

Examples:
  build -mwl                build for MacOS, Windows and Linux
  build --linux deb tar.xz  build deb and tar.xz for Linux
  build --win --ia32        build for Windows ia32
  build --em.foo=bar        set application package.json property `foo` to `bar`
```

# Programmatic Usage
See `node_modules/electron-builder/out/electron-builder.d.ts`. [Typings](https://github.com/Microsoft/TypeScript/wiki/Typings-for-npm-packages) is supported.

```js
"use strict"

const builder = require("electron-builder")
const Platform = builder.Platform

// Promise is returned
builder.build({
  targets: Platform.MAC.createTarget(),
  devMetadata: {
    "//": "build and other properties, see https://goo.gl/5jVxoO"
  }
})
  .then(() => {
    // handle result
  })
  .catch((error) => {
    // handle error
  })
```

# Donations

[Donate with PayPal.](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=W6V79R2RGCCHL)

# Further Reading
See the [Wiki](https://github.com/electron-userland/electron-builder/wiki) for more documentation.


