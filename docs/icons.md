Recommended tools: [AppIcon Generator](http://www.tweaknow.com/appicongenerator.php), [MakeAppIcon](https://makeappicon.com/), [iConvert Icons](https://iconverticons.com/online/).

## macOS

Files

* *Optional* `icon.icns` (macOS app icon) or `icon.png`. Icon size should be at least 512x512.
* *Optional* `background.png` (macOS DMG background).
* *Optional* `background@2x.png` (macOS DMG Retina background).

need to be placed in the [buildResources](configuration/configuration.md#MetadataDirectories-buildResources) directory (defaults to `build`). All files are optional — but it is important to provide `icon.icns` (or `icon.png`), as otherwise the default Electron icon will be used.

## Windows (NSIS)

* *Optional* `icon.ico` (Windows app icon) or `icon.png`. Icon size should be at least 256x256.

needs to be placed in the [buildResources](configuration/configuration.md#MetadataDirectories-buildResources) directory (defaults to `build`). It is important to provide `icon.ico` (or `icon.png`), as otherwise the default Electron icon will be used.

## Linux

Linux icon set will be generated automatically based on the macOS `icns` file or common `icon.png`.

Or you can put them into the `build/icons` directory if you want to specify them yourself.
The filename must contain the size (e.g. `256x256.png`) of the icon). Recommended sizes: 16, 32, 48, 64, 128, 256 (or just 512).

## AppX

See [AppX Assets](configuration/appx.md#appx-assets).
