# electron-builder [![NPM version][npm-image]][npm-url]
Complete solution to build ready for distribution and "auto update" installers of your app for OS X, Windows and Linux.

```sh
npm install electron-builder --save-dev
```

* [Native application dependencies](http://electron.atom.io/docs/latest/tutorial/using-native-node-modules/) compilation (only if [two-package.json project structure](#two-packagejson-structure) used).
* [Auto Update](#auto-update) ready application packaging.
* [Code Signing](#code-signing) on a CI server or development machine.
* [Build version management](#build-version-management).
* [Publishing artifacts to GitHub Releases](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts).

[electron-packager](https://github.com/electron-userland/electron-packager),
[appdmg](https://github.com/LinusU/node-appdmg) and
[windows-installer](https://github.com/electron/windows-installer) are used under the hood.

Real project example — [onshape-desktop-shell](https://github.com/develar/onshape-desktop-shell).

# Two package.json structure

We strongly recommend to use **two** package.json files (it is not required, you can build project with any structure).

1. For development

   In the root of the project.
  Here you declare dependencies for your development environment and build scripts.

2. For your application

   In the `app` directory. *Only this directory is distributed with real application.*

Why the two package.json structure is ideal and how it solves a lot of issues
([#39](https://github.com/electron-userland/electron-builder/issues/39),
[#182](https://github.com/electron-userland/electron-builder/issues/182),
[#230](https://github.com/electron-userland/electron-builder/issues/230))?

1. Native npm modules (those written in C, not JavaScript) need to be compiled, and here we have two different compilation targets for them. Those used in application need to be compiled against electron runtime, and all `devDependencies` need to be compiled against your locally installed node.js. Thanks to having two files this is trivial.
2. When you package the app for distribution there is no need to add up to size of the app with your `devDependencies`. Here those are always not included (because reside outside the `app` directory).

# Configuration

See [options](https://github.com/electron-userland/electron-builder/wiki/Options), but consider to follow simple guide outlined below at first.

## In short
1. Specify standard fields in the application `package.json` — [name](https://github.com/electron-userland/electron-builder/wiki/Options#AppMetadata-name), `description`, `version` and [author](https://docs.npmjs.com/files/package.json#people-fields-author-contributors) (for Linux [homepage](https://github.com/electron-userland/electron-builder/wiki/Options#AppMetadata-homepage) and [license](https://github.com/electron-userland/electron-builder/wiki/Options#AppMetadata-license) are also required).

2. Specify [build](https://github.com/electron-userland/electron-builder/wiki/Options#build) field in the development `package.json`:
    ```json
    "build": {
      "app-bundle-id": "your.id",
      "app-category-type": "your.app.category.type",
      "iconUrl": "(windows only)"
    }
    ```
   See [options](https://github.com/electron-userland/electron-builder/wiki/Options). This object will be used as a source of [electron-packager](https://www.npmjs.com/package/electron-packager#packageropts-callback) options. You can specify any other options here.

3. Create directory `build` in the root of the project and put your `background.png` (OS X DMG background), `icon.icns` (OS X app icon) and `icon.ico` (Windows app icon).

   <a id="user-content-linuxIcon" class="anchor" href="#linuxIcon" aria-hidden="true"></a>Linux icon set will be generated automatically on the fly from the OS X `icns` file (or you can put them into the `build/icons` directory — filename must contains size (e.g. `32x32.png`)).

4. Add [scripts](https://docs.npmjs.com/cli/run-script) to the development `package.json`:
    ```json
    "scripts": {
      "postinstall": "install-app-deps",
      "pack": "build",
      "dist": "build"
    }
    ```
    And then you can run `npm run pack` or `npm run dist` (to package in a distributable format (e.g. dmg, windows installer, deb package)).
    Both scripts are the same because If script named `dist` or name has prefix `dist:`, flag `--dist` is implied.

5. Install [required system packages](https://github.com/electron-userland/electron-builder/wiki/Multi-Platform-Build).

Please note — packaged into an asar archive [by default](https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-asar).

# Auto Update
`electron-builder` produces all required artifacts:

* `.dmg`: OS X installer, required for OS X user to initial install.
* `-mac.zip`: required for Squirrel.Mac.
* `.exe` and `-ia32.exe`: Windows installer, required for Windows user to initial install. Please note — [your app must handle Squirrel.Windows events](https://github.com/electronjs/windows-installer#handling-squirrel-events). See [real example](https://github.com/develar/onshape-desktop-shell/blob/master/src/WinSquirrelStartupEventHandler.ts).
* `.full-nupkg`: required for Squirrel.Windows.
* `-amd64.deb` and `-i386.deb`: Linux Debian package. Please note — by default the most effective [xz](https://en.wikipedia.org/wiki/Xz) compression format used.

You need to deploy somewhere releases/downloads server.
Consider using [Nuts](https://github.com/GitbookIO/nuts) (GitHub as a backend to store assets) or [Electron Release Server](https://github.com/ArekSredzki/electron-release-server).

# Code Signing
OS X and Windows code singing is supported.

## Signing OS X Development Builds
On a development machine, set environment variable `CSC_NAME` to your identity (recommended). Or pass `--sign` parameter.
```
export CSC_NAME="Developer ID Application: Your Name (code)"
```

This is only required on OS X.

## Signing Production Builds on Travis, AppVeyor and other CI servers
To sign app on build server:

> **NOTICE**: When exporting a code signing certificate, a [strong password](http://security.stackexchange.com/a/54773) must be used.
> Avoid using special characters (for bash) because “*values are not escaped when your builds are executed*”.

1. Get a code signing certificate
  - OS X
    - Sign up for an [Apple Developer](https://developer.apple.com/) account.
    - [Export](https://developer.apple.com/library/ios/documentation/IDEs/Conceptual/AppDistributionGuide/MaintainingCertificates/MaintainingCertificates.html#//apple_ref/doc/uid/TP40012582-CH31-SW7) certificate (Xcode is the easiest way to do this).
  - Windows
    - Purchase an Authenticode certificate (either "Standard" or "Extended Validation") from a trusted certificate authority. [See this MSDN page for more information](https://msdn.microsoft.com/en-us/library/windows/hardware/hh801887.aspx).
    - Export the certificate using the instructions provided by the certificate authority.
2. Upload the `*.p12` file to a place where it can be directly linked to (e.g. on [Google Drive](http://www.syncwithtech.org/p/direct-download-link-generator.html)).
3. Set ([Travis](https://docs.travis-ci.com/user/environment-variables/#Encrypted-Variables) or [AppVeyor](https://ci.appveyor.com/tools/encrypt)) `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables:
  - On Windows (AppVeyor), wrap your `CSC_LINK` and `CSC_KEY_PASSWORD` in doublequotes (`"`), not singlequotes (`'`).
    This avoids problems caused by certain characters common in URLs, such as `&`.
  ```
  travis encrypt 'CSC_LINK="https://drive.google.com/uc?export=download&id=***"' --add
  travis encrypt 'CSC_KEY_PASSWORD=beAwareAboutBashEscaping!!!' --add
  ```

See [`onshape-desktop-shell`](https://github.com/develar/onshape-desktop-shell) for example [`.travis.yml`](https://github.com/develar/onshape-desktop-shell/blob/master/.travis.yml) and [`appveyor.yml`](https://github.com/develar/onshape-desktop-shell/blob/master/appveyor.yml) files.

# Build Version Management
`CFBundleVersion` (OS X) and `FileVersion` (Windows) will be set automatically to `version`.`build_number` on CI server (Travis, AppVeyor and CircleCI supported).

# CLI Usage
Execute `node_modules/.bin/build --help` to get actual CLI usage guide.
In most cases you should not explicitly pass flags, so, we don't want to promote it here ([npm lifecycle](https://docs.npmjs.com/misc/scripts#current-lifecycle-event) is supported and script name is taken in account).
Want more — please file issue.

# Programmatic Usage
See `node_modules/electron-builder/out/electron-builder.d.ts`. [Typings](https://github.com/Microsoft/TypeScript/wiki/Typings-for-npm-packages) is supported.

[npm-url]: https://npmjs.org/package/electron-builder
[npm-image]: http://img.shields.io/npm/v/electron-builder.svg
