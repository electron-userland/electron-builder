# electron-builder (WIP)

The electron-builder project is used to create installer for the platforms Windows and MacOS.
It's build to work together with the [electron-packager](https://github.com/maxogden/electron-packager).

If you are looking for a complete set up on how to use [electron-packager](https://github.com/maxogden/electron-packager) and [electron-builder](https://github.com/loopline-systems/electron-builder) check the "How we use it section below".

The project is currently only executed on MacOS machines. Any support or help on Windows support is welcome.

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

```
part of package.json

{
  "scripts" : {
    "build:macos": "npm run clean:macos && electron-packager ./app \"Loopline Systems\" --out=dist/macos --platform=darwin --arch=x64 --version=0.25.3 --icon=assets/macos/loopline.icns",
  }
}

```

## Pre-requisites
If you're on OS X/Linux and want to build for Windows, you need Wine installed. Wine is required in order to set the correct icon for the exe.

```
$ brew install wine makensis
```

## Build MacOS installer

```
$ electron-builder dist/macos/someFancy.app --platform=macos --out=/some/path/ --config=config.json
```

## Build Windows installer

```
$ electron-builder dist/win/someFancy-win32 --platform=win --out=/some/path/ --config=config.json
```

## Parameters

```
Usage
  $ electron-builder <sourcedir> --plattform=<plattform> --config=<configPath> --out=<outputPath>

  Required options:
    platform:          win, macos
    config:            path to config file

  Optional options:
    out:               path to output the installer
```

Because the configuration is fairly complex we decided to go with a good old config file for now.
You will find a sample config file below.


```
config.json.sample:

{
  "macos" : {
    "title": "Loopline Systems",
    "background": "assets/macos/installer.png",
    "icon": "assets/macos/mount.icns",
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

## How we use it so far

This workflow creates when running `npm run pack` executables for the platforms Windows and MacOS inside of the `dist` directory. It grabs the generated executables afterwards to create the installers out of it.


```
directory structure

desktop
  |-- app                               // actual electron application
  |
  |-- assets                            // build related assets
    |-- macos                           // build assets for macos
      |-- installer.png                 //   -> referenced in packager.json
      |-- mount.icns
      |-- loopline.icns
    |-- win                             // build assets for macos
      |-- icon.ico                      //   -> referenced in packager.json
  |
  |-- dist                              // out put folder
    |-- macos                           // generated executables for MacOS
      |-- Loopline Systems.app
      |-- Loopline Systems.dmg
    |-- win                             // generated executables for Windows
      |-- Loopline Systems-win32
      |-- Loopline Systems Setup.exe
  |-- package.json
  |-- packager.json
```


```
package.json

{
  "name": "loopline-desktop",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "dev": "electron ./app",

    "clean": "rm -rf ./dist",
    "clean:macos": "rm -rf ./dist/macos",
    "clean:win": "rm -rf ./dist/win",

    "build": "npm run clean && npm run build:macos && npm run build:win",
    "build:macos": "npm run clean:macos && electron-packager ./app \"Loopline Systems\" --out=dist/macos --platform=darwin --arch=x64 --version=0.25.3 --icon=assets/macos/loopline.icns",
    "build:win": "npm run clean:win && electron-packager ./app \"Loopline Systems\" --out=dist/win --platform=win32 --arch=ia32 --version=0.25.3 --icon=assets/win/icon.ico",

    "pack": "npm run build && npm run pack:macos && npm run pack:win",
    "pack:macos": "npm run build:macos && electron-builder \"dist/macos/Loopline Systems.app\" --platform=macos --out=\"dist/macos\" --config=packager.json",
    "pack:win": "npm run build:win && electron-builder \"dist/win/Loopline Systems-win32\" --platform=win --out=\"dist/win\" --config=packager.json"
  },
  "dependencies": {
    "electron-packager": "^4.0.2",
    "electron-prebuilt": "^0.25.2",
    "electron-builder": "^1.0.0"
  }
}

```

```
packager.json

{
  "macos" : {
    "title": "Loopline Systems",
    "background": "assets/macos/installer.png",
    "icon": "assets/macos/mount.icns",
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