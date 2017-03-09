electron-builder configuration can be defined in the `package.json` file of your project or through the `--config <path/to/yml-or-json5>` option (defaults to `electron-builder.yml` (or `json`, or [json5](http://json5.org))).
If you'd like to use your package.json to store config, the `build` key should be used on the top level.

For example, to change icon location for DMG:
```json
"dmg": {
  "contents": [
    {
        "x": 130,
        "y": 220
    },
    {
      "x": 410,
      "y": 220,
      "type": "link",
      "path": "/Applications"
    }
  ]
}
```

As you can see, you need to customize macOS options only if you want to provide custom `x, y`.
Don't customize paths to background and icon, — just follow conventions.

Most of the options accept `null` — for example, to explicitly set that DMG icon must be default volume icon from the OS and default rules must be not applied (i.e. use application icon as DMG icon), set `dmg.icon` to `null`.

## File Patterns

Hidden files are not ignored by default, but all files that should be ignored, are [ignored by default](#default-file-pattern).

Development dependencies are never copied in any case. You don't need to ignore it explicitly.

[Multiple patterns](#multiple-glob-patterns) are supported. If directory matched, all contents are copied. So, you can just specify `foo` to copy `foo` directory.

Remember that default pattern `**/*` **is not added to your custom** if some of your patterns is not ignore (i.e. not starts with `!`).
 `package.json` is added to your custom in any case. All default ignores are added in any case — you don't need to repeat it if you configure own patterns.

May be specified in the platform options (e.g. in the [mac](#MacOptions)).

### Multiple Glob Patterns
 ```js
 [
   // match all files
   "**/*",

   // except for js files in the foo/ directory
   "!foo/*.js",

   // unless it's foo/bar.js
   "foo/bar.js",
 ]
 ```
 
### Excluding directories
 
Remember that `!doNotCopyMe/**/*` would match the files *in* the `doNotCopyMe` directory, but not the directory itself, so the [empty directory](https://github.com/gulpjs/gulp/issues/165#issuecomment-32613179) would be created.
Solution — use macro `${/*}`, e.g. `!doNotCopyMe${/*}`.


### File Macros

You can use macros in the file patterns, artifact file name patterns and publish configuration url: 
* `${arch}` — expanded to `ia32`, `x64`. If no `arch`, macro will be removed from your pattern with leading space, `-` and `_` (so, you don't need to worry and can reuse pattern).
* `${os}` — expanded to `mac`, `linux` or `win` according to target platform.
* `${name}` – `package.json` `name`.
* `${productName}` — [Sanitized](https://www.npmjs.com/package/sanitize-filename) product name.
* `${version}`
* `${env.ENV_NAME}` — any environment variable.

## Source and Destination Directories
You may also specify custom source and destination directories by using JSON objects instead of simple glob patterns.
Note this only works for `extraFiles` and `extraResources`.
 ```js
 [
   {
     "from": "path/to/source",
     "to": "path/to/destination",
     "filter": ["**/*", "!foo/*.js"]
   }
 ]
 ```
If `from` is given as a relative path, it is relative to the project directory.
If `to` is given as a relative path, it is relative to the app's content directory for `extraFiles` and the app's resource directory for `extraResources`.

`from` and `to` can be files and you can use this to [rename](https://github.com/electron-userland/electron-builder/issues/1119) a file while packaging.

You can use [file macros](#file-macros) in the `from` and `to` fields as well.

## Artifact File Name Pattern

`${ext}` macro is supported in addition to [file macros](#file-macros).

## Options

<!-- do not edit. start of generated block -->
* [Configuration Options](#Config)
  * [appx](#AppXOptions)
  * [deb Debian Package Specific Options](#DebOptions)
  * [directories](#MetadataDirectories)
  * [dmg macOS DMG Options](#DmgOptions)
  * [fileAssociations File Associations](#FileAssociation)
  * [linux Linux Specific Options](#LinuxBuildOptions)
  * [mac macOS Specific Options](#MacOptions)
  * [mas MAS (Mac Application Store) Specific Options](#MasBuildOptions)
  * [nsis](#NsisOptions)
  * [nsis Web Installer Specific Options](#NsisWebOptions)
  * [pkg macOS Product Archive Options](#PkgOptions)
  * [protocols URL Protocol Schemes](#Protocol)
  * [squirrelWindows](#SquirrelWindowsOptions)
  * [win Windows Specific Options](#WinBuildOptions)
  * [snap [Snap](http://snapcraft.io) Specific Options](#SnapOptions)
  * [dmg.window DMG Windows Position and Size](#DmgWindow)
* [Fields in the package.json](#Metadata)

<a name="Config"></a>
## Configuration Options
| Name | Description
| --- | ---
| appId | <a name="Config-appId"></a><p>The application id. Used as [CFBundleIdentifier](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070) for MacOS and as [Application User Model ID](https://msdn.microsoft.com/en-us/library/windows/desktop/dd378459(v=vs.85).aspx) for Windows (NSIS target only, Squirrel.Windows not supported).</p> <p>Defaults to <code>com.electron.${name}</code>. It is strongly recommended that an explicit ID be set.</p>
| copyright | <a name="Config-copyright"></a>The human-readable copyright line for the app. Defaults to `Copyright © year author`.
| iconUrl | <a name="Config-iconUrl"></a>* @deprecated
| productName | <a name="Config-productName"></a><p>As [name](#AppMetadata-name), but allows you to specify a product name for your executable which contains spaces and other special characters not allowed in the [name property](https://docs.npmjs.com/files/package.json#name}).</p>
| files | <a name="Config-files"></a><p>A [glob patterns](https://www.npmjs.com/package/glob#glob-primer) relative to the [app directory](#MetadataDirectories-app), which specifies which files to include when copying files to create the package.</p> <p>See [File Patterns](#multiple-glob-patterns).</p>
| extraResources | <a name="Config-extraResources"></a><p>A [glob patterns](https://www.npmjs.com/package/glob#glob-primer) relative to the project directory, when specified, copy the file or directory with matching names directly into the app’s resources directory (<code>Contents/Resources</code> for MacOS, <code>resources</code> for Linux/Windows).</p> <p>Glob rules the same as for [files](#multiple-glob-patterns).</p>
| extraFiles | <a name="Config-extraFiles"></a>The same as [extraResources](#Config-extraResources) but copy into the app's content directory (`Contents` for MacOS, root directory for Linux/Windows).
| asar | <a name="Config-asar"></a><p>Whether to package the application’s source code into an archive, using [Electron’s archive format](http://electron.atom.io/docs/tutorial/application-packaging/). Defaults to <code>true</code>. Node modules, that must be unpacked, will be detected automatically, you don’t need to explicitly set [asarUnpack](#Config-asarUnpack) - please file issue if this doesn’t work.</p>
| asarUnpack | <a name="Config-asarUnpack"></a>A [glob patterns](https://www.npmjs.com/package/glob#glob-primer) relative to the [app directory](#MetadataDirectories-app), which specifies which files to unpack when creating the [asar](http://electron.atom.io/docs/tutorial/application-packaging/) archive.
| compression | <a name="Config-compression"></a>The compression level, one of `store`, `normal`, `maximum` (default: `normal`). If you want to rapidly test build, `store` can reduce build time significantly.
| afterPack | <a name="Config-afterPack"></a>*programmatic API only* The function to be run after pack (but before pack into distributable format and sign). Promise must be returned.
| beforeBuild | <a name="Config-beforeBuild"></a>*programmatic API only* The function to be run before dependencies are installed or rebuilt. Works when `npmRebuild` is set to `true`. Promise must be returned. Resolving to `false` will skip dependencies install or rebuild.
| npmRebuild | <a name="Config-npmRebuild"></a>Whether to [rebuild](https://docs.npmjs.com/cli/rebuild) native dependencies (`npm rebuild`) before starting to package the app. Defaults to `true`.
| npmSkipBuildFromSource | <a name="Config-npmSkipBuildFromSource"></a>Whether to omit using [--build-from-source](https://github.com/mapbox/node-pre-gyp#options) flag when installing app native deps. Defaults to `false`.
| npmArgs | <a name="Config-npmArgs"></a>Additional command line arguments to use when installing app native deps. Defaults to `null`.
| nodeGypRebuild | <a name="Config-nodeGypRebuild"></a>Whether to execute `node-gyp rebuild` before starting to package the app. Defaults to `false`.
| electronDist | <a name="Config-electronDist"></a>The path to custom Electron build (e.g. `~/electron/out/R`). Only macOS supported, file issue if need for Linux or Windows.
| electronDownload | <a name="Config-electronDownload"></a>The [electron-download](https://github.com/electron-userland/electron-download#usage) options.
| publish | <a name="Config-publish"></a><ul> <li>Array of option objects. Order is important — first item will be used as a default auto-update server on Windows (NSIS).</li> <li>@see [Publish options](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts#publish-options).</li> </ul>
| forceCodeSigning | <a name="Config-forceCodeSigning"></a>Whether to fail if application will be not signed (to prevent unsigned app if code signing configuration is not correct).
| electronVersion | <a name="Config-electronVersion"></a>The version of electron you are packaging for. Defaults to version of `electron`, `electron-prebuilt` or `electron-prebuilt-compile` dependency.
| artifactName | <a name="Config-artifactName"></a><p>The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern). Defaults to <code>${productName}-${version}.${ext}</code> (some target can have another defaults, see corresponding options).</p> <p>Currently supported only for <code>mas</code>, <code>pkg</code>, <code>dmg</code> and <code>nsis</code>.</p>
| buildVersion | <a name="Config-buildVersion"></a><ul> <li>The build version. Maps to the <code>CFBundleVersion</code> on macOS, and <code>FileVersion</code> metadata property on Windows. Defaults to the <code>version</code>.</li> <li>If <code>TRAVIS_BUILD_NUMBER</code> or <code>APPVEYOR_BUILD_NUMBER</code> or <code>CIRCLE_BUILD_NUM</code> or <code>BUILD_NUMBER</code> or <code>bamboo.buildNumber</code> env defined, it will be used as a build version (<code>version.build_number</code>).</li> </ul>

<a name="AppXOptions"></a>
### `appx`

Please see [Windows AppX docs](https://msdn.microsoft.com/en-us/library/windows/apps/br211453.aspx).

| Name | Description
| --- | ---
| backgroundColor | <a name="AppXOptions-backgroundColor"></a>The background color of the app tile. Please see [Visual Elements](https://msdn.microsoft.com/en-us/library/windows/apps/br211471.aspx).
| publisher | <a name="AppXOptions-publisher"></a><p>Describes the publisher information in a form <code>CN=your name exactly as in your cert</code>. The Publisher attribute must match the publisher subject information of the certificate used to sign a package. By default will be extracted from code sign certificate.</p>
| displayName | <a name="AppXOptions-displayName"></a>A friendly name that can be displayed to users. Corresponds to [Properties.DisplayName](https://msdn.microsoft.com/en-us/library/windows/apps/br211432.aspx).
| publisherDisplayName | <a name="AppXOptions-publisherDisplayName"></a>A friendly name for the publisher that can be displayed to users. Corresponds to [Properties.PublisherDisplayName](https://msdn.microsoft.com/en-us/library/windows/apps/br211460.aspx).
| identityName | <a name="AppXOptions-identityName"></a>Describes the contents of the package. The Name attribute is case-sensitive. Corresponds to [Identity.Name](https://msdn.microsoft.com/en-us/library/windows/apps/br211441.aspx).

<a name="DebOptions"></a>
### `deb` Debian Package Specific Options
| Name | Description
| --- | ---
| synopsis | <a name="DebOptions-synopsis"></a>The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
| compression | <a name="DebOptions-compression"></a>The compression type, one of `gz`, `bzip2`, `xz`. Defaults to `xz`.
| priority | <a name="DebOptions-priority"></a>The [Priority](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Priority) attribute.

<a name="MetadataDirectories"></a>
### `directories`
| Name | Description
| --- | ---
| buildResources | <a name="MetadataDirectories-buildResources"></a>The path to build resources, defaults to `build`.
| output | <a name="MetadataDirectories-output"></a>The output directory, defaults to `dist`.
| app | <a name="MetadataDirectories-app"></a>The application directory (containing the application package.json), defaults to `app`, `www` or working directory.

<a name="DmgOptions"></a>
### `dmg` macOS DMG Options
| Name | Description
| --- | ---
| background | <a name="DmgOptions-background"></a><p>The path to background image (default: <code>build/background.tiff</code> or <code>build/background.png</code> if exists). The resolution of this file determines the resolution of the installer window. If background is not specified, use <code>window.size</code>. Default locations expected background size to be 540x380.</p> <p>See [DMG with Retina background support](http://stackoverflow.com/a/11204769/1910191).</p>
| backgroundColor | <a name="DmgOptions-backgroundColor"></a>The background color (accepts css colors). Defaults to `#ffffff` (white) if no background image.
| icon | <a name="DmgOptions-icon"></a><p>The path to DMG icon (volume icon), which will be shown when mounted, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. Defaults to the application icon (<code>build/icon.icns</code>).</p>
| iconSize | <a name="DmgOptions-iconSize"></a>The size of all the icons inside the DMG. Defaults to 80.
| iconTextSize | <a name="DmgOptions-iconTextSize"></a>The size of all the icon texts inside the DMG. Defaults to 12.
| title | <a name="DmgOptions-title"></a><p>The title of the produced DMG, which will be shown when mounted (volume name). Defaults to <code>${productName} ${version}</code></p> <p>Macro <code>${productName}</code>, <code>${version}</code> and <code>${name}</code> are supported.</p>
| contents | <a name="DmgOptions-contents"></a>The content — to customize icon locations.
| format | <a name="DmgOptions-format"></a>The disk image format, one of `UDRW`, `UDRO`, `UDCO`, `UDZO`, `UDBZ`, `ULFO` (lzfse-compressed image (OS X 10.11+ only)). Defaults to `UDBZ` (bzip2-compressed image).
| window | <a name="DmgOptions-window"></a>The DMG windows position and size. See [dmg.window](#DmgWindow).

<a name="FileAssociation"></a>
### `fileAssociations` File Associations

macOS (corresponds to [CFBundleDocumentTypes](https://developer.apple.com/library/content/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-101685)) and NSIS only. Array of option objects.

On Windows works only if [nsis.perMachine](https://github.com/electron-userland/electron-builder/wiki/Options#NsisOptions-perMachine) is set to `true`.

| Name | Description
| --- | ---
| **ext** | <a name="FileAssociation-ext"></a>The extension (minus the leading period). e.g. `png`.
| name | <a name="FileAssociation-name"></a>The name. e.g. `PNG`. Defaults to `ext`.
| description | <a name="FileAssociation-description"></a>*windows-only.* The description.
| icon | <a name="FileAssociation-icon"></a>The path to icon (`.icns` for MacOS and `.ico` for Windows), relative to `build` (build resources directory). Defaults to `${firstExt}.icns`/`${firstExt}.ico` (if several extensions specified, first is used) or to application icon.
| role | <a name="FileAssociation-role"></a>*macOS-only* The app’s role with respect to the type. The value can be `Editor`, `Viewer`, `Shell`, or `None`. Defaults to `Editor`. Corresponds to `CFBundleTypeRole`.
| isPackage | <a name="FileAssociation-isPackage"></a>*macOS-only* Whether the document is distributed as a bundle. If set to true, the bundle directory is treated as a file. Corresponds to `LSTypeIsPackage`.

<a name="LinuxBuildOptions"></a>
### `linux` Linux Specific Options
| Name | Description
| --- | ---
| category | <a name="LinuxBuildOptions-category"></a>The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
| packageCategory | <a name="LinuxBuildOptions-packageCategory"></a>The [package category](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Section). Not applicable for AppImage.
| description | <a name="LinuxBuildOptions-description"></a>As [description](#AppMetadata-description) from application package.json, but allows you to specify different for Linux.
| target | <a name="LinuxBuildOptions-target"></a><p>Target package type: list of <code>AppImage</code>, <code>snap</code>, <code>deb</code>, <code>rpm</code>, <code>freebsd</code>, <code>pacman</code>, <code>p5p</code>, <code>apk</code>, <code>7z</code>, <code>zip</code>, <code>tar.xz</code>, <code>tar.lz</code>, <code>tar.gz</code>, <code>tar.bz2</code>, <code>dir</code>. Defaults to <code>AppImage</code>.</p> <p>The most effective [xz](https://en.wikipedia.org/wiki/Xz) compression format used by default.</p> <p>electron-builder [docker image](https://github.com/electron-userland/electron-builder/wiki/Docker) can be used to build Linux targets on any platform. See [Multi platform build](https://github.com/electron-userland/electron-builder/wiki/Multi-Platform-Build).</p>
| maintainer | <a name="LinuxBuildOptions-maintainer"></a>The maintainer. Defaults to [author](#AppMetadata-author).
| vendor | <a name="LinuxBuildOptions-vendor"></a>The vendor. Defaults to [author](#AppMetadata-author).
| desktop | <a name="LinuxBuildOptions-desktop"></a>The [Desktop file](https://developer.gnome.org/integration-guide/stable/desktop-files.html.en) entries (name to value).
| depends | <a name="LinuxBuildOptions-depends"></a>Package dependencies. Defaults to `["gconf2", "gconf-service", "libnotify4", "libappindicator1", "libxtst6", "libnss3"]` for `deb`.
| executableName | <a name="LinuxBuildOptions-executableName"></a><p>The executable name. Defaults to <code>productName</code>.</p> <p>Cannot be specified per target, allowed only in the <code>linux</code>.</p>
| icon | <a name="LinuxBuildOptions-icon"></a><p>The path to icon set directory, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. The icon filename must contain the size (e.g. 32x32.png) of the icon. By default will be generated automatically based on the macOS icns file.</p>

<a name="MacOptions"></a>
### `mac` macOS Specific Options
| Name | Description
| --- | ---
| category | <a name="MacOptions-category"></a><p>The application category type, as shown in the Finder via *View -&gt; Arrange by Application Category* when viewing the Applications directory.</p> <p>For example, <code>&quot;category&quot;: &quot;public.app-category.developer-tools&quot;</code> will set the application category to *Developer Tools*.</p> <p>Valid values are listed in [Apple’s documentation](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html#//apple_ref/doc/uid/TP40009250-SW8).</p>
| target | <a name="MacOptions-target"></a>The target package type: list of `default`, `dmg`, `mas`, `pkg`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`. Defaults to `default` (dmg and zip for Squirrel.Mac).
| identity | <a name="MacOptions-identity"></a><p>The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](https://github.com/electron-userland/electron-builder/wiki/Code-Signing) instead of specifying this option. MAS installer identity is specified in the [mas](#MasBuildOptions-identity).</p>
| icon | <a name="MacOptions-icon"></a>The path to application icon. Defaults to `build/icon.icns` (consider using this convention instead of complicating your configuration).
| entitlements | <a name="MacOptions-entitlements"></a><p>The path to entitlements file for signing the app. <code>build/entitlements.mac.plist</code> will be used if exists (it is a recommended way to set). MAS entitlements is specified in the [mas](#MasBuildOptions-entitlements).</p>
| entitlementsInherit | <a name="MacOptions-entitlementsInherit"></a><p>The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. <code>build/entitlements.mac.inherit.plist</code> will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.darwin.inherit.plist).</p> <p>This option only applies when signing with <code>entitlements</code> provided.</p>
| bundleVersion | <a name="MacOptions-bundleVersion"></a>The `CFBundleVersion`. Do not use it unless [you need to](see (https://github.com/electron-userland/electron-builder/issues/565#issuecomment-230678643)).
| helperBundleId | <a name="MacOptions-helperBundleId"></a>The bundle identifier to use in the application helper's plist. Defaults to `${appBundleIdentifier}.helper`.
| type | <a name="MacOptions-type"></a>Whether to sign app for development or for distribution. One of `development`, `distribution`. Defaults to `distribution`.
| extendInfo | <a name="MacOptions-extendInfo"></a>The extra entries for `Info.plist`.

<a name="MasBuildOptions"></a>
### `mas` MAS (Mac Application Store) Specific Options
| Name | Description
| --- | ---
| entitlements | <a name="MasBuildOptions-entitlements"></a><p>The path to entitlements file for signing the app. <code>build/entitlements.mas.plist</code> will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.plist).</p>
| entitlementsInherit | <a name="MasBuildOptions-entitlementsInherit"></a><p>The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. <code>build/entitlements.mas.inherit.plist</code> will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.inherit.plist).</p>

<a name="NsisOptions"></a>
### `nsis`

See [NSIS target notes](https://github.com/electron-userland/electron-builder/wiki/NSIS).

| Name | Description
| --- | ---
| oneClick | <a name="NsisOptions-oneClick"></a>One-click installation. Defaults to `true`.
| perMachine | <a name="NsisOptions-perMachine"></a><p>Defaults to <code>false</code>.</p> <p>If <code>oneClick</code> is <code>true</code> (default): Install per all users (per-machine).</p> <p>If <code>oneClick</code> is <code>false</code>: no install mode installer page (choice per-machine or per-user), always install per-machine.</p>
| allowElevation | <a name="NsisOptions-allowElevation"></a>*boring installer only.* Allow requesting for elevation. If false, user will have to restart installer with elevated permissions. Defaults to `true`.
| allowToChangeInstallationDirectory | <a name="NsisOptions-allowToChangeInstallationDirectory"></a>*boring installer only.* Whether to allow user to change installation directory. Defaults to `false`.
| runAfterFinish | <a name="NsisOptions-runAfterFinish"></a>*one-click installer only.* Run application after finish. Defaults to `true`.
| guid | <a name="NsisOptions-guid"></a>See [GUID vs Application Name](https://github.com/electron-userland/electron-builder/wiki/NSIS#guid-vs-application-name).
| installerIcon | <a name="NsisOptions-installerIcon"></a><p>The path to installer icon, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. Defaults to <code>build/installerIcon.ico</code> or application icon.</p>
| installerHeader | <a name="NsisOptions-installerHeader"></a><p>*boring installer only.* <code>MUI_HEADERIMAGE</code>, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. Defaults to <code>build/installerHeader.bmp</code></p>
| installerSidebar | <a name="NsisOptions-installerSidebar"></a><p>*boring installer only.* <code>MUI_WELCOMEFINISHPAGE_BITMAP</code>, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. Defaults to <code>build/installerSidebar.bmp</code> or <code>${NSISDIR}\\Contrib\\Graphics\\Wizard\\nsis3-metro.bmp</code></p>
| uninstallerSidebar | <a name="NsisOptions-uninstallerSidebar"></a><p>*boring installer only.* <code>MUI_UNWELCOMEFINISHPAGE_BITMAP</code>, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. Defaults to <code>installerSidebar</code> option or <code>build/uninstallerSidebar.bmp</code> or <code>build/installerSidebar.bmp</code> or <code>${NSISDIR}\\Contrib\\Graphics\\Wizard\\nsis3-metro.bmp</code></p>
| installerHeaderIcon | <a name="NsisOptions-installerHeaderIcon"></a><p>*one-click installer only.* The path to header icon (above the progress bar), relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. Defaults to <code>build/installerHeaderIcon.ico</code> or application icon.</p>
| include | <a name="NsisOptions-include"></a>The path to NSIS include script to customize installer. Defaults to `build/installer.nsh`. See [Custom NSIS script](https://github.com/electron-userland/electron-builder/wiki/NSIS#custom-nsis-script).
| script | <a name="NsisOptions-script"></a>The path to NSIS script to customize installer. Defaults to `build/installer.nsi`. See [Custom NSIS script](https://github.com/electron-userland/electron-builder/wiki/NSIS#custom-nsis-script).
| license | <a name="NsisOptions-license"></a>The path to EULA license file. Defaults to `build/license.rtf` or `build/license.txt`.
| language | <a name="NsisOptions-language"></a>* [LCID Dec](https://msdn.microsoft.com/en-au/goglobal/bb964664.aspx), defaults to `1033`(`English - United States`).
| multiLanguageInstaller | <a name="NsisOptions-multiLanguageInstaller"></a><p>*boring installer only.* Whether to create multi-language installer. Defaults to <code>unicode</code> option value. [Not all strings are translated](https://github.com/electron-userland/electron-builder/issues/646#issuecomment-238155800).</p>
| warningsAsErrors | <a name="NsisOptions-warningsAsErrors"></a>Defaults to `true`. If `warningsAsErrors` is `true` (default): NSIS will treat warnings as errors. If `warningsAsErrors` is `false`: NSIS will allow warnings.
| menuCategory | <a name="NsisOptions-menuCategory"></a>Whether to create submenu for start menu shortcut and program files directory. Defaults to `false`. If `true`, company name will be used. Or string value.
| artifactName | <a name="NsisOptions-artifactName"></a>The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern). Defaults to `${productName} Setup ${version}.${ext}`.
| unicode | <a name="NsisOptions-unicode"></a>Whether to create [Unicode installer](http://nsis.sourceforge.net/Docs/Chapter1.html#intro-unicode). Defaults to `true`.
| deleteAppDataOnUninstall | <a name="NsisOptions-deleteAppDataOnUninstall"></a>*one-click installer only.* Whether to delete app data on uninstall. Defaults to `false`.

<a name="NsisWebOptions"></a>
### `nsis` Web Installer Specific Options
| Name | Description
| --- | ---
| appPackageUrl | <a name="NsisWebOptions-appPackageUrl"></a><p>The application package download URL. Optional — by default computed using publish configuration.</p> <p>URL like <code>https://example.com/download/latest</code> allows web installer to be version independent (installer will download latest application package).</p> <p>Custom <code>X-Arch</code> http header is set to <code>32</code> or <code>64</code>.</p>
| artifactName | <a name="NsisWebOptions-artifactName"></a>The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern). Defaults to `${productName} Web Setup ${version}.${ext}`.

<a name="PkgOptions"></a>
### `pkg` macOS Product Archive Options
| Name | Description
| --- | ---
| scripts | <a name="PkgOptions-scripts"></a><p>The scripts directory, relative to <code>build</code> (build resources directory). Defaults to <code>build/pkg-scripts</code>. See [Scripting in installer packages](http://macinstallers.blogspot.de/2012/07/scripting-in-installer-packages.html). The scripts can be in any language so long as the files are marked executable and have the appropriate shebang indicating the path to the interpreter.</p> <p>Scripts are required to be executable (<code>chmod +x file</code>).</p>
| installLocation | <a name="PkgOptions-installLocation"></a>The install location. Defaults to `/Applications`.

<a name="Protocol"></a>
### `protocols` URL Protocol Schemes

Protocols to associate the app with. macOS only.

Please note — on macOS [you need to register an `open-url` event handler](http://electron.atom.io/docs/api/app/#event-open-url-macos).

| Name | Description
| --- | ---
| **name** | <a name="Protocol-name"></a>The name. e.g. `IRC server URL`.
| role | <a name="Protocol-role"></a>*macOS-only* The app’s role with respect to the type. The value can be `Editor`, `Viewer`, `Shell`, or `None`. Defaults to `Editor`.
| **schemes** | <a name="Protocol-schemes"></a>The schemes. e.g. `["irc", "ircs"]`.

<a name="SquirrelWindowsOptions"></a>
### `squirrelWindows`

To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency. Squirrel.Windows target is maintained, but deprecated. Please use `nsis` instead.

| Name | Description
| --- | ---
| iconUrl | <a name="SquirrelWindowsOptions-iconUrl"></a><p>A URL to an ICO file to use as the application icon (displayed in Control Panel &gt; Programs and Features). Defaults to the Electron icon.</p> <p>Please note — [local icon file url is not accepted](https://github.com/atom/grunt-electron-installer/issues/73), must be https/http.</p> <ul> <li>If you don’t plan to build windows installer, you can omit it.</li> <li>If your project repository is public on GitHub, it will be <code>https://github.com/${u}/${p}/blob/master/build/icon.ico?raw=true</code> by default.</li> </ul>
| loadingGif | <a name="SquirrelWindowsOptions-loadingGif"></a><p>The path to a .gif file to display during install. <code>build/install-spinner.gif</code> will be used if exists (it is a recommended way to set) (otherwise [default](https://github.com/electron/windows-installer/blob/master/resources/install-spinner.gif)).</p>
| msi | <a name="SquirrelWindowsOptions-msi"></a>Whether to create an MSI installer. Defaults to `false` (MSI is not created).
| remoteReleases | <a name="SquirrelWindowsOptions-remoteReleases"></a>A URL to your existing updates. Or `true` to automatically set to your GitHub repository. If given, these will be downloaded to create delta updates.
| remoteToken | <a name="SquirrelWindowsOptions-remoteToken"></a>Authentication token for remote updates
| useAppIdAsId | <a name="SquirrelWindowsOptions-useAppIdAsId"></a>Use `appId` to identify package instead of `name`.

<a name="WinBuildOptions"></a>
### `win` Windows Specific Options
| Name | Description
| --- | ---
| target | <a name="WinBuildOptions-target"></a><p>Target package type: list of <code>nsis</code>, <code>nsis-web</code> (Web installer), <code>portable</code> (portable app without installation), <code>appx</code>, <code>squirrel</code>, <code>7z</code>, <code>zip</code>, <code>tar.xz</code>, <code>tar.lz</code>, <code>tar.gz</code>, <code>tar.bz2</code>, <code>dir</code>. Defaults to <code>nsis</code>.</p> <p>AppX package can be built only on Windows 10.</p> <p>To use Squirrel.Windows please install <code>electron-builder-squirrel-windows</code> dependency.</p>
| signingHashAlgorithms | <a name="WinBuildOptions-signingHashAlgorithms"></a><p>Array of signing algorithms used. Defaults to <code>['sha1', 'sha256']</code></p> <p>For AppX <code>sha256</code> is always used.</p>
| icon | <a name="WinBuildOptions-icon"></a>The path to application icon. Defaults to `build/icon.ico` (consider using this convention instead of complicating your configuration).
| legalTrademarks | <a name="WinBuildOptions-legalTrademarks"></a>The trademarks and registered trademarks.
| certificateFile | <a name="WinBuildOptions-certificateFile"></a><p>The path to the *.pfx certificate you want to sign with. Please use it only if you cannot use env variable <code>CSC_LINK</code> (<code>WIN_CSC_LINK</code>) for some reason. Please see [Code Signing](https://github.com/electron-userland/electron-builder/wiki/Code-Signing).</p>
| certificatePassword | <a name="WinBuildOptions-certificatePassword"></a><p>The password to the certificate provided in <code>certificateFile</code>. Please use it only if you cannot use env variable <code>CSC_KEY_PASSWORD</code> (<code>WIN_CSC_KEY_PASSWORD</code>) for some reason. Please see [Code Signing](https://github.com/electron-userland/electron-builder/wiki/Code-Signing).</p>
| certificateSubjectName | <a name="WinBuildOptions-certificateSubjectName"></a>The name of the subject of the signing certificate. Required only for EV Code Signing and works only on Windows.
| certificateSha1 | <a name="WinBuildOptions-certificateSha1"></a>* The SHA1 hash of the signing certificate. The SHA1 hash is commonly specified when multiple certificates satisfy the criteria specified by the remaining switches. Works only on Windows.
| rfc3161TimeStampServer | <a name="WinBuildOptions-rfc3161TimeStampServer"></a>The URL of the RFC 3161 time stamp server. Defaults to `http://timestamp.comodoca.com/rfc3161`.
| timeStampServer | <a name="WinBuildOptions-timeStampServer"></a>The URL of the time stamp server. Defaults to `http://timestamp.verisign.com/scripts/timstamp.dll`.
| publisherName | <a name="WinBuildOptions-publisherName"></a><p>[The publisher name](https://github.com/electron-userland/electron-builder/issues/1187#issuecomment-278972073), exactly as in your code signed certificate. Several names can be provided. Defaults to common name from your code signing certificate.</p>

<a name="SnapOptions"></a>
### `snap` [Snap](http://snapcraft.io) Specific Options
| Name | Description
| --- | ---
| confinement | <a name="SnapOptions-confinement"></a>The type of [confinement](https://snapcraft.io/docs/reference/confinement) supported by the snap. Defaults to `strict`.
| summary | <a name="SnapOptions-summary"></a>The 78 character long summary. Defaults to [productName](#AppMetadata-productName).
| grade | <a name="SnapOptions-grade"></a><p>The quality grade of the snap. It can be either <code>devel</code> (i.e. a development version of the snap, so not to be published to the “stable” or “candidate” channels) or “stable” (i.e. a stable release or release candidate, which can be released to all channels). Defaults to <code>stable</code>.</p>
| assumes | <a name="SnapOptions-assumes"></a>The list of features that must be supported by the core in order for this snap to install.
| stagePackages | <a name="SnapOptions-stagePackages"></a><p>The list of Ubuntu packages to use that are needed to support the <code>app</code> part creation. Like <code>depends</code> for <code>deb</code>. Defaults to <code>[&quot;libnotify4&quot;, &quot;libappindicator1&quot;, &quot;libxtst6&quot;, &quot;libnss3&quot;, &quot;libxss1&quot;, &quot;fontconfig-config&quot;, &quot;gconf2&quot;, &quot;libasound2&quot;, &quot;pulseaudio&quot;]</code>.</p> <p>If list contains <code>default</code>, it will be replaced to default list, so, <code>[&quot;default&quot;, &quot;foo&quot;]</code> can be used to add custom package <code>foo</code> in addition to defaults.</p>
| plugs | <a name="SnapOptions-plugs"></a><p>The list of [plugs](https://snapcraft.io/docs/reference/interfaces). Defaults to <code>[&quot;home&quot;, &quot;x11&quot;, &quot;unity7&quot;, &quot;browser-support&quot;, &quot;network&quot;, &quot;gsettings&quot;, &quot;pulseaudio&quot;, &quot;opengl&quot;]</code>.</p> <p>If list contains <code>default</code>, it will be replaced to default list, so, <code>[&quot;default&quot;, &quot;foo&quot;]</code> can be used to add custom plug <code>foo</code> in addition to defaults.</p>
| ubuntuAppPlatformContent | <a name="SnapOptions-ubuntuAppPlatformContent"></a><p>Specify <code>ubuntu-app-platform1</code> to use [ubuntu-app-platform](https://insights.ubuntu.com/2016/11/17/how-to-create-snap-packages-on-qt-applications/). Snap size will be greatly reduced, but it is not recommended for now because “the snaps must be connected before running uitk-gallery for the first time”.</p>

<a name="DmgWindow"></a>
### `dmg.window` DMG Windows Position and Size
| Name | Description
| --- | ---
| x | <a name="DmgWindow-x"></a>The X position relative to left of the screen. Defaults to 400.
| y | <a name="DmgWindow-y"></a>The Y position relative to top of the screen. Defaults to 100.
| width | <a name="DmgWindow-width"></a>* The width. Defaults to background image width or 540.
| height | <a name="DmgWindow-height"></a>* The height. Defaults to background image height or 380.

<a name="Metadata"></a>
## Fields in the package.json

Some standard fields should be defined in the `package.json`.

| Name | Description
| --- | ---
| **name** | <a name="Metadata-name"></a>The application name.
| description | <a name="Metadata-description"></a>The application description.
| homepage | <a name="Metadata-homepage"></a><p>The url to the project [homepage](https://docs.npmjs.com/files/package.json#homepage) (NuGet Package <code>projectUrl</code> (optional) or Linux Package URL (required)).</p> <p>If not specified and your project repository is public on GitHub, it will be <code>https://github.com/${user}/${project}</code> by default.</p>
| license | <a name="Metadata-license"></a>*linux-only.* The [license](https://docs.npmjs.com/files/package.json#license) name.

<!-- end of generated block -->

## Build Version Management
`CFBundleVersion` (macOS) and `FileVersion` (Windows) will be set automatically to `version.build_number` on CI server (Travis, AppVeyor, CircleCI and Bamboo supported).

## Default File Pattern

[files](#Config-files) defaults to:
* `**/*`
* `!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme,test,__tests__,tests,powered-test,example,examples,*.d.ts}`
* `!**/node_modules/.bin`
* `!**/*.{o,hprof,orig,pyc,pyo,rbc}`
* `!**/._*`
* `!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,__pycache__,thumbs.db,.gitignore,.gitattributes,.editorconfig,.flowconfig,.yarn-metadata.json,.idea,appveyor.yml,.travis.yml,circle.yml,npm-debug.log,.nyc_output,yarn.lock,.yarn-integrity}`