[![Build Status](https://img.shields.io/travis/loopline-systems/electron-builder.svg?style=flat)](https://travis-ci.org/loopline-systems/electron-builder) [![npm version](http://img.shields.io/npm/v/electron-builder.svg?style=flat)](https://www.npmjs.org/package/electron-builder) [![npm downloads](http://img.shields.io/npm/dm/electron-builder.svg?style=flat)](https://www.npmjs.org/package/electron-builder) [![Dependency Status](http://img.shields.io/gemnasium/loopline-systems/electron-builder.svg?style=flat)](https://gemnasium.com/loopline-systems/electron-builder) [![Uses greenkeeper.io](https://img.shields.io/badge/Uses-greenkeeper.io-green.svg)](http://greenkeeper.io/)


# electron-builder (WIP)

The electron-builder project is used to create installers for the platforms Windows and OS X.
It's built to work together with the [electron-packager](https://github.com/maxogden/electron-packager).

If you are looking for a complete set up on how to use the [electron-packager](https://github.com/maxogden/electron-packager) and [electron-builder](https://github.com/loopline-systems/electron-builder) check the ["How we use it section below"](https://github.com/loopline-systems/electron-builder#how-we-use-it-so-far).

The project has currently only been executed on OS X machines. Any support or help for Windows is welcome.

## Install

You can go the global installation route. ;)

```
$ npm install -g electron-builder
```

**Oooooor...** You can wrap `electron-builder` with `npm scripts` to not have a global dependency.

```
# install electron builder as a dependency of your project
$ npm install --save electron-builder
```

After that you can easily use the `electron-builder` binary in your `npm scripts`.

part of package.json
```js
{
  "scripts" : {
    "pack:osx": "npm run build:osx && electron-builder \"dist/osx/Loopline Systems.app\" --platform=osx --out=\"dist/osx\" --config=packager.json"
  }
}
```

## Pre-requisites
If you're on OS X/Linux and want to build for Windows, you need Wine installed. Wine is required in order to set the correct icon for the exe.

You will also need the nullsoft scriptable install system for all platforms.

On OS X, via Homebrew
```
$ brew install wine makensis
```
On Ubuntu(-based) Linux distributions, via apt:
```
# add-apt-repository ppa:ubuntu-wine/ppa -y
# apt-get update
# apt-get install wine nsis -y
```
On Windows, download the [nullsoft scriptable installer](http://nsis.sourceforge.net/Download)

If you're on OS X/Linux and want to build for Windows, make also sure you're running at least `v0.12.0` of node.js.

```
$ node --version
v0.12.0
```

## Build OS X installer

```
$ electron-builder dist/osx/someFancy.app --platform=osx --out=/some/path/ --config=config.json
```

## Build Windows installer

```
$ electron-builder dist/win/someFancy-win32 --platform=win --out=/some/path/ --config=config.json
```

## Parameters

```
Usage
  $ electron-builder <sourcedir> --platform=<platform> --config=<configPath> --out=<outputPath>

  Required options:
    platform:          win, osx
    config:            path to config file

  Optional options:
    out:               path to output the installer (must exist)
```

Because the configuration is fairly complex we decided to go with a good old config file for now.
You will find a sample config file below.


config.json.sample:
```js
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
    "icon" : "assets/win/icon.ico",
    "nsiTemplate" : "path/to/custom/installer.nsi.tpl"
  }
}
```

### `osx.title`
Title of the generated `dmg` file.

### `osx.background`
Background of the `dmg` dialog.

### `osx.icon`
Your application mount icon.

### `osx.icon-size`
Sizes of the icons included in `dmg` dialog.

### `osx.contents`
Icons you wish to include in `dmg` dialog.

### `win.title`
Title of your application shown in generated windows installer.

### `win.icon`
Icon to be shown in installation process.

### `win.nsiTemplate` *( optional )*
Option to define a custom NSI installation file.

**Note:** You need to add something that might have value for others? Please consider a PR. ;)




## How we use it so far

When you run `npm run pack` it will create executables for the platforms Windows and OS X inside of the `dist` directory. It grabs the generated executables afterwards to create the installers out of it.


directory structure
```
desktop
  |-- app                               // actual electron application
  |
  |-- assets                            // build related assets
    |-- osx                             // build assets for OS X
      |-- installer.png                 //   -> referenced in packager.json ( dmg background )
      |-- mount.icns                    //   -> use by electron-packager ( actual app icon )
      |-- loopline.icns                 //   -> referenced in packager.json ( dmg background )
    |-- win                             // build assets for Windows
      |-- icon.ico                      //   -> referenced in packager.json
  |
  |-- dist                              // out put folder
    |-- osx                             // generated executables for OS X
      |-- Loopline Systems.app
      |-- Loopline Systems.dmg
    |-- win                             // generated executables for Windows
      |-- Loopline Systems-win32
      |-- Loopline Systems Setup.exe
  |-- package.json
  |-- packager.json
```


package.json
```js
{
  "name": "loopline-desktop",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "dev": "electron ./app",

    "clean": "rimraf ./dist",
    "clean:osx": "rimraf ./dist/osx",
    "clean:win": "rimraf ./dist/win",

    "build": "npm run clean && npm run build:osx && npm run build:win",
    "build:osx": "npm run clean:osx && electron-packager ./app \"Loopline Systems\" --out=dist/osx --platform=darwin --arch=x64 --version=0.25.3 --icon=assets/osx/loopline.icns",
    "build:win": "npm run clean:win && electron-packager ./app \"Loopline Systems\" --out=dist/win --platform=win32 --arch=ia32 --version=0.25.3 --icon=assets/win/icon.ico",

    "pack": "npm run pack:osx && npm run pack:win",
    "pack:osx": "npm run build:osx && electron-builder \"dist/osx/Loopline Systems.app\" --platform=osx --out=\"dist/osx\" --config=packager.json",
    "pack:win": "npm run build:win && electron-builder \"dist/win/Loopline Systems-win32\" --platform=win --out=\"dist/win\" --config=packager.json"
  },
  "dependencies": {
    "electron-packager": "^4.0.2",
    "electron-prebuilt": "^0.25.2",
    "electron-builder": "^1.0.0"
  }
}

```

packager.json
```js
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
    "icon" : "assets/win/icon.ico"
  }
}
```

## Contribution

You want to help out and have ideas to make it better? Great!

Create an issue and we will tackle it.

If you decide to propose a pull request ( even better ) make sure `npm test` is succeeding.

## Releases

For releases we like to give release names via [adj-noun](https://github.com/btford/adj-noun).
You'll find proper release notes [here](https://github.com/loopline-systems/electron-builder/releases).
