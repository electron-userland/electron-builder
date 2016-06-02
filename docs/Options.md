# Options

In the development `package.json` custom `build` field can be specified to customize format:
```json
"build": {
  "osx": {
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

As you can see, you need to customize OS X options only if you want to provide custom `x, y`.
Don't customize paths to background and icon, — just follow conventions.

Here documented only `electron-builder` specific options:

<!-- do not edit. start of generated block -->

<a name="AppMetadata"></a>
# Application `package.json`
| Name | Description
| --- | ---
| **name** | <a name="AppMetadata-name"></a>The application name.
| productName | <a name="AppMetadata-productName"></a><p>As [name](#AppMetadata-name), but allows you to specify a product name for your executable which contains spaces and other special characters not allowed in the [name property](https://docs.npmjs.com/files/package.json#name}).</p>
| **description** | <a name="AppMetadata-description"></a>The application description.
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
| app-bundle-id | <a name="BuildMetadata-app-bundle-id"></a>*OS X-only.* The app bundle ID. See [CFBundleIdentifier](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070).
| app-category-type | <a name="BuildMetadata-app-category-type"></a><p>*OS X-only.* The application category type, as shown in the Finder via *View -&gt; Arrange by Application Category* when viewing the Applications directory.</p> <p>For example, <code>app-category-type=public.app-category.developer-tools</code> will set the application category to *Developer Tools*.</p> <p>Valid values are listed in [Apple’s documentation](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html#//apple_ref/doc/uid/TP40009250-SW8).</p>
| asar | <a name="BuildMetadata-asar"></a><p>Whether to package the application’s source code into an archive, using [Electron’s archive format](https://github.com/electron/asar). Defaults to <code>true</code>. Reasons why you may want to disable this feature are described in [an application packaging tutorial in Electron’s documentation](http://electron.atom.io/docs/latest/tutorial/application-packaging/#limitations-on-node-api/).</p> <p>Or you can pass object of any asar options.</p>
| productName | <a name="BuildMetadata-productName"></a>See [AppMetadata.productName](#AppMetadata-productName).
| extraResources | <a name="BuildMetadata-extraResources"></a><p>A [glob expression](https://www.npmjs.com/package/glob#glob-primer), when specified, copy the file or directory with matching names directly into the app’s resources directory (<code>Contents/Resources</code> for OS X, <code>resources</code> for Linux/Windows).</p> <p>You can use <code>${os}</code> (expanded to osx, linux or win according to current platform) and <code>${arch}</code> in the pattern.</p> <p>If directory matched, all contents are copied. So, you can just specify <code>foo</code> to copy <code>&lt;project_dir&gt;/foo</code> directory.</p> <p>May be specified in the platform options (i.e. in the <code>build.osx</code>).</p>
| extraFiles | <a name="BuildMetadata-extraFiles"></a>The same as [extraResources](#BuildMetadata-extraResources) but copy into the app's content directory (`Contents` for OS X, `` for Linux/Windows).
| osx | <a name="BuildMetadata-osx"></a>See [.build.osx](#OsXBuildOptions).
| mas | <a name="BuildMetadata-mas"></a>See [.build.mas](#MasBuildOptions).
| win | <a name="BuildMetadata-win"></a>See [.build.win](#LinuxBuildOptions).
| linux | <a name="BuildMetadata-linux"></a>See [.build.linux](#LinuxBuildOptions).
| compression | <a name="BuildMetadata-compression"></a>The compression level, one of `store`, `normal`, `maximum` (default: `normal`). If you want to rapidly test build, `store` can reduce build time significantly.
| afterPack | <a name="BuildMetadata-afterPack"></a>*programmatic API only* The function to be run after pack (but before pack into distributable format and sign). Promise must be returned.
| npmRebuild | <a name="BuildMetadata-npmRebuild"></a>Whether to rebuild native dependencies (`npm rebuild`) before starting to package the app. Defaults to `true`.

<a name="OsXBuildOptions"></a>
### `.build.osx`

See all [appdmg options](https://www.npmjs.com/package/appdmg#json-specification).

| Name | Description
| --- | ---
| icon | <a name="OsXBuildOptions-icon"></a>The path to DMG icon, which will be shown when mounted. Defaults to `build/icon.icns`.
| background | <a name="OsXBuildOptions-background"></a><p>The path to background (default: <code>build/background.png</code> if exists). The resolution of this file determines the resolution of the installer window. If background is not specified, use <code>window.size</code>, see [specification](https://github.com/LinusU/node-appdmg#json-specification).</p>
| target | <a name="OsXBuildOptions-target"></a>Target package type: list of `default`, `dmg`, `mas`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`. Defaults to `default` (dmg and zip for Squirrel.Mac).
| identity | <a name="OsXBuildOptions-identity"></a><p>The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](https://github.com/electron-userland/electron-builder/wiki/Code-Signing). MAS installer identity is specified in the [.build.mas](#MasBuildOptions-identity).</p>
| entitlements | <a name="OsXBuildOptions-entitlements"></a><p>The path to entitlements file for signing the app. <code>build/entitlements.osx.plist</code> will be used if exists (it is a recommended way to set). MAS entitlements is specified in the [.build.mas](#MasBuildOptions-entitlements).</p>
| entitlementsInherit | <a name="OsXBuildOptions-entitlementsInherit"></a><p>The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. <code>build/entitlements.osx.inherit.plist</code> will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.darwin.inherit.plist).</p> <p>This option only applies when signing with <code>entitlements</code> provided.</p>

<a name="MasBuildOptions"></a>
### `.build.mas`

MAS (Mac Application Store) specific options (in addition to `build.osx`).

| Name | Description
| --- | ---
| entitlements | <a name="MasBuildOptions-entitlements"></a><p>The path to entitlements file for signing the app. <code>build/entitlements.mas.plist</code> will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.plist).</p>
| entitlementsInherit | <a name="MasBuildOptions-entitlementsInherit"></a><p>The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. <code>build/entitlements.mas.inherit.plist</code> will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.inherit.plist).</p>

<a name="WinBuildOptions"></a>
### `.build.win`
| Name | Description
| --- | ---
| iconUrl | <a name="WinBuildOptions-iconUrl"></a><p>A URL to an ICO file to use as the application icon (displayed in Control Panel &gt; Programs and Features). Defaults to the Electron icon.</p> <p>Please note — [local icon file url is not accepted](https://github.com/atom/grunt-electron-installer/issues/73), must be https/http.</p> <ul> <li>If you don’t plan to build windows installer, you can omit it.</li> <li>If your project repository is public on GitHub, it will be <code>https://github.com/${u}/${p}/blob/master/build/icon.ico?raw=true</code> by default.</li> </ul>
| loadingGif | <a name="WinBuildOptions-loadingGif"></a><p>The path to a .gif file to display during install. <code>build/install-spinner.gif</code> will be used if exists (it is a recommended way to set) (otherwise [default](https://github.com/electron/windows-installer/blob/master/resources/install-spinner.gif)).</p>
| msi | <a name="WinBuildOptions-msi"></a>Whether to create an MSI installer. Defaults to `false` (MSI is not created).
| remoteReleases | <a name="WinBuildOptions-remoteReleases"></a>A URL to your existing updates. If given, these will be downloaded to create delta updates.
| remoteToken | <a name="WinBuildOptions-remoteToken"></a>Authentication token for remote updates
| signingHashAlgorithms | <a name="WinBuildOptions-signingHashAlgorithms"></a>Array of signing algorithms used. Defaults to `['sha1', 'sha256']`

<a name="LinuxBuildOptions"></a>
### `.build.linux`
| Name | Description
| --- | ---
| description | <a name="LinuxBuildOptions-description"></a>As [description](#AppMetadata-description) from application package.json, but allows you to specify different for Linux.
| synopsis | <a name="LinuxBuildOptions-synopsis"></a>*deb-only.* The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
| maintainer | <a name="LinuxBuildOptions-maintainer"></a>The maintainer. Defaults to [author](#AppMetadata-author).
| vendor | <a name="LinuxBuildOptions-vendor"></a>The vendor. Defaults to [author](#AppMetadata-author).
| compression | <a name="LinuxBuildOptions-compression"></a>*deb-only.* The compression type, one of `gz`, `bzip2`, `xz` (default: `xz`).
| depends | <a name="LinuxBuildOptions-depends"></a>Package dependencies. Defaults to `["libappindicator1", "libnotify-bin"]`.
| target | <a name="LinuxBuildOptions-target"></a><p>Target package type: list of <code>default</code>, <code>deb</code>, <code>rpm</code>, <code>freebsd</code>, <code>pacman</code>, <code>p5p</code>, <code>apk</code>, <code>7z</code>, <code>zip</code>, <code>tar.xz</code>, <code>tar.lz</code>, <code>tar.gz</code>, <code>tar.bz2</code>. Defaults to <code>default</code> (<code>deb</code>).</p> <p>Only <code>deb</code> is tested. Feel free to file issues for <code>rpm</code> and other package formats.</p>

<a name="MetadataDirectories"></a>
## `.directories`
| Name | Description
| --- | ---
| buildResources | <a name="MetadataDirectories-buildResources"></a>The path to build resources, default `build`.
| output | <a name="MetadataDirectories-output"></a>The output directory, default `dist`.
| app | <a name="MetadataDirectories-app"></a>The application directory (containing the application package.json), default `app`, `www` or working directory.

<!-- end of generated block -->
