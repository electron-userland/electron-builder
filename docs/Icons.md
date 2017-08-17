Recommended tools: [MakeAppIcon](https://makeappicon.com/), [AppIcon Generator](http://www.tweaknow.com/appicongenerator.php).

## macOS

Files

* `icon.icns` (macOS app icon). Icon size should be at least 512x512.
* `background.png` (macOS DMG background).

need to be placed in the [build](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) directory.

## Windows (NSIS)

* `icon.ico` (Windows app icon). Icon size should be at least 256x256.

need to be placed in the [build](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) directory.

## Linux

Linux icon set will be generated automatically based on the macOS `icns` file.

Or you can put them into the `build/icons` directory if you want to specify them yourself.
The filename must contain the size (e.g. `32x32.png`) of the icon). Recommended sizes: 16, 24, 32, 48, 64, 96, 128, 512, 1024 (or just 512).

## AppX

AppX assets need to be placed in the `appx` folder in the [build](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) directory.

The assets should follow these naming conventions:

- Logo: `StoreLogo.png`
- Square150x150Logo: `Square150x150Logo.png`
- Square44x44Logo: `Square44x44Logo.png`
- Wide310x150Logo: `Wide310x150Logo.png`
- *Optional* BadgeLogo: `BadgeLogo.png`
- *Optional* Square310x310Logo: `LargeTile.png`
- *Optional* Square71x71Logo: `SmallTile.png`
- *Optional* SplashScreen: `SplashScreen.png`

All official AppX asset types are supported by the build process. These assets can include scaled assets by using `target size` and `scale` in the name.
See [Guidelines for tile and icon assets](https://docs.microsoft.com/en-us/windows/uwp/controls-and-patterns/tiles-and-notifications-app-assets) for more information.

Default assets will be used for `Logo`, `Square150x150Logo`, `Square44x44Logo` and `Wide310x150Logo` if not provided. For assets marked `Optional`, these assets will not be listed in the manifest file if not provided.    