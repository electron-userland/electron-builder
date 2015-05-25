# electron-builder (WIP)

## Build MacOS installer

```
$ electron-builder dist/macos/someFancy.app --platform=macos --out=/some/path/ --config=config.json
```

## Build Windows installer

```
$ electron-builder dist/win/someFancy-win32 --platform=win --out=/some/path/ --config=config.json
```

```
Usage
  $ electron-builder <sourcedir> --plattform=<plattform> --config=<configPath> --out=<outputPath>

  Required options:
    platform:          win, macos
    config:            path to config file

  Optional options:
    out:               path to output the installer

Config.json sample:

{
  "macos" : {
    "title": "Loopline Systems Installer",
    "background": "./assets/macos/installer.png",
    "icon": "./assets/macos/mount.icns",
    "icon-size": 80,
    "contents": [
      { "x": 80, "y": 150, "type": "link", "path": "/Applications" },
      // path will be set as source dircectory
      { "x": 325, "y": 150, "type": "file" }
    ]
  },
  "win" : {
    "title" : "Loopline Systems Setup",
    "icon" : "../assets/win/icon.ico"
  }
}

```

