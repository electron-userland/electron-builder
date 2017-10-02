Recommended tools: [AppIcon Generator](http://www.tweaknow.com/appicongenerator.php), [MakeAppIcon](https://makeappicon.com/)
.

## macOS

Files

* *Optional* `icon.icns` (macOS app icon). Icon size should be at least 512x512.
* *Optional* `background.png` (macOS DMG background).

need to be placed in the [build](/configuration/configuration.md#MetadataDirectories-buildResources) directory. All files are optional — but it is important to provide `icon.icns`, otherwise default Electron icon will be used.

## Windows (NSIS)

* *Optional* `icon.ico` (Windows app icon). Icon size should be at least 256x256.

need to be placed in the [build](/configuration/configuration.md#MetadataDirectories-buildResources) directory. It is important to provide `icon.ico`, otherwise default Electron icon will be used.

## Linux

Linux icon set will be generated automatically based on the macOS `icns` file.

Or you can put them into the `build/icons` directory if you want to specify them yourself.
The filename must contain the size (e.g. `32x32.png`) of the icon). Recommended sizes: 16, 24, 32, 48, 64, 96, 128, 256. (or just 512).

## AppX

See [AppX Assets](/configuration/appx#appx-assets).