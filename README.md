Complete solution to build ready for distribution and "auto update" installers of your app for OS X, Windows and Linux.

* [Native application dependencies](http://electron.atom.io/docs/latest/tutorial/using-native-node-modules/) compilation (only if two-package.json project layout used).
* [Auto Update](#auto-update) ready application packaging.
* [Code Signing](#code-signing) on a CI server or development machine.
* [Build version management](#build-version-management).
* [Publishing artifacts to GitHub Releases](./docs/deployment.md).

[electron-packager](https://github.com/maxogden/electron-packager),
[appdmg](https://github.com/LinusU/node-appdmg) and
[windows-installer](https://github.com/electronjs/windows-installer) are used under the hood.

Real project example — [onshape-desktop-shell](https://github.com/develar/onshape-desktop-shell).

# Configuration
## In short
1. Ensure that required fields are specified in the application `package.json`:

  Standard `name`, `description`, `version` and `author`.

  Custom `build` field must be specified:
  ```json
  "build": {
    "app-bundle-id": "your.id",
    "app-category-type": "your.app.category.type",
    "iconUrl": "(windows only) A URL to an ICO file to use as the application icon, see details below"
  }
  ```
  This object will be used as a source of [electron-packager](https://www.npmjs.com/package/electron-packager#packageropts-callback) options. You can specify any other options here.

2. Create directory `build` in the root of the project and put your `background.png` (OS X DMG background), `icon.icns` (OS X app icon) and `icon.ico` (Windows app icon).
  Linux icon set will be generated automatically on the fly from the OS X `icns` file.

3. Add [scripts](https://docs.npmjs.com/cli/run-script) to the development `package.json`:
    ```json
    "scripts": {
      "postinstall": "install-app-deps",
      "pack": "build",
      "dist": "build"
    }
    ```
    And then you can run `npm run pack` or `npm run dist` (to package in a distributable format (e.g. DMG, windows installer, NuGet package)).

4. Install [required system packages](./docs/multi-platform-build.md).

## iconUrl
Please note — [local icon file url is not accepted](https://github.com/atom/grunt-electron-installer/issues/73), must be https/http.
* If you don't plan to build windows installer, you can omit it.
* If your project repository is public on GitHub, it will be `https://raw.githubusercontent.com/${info.user}/${info.project}/master/build/icon.ico` by default.

## Distributable Format Configuration
In the development `package.json` custom `build` field can be specified to customize distributable format:
```json
"build": {
  "osx": {
    "title": "computed name from app package.js, you can overwrite",
    "icon": "build/icon.icns",
    "icon-size": 80,
    "background": "build/background.png",
    "contents": [
      {
        "x": 410,
        "y": 220,
        "type": "link",
        "path": "/Applications"
      },
      {
        "x": 130,
        "y": 220,
        "type": "file",
        "path": "computed path to artifact, do not specify it - will be overwritten"
      }
    ]
  },
  "win": "see https://github.com/electronjs/windows-installer#usage"
}
```

As you can see, you need to customize OS X options only if you want to provide custom `x, y`.
Don't customize paths to background and icon, — just follow conventions (if you don't want to use `build` as directory of resources — please create issue to ask ability to customize it).

See [OS X options](https://www.npmjs.com/package/appdmg#json-specification) and [Windows options](https://github.com/electronjs/windows-installer#usage).

# Auto Update
`electron-builder` produces all required artifacts:

* `.dmg`: OS X installer, required for OS X user to initial install.
* `-mac.zip`: required for Squirrel.Mac.
* `.exe` and `-x64.exe`: Windows installer, required for Windows user to initial install. Please note — [your app must handle Squirrel.Windows events](https://github.com/electronjs/windows-installer#handling-squirrel-events). See [real example](https://github.com/develar/onshape-desktop-shell/blob/master/src/WinSquirrelStartupEventHandler.ts).
* `.full-nupkg`: required for Squirrel.Windows.
* `-amd64.deb` and `-i386.deb`: Linux Debian package. Please note — by default the most effective [xz](https://en.wikipedia.org/wiki/Xz) compression format used.

You need to deploy somewhere [releases/downloads server](https://github.com/GitbookIO/nuts).

In general, there is a possibility to setup it as a service for all (it is boring to setup own if cloud service is possible).
May be it will be soon (feel free to file an issue to track progress).
It is safe since you should sign your app in any case (so, even if server will be compromised, users will not be affected because OS X will just block unsigned/unidentified app).

# Code signing
OS X and Windows code singing is supported.
On a development machine set environment variable `CSC_NAME` to your identity (recommended). Or pass `--sign` parameter.
```
export CSC_NAME="Developer ID Application: Your Name (code)"
```

## Travis, AppVeyor and other CI servers
To sign app on build server:

1. [Export](https://developer.apple.com/library/ios/documentation/IDEs/Conceptual/AppDistributionGuide/MaintainingCertificates/MaintainingCertificates.html#//apple_ref/doc/uid/TP40012582-CH31-SW7) certificate.
 [Strong password](http://security.stackexchange.com/a/54773) must be used. Consider to not use special characters (for bash) because “*values are not escaped when your builds are executed*”.
2. Upload `*.p12` file (e.g. on [Google Drive](http://www.syncwithtech.org/p/direct-download-link-generator.html)).
3. Set ([Travis](https://docs.travis-ci.com/user/environment-variables/#Encrypted-Variables) or [AppVeyor](https://ci.appveyor.com/tools/encrypt)) `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables:
```
travis encrypt "CSC_LINK='https://drive.google.com/uc?export=download&id=***'" --add
travis encrypt 'CSC_KEY_PASSWORD=beAwareAboutBashEscaping!!!' --add
```

# Build Version Management
`CFBundleVersion` (OS X) and `FileVersion` (Windows) will be set automatically to `version`.`build_number` on CI server (Travis, AppVeyor and CircleCI supported).

# CLI usage
Execute `node_modules/.bin/build --help` to get actual CLI usage guide.
In most cases you should not explicitly pass flags, so, we don't want to promote it here ([npm lifecycle](https://docs.npmjs.com/misc/scripts#current-lifecycle-event) is supported and script name is taken in account).
Want more — please file issue.

# Programmatic usage
See `node_modules/electron-builder/out/electron-builder.d.ts`. [Typings](https://github.com/Microsoft/TypeScript/wiki/Typings-for-npm-packages) is supported.

# Old API (< 2.8)
Old API is deprecated, but not dropped. You can use it as before. Please note — new API by default produces Squirrel.Windows installer, set `target` to build NSIS:
 ```
 build --target=nsis
 ```