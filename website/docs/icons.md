Recommended tools: [Icon Composer](https://developer.apple.com/icon-composer/), [AppIcon Generator](http://www.tweaknow.com/appicongenerator.php), [MakeAppIcon](https://makeappicon.com/).

## macOS

Files

* *Optional* `icon.icon` (Apple Icon Composer asset), `icon.icns` (legacy macOS app icon), or `icon.png`. Icon size should be at least 512x512.
* *Optional* `background.png` (macOS DMG background).
* *Optional* `background@2x.png` (macOS DMG Retina background).

need to be placed in the [buildResources](./contents.md#extraresources) directory (defaults to `build`). All files are optional — but it is important to provide a macOS-capable icon: `.icon` (preferred), `.icns` (legacy), or `icon.png`; otherwise the default Electron icon will be used.

Notes

- `.icon` preferred: If you set `mac.icon` to a `.icon` file, electron-builder compiles it into an asset catalog (`Assets.car`) and wires it via `CFBundleIconName`. This requires Xcode 26+ (`actool` 26+) on macOS 15+.
- `.icns` accepted: If you set `mac.icon` to `.icns`, it is copied into the app bundle and referenced via `CFBundleIconFile`.
- DMG volume icon: If you rely on the default DMG volume icon and only provide `.icon`, consider setting `dmg.icon` explicitly to an `.icns` file, as the DMG volume icon still uses `.icns`.

## Windows (NSIS)

* *Optional* `icon.ico` (Windows app icon) or `icon.png`. Icon size should be at least 256x256.

needs to be placed in the [buildResources](./contents.md#extraresources) directory (defaults to `build`). It is important to provide `icon.ico` (or `icon.png`), as otherwise the default Electron icon will be used.

## Linux

Linux icon set will be generated automatically based on the macOS `icns` file or common `icon.png`.

Or you can put them into the `build/icons` directory if you want to specify them yourself.
The filename must contain the size (e.g. `256x256.png`) of the icon). Recommended sizes: 16, 32, 48, 64, 128, 256 (or just 512).

## AppX

See [AppX Assets](./appx.md#appx-assets).
