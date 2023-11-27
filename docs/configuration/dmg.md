The top-level [dmg](configuration.md#Configuration-dmg) key contains set of options instructing electron-builder on how it should build [DMG](https://en.wikipedia.org/wiki/Apple_Disk_Image).

<!-- do not edit. start of generated block -->
<ul>
<li>
<p><code id="DmgOptions-background">background</code> String | “undefined” - The path to background image (default: <code>build/background.tiff</code> or <code>build/background.png</code> if exists). The resolution of this file determines the resolution of the installer window. If background is not specified, use <code>window.size</code>. Default locations expected background size to be 540x380. See: <a href="http://stackoverflow.com/a/11204769/1910191">DMG with Retina background support</a>.</p>
</li>
<li>
<p><code id="DmgOptions-backgroundColor">backgroundColor</code> String | “undefined” - The background color (accepts css colors). Defaults to <code>#ffffff</code> (white) if no background image.</p>
</li>
<li>
<p><code id="DmgOptions-icon">icon</code> String | “undefined” - The path to DMG icon (volume icon), which will be shown when mounted, relative to the <a href="/configuration/configuration#MetadataDirectories-buildResources">build resources</a> or to the project directory. Defaults to the application icon (<code>build/icon.icns</code>).</p>
</li>
<li>
<p><code id="DmgOptions-iconSize">iconSize</code> = <code>80</code> Number | “undefined” - The size of all the icons inside the DMG.</p>
</li>
<li>
<p><code id="DmgOptions-iconTextSize">iconTextSize</code> = <code>12</code> Number | “undefined” - The size of all the icon texts inside the DMG.</p>
</li>
<li>
<p><code id="DmgOptions-title">title</code> = <code>${productName} ${version}</code> String | “undefined” - The title of the produced DMG, which will be shown when mounted (volume name).</p>
<p>Macro <code>${productName}</code>, <code>${version}</code> and <code>${name}</code> are supported.</p>
</li>
<li>
<p><code id="DmgOptions-contents">contents</code> Array&lt;DmgContent&gt;<a name="DmgContent"></a> - The content — to customize icon locations. The x and y coordinates refer to the position of the <strong>center</strong> of the icon (at 1x scale), and do not take the label into account.</p>
<ul>
<li><strong><code id="DmgContent-x">x</code></strong> Number - The device-independent pixel offset from the left of the window to the <strong>center</strong> of the icon.</li>
<li><strong><code id="DmgContent-y">y</code></strong> Number - The device-independent pixel offset from the top of the window to the <strong>center</strong> of the icon.</li>
<li><code id="DmgContent-type">type</code> “link” | “file” | “dir”</li>
<li><code id="DmgContent-name">name</code> String - The name of the file within the DMG. Defaults to basename of <code>path</code>.</li>
<li><code id="DmgContent-path">path</code> String - The path of the file within the DMG.</li>
</ul>
</li>
<li>
<p><code id="DmgOptions-format">format</code> = <code>UDZO</code> “UDRW” | “UDRO” | “UDCO” | “UDZO” | “UDBZ” | “ULFO” - The disk image format. <code>ULFO</code> (lzfse-compressed image (OS X 10.11+ only)).</p>
</li>
<li>
<p><code id="DmgOptions-window">window</code><a name="DmgWindow"></a> - The DMG window position and size. With y co-ordinates running from bottom to top.</p>
<p>The Finder makes sure that the window will be on the user’s display, so if you want your window at the top left of the display you could use <code>&quot;x&quot;: 0, &quot;y&quot;: 100000</code> as the x, y co-ordinates. It is not to be possible to position the window relative to the <a href="https://github.com/electron-userland/electron-builder/issues/3990#issuecomment-512960957">top left</a> or relative to the center of the user’s screen.</p>
<ul>
<li><code id="DmgWindow-x">x</code> = <code>400</code> Number - The X position relative to left of the screen.</li>
<li><code id="DmgWindow-y">y</code> = <code>100</code> Number - The Y position relative to bottom of the screen.</li>
<li><code id="DmgWindow-width">width</code> Number - The width. Defaults to background image width or 540.</li>
<li><code id="DmgWindow-height">height</code> Number - The height. Defaults to background image height or 380.</li>
</ul>
</li>
<li>
<p><code id="DmgOptions-internetEnabled">internetEnabled</code> = <code>false</code> Boolean - Whether to create internet-enabled disk image (when it is downloaded using a browser it will automatically decompress the image, put the application on the desktop, unmount and remove the disk image file).</p>
</li>
<li>
<p><code id="DmgOptions-sign">sign</code> = <code>false</code> Boolean - Whether to sign the DMG or not. Signing is not required and will lead to unwanted errors in combination with notarization requirements.</p>
</li>
</ul>
<p>Inherited from <code>TargetSpecificOptions</code>:</p>
<ul>
<li><code id="DmgOptions-artifactName">artifactName</code> String | “undefined” - The <a href="/configuration/configuration#artifact-file-name-template">artifact file name template</a>.</li>
<li><code id="DmgOptions-publish">publish</code> The <a href="/configuration/publish">publish</a> options.</li>
</ul>

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
