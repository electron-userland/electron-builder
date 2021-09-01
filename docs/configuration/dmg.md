The top-level [dmg](configuration.md#Configuration-dmg) key contains set of options instructing electron-builder on how it should build [DMG](https://en.wikipedia.org/wiki/Apple_Disk_Image).

<!-- do not edit. start of generated block -->
* <code id="DmgOptions-background">background</code> String | "undefined" - The path to background image (default: `build/background.tiff` or `build/background.png` if exists). The resolution of this file determines the resolution of the installer window. If background is not specified, use `window.size`. Default locations expected background size to be 540x380. See: [DMG with Retina background support](http://stackoverflow.com/a/11204769/1910191).
* <code id="DmgOptions-backgroundColor">backgroundColor</code> String | "undefined" - The background color (accepts css colors). Defaults to `#ffffff` (white) if no background image.
* <code id="DmgOptions-icon">icon</code> String | "undefined" - The path to DMG icon (volume icon), which will be shown when mounted, relative to the [build resources](/configuration/configuration#MetadataDirectories-buildResources) or to the project directory. Defaults to the application icon (`build/icon.icns`).
* <code id="DmgOptions-iconSize">iconSize</code> = `80` Number | "undefined" - The size of all the icons inside the DMG.
* <code id="DmgOptions-iconTextSize">iconTextSize</code> = `12` Number | "undefined" - The size of all the icon texts inside the DMG.
* <code id="DmgOptions-title">title</code> = `${productName} ${version}` String | "undefined" - The title of the produced DMG, which will be shown when mounted (volume name).
    
    Macro `${productName}`, `${version}` and `${name}` are supported.

* <code id="DmgOptions-contents">contents</code> Array&lt;DmgContent&gt;<a name="DmgContent"></a> - The content — to customize icon locations. The x and y coordinates refer to the position of the **center** of the icon (at 1x scale), and do not take the label into account.
    * **<code id="DmgContent-x">x</code>** Number - The device-independent pixel offset from the left of the window to the **center** of the icon.
    * **<code id="DmgContent-y">y</code>** Number - The device-independent pixel offset from the top of the window to the **center** of the icon.
    * <code id="DmgContent-type">type</code> "link" | "file" | "dir"
    * <code id="DmgContent-name">name</code> String - The name of the file within the DMG. Defaults to basename of `path`.
    * <code id="DmgContent-path">path</code> String - The path of the file within the DMG.
* <code id="DmgOptions-format">format</code> = `UDZO` "UDRW" | "UDRO" | "UDCO" | "UDZO" | "UDBZ" | "ULFO" - The disk image format. `ULFO` (lzfse-compressed image (OS X 10.11+ only)).
* <code id="DmgOptions-window">window</code><a name="DmgWindow"></a> - The DMG window position and size. With y co-ordinates running from bottom to top.
    
    The Finder makes sure that the window will be on the user’s display, so if you want your window at the top left of the display you could use `"x": 0, "y": 100000` as the x, y co-ordinates. It is not to be possible to position the window relative to the [top left](https://github.com/electron-userland/electron-builder/issues/3990#issuecomment-512960957) or relative to the center of the user’s screen.

    * <code id="DmgWindow-x">x</code> = `400` Number - The X position relative to left of the screen.
    * <code id="DmgWindow-y">y</code> = `100` Number - The Y position relative to bottom of the screen.
    * <code id="DmgWindow-width">width</code> Number - The width. Defaults to background image width or 540.
    * <code id="DmgWindow-height">height</code> Number - The height. Defaults to background image height or 380.
* <code id="DmgOptions-internetEnabled">internetEnabled</code> = `false` Boolean - Whether to create internet-enabled disk image (when it is downloaded using a browser it will automatically decompress the image, put the application on the desktop, unmount and remove the disk image file).
* <code id="DmgOptions-sign">sign</code> = `false` Boolean - Whether to sign the DMG or not. Signing is not required and will lead to unwanted errors in combination with notarization requirements.

Inherited from `TargetSpecificOptions`:

* <code id="DmgOptions-artifactName">artifactName</code> String | "undefined" - The [artifact file name template](/configuration/configuration#artifact-file-name-template).
* <code id="DmgOptions-publish">publish</code> The [publish](/configuration/publish) options.

<!-- end of generated block -->

## DMG License

To add license to DMG, create file `license_LANG_CODE.txt` in the build resources. Multiple license files in different languages are supported — use lang postfix (e.g. `_de`, `_ru`)). For example, create files `license_de.txt` and `license_en.txt` in the build resources.
If OS language is german, `license_de.txt` will be displayed. See map of [language code to name](https://github.com/meikidd/iso-639-1/blob/master/src/data.js).

You can also change the default button labels of the DMG by passing a json file named `licenseButtons_LANG_CODE.json`. The german file would be named: `licenseButtons_de.json`.
The contain file should have the following format:
```json
{
  "lang": "English",
  "agree": "Agree",
  "disagree": "Disagree",
  "print": "Print",
  "save": "Save",
  "description": "Here is my own description"
}
```
