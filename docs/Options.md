# Options

In the development `package.json` custom `build` field can be specified to customize format:
```json
"build": {
  "dmg": {
    "contents": [
      {
        "x": 410,
        "y": 220,
        "type": "link",
        "path": "/Applications"
      },
      {
        "x": 130,
        "y": 220,
        "type": "file",
        "path": "computed path to artifact, do not specify it - will be overwritten"
      }
    ]
  }
}
```

As you can see, you need to customize MacOS options only if you want to provide custom `x, y`.
Don't customize paths to background and icon, — just follow conventions.

<!-- do not edit. start of generated block -->

<a name="AppMetadata"></a>
# Application `package.json`
| Name | Description
| --- | ---
| **name** | <a name="AppMetadata-name"></a>The application name.
| productName | <a name="AppMetadata-productName"></a><p>As [name](#AppMetadata-name), but allows you to specify a product name for your executable which contains spaces and other special characters not allowed in the [name property](https://docs.npmjs.com/files/package.json#name}).</p>
| description | <a name="AppMetadata-description"></a>The application description.
| homepage | <a name="AppMetadata-homepage"></a><p>The url to the project [homepage](https://docs.npmjs.com/files/package.json#homepage) (NuGet Package <code>projectUrl</code> (optional) or Linux Package URL (required)).</p> <p>If not specified and your project repository is public on GitHub, it will be <code>https://github.com/${user}/${project}</code> by default.</p>
| license | <a name="AppMetadata-license"></a>*linux-only.* The [license](https://docs.npmjs.com/files/package.json#license) name.

<a name="DevMetadata"></a>
# Development `package.json`
| Name | Description
| --- | ---
| **build** | <a name="DevMetadata-build"></a>See [.build](#BuildMetadata).
| directories | <a name="DevMetadata-directories"></a>See [.directories](#MetadataDirectories)

<a name="BuildMetadata"></a>
## `.build`
| Name | Description
| --- | ---
| appId | <a name="BuildMetadata-appId"></a><p>The application id. Used as [CFBundleIdentifier](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070) for MacOS and as [Application User Model ID](https://msdn.microsoft.com/en-us/library/windows/desktop/dd378459(v=vs.85).aspx) for Windows (NSIS target only, Squirrel.Windows not supported).</p> <p>Defaults to <code>com.electron.${name}</code>. It is strongly recommended that an explicit ID be set.</p>
| copyright | <a name="BuildMetadata-copyright"></a>The human-readable copyright line for the app. Defaults to `Copyright © year author`.
| asar | <a name="BuildMetadata-asar"></a><p>Whether to package the application’s source code into an archive, using [Electron’s archive format](https://github.com/electron/asar). Defaults to <code>true</code>. Reasons why you may want to disable this feature are described in [an application packaging tutorial in Electron’s documentation](http://electron.atom.io/docs/latest/tutorial/application-packaging/#limitations-on-node-api/).</p> <p>Or you can pass object of any asar options.</p> <p>Node modules, that must be unpacked, will be detected automatically, you don’t need to explicitly set <code>asar.unpackDir</code> - please file issue if this doesn’t work.</p>
| productName | <a name="BuildMetadata-productName"></a>See [AppMetadata.productName](#AppMetadata-productName).
| files | <a name="BuildMetadata-files"></a><p>A [glob patterns](https://www.npmjs.com/package/glob#glob-primer) relative to the [app directory](#MetadataDirectories-app), which specifies which files to include when copying files to create the package.</p> <p>See [File Patterns](#multiple-glob-patterns).</p>
| extraResources | <a name="BuildMetadata-extraResources"></a><p>A [glob patterns](https://www.npmjs.com/package/glob#glob-primer) relative to the project directory, when specified, copy the file or directory with matching names directly into the app’s resources directory (<code>Contents/Resources</code> for MacOS, <code>resources</code> for Linux/Windows).</p> <p>Glob rules the same as for [files](#multiple-glob-patterns).</p>
| extraFiles | <a name="BuildMetadata-extraFiles"></a>The same as [extraResources](#BuildMetadata-extraResources) but copy into the app's content directory (`Contents` for MacOS, root directory for Linux/Windows).
| fileAssociations | <a name="BuildMetadata-fileAssociations"></a>The file associations. See [.build.fileAssociations](#FileAssociation).
| protocols | <a name="BuildMetadata-protocols"></a>The URL protocol scheme(s) to associate the app with. See [.build.protocol](#Protocol).
| mac | <a name="BuildMetadata-mac"></a>See [.build.mac](#MacOptions).
| dmg | <a name="BuildMetadata-dmg"></a>See [.build.dmg](#DmgOptions).
| mas | <a name="BuildMetadata-mas"></a>See [.build.mas](#MasBuildOptions).
| win | <a name="BuildMetadata-win"></a>See [.build.win](#WinBuildOptions).
| nsis | <a name="BuildMetadata-nsis"></a>See [.build.nsis](#NsisOptions).
| linux | <a name="BuildMetadata-linux"></a>See [.build.linux](#LinuxBuildOptions).
| compression | <a name="BuildMetadata-compression"></a>The compression level, one of `store`, `normal`, `maximum` (default: `normal`). If you want to rapidly test build, `store` can reduce build time significantly.
| afterPack | <a name="BuildMetadata-afterPack"></a>*programmatic API only* The function to be run after pack (but before pack into distributable format and sign). Promise must be returned.
| npmRebuild | <a name="BuildMetadata-npmRebuild"></a>*two package.json structure only* Whether to [rebuild](https://docs.npmjs.com/cli/rebuild) native dependencies (`npm rebuild`) before starting to package the app. Defaults to `true`.
| nodeGypRebuild | <a name="BuildMetadata-nodeGypRebuild"></a>Whether to execute `node-gyp rebuild` before starting to package the app. Defaults to `false`.

<a name="MacOptions"></a>
### `.build.mac`

MacOS specific build options.

| Name | Description
| --- | ---
| category | <a name="MacOptions-category"></a><p>The application category type, as shown in the Finder via *View -&gt; Arrange by Application Category* when viewing the Applications directory.</p> <p>For example, <code>&quot;category&quot;: &quot;public.app-category.developer-tools&quot;</code> will set the application category to *Developer Tools*.</p> <p>Valid values are listed in [Apple’s documentation](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html#//apple_ref/doc/uid/TP40009250-SW8).</p>
| target | <a name="MacOptions-target"></a>Target package type: list of `default`, `dmg`, `mas`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`. Defaults to `default` (dmg and zip for Squirrel.Mac).
| identity | <a name="MacOptions-identity"></a><p>The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](https://github.com/electron-userland/electron-builder/wiki/Code-Signing). MAS installer identity is specified in the [.build.mas](#MasBuildOptions-identity).</p>
| icon | <a name="MacOptions-icon"></a>The path to application icon. Defaults to `build/icon.icns` (consider using this convention instead of complicating your configuration).
| entitlements | <a name="MacOptions-entitlements"></a><p>The path to entitlements file for signing the app. <code>build/entitlements.mac.plist</code> will be used if exists (it is a recommended way to set). MAS entitlements is specified in the [.build.mas](#MasBuildOptions-entitlements).</p>
| entitlementsInherit | <a name="MacOptions-entitlementsInherit"></a><p>The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. <code>build/entitlements.mac.inherit.plist</code> will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.darwin.inherit.plist).</p> <p>This option only applies when signing with <code>entitlements</code> provided.</p>
| bundleVersion | <a name="MacOptions-bundleVersion"></a>The `CFBundleVersion`. Do not use it unless [you need to](see (https://github.com/electron-userland/electron-builder/issues/565#issuecomment-230678643)).
| helperBundleId | <a name="MacOptions-helperBundleId"></a>The bundle identifier to use in the application helper's plist. Defaults to `${appBundleIdentifier}.helper`.

<a name="DmgOptions"></a>
### `.build.dmg`

MacOS DMG specific options.

See all [appdmg options](https://www.npmjs.com/package/appdmg#json-specification).

| Name | Description
| --- | ---
| icon | <a name="DmgOptions-icon"></a>The path to DMG icon, which will be shown when mounted. Defaults to `build/icon.icns`.
| background | <a name="DmgOptions-background"></a><p>The path to background (default: <code>build/background.png</code> if exists). The resolution of this file determines the resolution of the installer window. If background is not specified, use <code>window.size</code>, see [specification](https://github.com/LinusU/node-appdmg#json-specification).</p>

<a name="MasBuildOptions"></a>
### `.build.mas`

MAS (Mac Application Store) specific options (in addition to `build.mac`).

| Name | Description
| --- | ---
| entitlements | <a name="MasBuildOptions-entitlements"></a><p>The path to entitlements file for signing the app. <code>build/entitlements.mas.plist</code> will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.plist).</p>
| entitlementsInherit | <a name="MasBuildOptions-entitlementsInherit"></a><p>The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. <code>build/entitlements.mas.inherit.plist</code> will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.inherit.plist).</p>

<a name="WinBuildOptions"></a>
### `.build.win`

Windows specific build options.

| Name | Description
| --- | ---
| target | <a name="WinBuildOptions-target"></a>Target package type: list of `squirrel`, `nsis`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`. Defaults to `squirrel`.
| iconUrl | <a name="WinBuildOptions-iconUrl"></a><p>*Squirrel.Windows-only.* A URL to an ICO file to use as the application icon (displayed in Control Panel &gt; Programs and Features). Defaults to the Electron icon.</p> <p>Please note — [local icon file url is not accepted](https://github.com/atom/grunt-electron-installer/issues/73), must be https/http.</p> <ul> <li>If you don’t plan to build windows installer, you can omit it.</li> <li>If your project repository is public on GitHub, it will be <code>https://github.com/${u}/${p}/blob/master/build/icon.ico?raw=true</code> by default.</li> </ul>
| loadingGif | <a name="WinBuildOptions-loadingGif"></a><p>*Squirrel.Windows-only.* The path to a .gif file to display during install. <code>build/install-spinner.gif</code> will be used if exists (it is a recommended way to set) (otherwise [default](https://github.com/electron/windows-installer/blob/master/resources/install-spinner.gif)).</p>
| msi | <a name="WinBuildOptions-msi"></a>*Squirrel.Windows-only.* Whether to create an MSI installer. Defaults to `false` (MSI is not created).
| remoteReleases | <a name="WinBuildOptions-remoteReleases"></a>*Squirrel.Windows-only.* A URL to your existing updates. Or `true` to automatically set to your GitHub repository. If given, these will be downloaded to create delta updates.
| remoteToken | <a name="WinBuildOptions-remoteToken"></a>*Squirrel.Windows-only.* Authentication token for remote updates
| signingHashAlgorithms | <a name="WinBuildOptions-signingHashAlgorithms"></a>Array of signing algorithms used. Defaults to `['sha1', 'sha256']`
| icon | <a name="WinBuildOptions-icon"></a>The path to application icon. Defaults to `build/icon.ico` (consider using this convention instead of complicating your configuration).
| legalTrademarks | <a name="WinBuildOptions-legalTrademarks"></a>The trademarks and registered trademarks.
| certificateSubjectName | <a name="WinBuildOptions-certificateSubjectName"></a>The name of the subject of the signing certificate. Required only for EV Code Signing and works only on Windows.
| rfc3161TimeStampServer | <a name="WinBuildOptions-rfc3161TimeStampServer"></a>The URL of the RFC 3161 time stamp server. Defaults to `http://timestamp.comodoca.com/rfc3161`.

<a name="NsisOptions"></a>
### `.build.nsis`

NSIS target support in progress — not polished and not fully tested and checked.

See [NSIS target notes](https://github.com/electron-userland/electron-builder/wiki/NSIS).

| Name | Description
| --- | ---
| oneClick | <a name="NsisOptions-oneClick"></a>One-click installation. Defaults to `true`.
| perMachine | <a name="NsisOptions-perMachine"></a><p>Defaults to <code>false</code>.</p> <p>If <code>oneClick</code> is <code>true</code> (default): Install per all users (per-machine).</p> <p>If <code>oneClick</code> is <code>false</code>: no install mode installer page (choice per-machine or per-user), always install per-machine.</p>
| allowElevation | <a name="NsisOptions-allowElevation"></a>*boring installer only.* Allow requesting for elevation. If false, user will have to restart installer with elevated permissions. Defaults to `true`.
| runAfterFinish | <a name="NsisOptions-runAfterFinish"></a>*one-click installer only.* Run application after finish. Defaults to `true`.
| guid | <a name="NsisOptions-guid"></a>See [GUID vs Application Name](https://github.com/electron-userland/electron-builder/wiki/NSIS#guid-vs-application-name).
| installerHeader | <a name="NsisOptions-installerHeader"></a>*boring installer only.* `MUI_HEADERIMAGE`, relative to the project directory. Defaults to `build/installerHeader.bmp`
| installerHeaderIcon | <a name="NsisOptions-installerHeaderIcon"></a>*one-click installer only.* The path to header icon (above the progress bar), relative to the project directory. Defaults to `build/installerHeaderIcon.ico` or application icon.
| include | <a name="NsisOptions-include"></a>The path to NSIS include script to customize installer. Defaults to `build/installer.nsh`. See [Custom NSIS script](https://github.com/electron-userland/electron-builder/wiki/NSIS#custom-nsis-script).
| script | <a name="NsisOptions-script"></a>The path to NSIS script to customize installer. Defaults to `build/installer.nsi`. See [Custom NSIS script](https://github.com/electron-userland/electron-builder/wiki/NSIS#custom-nsis-script).
| language | <a name="NsisOptions-language"></a>* [LCID Dec](https://msdn.microsoft.com/en-au/goglobal/bb964664.aspx), defaults to `1033`(`English - United States`).

<a name="LinuxBuildOptions"></a>
### `.build.linux`

Linux specific build options.

| Name | Description
| --- | ---
| category | <a name="LinuxBuildOptions-category"></a>The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
| packageCategory | <a name="LinuxBuildOptions-packageCategory"></a>The [package category](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Section). Not applicable for AppImage.
| description | <a name="LinuxBuildOptions-description"></a>As [description](#AppMetadata-description) from application package.json, but allows you to specify different for Linux.
| target | <a name="LinuxBuildOptions-target"></a><p>Target package type: list of <code>AppImage</code>, <code>deb</code>, <code>rpm</code>, <code>freebsd</code>, <code>pacman</code>, <code>p5p</code>, <code>apk</code>, <code>7z</code>, <code>zip</code>, <code>tar.xz</code>, <code>tar.lz</code>, <code>tar.gz</code>, <code>tar.bz2</code>. Defaults to <code>AppImage</code>.</p> <p>The most effective [xz](https://en.wikipedia.org/wiki/Xz) compression format used by default.</p> <p>Only <code>deb</code> and <code>AppImage</code> is tested. Feel free to file issues for <code>rpm</code> and other package formats.</p>
| synopsis | <a name="LinuxBuildOptions-synopsis"></a>*deb-only.* The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
| maintainer | <a name="LinuxBuildOptions-maintainer"></a>The maintainer. Defaults to [author](#AppMetadata-author).
| vendor | <a name="LinuxBuildOptions-vendor"></a>The vendor. Defaults to [author](#AppMetadata-author).
| desktop | <a name="LinuxBuildOptions-desktop"></a>The [Desktop file](https://developer.gnome.org/integration-guide/stable/desktop-files.html.en) entries.
| compression | <a name="LinuxBuildOptions-compression"></a>*deb-only.* The compression type, one of `gz`, `bzip2`, `xz`. Defaults to `xz`.
| depends | <a name="LinuxBuildOptions-depends"></a>Package dependencies. Defaults to `["libappindicator1", "libnotify-bin"]`.

<a name="FileAssociation"></a>
### `.build.fileAssociations`

NSIS and MacOS only.

| Name | Description
| --- | ---
| **ext** | <a name="FileAssociation-ext"></a>The extension (minus the leading period). e.g. `png`.
| **name** | <a name="FileAssociation-name"></a>The name. e.g. `PNG`.
| description | <a name="FileAssociation-description"></a>*windows-only.* The description.
| icon | <a name="FileAssociation-icon"></a>The path to icon (`.icns` for MacOS and `.ico` for Windows), relative to `build` (build resources directory). Defaults to `${firstExt}.icns`/`${firstExt}.ico` (if several extensions specified, first is used) or to application icon.
| role | <a name="FileAssociation-role"></a>*macOS-only* The app’s role with respect to the type. The value can be `Editor`, `Viewer`, `Shell`, or `None`. Defaults to `Editor`.

<a name="Protocol"></a>
### `.build.protocols`

macOS only.

| Name | Description
| --- | ---
| **name** | <a name="Protocol-name"></a>The name. e.g. `IRC server URL`.
| **schemes** | <a name="Protocol-schemes"></a>The schemes. e.g. `["irc", "ircs"]`.

<a name="MetadataDirectories"></a>
## `.directories`
| Name | Description
| --- | ---
| buildResources | <a name="MetadataDirectories-buildResources"></a>The path to build resources, defaults to `build`.
| output | <a name="MetadataDirectories-output"></a>The output directory, defaults to `dist`.
| app | <a name="MetadataDirectories-app"></a>The application directory (containing the application package.json), defaults to `app`, `www` or working directory.

<!-- end of generated block -->

# File Patterns

[build.files](#BuildMetadata-files) defaults to `**/*` (i.e. [hidden files are ignored by default](https://www.npmjs.com/package/glob#dots)).

Development dependencies are never copied in any case. You don't need to ignore it explicitly.

[Multiple patterns](#multiple-glob-patterns) are supported. You can use `${os}` (expanded to mac, linux or win according to current platform) and `${arch}` in the pattern.
If directory matched, all contents are copied. So, you can just specify `foo` to copy `foo` directory.

Remember that default pattern `**/*` is not added to your custom, so, you have to add it explicitly — e.g. `["**/*", "!ignoreMe${/*}"]`.

May be specified in the platform options (e.g. in the `build.mac`).

## Multiple Glob Patterns
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

## Excluding directories

Remember that `!doNotCopyMe/**/*` would match the files *in* the `doNotCopyMe` directory, but not the directory itself, so the [empty directory](https://github.com/gulpjs/gulp/issues/165#issuecomment-32613179) would be created.
Solution — use macro `${/*}`, e.g. `!doNotCopyMe${/*}`.

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

You can you `${os}` and `${arch}` in the `from` and `to` fields as well.

# Build Version Management
`CFBundleVersion` (MacOS) and `FileVersion` (Windows) will be set automatically to `version`.`build_number` on CI server (Travis, AppVeyor and CircleCI supported).