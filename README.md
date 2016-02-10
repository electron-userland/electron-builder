[![Build Status](https://img.shields.io/travis/loopline-systems/electron-builder.svg?style=flat)](https://travis-ci.org/loopline-systems/electron-builder) [![npm version](http://img.shields.io/npm/v/electron-builder.svg?style=flat)](https://www.npmjs.org/package/electron-builder) [![npm downloads](http://img.shields.io/npm/dm/electron-builder.svg?style=flat)](https://www.npmjs.org/package/electron-builder)  [![Uses greenkeeper.io](https://img.shields.io/badge/Uses-greenkeeper.io-green.svg)](http://greenkeeper.io/)


# electron-builder

The electron-builder project is used to create installers for the platforms Windows, OS X and Linux.
It's built to work together with [electron-packager](https://github.com/maxogden/electron-packager).

If you are looking for a complete set up on how to use [electron-packager](https://github.com/maxogden/electron-packager) and [electron-builder](https://github.com/loopline-systems/electron-builder), check the ["How we use it"](https://github.com/loopline-systems/electron-builder#how-we-use-it-so-far) section below.

The project has been tested successfully on OS X, Windows and Linux (Debian-based) machines.

## Install

You can go the global installation route. ;)

```
$ npm install -g electron-builder electron-packager
```

**Oooooor...** You can wrap `electron-builder` with `npm scripts` to not have a global dependency.

```
# install electron builder and electron-packager as dependencies of your project
$ npm install --save-dev electron-builder electron-packager
```

After that, you can easily use the `electron-builder` binary in your `package.json`:

```json
{
  "scripts" : {
    "pack:osx": "electron-packager . MyApp --platform=darwin --arch=x64 --version=0.36.7 --icon=assets/MyApp.icns --out=dist --ignore=dist",
    "build:osx": "npm run pack:osx && electron-builder dist/osx/MyApp.app --platform=osx --out=\"dist/osx\" --config=config.json"
  }
}
```

**Note:** Executables with spaces in their name **must** be written as `\"My App\"`.

## Pre-requisites

- Node.js 0.12 or higher. You can check by running:

```
$ node --version
v0.12.0
```

- [electron-packager](https://github.com/maxogden/electron-packager)

### Creating Installers

For further documentation depending on the target please check the details sites:

- [Create installers for Windows](./docs/win.md)
- [Create installers for OS X](./docs/osx.md)
- [Create installers for Linux](./docs/linux.md)

## Parameters

```
Usage
  $ electron-builder <sourcedir> --platform=<platform> --config=<configPath> --out=<outputPath>

  Required options:
    platform:          win, osx, linux

  Optional options:
    config:            path to config file
                       -> if not provided `builder` property in `package.json`
                          in current working directory will be read
    out:               path to output the installer (must exist)
```

Here's an example of what your `config.json` might look like:

**Note**: `nsiTemplate` and `fileAssociation` are completely optional.

```json
{
  "osx" : {
    "title": "Loopline Systems",
    "background": "assets/osx/installer.png",
    "icon": "assets/osx/mount.icns",
    "icon-size": 80,
    "contents": [
      { "x": 438, "y": 344, "type": "link", "path": "/Applications" },
      { "x": 192, "y": 344, "type": "file" }
    ]
  },
  "win" : {
    "title" : "Loopline Systems",
    "version" : "x.x.x.x",
    "publisher": "Publisher Info",
    "icon" : "assets/win/icon.ico",
    "verbosity": 1,
    "nsiTemplate" : "path/to/custom/installer.nsi.tpl",
    "fileAssociation": {
      "extension": ".loop",
      "fileType": "Loopline Systems File"
    }
  },
  "linux" : {
    "arch" : 64,
    "target" : "deb",
    "version" : "x.x.x.x",
    "title" : "Loopline Systems",
    "comment" : "This is a comment",
    "executable" : "myExec",
    "maintainer": "Dummy Maintainer <dummy@maintainer.org>"
  }
}
```

Or what your `package.json` might look like:

```json
{
  "name": "Loopline App",
  "version": "2.6.0",
  "builder": {
    "osx" : {
      "title": "Loopline Systems",
      "background": "assets/osx/installer.png",
      "icon": "assets/osx/mount.icns",
      "icon-size": 80,
      "contents": [
        { "x": 438, "y": 344, "type": "link", "path": "/Applications" },
        { "x": 192, "y": 344, "type": "file" }
      ]
    },
    "win" : {
      "title" : "Loopline Systems",
      "version" : "x.x.x.x",
      "publisher": "Publisher Info",
      "icon" : "assets/win/icon.ico",
      "verbosity": 1,
      "nsiTemplate" : "path/to/custom/installer.nsi.tpl",
      "fileAssociation": {
        "extension": ".loop",
        "fileType": "Loopline Systems File"
      }
    },
    "linux" : {
      "arch" : 64,
      "target" : "deb",
      "version" : "x.x.x.x",
      "title" : "Loopline Systems",
      "comment" : "This is a comment",
      "executable" : "myExec",
      "maintainer": "Dummy Maintainer <dummy@maintainer.org>"
    }
  }
}
```

**Note:** Need to add something that might have value for others? Consider a [Pull Request](https://github.com/loopline-systems/electron-builder/pulls)! ;)


## How we use it so far

When you run `npm run pack`, it will create executables for the Windows and OS X platforms inside of the `dist` directory. It grabs the generated executables afterwards to create the installers out of it.


directory structure
```
desktop
  |-- app                               // actual electron application
  |
  |-- assets                            // build related assets
    |-- osx                             // build assets for OS X
      |-- installer.png                 //   -> referenced in builder.json ( dmg background )
      |-- mount.icns                    //   -> use by electron-packager ( actual app icon )
      |-- loopline.icns                 //   -> referenced in builder.json ( dmg background )
    |-- win                             // build assets for Windows
      |-- icon.ico                      //   -> referenced in builder.json
  |
  |-- dist                              // out put folder
    |-- osx                             // generated executables for OS X
      |-- Loopline Systems.app
      |-- Loopline Systems.dmg
    |-- win                             // generated executables for Windows
      |-- Loopline Systems-win32
      |-- Loopline Systems Setup.exe
  |-- package.json
  |-- config.json
```

`package.json`:

```json
{
  "name": "loopline-desktop",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "dev": "electron ./app",

    "clean": "rm -rf ./dist",
    "clean:osx": "rm -rf ./dist/osx",
    "clean:win": "rm -rf ./dist/win",

    "pack": "npm run clean && npm run pack:osx && npm run pack:win",
    "pack:osx": "npm run clean:osx && electron-packager ./app \"Loopline Systems\" --out=dist/osx --platform=darwin --arch=x64 --version=0.36.1 --icon=assets/osx/loopline.icns",
    "pack:win": "npm run clean:win && electron-packager ./app \"Loopline Systems\" --out=dist/win --platform=win32 --arch=ia32 --version=0.36.1 --icon=assets/win/icon.ico",

    "build": "npm run build:osx && npm run build:win",
    "build:osx": "npm run pack:osx && electron-builder \"dist/osx/Loopline Systems.app\" --platform=osx --out=\"dist/osx\" --config=builder.json",
    "build:win": "npm run pack:win && electron-builder \"dist/win/Loopline Systems-win32\" --platform=win --out=\"dist/win\" --config=builder.json"
  },
  "dependencies": {
    "electron-packager": "^4.0.2",
    "electron-prebuilt": "^0.36.7",
    "electron-builder": "^2.7.2"
  }
}

```

**Important note for Windows users:** *If the build process throws an error like `"rm" is not recognized as an internal or external command,
operable program or batch file.` you may want to use windows counter part `rmdir` or `rimraf` (cross platform) to clean up the distribution folder.*


## Contribution

You want to help out and have ideas to make it better? Great!

Create an [issue](https://github.com/loopline-systems/electron-builder/issues) and we will tackle it.

If you decide to propose a pull request (even better) make sure `npm test` is succeeding.

## Releases

For releases, we like to give release names via [adj-noun](https://github.com/btford/adj-noun).
You'll find proper release notes [here](https://github.com/loopline-systems/electron-builder/releases).

## Related packages

[grunt-electron-builder-wrapper](https://www.npmjs.com/package/grunt-electron-builder-wrapper) - grunt plugin for electron-builder.
