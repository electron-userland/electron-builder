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

<a name="DevMetadata"></a>
# Development `package.json`
| Name | Description
| --- | ---
| homepage | <a name="DevMetadata-homepage"></a><p>The url to the project [homepage](https://docs.npmjs.com/files/package.json#homepage) (NuGet Package <code>projectUrl</code> (optional) or Linux Package URL (required)).</p> <p>If not specified and your project repository is public on GitHub, it will be <code>https://github.com/${user}/${project}</code> by default.</p>
| license | <a name="DevMetadata-license"></a>*linux-only.* The [license](https://docs.npmjs.com/files/package.json#license) name for this package.
| **build** | <a name="DevMetadata-build"></a>See [.build](#BuildMetadata).
| directories | <a name="DevMetadata-directories"></a>See [.directories](#MetadataDirectories)

<a name="BuildMetadata"></a>
## `.build`
| Name | Description
| --- | ---
| **app-bundle-id** | <a name="BuildMetadata-app-bundle-id"></a>The bundle identifier to use in the application's plist.
| **app-category-type** | <a name="BuildMetadata-app-category-type"></a><p>The application category type, as shown in the Finder via *View -&gt; Arrange by Application Category* when viewing the Applications directory.</p> <p>For example, <code>app-category-type=public.app-category.developer-tools</code> will set the application category to *Developer Tools*.</p> <p>Valid values are listed in [Apple’s documentation](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html#//apple_ref/doc/uid/TP40009250-SW8).</p>
| **iconUrl** | <a name="BuildMetadata-iconUrl"></a><p>*windows-only.* A URL to an ICO file to use as the application icon (displayed in Control Panel &gt; Programs and Features). Defaults to the Electron icon.</p> <p>Please note — [local icon file url is not accepted](https://github.com/atom/grunt-electron-installer/issues/73), must be https/http.</p> <ul> <li>If you don’t plan to build windows installer, you can omit it.</li> <li>If your project repository is public on GitHub, it will be <code>https://raw.githubusercontent.com/${user}/${project}/master/build/icon.ico</code> by default.</li> </ul>
| productName | <a name="BuildMetadata-productName"></a>See [AppMetadata.productName](#AppMetadata-productName).
| extraResources | <a name="BuildMetadata-extraResources"></a><p>A [glob expression](https://www.npmjs.com/package/glob#glob-primer), when specified, copy the file or directory with matching names directly into the app’s directory (<code>Contents/Resources</code> for OS X).</p> <p>You can use <code>${os}</code> (expanded to osx, linux or win according to current platform) and <code>${arch}</code> in the pattern.</p> <p>If directory matched, all contents are copied. So, you can just specify <code>foo</code> to copy <code>&lt;project_dir&gt;/foo</code> directory.</p> <p>May be specified in the platform options (i.e. in the <code>build.osx</code>).</p>
| osx | <a name="BuildMetadata-osx"></a>See [.build.osx](#OsXBuildOptions).
| win | <a name="BuildMetadata-win"></a>See [.build.win](#LinuxBuildOptions).
| linux | <a name="BuildMetadata-linux"></a>See [.build.linux](#LinuxBuildOptions).
| compression | <a name="BuildMetadata-compression"></a>The compression level, one of `store`, `normal`, `maximum` (default: `normal`). If you want to rapidly test build, `store` can reduce build time significantly.

<a name="OsXBuildOptions"></a>
### `.build.osx`

See all [appdmg options](https://www.npmjs.com/package/appdmg#json-specification).

| Name | Description
| --- | ---
| icon | <a name="OsXBuildOptions-icon"></a>The path to icon, which will be shown when mounted (default: `build/icon.icns`).
| background | <a name="OsXBuildOptions-background"></a>The path to background (default: `build/background.png`).

<a name="WinBuildOptions"></a>
### `.build.win`

See all [windows-installer options](https://github.com/electron/windows-installer#usage).

| Name | Description
| --- | ---
| loadingGif | <a name="WinBuildOptions-loadingGif"></a><p>The path to a .gif file to display during install. <code>build/install-spinner.gif</code> will be used if exists (otherwise [default](https://github.com/electron/windows-installer/blob/master/resources/install-spinner.gif)).</p>
| noMsi | <a name="WinBuildOptions-noMsi"></a>Whether to create an MSI installer. Defaults to `true` (MSI is not created).

<a name="LinuxBuildOptions"></a>
### `.build.linux`
| Name | Description
| --- | ---
| compression | <a name="LinuxBuildOptions-compression"></a>*deb-only.* The compression type, one of `gz`, `bzip2`, `xz` (default: `xz`).

<a name="MetadataDirectories"></a>
## `.directories`
| Name | Description
| --- | ---
| buildResources | <a name="MetadataDirectories-buildResources"></a>The path to build resources, default `build`.
| output | <a name="MetadataDirectories-output"></a>The output directory, default `dist`.

<!-- end of generated block -->
