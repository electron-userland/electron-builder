electron-builder [configuration](#Config) can be defined 
* in the `package.json` file of your project using the `build` key on the top level
* or through the `--config <path/to/yml-or-json5>` option (defaults to `electron-builder.yml` (or `json`, or [json5](http://json5.org))).

See [Config](#Config).

Most of the options accept `null` — for example, to explicitly set that DMG icon must be default volume icon from the OS and default rules must be not applied (i.e. use application icon as DMG icon), set `dmg.icon` to `null`.

Most of the options supports inheritance — `f`

## File Patterns

Hidden files are not ignored by default, but all files that should be ignored, are [ignored by default](#default-file-pattern).

Development dependencies are never copied in any case. You don't need to ignore it explicitly.

[Multiple patterns](#multiple-glob-patterns) are supported. If directory matched, all contents are copied. So, you can just specify `foo` to copy `foo` directory.

Remember that default pattern `**/*` **is not added to your custom** if some of your patterns is not ignore (i.e. not starts with `!`).
 `package.json` is added to your custom in any case. All default ignores are added in any case — you don't need to repeat it if you configure own patterns.

May be specified in the platform options (e.g. in the [mac](#module_electron-builder.MacOptions)).

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

### Default File Pattern

[files](#Config-files) defaults to:
* `**/*`
* `!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme,test,__tests__,tests,powered-test,example,examples,*.d.ts}`
* `!**/node_modules/.bin`
* `!**/*.{o,hprof,orig,pyc,pyo,rbc}`
* `!**/._*`
* `!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,__pycache__,thumbs.db,.gitignore,.gitattributes,.editorconfig,.flowconfig,.yarn-metadata.json,.idea,appveyor.yml,.travis.yml,circle.yml,npm-debug.log,.nyc_output,yarn.lock,.yarn-integrity}`

## Artifact File Name Pattern

`${ext}` macro is supported in addition to [file macros](#file-macros).

## Build Version Management
`CFBundleVersion` (macOS) and `FileVersion` (Windows) will be set automatically to `version.build_number` on CI server (Travis, AppVeyor, CircleCI and Bamboo supported).

<!-- do not edit. start of generated block -->
## API

* [electron-builder](#module_electron-builder)
    * [`.AfterPackContext`](#AfterPackContext)
    * [`.AppXOptions`](#AppXOptions)
    * [`.ArtifactCreated`](#ArtifactCreated)
    * [`.BuildInfo`](#BuildInfo)
    * [`.BuildOptions`](#BuildOptions) ⇐ <code>[PublishOptions](Publishing-Artifacts#PublishOptions)</code>
    * [`.BuildResult`](#BuildResult)
    * [`.CliOptions`](#CliOptions) ⇐ <code>[PublishOptions](Publishing-Artifacts#PublishOptions)</code>
    * [`.Config`](#Config) ⇐ <code>[PlatformSpecificBuildOptions](Developer-API#PlatformSpecificBuildOptions)</code>
    * [`.DebOptions`](#DebOptions) ⇐ <code>[LinuxBuildOptions](#LinuxBuildOptions)</code>
    * [`.DmgContent`](#DmgContent)
    * [`.DmgOptions`](#DmgOptions) ⇐ <code>[TargetSpecificOptions](Developer-API#TargetSpecificOptions)</code>
    * [`.DmgWindow`](#DmgWindow)
    * [`.LinuxBuildOptions`](#LinuxBuildOptions) ⇐ <code>[PlatformSpecificBuildOptions](Developer-API#PlatformSpecificBuildOptions)</code>
    * [`.MacOptions`](#MacOptions) ⇐ <code>[PlatformSpecificBuildOptions](Developer-API#PlatformSpecificBuildOptions)</code>
    * [`.MasBuildOptions`](#MasBuildOptions) ⇐ <code>[MacOptions](#MacOptions)</code>
    * [`.Metadata`](#Metadata)
    * [`.NsisOptions`](#NsisOptions)
    * [`.NsisWebOptions`](#NsisWebOptions) ⇐ <code>[NsisOptions](#NsisOptions)</code>
    * [`.PackagerOptions`](#PackagerOptions)
    * [`.PkgOptions`](#PkgOptions) ⇐ <code>[TargetSpecificOptions](Developer-API#TargetSpecificOptions)</code>
    * [`.SnapOptions`](#SnapOptions) ⇐ <code>[LinuxBuildOptions](#LinuxBuildOptions)</code>
    * [`.SquirrelWindowsOptions`](#SquirrelWindowsOptions) ⇐ <code>[WinBuildOptions](#WinBuildOptions)</code>
    * [`.WinBuildOptions`](#WinBuildOptions) ⇐ <code>[PlatformSpecificBuildOptions](Developer-API#PlatformSpecificBuildOptions)</code>
    * [.Packager](#Packager) ⇐ <code>[BuildInfo](#BuildInfo)</code>
    * [`.build(rawOptions)`](#module_electron-builder.build) ⇒ <code>Promise&lt;Array&lt;string&gt;&gt;</code>
    * [`.createTargets(platforms, type, arch)`](#module_electron-builder.createTargets) ⇒ <code>Map&lt;[Platform](Developer-API#Platform) &#124; Map&lt;[Arch](Developer-API#Arch) &#124; Array&lt;string&gt;&gt;&gt;</code>

<a name="AfterPackContext"></a>

### `AfterPackContext`
**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **appOutDir**| <code>string</code> | 
| **packager**| <code>[PlatformPackager](Developer-API#PlatformPackager)&lt;any&gt;</code> | 
| **electronPlatformName**| <code>string</code> | 
| **arch**| <code>[Arch](Developer-API#Arch)</code> | 
| **targets**| <code>Array&lt;[Target](Developer-API#Target)&gt;</code> | 

<a name="AppXOptions"></a>

### `AppXOptions`
AppX Options

**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**See**: [Windows AppX docs](https://msdn.microsoft.com/en-us/library/windows/apps/br211453.aspx).  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| backgroundColor| <code>string</code> \| <code>null</code> | <a name="AppXOptions-backgroundColor"></a>The background color of the app tile. See: [Visual Elements](https://msdn.microsoft.com/en-us/library/windows/apps/br211471.aspx). |
| publisher| <code>string</code> \| <code>null</code> | <a name="AppXOptions-publisher"></a>Describes the publisher information in a form `CN=your name exactly as in your cert`. The Publisher attribute must match the publisher subject information of the certificate used to sign a package. By default will be extracted from code sign certificate. |
| displayName| <code>string</code> \| <code>null</code> | <a name="AppXOptions-displayName"></a>A friendly name that can be displayed to users. Corresponds to [Properties.DisplayName](https://msdn.microsoft.com/en-us/library/windows/apps/br211432.aspx). |
| publisherDisplayName| <code>string</code> \| <code>null</code> | <a name="AppXOptions-publisherDisplayName"></a>A friendly name for the publisher that can be displayed to users. Corresponds to [Properties.PublisherDisplayName](https://msdn.microsoft.com/en-us/library/windows/apps/br211460.aspx). |
| identityName| <code>string</code> \| <code>null</code> | <a name="AppXOptions-identityName"></a>Describes the contents of the package. The Name attribute is case-sensitive. Corresponds to [Identity.Name](https://msdn.microsoft.com/en-us/library/windows/apps/br211441.aspx). |

<a name="ArtifactCreated"></a>

### `ArtifactCreated`
**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **packager**| <code>[PlatformPackager](Developer-API#PlatformPackager)&lt;any&gt;</code> | 
| **target**| <code>[Target](Developer-API#Target)</code> \| <code>null</code> | 
| file| <code>string</code> | 
| data| <code>Buffer</code> | 
| safeArtifactName| <code>string</code> | 
| publishConfig| <code>[PublishConfiguration](Publishing-Artifacts#PublishConfiguration)</code> | 

<a name="BuildInfo"></a>

### `BuildInfo`
**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **options**| <code>[PackagerOptions](#PackagerOptions)</code> | 
| **metadata**| <code>[Metadata](#Metadata)</code> | 
| **config**| <code>[Config](#Config)</code> | 
| **projectDir**| <code>string</code> | 
| **appDir**| <code>string</code> | 
| **electronVersion**| <code>string</code> | 
| **isTwoPackageJsonProjectLayoutUsed**| <code>boolean</code> | 
| **appInfo**| <code>[AppInfo](Developer-API#AppInfo)</code> | 
| **tempDirManager**| <code>[TmpDir](Developer-API#TmpDir)</code> | 
| **repositoryInfo**| <code>Promise&lt; \| [SourceRepositoryInfo](Developer-API#SourceRepositoryInfo)&gt;</code> | 
| **isPrepackedAppAsar**| <code>boolean</code> | 
| prepackaged| <code>string</code> \| <code>null</code> | 
| **cancellationToken**| <code>[CancellationToken](Developer-API#CancellationToken)</code> | 

<a name="BuildOptions"></a>

### `BuildOptions` ⇐ <code>[PublishOptions](Publishing-Artifacts#PublishOptions)</code>
**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Extends**: <code>[PublishOptions](Publishing-Artifacts#PublishOptions)</code>  
<a name="BuildResult"></a>

### `BuildResult`
**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **outDir**| <code>string</code> | 
| **platformToTargets**| <code>Map&lt;[Platform](Developer-API#Platform) \| Map&lt;String \| [Target](Developer-API#Target)&gt;&gt;</code> | 

<a name="CliOptions"></a>

### `CliOptions` ⇐ <code>[PublishOptions](Publishing-Artifacts#PublishOptions)</code>
**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Extends**: <code>[PublishOptions](Publishing-Artifacts#PublishOptions)</code>  
**Properties**

| Name | Type |
| --- | --- |
| mac| <code>Array&lt;string&gt;</code> | 
| linux| <code>Array&lt;string&gt;</code> | 
| win| <code>Array&lt;string&gt;</code> | 
| arch| <code>string</code> | 
| x64| <code>boolean</code> | 
| ia32| <code>boolean</code> | 
| armv7l| <code>boolean</code> | 
| dir| <code>boolean</code> | 
| platform| <code>string</code> | 
| project| <code>string</code> | 

<a name="Config"></a>

### `Config` ⇐ <code>[PlatformSpecificBuildOptions](Developer-API#PlatformSpecificBuildOptions)</code>
Configuration Options

**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Extends**: <code>[PlatformSpecificBuildOptions](Developer-API#PlatformSpecificBuildOptions)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| appId| <code>string</code> \| <code>null</code> | <a name="Config-appId"></a>The application id. Used as [CFBundleIdentifier](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070) for MacOS and as [Application User Model ID](https://msdn.microsoft.com/en-us/library/windows/desktop/dd378459(v=vs.85).aspx) for Windows (NSIS target only, Squirrel.Windows not supported).<br><br>Defaults to `com.electron.${name}`. It is strongly recommended that an explicit ID be set. |
| copyright| <code>string</code> \| <code>null</code> | <a name="Config-copyright"></a>The human-readable copyright line for the app. Defaults to `Copyright © year author`. |
| productName| <code>string</code> \| <code>null</code> | <a name="Config-productName"></a>As [name](#AppMetadata-name), but allows you to specify a product name for your executable which contains spaces and other special characters not allowed in the [name property](https://docs.npmjs.com/files/package.json#name}). |
| files| <code>Array&lt;string&gt;</code> \| <code>string</code> \| <code>null</code> | <a name="Config-files"></a>A [glob patterns](https://www.npmjs.com/package/glob#glob-primer) relative to the [app directory](#MetadataDirectories-app), which specifies which files to include when copying files to create the package. See: [File Patterns](#multiple-glob-patterns). |
| extraResources| <code>Array&lt;string \| [FilePattern](Developer-API#FilePattern)&gt;</code> \| <code>[FilePattern](Developer-API#FilePattern)</code> \| <code>string</code> \| <code>null</code> | <a name="Config-extraResources"></a>A [glob patterns](https://www.npmjs.com/package/glob#glob-primer) relative to the project directory, when specified, copy the file or directory with matching names directly into the app's resources directory (`Contents/Resources` for MacOS, `resources` for Linux/Windows).<br><br>Glob rules the same as for [files](#multiple-glob-patterns). |
| extraFiles| <code>Array&lt;string \| [FilePattern](Developer-API#FilePattern)&gt;</code> \| <code>[FilePattern](Developer-API#FilePattern)</code> \| <code>string</code> \| <code>null</code> | <a name="Config-extraFiles"></a>The same as [extraResources](#Config-extraResources) but copy into the app's content directory (`Contents` for MacOS, root directory for Linux/Windows). |
| asar = <code>true</code>| <code>[AsarOptions](Developer-API#AsarOptions)</code> \| <code>boolean</code> \| <code>null</code> | <a name="Config-asar"></a>Whether to package the application's source code into an archive, using [Electron's archive format](http://electron.atom.io/docs/tutorial/application-packaging/).<br><br>Node modules, that must be unpacked, will be detected automatically, you don't need to explicitly set [asarUnpack](#Config-asarUnpack) - please file issue if this doesn't work. |
| asarUnpack| <code>Array&lt;string&gt;</code> \| <code>string</code> \| <code>null</code> | <a name="Config-asarUnpack"></a>A [glob patterns](https://www.npmjs.com/package/glob#glob-primer) relative to the [app directory](#MetadataDirectories-app), which specifies which files to unpack when creating the [asar](http://electron.atom.io/docs/tutorial/application-packaging/) archive. |
| fileAssociations| <code>Array&lt;[FileAssociation](Developer-API#FileAssociation)&gt;</code> \| <code>[FileAssociation](Developer-API#FileAssociation)</code> | <a name="Config-fileAssociations"></a>File associations. |
| protocols| <code>Array&lt;[Protocol](Developer-API#Protocol)&gt;</code> \| <code>[Protocol](Developer-API#Protocol)</code> | <a name="Config-protocols"></a>URL protocol schemes. |
| compression = <code>normal</code>| <code>"store"</code> \| <code>"normal"</code> \| <code>"maximum"</code> \| <code>null</code> | <a name="Config-compression"></a>The compression level. If you want to rapidly test build, `store` can reduce build time significantly. |
| afterPack| <code>callback</code> | <a name="Config-afterPack"></a>*programmatic API only* The function to be run after pack (but before pack into distributable format and sign). Promise must be returned. |
| beforeBuild| <code>callback</code> | <a name="Config-beforeBuild"></a>*programmatic API only* The function to be run before dependencies are installed or rebuilt. Works when `npmRebuild` is set to `true`. Promise must be returned. Resolving to `false` will skip dependencies install or rebuild. |
| npmRebuild = <code>true</code>| <code>boolean</code> | <a name="Config-npmRebuild"></a>Whether to [rebuild](https://docs.npmjs.com/cli/rebuild) native dependencies (`npm rebuild`) before starting to package the app. |
| npmSkipBuildFromSource| <code>boolean</code> | <a name="Config-npmSkipBuildFromSource"></a>Whether to omit using [--build-from-source](https://github.com/mapbox/node-pre-gyp#options) flag when installing app native deps. |
| npmArgs| <code>Array&lt;string&gt;</code> \| <code>string</code> \| <code>null</code> | <a name="Config-npmArgs"></a>Additional command line arguments to use when installing app native deps. |
| nodeGypRebuild| <code>boolean</code> | <a name="Config-nodeGypRebuild"></a>Whether to execute `node-gyp rebuild` before starting to package the app. |
| electronDist| <code>string</code> | <a name="Config-electronDist"></a>The path to custom Electron build (e.g. `~/electron/out/R`). Only macOS supported, file issue if need for Linux or Windows. |
| electronDownload| <code>any</code> | <a name="Config-electronDownload"></a>The [electron-download](https://github.com/electron-userland/electron-download#usage) options. |
| publish| <code>null</code> \| <code>string</code> \| <code>[GithubOptions](Publishing-Artifacts#GithubOptions)</code> \| <code>[S3Options](Publishing-Artifacts#S3Options)</code> \| <code>[GenericServerOptions](Publishing-Artifacts#GenericServerOptions)</code> \| <code>[BintrayOptions](Publishing-Artifacts#BintrayOptions)</code> \| <code>Array</code> | <a name="Config-publish"></a>Array of option objects. Order is important — first item will be used as a default auto-update server on Windows (NSIS). See: [Publish options](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts#publish-options). |
| forceCodeSigning| <code>boolean</code> | <a name="Config-forceCodeSigning"></a>Whether to fail if application will be not signed (to prevent unsigned app if code signing configuration is not correct). |
| directories| <code>[MetadataDirectories](Developer-API#MetadataDirectories)</code> \| <code>null</code> | <a name="Config-directories"></a> |
| electronVersion| <code>string</code> \| <code>null</code> | <a name="Config-electronVersion"></a>The version of electron you are packaging for. Defaults to version of `electron`, `electron-prebuilt` or `electron-prebuilt-compile` dependency. |
| artifactName| <code>string</code> \| <code>null</code> | <a name="Config-artifactName"></a>The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern). Defaults to `${productName}-${version}.${ext}` (some target can have another defaults, see corresponding options).<br><br>Currently supported only for `mas`, `pkg`, `dmg` and `nsis`. |
| buildVersion| <code>string</code> \| <code>null</code> | <a name="Config-buildVersion"></a>The build version. Maps to the `CFBundleVersion` on macOS, and `FileVersion` metadata property on Windows. Defaults to the `version`. If `TRAVIS_BUILD_NUMBER` or `APPVEYOR_BUILD_NUMBER` or `CIRCLE_BUILD_NUM` or `BUILD_NUMBER` or `bamboo.buildNumber` env defined, it will be used as a build version (`version.build_number`). |
| mac| <code>[MacOptions](#MacOptions)</code> \| <code>null</code> | <a name="Config-mac"></a> |
| mas| <code>[MasBuildOptions](#MasBuildOptions)</code> \| <code>null</code> | <a name="Config-mas"></a> |
| dmg| <code>[DmgOptions](#DmgOptions)</code> \| <code>null</code> | <a name="Config-dmg"></a> |
| pkg| <code>[PkgOptions](#PkgOptions)</code> \| <code>null</code> | <a name="Config-pkg"></a> |
| win| <code>[WinBuildOptions](#WinBuildOptions)</code> \| <code>null</code> | <a name="Config-win"></a> |
| nsis| <code>[NsisOptions](#NsisOptions)</code> \| <code>null</code> | <a name="Config-nsis"></a> |
| nsisWeb| <code>[NsisWebOptions](#NsisWebOptions)</code> \| <code>null</code> | <a name="Config-nsisWeb"></a> |
| portable| <code>[NsisOptions](#NsisOptions)</code> \| <code>null</code> | <a name="Config-portable"></a> |
| appx| <code>[AppXOptions](#AppXOptions)</code> \| <code>null</code> | <a name="Config-appx"></a> |
| squirrelWindows| <code>[SquirrelWindowsOptions](#SquirrelWindowsOptions)</code> \| <code>null</code> | <a name="Config-squirrelWindows"></a> |
| linux| <code>[LinuxBuildOptions](#LinuxBuildOptions)</code> \| <code>null</code> | <a name="Config-linux"></a> |
| deb| <code>[DebOptions](#DebOptions)</code> \| <code>null</code> | <a name="Config-deb"></a> |
| snap| <code>[SnapOptions](#SnapOptions)</code> \| <code>null</code> | <a name="Config-snap"></a> |
| appimage| <code>[LinuxBuildOptions](#LinuxBuildOptions)</code> \| <code>null</code> | <a name="Config-appimage"></a> |
| pacman| <code>[LinuxBuildOptions](#LinuxBuildOptions)</code> \| <code>null</code> | <a name="Config-pacman"></a> |
| rpm| <code>[LinuxBuildOptions](#LinuxBuildOptions)</code> \| <code>null</code> | <a name="Config-rpm"></a> |
| freebsd| <code>[LinuxBuildOptions](#LinuxBuildOptions)</code> \| <code>null</code> | <a name="Config-freebsd"></a> |
| p5p| <code>[LinuxBuildOptions](#LinuxBuildOptions)</code> \| <code>null</code> | <a name="Config-p5p"></a> |
| apk| <code>[LinuxBuildOptions](#LinuxBuildOptions)</code> \| <code>null</code> | <a name="Config-apk"></a> |

<a name="DebOptions"></a>

### `DebOptions` ⇐ <code>[LinuxBuildOptions](#LinuxBuildOptions)</code>
Debian Package Specific Options

**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Extends**: <code>[LinuxBuildOptions](#LinuxBuildOptions)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| synopsis| <code>string</code> \| <code>null</code> | <a name="DebOptions-synopsis"></a>The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description). |
| compression = <code>xz</code>| <code>"gz"</code> \| <code>"bzip2"</code> \| <code>"xz"</code> \| <code>null</code> | <a name="DebOptions-compression"></a>The compression type. |
| priority| <code>string</code> \| <code>null</code> | <a name="DebOptions-priority"></a>The [Priority](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Priority) attribute. |

<a name="DmgContent"></a>

### `DmgContent`
**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| **x**| <code>number</code> | <a name="DmgContent-x"></a> |
| **y**| <code>number</code> | <a name="DmgContent-y"></a> |
| type| <code>"link"</code> \| <code>"file"</code> | <a name="DmgContent-type"></a> |
| name| <code>string</code> | <a name="DmgContent-name"></a>The name of the file within the DMG. Defaults to basename of `path`. |
| path| <code>string</code> | <a name="DmgContent-path"></a> |

<a name="DmgOptions"></a>

### `DmgOptions` ⇐ <code>[TargetSpecificOptions](Developer-API#TargetSpecificOptions)</code>
`dmg` macOS DMG Options

**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Extends**: <code>[TargetSpecificOptions](Developer-API#TargetSpecificOptions)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| background| <code>string</code> \| <code>null</code> | <a name="DmgOptions-background"></a>The path to background image (default: `build/background.tiff` or `build/background.png` if exists). The resolution of this file determines the resolution of the installer window. If background is not specified, use `window.size`. Default locations expected background size to be 540x380. See: [DMG with Retina background support](http://stackoverflow.com/a/11204769/1910191). |
| backgroundColor| <code>string</code> \| <code>null</code> | <a name="DmgOptions-backgroundColor"></a>The background color (accepts css colors). Defaults to `#ffffff` (white) if no background image. |
| icon| <code>string</code> \| <code>null</code> | <a name="DmgOptions-icon"></a>The path to DMG icon (volume icon), which will be shown when mounted, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. Defaults to the application icon (`build/icon.icns`). |
| iconSize = <code>80</code>| <code>number</code> \| <code>null</code> | <a name="DmgOptions-iconSize"></a>The size of all the icons inside the DMG. |
| iconTextSize = <code>12</code>| <code>number</code> \| <code>null</code> | <a name="DmgOptions-iconTextSize"></a>The size of all the icon texts inside the DMG. |
| title = <code>&quot;${productName} ${version}&quot;</code>| <code>string</code> \| <code>null</code> | <a name="DmgOptions-title"></a>The title of the produced DMG, which will be shown when mounted (volume name).<br><br>Macro `${productName}`, `${version}` and `${name}` are supported. |
| contents| <code>Array&lt;[DmgContent](#DmgContent)&gt;</code> | <a name="DmgOptions-contents"></a>The content — to customize icon locations. |
| format = <code>UDZO</code>| <code>"UDRW"</code> \| <code>"UDRO"</code> \| <code>"UDCO"</code> \| <code>"UDZO"</code> \| <code>"UDBZ"</code> \| <code>"ULFO"</code> | <a name="DmgOptions-format"></a>The disk image format. `ULFO` (lzfse-compressed image (OS X 10.11+ only)). |
| window| <code>[DmgWindow](#DmgWindow)</code> | <a name="DmgOptions-window"></a>The DMG windows position and size. See [dmg.window](#DmgWindow). |

**Example** *(change file icons location for DMG)*  
```js
{
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
<a name="DmgWindow"></a>

### `DmgWindow`
DMG Windows Position and Size

**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| x = <code>400</code>| <code>number</code> | <a name="DmgWindow-x"></a>The X position relative to left of the screen. |
| y = <code>100</code>| <code>number</code> | <a name="DmgWindow-y"></a>The Y position relative to top of the screen. |
| width| <code>number</code> | <a name="DmgWindow-width"></a>The width. Defaults to background image width or 540. |
| height| <code>number</code> | <a name="DmgWindow-height"></a>The height. Defaults to background image height or 380. |

<a name="LinuxBuildOptions"></a>

### `LinuxBuildOptions` ⇐ <code>[PlatformSpecificBuildOptions](Developer-API#PlatformSpecificBuildOptions)</code>
Linux Options

**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Extends**: <code>[PlatformSpecificBuildOptions](Developer-API#PlatformSpecificBuildOptions)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| category| <code>string</code> \| <code>null</code> | <a name="LinuxBuildOptions-category"></a>The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry). |
| packageCategory| <code>string</code> \| <code>null</code> | <a name="LinuxBuildOptions-packageCategory"></a>The [package category](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Section). Not applicable for AppImage. |
| description| <code>string</code> \| <code>null</code> | <a name="LinuxBuildOptions-description"></a>As [description](#AppMetadata-description) from application package.json, but allows you to specify different for Linux. |
| target = <code>AppImage</code>| <code>null</code> \| <code>string</code> \| <code>[TargetConfig](Developer-API#TargetConfig)</code> \| <code>Array</code> | <a name="LinuxBuildOptions-target"></a>Target package type: list of `AppImage`, `snap`, `deb`, `rpm`, `freebsd`, `pacman`, `p5p`, `apk`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`.<br><br>electron-builder [docker image](https://github.com/electron-userland/electron-builder/wiki/Docker) can be used to build Linux targets on any platform. See [Multi platform build](https://github.com/electron-userland/electron-builder/wiki/Multi-Platform-Build). See: [Please do not put an AppImage into another archive like a .zip or .tar.gz](https://github.com/probonopd/AppImageKit/wiki/Creating-AppImages#common-mistake) |
| maintainer| <code>string</code> \| <code>null</code> | <a name="LinuxBuildOptions-maintainer"></a>The maintainer. Defaults to [author](#AppMetadata-author). |
| vendor| <code>string</code> \| <code>null</code> | <a name="LinuxBuildOptions-vendor"></a>The vendor. Defaults to [author](#AppMetadata-author). |
| desktop| <code>Object&lt;string, any&gt;</code> \| <code>null</code> | <a name="LinuxBuildOptions-desktop"></a>The [Desktop file](https://developer.gnome.org/integration-guide/stable/desktop-files.html.en) entries (name to value). |
| afterInstall| <code>string</code> \| <code>null</code> | <a name="LinuxBuildOptions-afterInstall"></a> |
| afterRemove| <code>string</code> \| <code>null</code> | <a name="LinuxBuildOptions-afterRemove"></a> |
| depends| <code>Array&lt;string&gt;</code> \| <code>null</code> | <a name="LinuxBuildOptions-depends"></a>Package dependencies. Defaults to `["gconf2", "gconf-service", "libnotify4", "libappindicator1", "libxtst6", "libnss3"]` for `deb`. |
| executableName| <code>string</code> \| <code>null</code> | <a name="LinuxBuildOptions-executableName"></a>The executable name. Defaults to `productName`. Cannot be specified per target, allowed only in the `linux`. |
| icon| <code>string</code> | <a name="LinuxBuildOptions-icon"></a>The path to icon set directory, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. The icon filename must contain the size (e.g. 32x32.png) of the icon. By default will be generated automatically based on the macOS icns file. |

<a name="MacOptions"></a>

### `MacOptions` ⇐ <code>[PlatformSpecificBuildOptions](Developer-API#PlatformSpecificBuildOptions)</code>
macOS Options

**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Extends**: <code>[PlatformSpecificBuildOptions](Developer-API#PlatformSpecificBuildOptions)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| category| <code>string</code> \| <code>null</code> | <a name="MacOptions-category"></a>The application category type, as shown in the Finder via *View -> Arrange by Application Category* when viewing the Applications directory.<br><br>For example, `"category": "public.app-category.developer-tools"` will set the application category to *Developer Tools*.<br><br>Valid values are listed in [Apple's documentation](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html#//apple_ref/doc/uid/TP40009250-SW8). |
| target| <code>Array&lt;[TargetConfig](Developer-API#TargetConfig) \| "default" \| "dmg" \| "mas" \| "pkg" \| "7z" \| "zip" \| "tar.xz" \| "tar.lz" \| "tar.gz" \| "tar.bz2" \| "dir"&gt;</code> \| <code>"default"</code> \| <code>"dmg"</code> \| <code>"mas"</code> \| <code>"pkg"</code> \| <code>"7z"</code> \| <code>"zip"</code> \| <code>"tar.xz"</code> \| <code>"tar.lz"</code> \| <code>"tar.gz"</code> \| <code>"tar.bz2"</code> \| <code>"dir"</code> \| <code>[TargetConfig](Developer-API#TargetConfig)</code> \| <code>null</code> | <a name="MacOptions-target"></a>The target package type: list of `default`, `dmg`, `mas`, `pkg`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`. Defaults to `default` (dmg and zip for Squirrel.Mac). |
| identity| <code>string</code> \| <code>null</code> | <a name="MacOptions-identity"></a>The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](https://github.com/electron-userland/electron-builder/wiki/Code-Signing) instead of specifying this option. MAS installer identity is specified in the [mas](#MasBuildOptions-identity). |
| icon = <code>&quot;build/icon.icns&quot;</code>| <code>string</code> \| <code>null</code> | <a name="MacOptions-icon"></a>The path to application icon. |
| entitlements| <code>string</code> \| <code>null</code> | <a name="MacOptions-entitlements"></a>The path to entitlements file for signing the app. `build/entitlements.mac.plist` will be used if exists (it is a recommended way to set). MAS entitlements is specified in the [mas](#MasBuildOptions-entitlements). |
| entitlementsInherit| <code>string</code> \| <code>null</code> | <a name="MacOptions-entitlementsInherit"></a>The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mac.inherit.plist` will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.darwin.inherit.plist).<br><br>This option only applies when signing with `entitlements` provided. |
| bundleVersion| <code>string</code> \| <code>null</code> | <a name="MacOptions-bundleVersion"></a>The `CFBundleVersion`. Do not use it unless [you need to](see (https://github.com/electron-userland/electron-builder/issues/565#issuecomment-230678643)). |
| helperBundleId = <code>&quot;${appBundleIdentifier}.helper&quot;</code>| <code>string</code> \| <code>null</code> | <a name="MacOptions-helperBundleId"></a>The bundle identifier to use in the application helper's plist. |
| type = <code>distribution</code>| <code>"distribution"</code> \| <code>"development"</code> \| <code>null</code> | <a name="MacOptions-type"></a>Whether to sign app for development or for distribution. |
| extendInfo| <code>any</code> | <a name="MacOptions-extendInfo"></a>The extra entries for `Info.plist`. |

<a name="MasBuildOptions"></a>

### `MasBuildOptions` ⇐ <code>[MacOptions](#MacOptions)</code>
MAS (Mac Application Store) Options

**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Extends**: <code>[MacOptions](#MacOptions)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| entitlements| <code>string</code> \| <code>null</code> | <a name="MasBuildOptions-entitlements"></a>The path to entitlements file for signing the app. `build/entitlements.mas.plist` will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.plist). |
| entitlementsInherit| <code>string</code> \| <code>null</code> | <a name="MasBuildOptions-entitlementsInherit"></a>The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mas.inherit.plist` will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.inherit.plist). |

<a name="Metadata"></a>

### `Metadata`
Fields in the package.json
Some standard fields should be defined in the `package.json`.

**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| repository| <code>string</code> \| <code>[RepositoryInfo](Developer-API#RepositoryInfo)</code> \| <code>null</code> | <a name="Metadata-repository"></a> |
| dependencies| <code>Object&lt;string, any&gt;</code> | <a name="Metadata-dependencies"></a> |
| version| <code>string</code> | <a name="Metadata-version"></a> |
| **name**| <code>string</code> | <a name="Metadata-name"></a>The application name. |
| productName| <code>string</code> \| <code>null</code> | <a name="Metadata-productName"></a> |
| description| <code>string</code> | <a name="Metadata-description"></a>The application description. |
| main| <code>string</code> \| <code>null</code> | <a name="Metadata-main"></a> |
| author| <code>[AuthorMetadata](Developer-API#AuthorMetadata)</code> | <a name="Metadata-author"></a> |
| homepage| <code>string</code> \| <code>null</code> | <a name="Metadata-homepage"></a>The url to the project [homepage](https://docs.npmjs.com/files/package.json#homepage) (NuGet Package `projectUrl` (optional) or Linux Package URL (required)).<br><br>If not specified and your project repository is public on GitHub, it will be `https://github.com/${user}/${project}` by default. |
| license| <code>string</code> \| <code>null</code> | <a name="Metadata-license"></a>linux-only.* The [license](https://docs.npmjs.com/files/package.json#license) name. |
| build| <code>[Config](#Config)</code> | <a name="Metadata-build"></a> |

<a name="NsisOptions"></a>

### `NsisOptions`
NSIS specific options
See [NSIS target notes](https://github.com/electron-userland/electron-builder/wiki/NSIS).

**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| oneClick = <code>true</code>| <code>boolean</code> | <a name="NsisOptions-oneClick"></a>One-click installation. |
| perMachine| <code>boolean</code> | <a name="NsisOptions-perMachine"></a>If `oneClick` is `true` (default): Install per all users (per-machine).<br><br>If `oneClick` is `false`: no install mode installer page (choice per-machine or per-user), always install per-machine. |
| allowElevation = <code>true</code>| <code>boolean</code> | <a name="NsisOptions-allowElevation"></a>*boring installer only.* Allow requesting for elevation. If false, user will have to restart installer with elevated permissions. |
| allowToChangeInstallationDirectory| <code>boolean</code> | <a name="NsisOptions-allowToChangeInstallationDirectory"></a>*boring installer only.* Whether to allow user to change installation directory. |
| runAfterFinish = <code>true</code>| <code>boolean</code> | <a name="NsisOptions-runAfterFinish"></a>*one-click installer only.* Run application after finish. |
| guid| <code>string</code> \| <code>null</code> | <a name="NsisOptions-guid"></a>See [GUID vs Application Name](https://github.com/electron-userland/electron-builder/wiki/NSIS#guid-vs-application-name). |
| installerIcon| <code>string</code> \| <code>null</code> | <a name="NsisOptions-installerIcon"></a>The path to installer icon, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. Defaults to `build/installerIcon.ico` or application icon. |
| installerHeader = <code>&quot;build/installerHeader.bmp&quot;</code>| <code>string</code> \| <code>null</code> | <a name="NsisOptions-installerHeader"></a>*boring installer only.* `MUI_HEADERIMAGE`, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. |
| installerSidebar| <code>string</code> \| <code>null</code> | <a name="NsisOptions-installerSidebar"></a>*boring installer only.* `MUI_WELCOMEFINISHPAGE_BITMAP`, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. Defaults to `build/installerSidebar.bmp` or `${NSISDIR}\\Contrib\\Graphics\\Wizard\\nsis3-metro.bmp` |
| uninstallerSidebar| <code>string</code> \| <code>null</code> | <a name="NsisOptions-uninstallerSidebar"></a>*boring installer only.* `MUI_UNWELCOMEFINISHPAGE_BITMAP`, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. Defaults to `installerSidebar` option or `build/uninstallerSidebar.bmp` or `build/installerSidebar.bmp` or `${NSISDIR}\\Contrib\\Graphics\\Wizard\\nsis3-metro.bmp` |
| installerHeaderIcon| <code>string</code> \| <code>null</code> | <a name="NsisOptions-installerHeaderIcon"></a>*one-click installer only.* The path to header icon (above the progress bar), relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. Defaults to `build/installerHeaderIcon.ico` or application icon. |
| include| <code>string</code> \| <code>null</code> | <a name="NsisOptions-include"></a>The path to NSIS include script to customize installer. Defaults to `build/installer.nsh`. See [Custom NSIS script](https://github.com/electron-userland/electron-builder/wiki/NSIS#custom-nsis-script). |
| script| <code>string</code> \| <code>null</code> | <a name="NsisOptions-script"></a>The path to NSIS script to customize installer. Defaults to `build/installer.nsi`. See [Custom NSIS script](https://github.com/electron-userland/electron-builder/wiki/NSIS#custom-nsis-script). |
| license| <code>string</code> \| <code>null</code> | <a name="NsisOptions-license"></a>The path to EULA license file. Defaults to `license.rtf` or `license.txt` or `eula.rtf` or `eula.txt` (or uppercase variants, e.g. `EULA.txt` or `LICENSE.TXT`).<br><br>Multiple license files in different languages are supported — use lang postfix (e.g. `_de`, `_ru`)). For example, create files `license_de.txt` and `license_en.txt` in the build resources. If OS language is german, `license_de.txt` will be displayed. See map of [language code to name](https://github.com/meikidd/iso-639-1/blob/master/src/data.js).<br><br>Appropriate license file will be selected by user OS language. |
| language| <code>string</code> \| <code>null</code> | <a name="NsisOptions-language"></a>[LCID Dec](https://msdn.microsoft.com/en-au/goglobal/bb964664.aspx), defaults to `1033`(`English - United States`). |
| multiLanguageInstaller| <code>boolean</code> | <a name="NsisOptions-multiLanguageInstaller"></a>*boring installer only.* Whether to create multi-language installer. Defaults to `unicode` option value. [Not all strings are translated](https://github.com/electron-userland/electron-builder/issues/646#issuecomment-238155800). |
| warningsAsErrors = <code>true</code>| <code>boolean</code> | <a name="NsisOptions-warningsAsErrors"></a>If `warningsAsErrors` is `true` (default): NSIS will treat warnings as errors. If `warningsAsErrors` is `false`: NSIS will allow warnings. |
| menuCategory| <code>boolean</code> \| <code>string</code> | <a name="NsisOptions-menuCategory"></a>Whether to create submenu for start menu shortcut and program files directory. If `true`, company name will be used. Or string value. |
| artifactName| <code>string</code> \| <code>null</code> | <a name="NsisOptions-artifactName"></a>The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern). Defaults to `${productName} Setup ${version}.${ext}`. |
| unicode = <code>true</code>| <code>boolean</code> | <a name="NsisOptions-unicode"></a>Whether to create [Unicode installer](http://nsis.sourceforge.net/Docs/Chapter1.html#intro-unicode). |
| deleteAppDataOnUninstall| <code>boolean</code> | <a name="NsisOptions-deleteAppDataOnUninstall"></a>*one-click installer only.* Whether to delete app data on uninstall. |

<a name="NsisWebOptions"></a>

### `NsisWebOptions` ⇐ <code>[NsisOptions](#NsisOptions)</code>
Web Installer Specific Options

**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Extends**: <code>[NsisOptions](#NsisOptions)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| appPackageUrl| <code>string</code> \| <code>null</code> | <a name="NsisWebOptions-appPackageUrl"></a>The application package download URL. Optional — by default computed using publish configuration.<br><br>URL like `https://example.com/download/latest` allows web installer to be version independent (installer will download latest application package).<br><br>Custom `X-Arch` http header is set to `32` or `64`. |
| artifactName| <code>string</code> \| <code>null</code> | <a name="NsisWebOptions-artifactName"></a>The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern). Defaults to `${productName} Web Setup ${version}.${ext}`. |

<a name="PackagerOptions"></a>

### `PackagerOptions`
**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| targets| <code>Map&lt;[Platform](Developer-API#Platform) \| Map&lt;[Arch](Developer-API#Arch) \| Array&lt;string&gt;&gt;&gt;</code> | <a name="PackagerOptions-targets"></a> |
| projectDir| <code>string</code> \| <code>null</code> | <a name="PackagerOptions-projectDir"></a> |
| cscLink| <code>string</code> \| <code>null</code> | <a name="PackagerOptions-cscLink"></a> |
| cscKeyPassword| <code>string</code> \| <code>null</code> | <a name="PackagerOptions-cscKeyPassword"></a> |
| cscInstallerLink| <code>string</code> \| <code>null</code> | <a name="PackagerOptions-cscInstallerLink"></a> |
| cscInstallerKeyPassword| <code>string</code> \| <code>null</code> | <a name="PackagerOptions-cscInstallerKeyPassword"></a> |
| platformPackagerFactory| <code>module:electron-builder/out/packagerApi.__type</code> \| <code>null</code> | <a name="PackagerOptions-platformPackagerFactory"></a> |
| devMetadata| <code>[Metadata](#Metadata)</code> | <a name="PackagerOptions-devMetadata"></a>Deprecated: {tag.description} |
| config| <code>[Config](#Config)</code> \| <code>string</code> \| <code>null</code> | <a name="PackagerOptions-config"></a> |
| appMetadata| <code>[Metadata](#Metadata)</code> | <a name="PackagerOptions-appMetadata"></a>The same as [application package.json](https://github.com/electron-userland/electron-builder/wiki/Options#AppMetadata).<br><br>Application `package.json` will be still read, but options specified in this object will override. |
| effectiveOptionComputed| <code>callback</code> | <a name="PackagerOptions-effectiveOptionComputed"></a> |
| extraMetadata| <code>any</code> | <a name="PackagerOptions-extraMetadata"></a> |
| prepackaged| <code>string</code> | <a name="PackagerOptions-prepackaged"></a> |

<a name="PkgOptions"></a>

### `PkgOptions` ⇐ <code>[TargetSpecificOptions](Developer-API#TargetSpecificOptions)</code>
`pkg` macOS Product Archive Options

**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Extends**: <code>[TargetSpecificOptions](Developer-API#TargetSpecificOptions)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| scripts = <code>&quot;build/pkg-scripts&quot;</code>| <code>string</code> \| <code>null</code> | <a name="PkgOptions-scripts"></a>The scripts directory, relative to `build` (build resources directory). The scripts can be in any language so long as the files are marked executable and have the appropriate shebang indicating the path to the interpreter. Scripts are required to be executable (`chmod +x file`). See: [Scripting in installer packages](http://macinstallers.blogspot.de/2012/07/scripting-in-installer-packages.html). |
| installLocation = <code>&quot;/Applications&quot;</code>| <code>string</code> \| <code>null</code> | <a name="PkgOptions-installLocation"></a>The install location. |
| identity| <code>string</code> \| <code>null</code> | <a name="PkgOptions-identity"></a> |

<a name="SnapOptions"></a>

### `SnapOptions` ⇐ <code>[LinuxBuildOptions](#LinuxBuildOptions)</code>
[Snap](http://snapcraft.io) Options

**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Extends**: <code>[LinuxBuildOptions](#LinuxBuildOptions)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| confinement = <code>strict</code>| <code>"devmode"</code> \| <code>"strict"</code> \| <code>"classic"</code> \| <code>null</code> | <a name="SnapOptions-confinement"></a>The type of [confinement](https://snapcraft.io/docs/reference/confinement) supported by the snap. |
| summary| <code>string</code> \| <code>null</code> | <a name="SnapOptions-summary"></a>The 78 character long summary. Defaults to [productName](#AppMetadata-productName). |
| grade = <code>stable</code>| <code>"devel"</code> \| <code>"stable"</code> \| <code>null</code> | <a name="SnapOptions-grade"></a>The quality grade of the snap. It can be either `devel` (i.e. a development version of the snap, so not to be published to the “stable” or “candidate” channels) or “stable” (i.e. a stable release or release candidate, which can be released to all channels). |
| assumes| <code>Array&lt;string&gt;</code> \| <code>null</code> | <a name="SnapOptions-assumes"></a>The list of features that must be supported by the core in order for this snap to install. |
| stagePackages| <code>Array&lt;string&gt;</code> \| <code>null</code> | <a name="SnapOptions-stagePackages"></a>The list of Ubuntu packages to use that are needed to support the `app` part creation. Like `depends` for `deb`. Defaults to `["libnotify4", "libappindicator1", "libxtst6", "libnss3", "libxss1", "fontconfig-config", "gconf2", "libasound2", "pulseaudio"]`.<br><br>If list contains `default`, it will be replaced to default list, so, `["default", "foo"]` can be used to add custom package `foo` in addition to defaults. |
| plugs| <code>Array&lt;string&gt;</code> \| <code>null</code> | <a name="SnapOptions-plugs"></a>The list of [plugs](https://snapcraft.io/docs/reference/interfaces). Defaults to `["home", "x11", "unity7", "browser-support", "network", "gsettings", "pulseaudio", "opengl"]`.<br><br>If list contains `default`, it will be replaced to default list, so, `["default", "foo"]` can be used to add custom plug `foo` in addition to defaults. |
| ubuntuAppPlatformContent| <code>string</code> \| <code>null</code> | <a name="SnapOptions-ubuntuAppPlatformContent"></a>Specify `ubuntu-app-platform1` to use [ubuntu-app-platform](https://insights.ubuntu.com/2016/11/17/how-to-create-snap-packages-on-qt-applications/). Snap size will be greatly reduced, but it is not recommended for now because "the snaps must be connected before running uitk-gallery for the first time". |

<a name="SquirrelWindowsOptions"></a>

### `SquirrelWindowsOptions` ⇐ <code>[WinBuildOptions](#WinBuildOptions)</code>
Squirrel.Windows Options.
To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency. Squirrel.Windows target is maintained, but deprecated. Please use `nsis` instead.

**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Extends**: <code>[WinBuildOptions](#WinBuildOptions)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| iconUrl| <code>string</code> \| <code>null</code> | <a name="SquirrelWindowsOptions-iconUrl"></a>A URL to an ICO file to use as the application icon (displayed in Control Panel > Programs and Features). Defaults to the Electron icon.<br><br>Please note — [local icon file url is not accepted](https://github.com/atom/grunt-electron-installer/issues/73), must be https/http.<br><br>If you don't plan to build windows installer, you can omit it. If your project repository is public on GitHub, it will be `https://github.com/${u}/${p}/blob/master/build/icon.ico?raw=true` by default. |
| loadingGif| <code>string</code> \| <code>null</code> | <a name="SquirrelWindowsOptions-loadingGif"></a>The path to a .gif file to display during install. `build/install-spinner.gif` will be used if exists (it is a recommended way to set) (otherwise [default](https://github.com/electron/windows-installer/blob/master/resources/install-spinner.gif)). |
| msi| <code>boolean</code> | <a name="SquirrelWindowsOptions-msi"></a>Whether to create an MSI installer. Defaults to `false` (MSI is not created). |
| remoteReleases| <code>string</code> \| <code>boolean</code> \| <code>null</code> | <a name="SquirrelWindowsOptions-remoteReleases"></a>A URL to your existing updates. Or `true` to automatically set to your GitHub repository. If given, these will be downloaded to create delta updates. |
| remoteToken| <code>string</code> \| <code>null</code> | <a name="SquirrelWindowsOptions-remoteToken"></a>Authentication token for remote updates |
| useAppIdAsId| <code>boolean</code> | <a name="SquirrelWindowsOptions-useAppIdAsId"></a>Use `appId` to identify package instead of `name`. |

<a name="WinBuildOptions"></a>

### `WinBuildOptions` ⇐ <code>[PlatformSpecificBuildOptions](Developer-API#PlatformSpecificBuildOptions)</code>
Windows Specific Options

**Kind**: interface of <code>[electron-builder](#module_electron-builder)</code>  
**Extends**: <code>[PlatformSpecificBuildOptions](Developer-API#PlatformSpecificBuildOptions)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| target| <code>null</code> \| <code>string</code> \| <code>[TargetConfig](Developer-API#TargetConfig)</code> \| <code>Array</code> | <a name="WinBuildOptions-target"></a>Target package type: list of `nsis`, `nsis-web` (Web installer), `portable` (portable app without installation), `appx`, `squirrel`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`. Defaults to `nsis`. AppX package can be built only on Windows 10.<br><br>To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency. |
| signingHashAlgorithms| <code>Array&lt;"sha1" \| "sha256"&gt;</code> \| <code>null</code> | <a name="WinBuildOptions-signingHashAlgorithms"></a>Array of signing algorithms used. Defaults to `['sha1', 'sha256']`<br><br>For AppX `sha256` is always used. |
| icon = <code>&quot;build/icon.ico&quot;</code>| <code>string</code> \| <code>null</code> | <a name="WinBuildOptions-icon"></a>The path to application icon. |
| legalTrademarks| <code>string</code> \| <code>null</code> | <a name="WinBuildOptions-legalTrademarks"></a>The trademarks and registered trademarks. |
| certificateFile| <code>string</code> | <a name="WinBuildOptions-certificateFile"></a>The path to the *.pfx certificate you want to sign with. Please use it only if you cannot use env variable `CSC_LINK` (`WIN_CSC_LINK`) for some reason. Please see [Code Signing](https://github.com/electron-userland/electron-builder/wiki/Code-Signing). |
| certificatePassword| <code>string</code> | <a name="WinBuildOptions-certificatePassword"></a>The password to the certificate provided in `certificateFile`. Please use it only if you cannot use env variable `CSC_KEY_PASSWORD` (`WIN_CSC_KEY_PASSWORD`) for some reason. Please see [Code Signing](https://github.com/electron-userland/electron-builder/wiki/Code-Signing). |
| certificateSubjectName| <code>string</code> | <a name="WinBuildOptions-certificateSubjectName"></a>The name of the subject of the signing certificate. Required only for EV Code Signing and works only on Windows. |
| certificateSha1| <code>string</code> | <a name="WinBuildOptions-certificateSha1"></a>The SHA1 hash of the signing certificate. The SHA1 hash is commonly specified when multiple certificates satisfy the criteria specified by the remaining switches. Works only on Windows. |
| rfc3161TimeStampServer| <code>string</code> | <a name="WinBuildOptions-rfc3161TimeStampServer"></a>The URL of the RFC 3161 time stamp server. Defaults to `http://timestamp.comodoca.com/rfc3161`. |
| timeStampServer| <code>string</code> | <a name="WinBuildOptions-timeStampServer"></a>The URL of the time stamp server. Defaults to `http://timestamp.verisign.com/scripts/timstamp.dll`. |
| publisherName| <code>string</code> \| <code>Array&lt;string&gt;</code> \| <code>null</code> | <a name="WinBuildOptions-publisherName"></a>[The publisher name](https://github.com/electron-userland/electron-builder/issues/1187#issuecomment-278972073), exactly as in your code signed certificate. Several names can be provided. Defaults to common name from your code signing certificate. |

<a name="Packager"></a>

### Packager ⇐ <code>[BuildInfo](#BuildInfo)</code>
**Kind**: class of <code>[electron-builder](#module_electron-builder)</code>  
**Extends**: <code>[BuildInfo](#BuildInfo)</code>  
<a name="module_electron-builder.build"></a>

### `electron-builder.build(rawOptions)` ⇒ <code>Promise&lt;Array&lt;string&gt;&gt;</code>
**Kind**: method of <code>[electron-builder](#module_electron-builder)</code>  

| Param | Type |
| --- | --- |
| rawOptions | <code>[CliOptions](#CliOptions)</code> | 

<a name="module_electron-builder.createTargets"></a>

### `electron-builder.createTargets(platforms, type, arch)` ⇒ <code>Map&lt;[Platform](Developer-API#Platform) &#124; Map&lt;[Arch](Developer-API#Arch) &#124; Array&lt;string&gt;&gt;&gt;</code>
**Kind**: method of <code>[electron-builder](#module_electron-builder)</code>  

| Param | Type |
| --- | --- |
| platforms | <code>Array&lt;[Platform](Developer-API#Platform)&gt;</code> | 
| type | <code>string</code> &#124; <code>null</code> | 
| arch | <code>string</code> &#124; <code>null</code> | 


<!-- end of generated block -->