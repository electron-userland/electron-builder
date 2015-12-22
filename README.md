[![Build Status](https://img.shields.io/travis/loopline-systems/electron-builder.svg?style=flat)](https://travis-ci.org/loopline-systems/electron-builder) [![npm version](http://img.shields.io/npm/v/electron-builder.svg?style=flat)](https://www.npmjs.org/package/electron-builder) [![npm downloads](http://img.shields.io/npm/dm/electron-builder.svg?style=flat)](https://www.npmjs.org/package/electron-builder) [![Dependency Status](http://img.shields.io/gemnasium/loopline-systems/electron-builder.svg?style=flat)](https://gemnasium.com/loopline-systems/electron-builder) [![Uses greenkeeper.io](https://img.shields.io/badge/Uses-greenkeeper.io-green.svg)](http://greenkeeper.io/)


# electron-builder

The electron-builder project is used to create installers for the platforms Windows and OS X.
It's built to work together with the [electron-packager](https://github.com/maxogden/electron-packager).

If you are looking for a complete set up on how to use the [electron-packager](https://github.com/maxogden/electron-packager) and [electron-builder](https://github.com/loopline-systems/electron-builder) check the ["How we use it"](https://github.com/loopline-systems/electron-builder/docs/how-we-use-it.md) section in [docs](https://github.com/loopline-systems/electron-builder/docs).

## Install

```
$ npm install --save electron-builder
```

After that you can easily use the `electron-builder` binary in your `npm scripts`.

part of package.json
```json
{
  "scripts" : {
    "build:osx": "npm run pack:osx && electron-builder \"dist/osx/Loopline Systems.app\" --platform=osx --out=\"dist/osx\" --config=builder.json"
  }
}
```

## Usage
```
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
    "icon" : "assets/win/icon.ico",
    "verbosity": 1,
    "nsiTemplate" : "path/to/custom/installer.nsi.tpl", // optional
    "fileAssociation": { // optional
      "extension": ".loop",
      "fileType": "Loopline Systems File"
    }
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

## Related packages

[grunt-electron-builder-wrapper](https://www.npmjs.com/package/grunt-electron-builder-wrapper) - grunt plugin for electron-builder.
