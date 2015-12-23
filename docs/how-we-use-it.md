## How we use it so far

When you run `npm run pack` it will create executables for the platforms Windows and OS X inside of the `dist` directory. It grabs the generated executables afterwards to create the installers out of it.


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
  |-- builder.json
```


package.json
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

    "pack": "npm run clean && npm run build:osx && npm run build:win",
    "pack:osx": "npm run clean:osx && electron-packager ./app \"Loopline Systems\" --out=dist/osx --platform=darwin --arch=x64 --version=0.36.1 --icon=assets/osx/loopline.icns",
    "pack:win": "npm run clean:win && electron-packager ./app \"Loopline Systems\" --out=dist/win --platform=win32 --arch=ia32 --version=0.36.1 --icon=assets/win/icon.ico",

    "build": "npm run pack:osx && npm run pack:win",
    "build:osx": "npm run build:osx && electron-builder \"dist/osx/Loopline Systems.app\" --platform=osx --out=\"dist/osx\" --config=builder.json",
    "build:win": "npm run build:win && electron-builder \"dist/win/Loopline Systems-win32\" --platform=win --out=\"dist/win\" --config=builder.json"
  },
  "dependencies": {
    "electron-packager": "^4.0.2",
    "electron-prebuilt": "^0.25.2",
    "electron-builder": "^1.0.0"
  }
}

```

builder.json
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
    "icon" : "assets/win/icon.ico"
  }
}
```