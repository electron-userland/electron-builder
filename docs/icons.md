Recommended tools: [MakeAppIcon](https://makeappicon.com/), [AppIcon Generator](http://www.tweaknow.com/appicongenerator.php).

## macOS

Files

* `icon.icns` (macOS app icon). Icon size should be at least 512x512.
* `background.png` (macOS DMG background).

need to be placed in the [build](/configuration/configuration.md#MetadataDirectories-buildResources) directory.

## Windows (NSIS)

* `icon.ico` (Windows app icon). Icon size should be at least 256x256.

need to be placed in the [build](/configuration/configuration.md#MetadataDirectories-buildResources) directory.

## Linux

Linux icon set will be generated automatically based on the macOS `icns` file.

Or you can put them into the `build/icons` directory if you want to specify them yourself.
The filename must contain the size (e.g. `32x32.png`) of the icon). Recommended sizes: 16, 24, 32, 48, 64, 96, 128, 512, 1024 (or just 512).

## AppX

See [AppX Assets](/configuration/appx#appx-assets).