# electron-builder [![npm version](https://img.shields.io/npm/v/electron-builder.svg)](https://npmjs.org/package/electron-builder) [![downloads per month](http://img.shields.io/npm/dm/electron-builder.svg)](https://www.npmjs.org/package/electron-builder) [![donate](https://img.shields.io/badge/Donate-Donorbox-green.svg)](https://donorbox.org/electron-builder)
A complete solution to package and build a ready for distribution Electron app for macOS, Windows and Linux with “auto update” support out of the box.

* NPM packages management:
  * [Native application dependencies](http://electron.atom.io/docs/latest/tutorial/using-native-node-modules/) compilation (including [Yarn](http://yarnpkg.com/) support).
  * Development dependencies are never included. You don't need to ignore them explicitly.
* [Code Signing](https://github.com/electron-userland/electron-builder/wiki/Code-Signing) on a CI server or development machine.
* [Auto Update](https://github.com/electron-userland/electron-builder/wiki/Auto-Update) ready application packaging.
* Numerous target formats:
  * All platforms: `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir` (unpacked directory).
  * [macOS](https://github.com/electron-userland/electron-builder/wiki/Options#MacOptions-target): `dmg`, `pkg`, `mas`.
  * [Linux](https://github.com/electron-userland/electron-builder/wiki/Options#LinuxBuildOptions-target): [AppImage](http://appimage.org), [snap](http://snapcraft.io), debian package (`deb`), `rpm`, `freebsd`, `pacman`, `p5p`, `apk`.
  * [Windows](https://github.com/electron-userland/electron-builder/wiki/Options#WinBuildOptions-target): `nsis` (Installer), `nsis-web` (Web installer), `portable` (portable app without installation), AppX (Windows Store), Squirrel.Windows.
* [Two package.json structure](https://github.com/electron-userland/electron-builder/wiki/Two-package.json-Structure) is supported, but you are not forced to use it even if you have native production dependencies.  
* [Build version management](https://github.com/electron-userland/electron-builder/wiki/Options#build-version-management).
* [Publishing artifacts](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts) to GitHub Releases, Amazon S3 and Bintray.
* Pack in a distributable format [already packaged app](#pack-only-in-a-distributable-format).
* Separate [build steps](https://github.com/electron-userland/electron-builder/issues/1102#issuecomment-271845854).
* Build and publish in parallel, using hard links on CI server to reduce IO and disk space usage.
* [electron-compile](https://github.com/electron/electron-compile) support (compile for release-time on the fly on build).

| Question | Answer |
|--------|-------|
| “I want to configure electron-builder” | [See options](https://github.com/electron-userland/electron-builder/wiki/Options) |
| “I have a question” | [Open an issue](https://github.com/electron-userland/electron-builder/issues) or [join the chat](https://slackin.electron.build) |
| “I found a bug” | [Open an issue](https://github.com/electron-userland/electron-builder/issues/new) |
| “I want to donate” | [Donate with Donorbox](https://donorbox.org/electron-builder) or [Paypal](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=W6V79R2RGCCHL) |

Real project example — [onshape-desktop-shell](https://github.com/develar/onshape-desktop-shell).

## Installation
[Yarn](http://yarnpkg.com/) is [strongly](https://github.com/electron-userland/electron-builder/issues/1147#issuecomment-276284477) recommended instead of npm.

`yarn add electron-builder --dev`

Platform specific `7zip-bin-*` packages are `optionalDependencies`, which may require manual install if you have npm configured to [not install optional deps by default](https://docs.npmjs.com/misc/config#optional).

## Boilerplates

* [electron-react-boilerplate](https://github.com/chentsulin/electron-react-boilerplate) A boilerplate for scalable cross-platform desktop apps.
* [electron-react-redux-boilerplate](https://github.com/jschr/electron-react-redux-boilerplate) A minimal boilerplate to get started with Electron, React and Redux.
* [electron-boilerplate](https://github.com/szwacz/electron-boilerplate) A minimalistic yet comprehensive boilerplate application.
* [electron-vue](https://github.com/SimulatedGREG/electron-vue) A boilerplate for making electron applications built with vue.

## Quick Setup Guide

1. Specify the standard fields in the application `package.json` — [name](https://github.com/electron-userland/electron-builder/wiki/Options#Metadata-name), `description`, `version` and [author](https://docs.npmjs.com/files/package.json#people-fields-author-contributors).

2. Specify the [build](https://github.com/electron-userland/electron-builder/wiki/Options#build) configuration in the `package.json` as follows:
    ```json
    "build": {
      "appId": "your.id",
      "mac": {
        "category": "your.app.category.type"
      }
    }
    ```
   See [all options](https://github.com/electron-userland/electron-builder/wiki/Options).

3. Create a directory [build](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) in the root of the project and save a `background.png` (macOS DMG background), `icon.icns` (macOS app icon) and `icon.ico` (Windows app icon) into it.

   <a id="user-content-linuxIcon" class="anchor" href="#linuxIcon" aria-hidden="true"></a>The Linux icon set will be generated automatically based on the macOS `icns` file (or you can put them into the `build/icons` directory if you want to specify them yourself. The filename must contain the size (e.g. `32x32.png`) of the icon).

4. Add the [scripts](https://docs.npmjs.com/cli/run-script) key to the development `package.json`:
    ```json
    "scripts": {
      "pack": "electron-builder --dir",
      "dist": "electron-builder"
    }
    ```
    Then you can run `yarn dist` (to package in a distributable format (e.g. dmg, windows installer, deb package)) or `yarn pack` (only generates the package directory without really packaging it. This is useful for testing purposes).

    To ensure your native dependencies are always matched electron version, simply add script `"postinstall": "electron-builder install-app-deps"` to your `package.json`.

5. If you have native addons of your own that are part of the application (not as a dependency), add `"nodeGypRebuild": true` to the `build` section of your development `package.json`.  
   :bulb: Don't [use](https://github.com/electron-userland/electron-builder/issues/683#issuecomment-241214075) [npm](http://electron.atom.io/docs/tutorial/using-native-node-modules/#using-npm) (neither `.npmrc`) for configuring electron headers. Use [node-gyp-rebuild](https://github.com/electron-userland/electron-builder/issues/683#issuecomment-241488783) bin instead.

   
6. Install the [required system packages](https://github.com/electron-userland/electron-builder/wiki/Multi-Platform-Build) if you are not on macOS 10.12+.

Please note that everything is packaged into an asar archive [by default](https://github.com/electron-userland/electron-builder/wiki/Options#Config-asar).

For an app that will be shipped to production, you should sign your application. See [Where to buy code signing certificates](https://github.com/electron-userland/electron-builder/wiki/Code-Signing#where-to-buy-code-signing-certificate).

## CLI Usage
Execute `node_modules/.bin/electron-builder --help` (`node_modules/.bin/electron-builder build --help` for `build subcommand) to get the actual CLI usage guide.
```
Building:
  --mac, -m, -o, --macos   Build for macOS, accepts target list (see
                           https://goo.gl/HAnnq8).                       [array]
  --linux, -l              Build for Linux, accepts target list (see
                           https://goo.gl/O80IL2)                        [array]
  --win, -w, --windows     Build for Windows, accepts target list (see
                           https://goo.gl/dL4i8i)                        [array]
  --x64                    Build for x64                               [boolean]
  --ia32                   Build for ia32                              [boolean]
  --armv7l                 Build for armv7l                            [boolean]
  --dir                    Build unpacked dir. Useful to test.         [boolean]
  --extraMetadata, --em    Deprecated. Use -c.extraMetadata.
  --prepackaged, --pd      The path to prepackaged app (to pack in a
                           distributable format)
  --projectDir, --project  The path to project directory. Defaults to current
                           working directory.
  --config, -c             The path to an electron-builder config. Defaults to
                           `electron-builder.yml` (or `json`, or `json5`), see
                           https://goo.gl/YFRJOM

Publishing:
  --publish, -p  Publish artifacts (to GitHub Releases), see
                 https://goo.gl/WMlr4n
                [choices: "onTag", "onTagOrDraft", "always", "never", undefined]
  --draft        Create a draft (unpublished) release                  [boolean]
  --prerelease   Identify the release as a prerelease                  [boolean]

Deprecated:
  --platform  The target platform (preferred to use --mac, --win or --linux)
           [choices: "mac", "win", "linux", "darwin", "win32", "all", undefined]
  --arch      The target arch (preferred to use --x64 or --ia32)
                                      [choices: "ia32", "x64", "all", undefined]

Other:
  --help     Show help                                                 [boolean]
  --version

Examples:
  electron-builder -mwl                     build for macOS, Windows and Linux
  electron-builder --linux deb tar.xz       build deb and tar.xz for Linux
  electron-builder --win --ia32             build for Windows ia32
  electron-builder --em.foo=bar             set package.json property `foo` to
                                            `bar`
  electron-builder                          configure unicode options for NSIS
  --config.nsis.unicode=false

```

## Programmatic Usage
See `node_modules/electron-builder/out/electron-builder.d.ts`. [Typings](https://github.com/Microsoft/TypeScript/wiki/Typings-for-npm-packages) is supported.

```js
"use strict"

const builder = require("electron-builder")
const Platform = builder.Platform

// Promise is returned
builder.build({
  targets: Platform.MAC.createTarget(),
  config: {
   "//": "build options, see https://goo.gl/ZhRfla"
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
./node_modules/.bin/build --prepackaged <packed dir>
```

`--projectDir` (the path to project directory) option also can be useful.

## Community

[electron-builder](https://slackin.electron.build) on Slack (please use [threads](https://get.slack.help/hc/en-us/articles/115000769927-Message-threads)).
Public [archive](http://electron-builder.slackarchive.io) without registration.

## Further Reading
See the [Wiki](https://github.com/electron-userland/electron-builder/wiki) for more documentation.