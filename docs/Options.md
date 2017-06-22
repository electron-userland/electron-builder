electron-builder [configuration](#Config) can be defined 
* in the `package.json` file of your project using the `build` key on the top level:
   ```json
   "build": {
     "appId": "com.example.app"
   }
   ```
* or through the `--config <path/to/yml-or-json5-or-toml>` option (defaults to `electron-builder.yml` (or `json`, or [json5](http://json5.org), or [toml](https://github.com/toml-lang/toml))).
   ```yaml
   appId: "com.example.app"
   ```

See [Config](#Config). Or [config json schema](http://electron-userland.github.io/electron-builder/) viewer (experimental).

If you want to use [toml](), please install `yarn add toml --dev`.

Most of the options accept `null` — for example, to explicitly set that DMG icon must be default volume icon from the OS and default rules must be not applied (i.e. use application icon as DMG icon), set `dmg.icon` to `null`.

## File Patterns

* `*` Matches 0 or more characters in a single path portion
* `?` Matches 1 character
* `[...]` Matches a range of characters, similar to a RegExp range.
  If the first character of the range is `!` or `^` then it matches
  any character not in the range.
* `!(pattern|pattern|pattern)` Matches anything that does not match
  any of the patterns provided.
* `?(pattern|pattern|pattern)` Matches zero or one occurrence of the
  patterns provided.
* `+(pattern|pattern|pattern)` Matches one or more occurrences of the
  patterns provided.
* `*(a|b|c)` Matches zero or more occurrences of the patterns provided
* `@(pattern|pat*|pat?erN)` Matches exactly one of the patterns
  provided
* `**` If a "globstar" is alone in a path portion, then it matches
  zero or more directories and subdirectories searching for matches.
  It does not crawl symlinked directories.

Hidden files are not ignored by default, but all files that should be ignored, are [ignored by default](#default-file-pattern).

If directory matched, all contents are copied. So, you can just specify `foo` to copy `foo` directory.

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
 
### Excluding Directories
 
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
* Any property of [AppInfo](https://github.com/electron-userland/electron-builder/wiki/electron-builder#AppInfo) (e.g. `buildVersion`, `buildNumber`).

### Default File Pattern

[files](#Config-files) defaults to:
* `**/*`
* `!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme,test,__tests__,tests,powered-test,example,examples,*.d.ts}`
* `!**/node_modules/.bin`
* `!**/*.{o,hprof,orig,pyc,pyo,rbc}`
* `!**/._*`
* `!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,__pycache__,thumbs.db,.gitignore,.gitattributes,.editorconfig,.flowconfig,.yarn-metadata.json,.idea,.vs,appveyor.yml,.travis.yml,circle.yml,npm-debug.log,.nyc_output,yarn.lock,.yarn-integrity}`

## Artifact File Name Pattern

`${ext}` macro is supported in addition to [file macros](#file-macros).

## How to Read Docs

* Name of optional property is normal, **required** is bold.
* Type is specified after property name: `Array<String> | String`. Union like this means that you can specify or string (`**/*`), or array of strings (`["**/*", "!foo.js"]`).

<!-- do not edit. start of generated block -->
<a name="Config"></a>
## `Config` ⇐ <code>[PlatformSpecificBuildOptions](electron-builder#PlatformSpecificBuildOptions)</code>
Configuration Options

**Kind**: interface of [<code>electron-builder</code>](#module_electron-builder)  
**Extends**: <code>[PlatformSpecificBuildOptions](electron-builder#PlatformSpecificBuildOptions)</code>  
**Properties**
* <a name="Config-appId"></a>`appId` = `com.electron.${name}` String - The application id. Used as [CFBundleIdentifier](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070) for MacOS and as [Application User Model ID](https://msdn.microsoft.com/en-us/library/windows/desktop/dd378459(v=vs.85).aspx) for Windows (NSIS target only, Squirrel.Windows not supported). It is strongly recommended that an explicit ID be set.
* <a name="Config-productName"></a>`productName` String - As [name](#Metadata-name), but allows you to specify a product name for your executable which contains spaces and other special characters not allowed in the [name property](https://docs.npmjs.com/files/package.json#name}).
* <a name="Config-artifactName"></a>`artifactName` String - The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern). Defaults to `${productName}-${version}.${ext}` (some target can have another defaults, see corresponding options).
* <a name="Config-asar"></a>`asar` = `true` Boolean | [AsarOptions](#AsarOptions)<a name="AsarOptions"></a> - Whether to package the application's source code into an archive, using [Electron's archive format](http://electron.atom.io/docs/tutorial/application-packaging/).
  
  Node modules, that must be unpacked, will be detected automatically, you don't need to explicitly set [asarUnpack](#Config-asarUnpack) - please file issue if this doesn't work.
  * <a name="AsarOptions-smartUnpack"></a>`smartUnpack` = `true` Boolean - Whether to automatically unpack executables files.
  * <a name="AsarOptions-ordering"></a>`ordering` String
* <a name="Config-asarUnpack"></a>`asarUnpack` Array&lt;String&gt; | String - A [glob patterns](#file-patterns) relative to the [app directory](#MetadataDirectories-app), which specifies which files to unpack when creating the [asar](http://electron.atom.io/docs/tutorial/application-packaging/) archive.
* <a name="Config-compression"></a>`compression` = `normal` "store" | "normal" | "maximum" - The compression level. If you want to rapidly test build, `store` can reduce build time significantly.
* <a name="Config-copyright"></a>`copyright` = `Copyright © year ${author}` String - The human-readable copyright line for the app.
* <a name="Config-directories"></a>`directories`<a name="MetadataDirectories"></a>
  * <a name="MetadataDirectories-buildResources"></a>`buildResources` = `build` String - The path to build resources.
  * <a name="MetadataDirectories-output"></a>`output` = `dist` String - The output directory.
  * <a name="MetadataDirectories-app"></a>`app` String - The application directory (containing the application package.json), defaults to `app`, `www` or working directory.
* <a name="Config-files"></a>`files` Array&lt;String&gt; | String - A [glob patterns](#file-patterns) relative to the [app directory](#MetadataDirectories-app), which specifies which files to include when copying files to create the package.
  
  Development dependencies are never copied in any case. You don't need to ignore it explicitly.
  
  Default pattern `**/*` **is not added to your custom** if some of your patterns is not ignore (i.e. not starts with `!`). `package.json` and `**/node_modules/**/*` (only production dependencies will be copied) is added to your custom in any case. All [default ignores](#default-file-pattern) are added in any case — you don't need to repeat it if you configure own patterns.
  
  May be specified in the platform options (e.g. in the [mac](#MacOptions)).
* <a name="Config-extraResources"></a>`extraResources` Array&lt;String | [FilePattern](#FilePattern)&gt; | [FilePattern](#FilePattern) | String<a name="FilePattern"></a> - A [glob patterns](#file-patterns) relative to the project directory, when specified, copy the file or directory with matching names directly into the app's resources directory (`Contents/Resources` for MacOS, `resources` for Linux/Windows).
  
  Glob rules the same as for [files](#multiple-glob-patterns).
  
  You may also specify custom source and destination directories by using JSON objects instead of simple glob patterns. Note this only works for [extraFiles](#Config-extraFiles) and [extraResources](#Config-extraResources).
  
  ```json
   [
     {
       "from": "path/to/source",
       "to": "path/to/destination",
       "filter": ["**/*", "!foo/*.js"]
     }
   ]
   ```
  
  `from` and `to` can be files and you can use this to [rename](https://github.com/electron-userland/electron-builder/issues/1119) a file while packaging.
  
  You can use [file macros](#file-macros) in the `from` and `to` fields as well.
  * <a name="FilePattern-from"></a>`from` String - The source path relative to the project directory.
  * <a name="FilePattern-to"></a>`to` String - The destination path relative to the app's content directory for `extraFiles` and the app's resource directory for `extraResources`.
  * <a name="FilePattern-filter"></a>`filter` Array&lt;String&gt; | String - The [glob patterns](#file-patterns).
* <a name="Config-extraFiles"></a>`extraFiles` Array&lt;String | [FilePattern](#FilePattern)&gt; | [FilePattern](#FilePattern) | String - The same as [extraResources](#Config-extraResources) but copy into the app's content directory (`Contents` for MacOS, root directory for Linux/Windows).
* <a name="Config-fileAssociations"></a>`fileAssociations` Array&lt;[FileAssociation](#FileAssociation)&gt; | [FileAssociation](#FileAssociation)<a name="FileAssociation"></a> - The file associations.
  * <a name="FileAssociation-ext"></a>**`ext`** String | Array&lt;String&gt; - The extension (minus the leading period). e.g. `png`.
  * <a name="FileAssociation-name"></a>`name` String - The name. e.g. `PNG`. Defaults to `ext`.
  * <a name="FileAssociation-description"></a>`description` String - *windows-only.* The description.
  * <a name="FileAssociation-icon"></a>`icon` String - The path to icon (`.icns` for MacOS and `.ico` for Windows), relative to `build` (build resources directory). Defaults to `${firstExt}.icns`/`${firstExt}.ico` (if several extensions specified, first is used) or to application icon.
  * <a name="FileAssociation-role"></a>`role` = `Editor` String - *macOS-only* The app’s role with respect to the type. The value can be `Editor`, `Viewer`, `Shell`, or `None`. Corresponds to `CFBundleTypeRole`.
  * <a name="FileAssociation-isPackage"></a>`isPackage` Boolean - *macOS-only* Whether the document is distributed as a bundle. If set to true, the bundle directory is treated as a file. Corresponds to `LSTypeIsPackage`.
* <a name="Config-protocols"></a>`protocols` Array&lt;[Protocol](#Protocol)&gt; | [Protocol](#Protocol)<a name="Protocol"></a> - The URL protocol schemes.
  * <a name="Protocol-name"></a>**`name`** String - The name. e.g. `IRC server URL`.
  * <a name="Protocol-schemes"></a>**`schemes`** Array&lt;String&gt; - The schemes. e.g. `["irc", "ircs"]`.
  * <a name="Protocol-role"></a>`role` = `Editor` "Editor" | "Viewer" | "Shell" | "None" - *macOS-only* The app’s role with respect to the type.
* <a name="Config-electronCompile"></a>`electronCompile` Boolean - Whether to use [electron-compile](http://github.com/electron/electron-compile) to compile app. Defaults to `true` if `electron-compile` in the dependencies. And `false` if in the `devDependencies` or doesn't specified.
* <a name="Config-electronDist"></a>`electronDist` String - The path to custom Electron build (e.g. `~/electron/out/R`).
* <a name="Config-electronDownload"></a>`electronDownload`<a name="ElectronDownloadOptions"></a> - The [electron-download](https://github.com/electron-userland/electron-download#usage) options.
  * <a name="ElectronDownloadOptions-cache"></a>`cache` String - The [cache location](https://github.com/electron-userland/electron-download#cache-location).
  * <a name="ElectronDownloadOptions-mirror"></a>`mirror` String - The mirror.
  * <a name="ElectronDownloadOptions-customDir"></a>`customDir` String
  * <a name="ElectronDownloadOptions-customFilename"></a>`customFilename` String
  * <a name="ElectronDownloadOptions-quiet"></a>`quiet` Boolean
  * <a name="ElectronDownloadOptions-strictSSL"></a>`strictSSL` Boolean
  * <a name="ElectronDownloadOptions-verifyChecksum"></a>`verifyChecksum` Boolean
  * <a name="ElectronDownloadOptions-force"></a>`force` Boolean
  * <a name="ElectronDownloadOptions-symbols"></a>`symbols` Boolean
  * <a name="ElectronDownloadOptions-mksnapshot"></a>`mksnapshot` Boolean
  * <a name="ElectronDownloadOptions-ffmpeg"></a>`ffmpeg` Boolean
  * <a name="ElectronDownloadOptions-dsym"></a>`dsym` Boolean
* <a name="Config-electronVersion"></a>`electronVersion` String - The version of electron you are packaging for. Defaults to version of `electron`, `electron-prebuilt` or `electron-prebuilt-compile` dependency.
* <a name="Config-extends"></a>`extends` String - The name of a built-in configuration preset or path to config file (relative to project dir). Currently, only `react-cra` is supported.
  
  If `react-scripts` in the app dev dependencies, `react-cra` will be set automatically. Set to `null` to disable automatic detection.
* <a name="Config-extraMetadata"></a>`extraMetadata` any - Inject properties to `package.json`.
* <a name="Config-forceCodeSigning"></a>`forceCodeSigning` = `false` Boolean - Whether to fail if application will be not signed (to prevent unsigned app if code signing configuration is not correct).
* <a name="Config-muonVersion"></a>`muonVersion` String - The version of muon you are packaging for.
* <a name="Config-nodeGypRebuild"></a>`nodeGypRebuild` = `false` Boolean - Whether to execute `node-gyp rebuild` before starting to package the app.
* <a name="Config-npmArgs"></a>`npmArgs` Array&lt;String&gt; | String - Additional command line arguments to use when installing app native deps.
* <a name="Config-npmRebuild"></a>`npmRebuild` = `true` Boolean - Whether to [rebuild](https://docs.npmjs.com/cli/rebuild) native dependencies (`npm rebuild`) before starting to package the app.
* <a name="Config-npmSkipBuildFromSource"></a>`npmSkipBuildFromSource` = `false` Boolean - Whether to omit using [--build-from-source](https://github.com/mapbox/node-pre-gyp#options) flag when installing app native deps.
* <a name="Config-publish"></a>`publish` String | [GithubOptions](Publishing-Artifacts#GithubOptions) | [S3Options](Publishing-Artifacts#S3Options) | [GenericServerOptions](Publishing-Artifacts#GenericServerOptions) | [BintrayOptions](Publishing-Artifacts#BintrayOptions) | Array - The [publish configuration](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts#publish-options). Order is important — first item will be used as a default auto-update server.
  
  If `GH_TOKEN` is set — defaults to `[{provider: "github"}]`.
  
  If `BT_TOKEN` is set and `GH_TOKEN` is not set — defaults to `[{provider: "bintray"}]`.
* <a name="Config-releaseInfo"></a>`releaseInfo`<a name="ReleaseInfo"></a> - The release info. Intended for command line usage (`-c.releaseInfo.releaseNotes="new features"`) or programmatically.
  * <a name="ReleaseInfo-releaseName"></a>`releaseName` String - The release name.
  * <a name="ReleaseInfo-releaseNotes"></a>`releaseNotes` String - The release notes.
  * <a name="ReleaseInfo-releaseNotesFile"></a>`releaseNotesFile` String - The path to release notes file. Defaults to `release-notes.md` in the [build resources](#MetadataDirectories-buildResources).
  * <a name="ReleaseInfo-releaseDate"></a>`releaseDate` String - The release date.
* <a name="Config-buildVersion"></a>`buildVersion` String - The build version. Maps to the `CFBundleVersion` on macOS, and `FileVersion` metadata property on Windows. Defaults to the `version`. If `TRAVIS_BUILD_NUMBER` or `APPVEYOR_BUILD_NUMBER` or `CIRCLE_BUILD_NUM` or `BUILD_NUMBER` or `bamboo.buildNumber` env defined, it will be used as a build version (`version.build_number`).
* <a name="Config-detectUpdateChannel"></a>`detectUpdateChannel` = `true` Boolean - Whether to infer update channel from application version prerelease components. e.g. if version `0.12.1-alpha.1`, channel will be set to `alpha`. Otherwise to `latest`.
* <a name="Config-mac"></a>`mac`<a name="MacOptions"></a> - macOS options.
  * <a name="MacOptions-category"></a>`category` String - The application category type, as shown in the Finder via *View -> Arrange by Application Category* when viewing the Applications directory.
    
    For example, `"category": "public.app-category.developer-tools"` will set the application category to *Developer Tools*.
    
    Valid values are listed in [Apple's documentation](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html#//apple_ref/doc/uid/TP40009250-SW8).
  * <a name="MacOptions-target"></a>`target` Array&lt;[TargetConfig](electron-builder#TargetConfig) | "default" | "dmg" | "mas" | "mas-dev" | "pkg" | "7z" | "zip" | "tar.xz" | "tar.lz" | "tar.gz" | "tar.bz2" | "dir"&gt; | "default" | "dmg" | "mas" | "mas-dev" | "pkg" | "7z" | "zip" | "tar.xz" | "tar.lz" | "tar.gz" | "tar.bz2" | "dir" | [TargetConfig](electron-builder#TargetConfig) - The target package type: list of `default`, `dmg`, `mas`, `pkg`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`. Defaults to `default` (dmg and zip for Squirrel.Mac).
  * <a name="MacOptions-identity"></a>`identity` String - The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](https://github.com/electron-userland/electron-builder/wiki/Code-Signing) instead of specifying this option. MAS installer identity is specified in the [mas](#MasBuildOptions-identity).
  * <a name="MacOptions-icon"></a>`icon` = `build/icon.icns` String - The path to application icon.
  * <a name="MacOptions-entitlements"></a>`entitlements` String - The path to entitlements file for signing the app. `build/entitlements.mac.plist` will be used if exists (it is a recommended way to set). MAS entitlements is specified in the [mas](#MasBuildOptions-entitlements).
  * <a name="MacOptions-entitlementsInherit"></a>`entitlementsInherit` String - The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mac.inherit.plist` will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.darwin.inherit.plist).
    
    This option only applies when signing with `entitlements` provided.
  * <a name="MacOptions-bundleVersion"></a>`bundleVersion` String - The `CFBundleVersion`. Do not use it unless [you need to](https://github.com/electron-userland/electron-builder/issues/565#issuecomment-230678643).
  * <a name="MacOptions-helperBundleId"></a>`helperBundleId` = `${appBundleIdentifier}.helper` String - The bundle identifier to use in the application helper's plist.
  * <a name="MacOptions-type"></a>`type` = `distribution` "distribution" | "development" - Whether to sign app for development or for distribution.
  * <a name="MacOptions-extendInfo"></a>`extendInfo` any - The extra entries for `Info.plist`.
  * <a name="MacOptions-binaries"></a>`binaries` Array&lt;String&gt; - Paths of any extra binaries that need to be signed.
  * <a name="MacOptions-requirements"></a>`requirements` String - Path of [requirements file](https://developer.apple.com/library/mac/documentation/Security/Conceptual/CodeSigningGuide/RequirementLang/RequirementLang.html) used in signing. Not applicable for MAS.
* <a name="Config-mas"></a>`mas`<a name="MasBuildOptions"></a> - MAS (Mac Application Store) options.
  Inherits [MacOptions](#MacOptions) options.
  * <a name="MasBuildOptions-entitlements"></a>`entitlements` String - The path to entitlements file for signing the app. `build/entitlements.mas.plist` will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.plist).
  * <a name="MasBuildOptions-entitlementsInherit"></a>`entitlementsInherit` String - The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mas.inherit.plist` will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.inherit.plist).
  * <a name="MasBuildOptions-binaries"></a>`binaries` Array&lt;String&gt; - Paths of any extra binaries that need to be signed.
* <a name="Config-dmg"></a>`dmg`<a name="DmgOptions"></a> - macOS DMG options.
  
  To add license to DMG, create file `license_LANG_CODE.txt` in the build resources. Multiple license files in different languages are supported — use lang postfix (e.g. `_de`, `_ru`)). For example, create files `license_de.txt` and `license_en.txt` in the build resources. If OS language is german, `license_de.txt` will be displayed. See map of [language code to name](https://github.com/meikidd/iso-639-1/blob/master/src/data.js).
  * <a name="DmgOptions-background"></a>`background` String - The path to background image (default: `build/background.tiff` or `build/background.png` if exists). The resolution of this file determines the resolution of the installer window. If background is not specified, use `window.size`. Default locations expected background size to be 540x380. See: [DMG with Retina background support](http://stackoverflow.com/a/11204769/1910191).
  * <a name="DmgOptions-backgroundColor"></a>`backgroundColor` String - The background color (accepts css colors). Defaults to `#ffffff` (white) if no background image.
  * <a name="DmgOptions-icon"></a>`icon` String - The path to DMG icon (volume icon), which will be shown when mounted, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. Defaults to the application icon (`build/icon.icns`).
  * <a name="DmgOptions-iconSize"></a>`iconSize` = `80` Number - The size of all the icons inside the DMG.
  * <a name="DmgOptions-iconTextSize"></a>`iconTextSize` = `12` Number - The size of all the icon texts inside the DMG.
  * <a name="DmgOptions-title"></a>`title` = `${productName} ${version}` String - The title of the produced DMG, which will be shown when mounted (volume name).
    
    Macro `${productName}`, `${version}` and `${name}` are supported.
  * <a name="DmgOptions-contents"></a>`contents` Array&lt;[DmgContent](#DmgContent)&gt; - The content — to customize icon locations.
  * <a name="DmgOptions-format"></a>`format` = `UDZO` "UDRW" | "UDRO" | "UDCO" | "UDZO" | "UDBZ" | "ULFO" - The disk image format. `ULFO` (lzfse-compressed image (OS X 10.11+ only)).
  * <a name="DmgOptions-window"></a>`window`<a name="DmgWindow"></a> - The DMG windows position and size.
    * <a name="DmgWindow-x"></a>`x` = `400` Number - The X position relative to left of the screen.
    * <a name="DmgWindow-y"></a>`y` = `100` Number - The Y position relative to top of the screen.
    * <a name="DmgWindow-width"></a>`width` Number - The width. Defaults to background image width or 540.
    * <a name="DmgWindow-height"></a>`height` Number - The height. Defaults to background image height or 380.
  * <a name="DmgOptions-artifactName"></a>`artifactName` String - The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern).
  * <a name="DmgOptions-publish"></a>`publish` String | [GithubOptions](Publishing-Artifacts#GithubOptions) | [S3Options](Publishing-Artifacts#S3Options) | [GenericServerOptions](Publishing-Artifacts#GenericServerOptions) | [BintrayOptions](Publishing-Artifacts#BintrayOptions) | Array
* <a name="Config-pkg"></a>`pkg`<a name="PkgOptions"></a> - macOS product archive options.
  * <a name="PkgOptions-scripts"></a>`scripts` = `build/pkg-scripts` String - The scripts directory, relative to `build` (build resources directory). The scripts can be in any language so long as the files are marked executable and have the appropriate shebang indicating the path to the interpreter. Scripts are required to be executable (`chmod +x file`). See: [Scripting in installer packages](http://macinstallers.blogspot.de/2012/07/scripting-in-installer-packages.html).
  * <a name="PkgOptions-installLocation"></a>`installLocation` = `/Applications` String - The install location. [Do not use it](https://stackoverflow.com/questions/12863944/how-do-you-specify-a-default-install-location-to-home-with-pkgbuild) to create per-user package. Mostly never you will need to change this option. `/Applications` would install it as expected into `/Applications` if the local system domain is chosen, or into `$HOME/Applications` if the home installation is chosen.
  * <a name="PkgOptions-allowAnywhere"></a>`allowAnywhere` = `true` Boolean - Whether can be installed at the root of any volume, including non-system volumes. Otherwise, it cannot be installed at the root of a volume.
    
    Corresponds to [enable_anywhere](https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70).
  * <a name="PkgOptions-allowCurrentUserHome"></a>`allowCurrentUserHome` = `true` Boolean - Whether can be installed into the current user’s home directory. A home directory installation is done as the current user (not as root), and it cannot write outside of the home directory. If the product cannot be installed in the user’s home directory and be not completely functional from user’s home directory.
    
    Corresponds to [enable_currentUserHome](https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70).
  * <a name="PkgOptions-allowRootDirectory"></a>`allowRootDirectory` = `true` Boolean - Whether can be installed into the root directory. Should usually be `true` unless the product can be installed only to the user’s home directory.
    
    Corresponds to [enable_localSystem](https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70).
  * <a name="PkgOptions-identity"></a>`identity` String - The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](https://github.com/electron-userland/electron-builder/wiki/Code-Signing) instead of specifying this option.
  * <a name="PkgOptions-artifactName"></a>`artifactName` String - The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern).
  * <a name="PkgOptions-publish"></a>`publish` String | [GithubOptions](Publishing-Artifacts#GithubOptions) | [S3Options](Publishing-Artifacts#S3Options) | [GenericServerOptions](Publishing-Artifacts#GenericServerOptions) | [BintrayOptions](Publishing-Artifacts#BintrayOptions) | Array
* <a name="Config-win"></a>`win`<a name="WinBuildOptions"></a> - Windows options.
  * <a name="WinBuildOptions-target"></a>`target` = `nsis` String | [TargetConfig](electron-builder#TargetConfig) | Array - Target package type: list of `nsis`, `nsis-web` (Web installer), `portable` (portable app without installation), `appx`, `squirrel`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`. AppX package can be built only on Windows 10.
    
    To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency.
  * <a name="WinBuildOptions-signingHashAlgorithms"></a>`signingHashAlgorithms` = `['sha1', 'sha256']` Array&lt;"sha1" | "sha256"&gt; - Array of signing algorithms used. For AppX `sha256` is always used.
  * <a name="WinBuildOptions-icon"></a>`icon` = `build/icon.ico` String - The path to application icon.
  * <a name="WinBuildOptions-legalTrademarks"></a>`legalTrademarks` String - The trademarks and registered trademarks.
  * <a name="WinBuildOptions-certificateFile"></a>`certificateFile` String - The path to the *.pfx certificate you want to sign with. Please use it only if you cannot use env variable `CSC_LINK` (`WIN_CSC_LINK`) for some reason. Please see [Code Signing](https://github.com/electron-userland/electron-builder/wiki/Code-Signing).
  * <a name="WinBuildOptions-certificatePassword"></a>`certificatePassword` String - The password to the certificate provided in `certificateFile`. Please use it only if you cannot use env variable `CSC_KEY_PASSWORD` (`WIN_CSC_KEY_PASSWORD`) for some reason. Please see [Code Signing](https://github.com/electron-userland/electron-builder/wiki/Code-Signing).
  * <a name="WinBuildOptions-certificateSubjectName"></a>`certificateSubjectName` String - The name of the subject of the signing certificate. Required only for EV Code Signing and works only on Windows.
  * <a name="WinBuildOptions-certificateSha1"></a>`certificateSha1` String - The SHA1 hash of the signing certificate. The SHA1 hash is commonly specified when multiple certificates satisfy the criteria specified by the remaining switches. Works only on Windows.
  * <a name="WinBuildOptions-additionalCertificateFile"></a>`additionalCertificateFile` String - The path to an additional certificate file you want to add to the signature block.
  * <a name="WinBuildOptions-rfc3161TimeStampServer"></a>`rfc3161TimeStampServer` = `http://timestamp.comodoca.com/rfc3161` String - The URL of the RFC 3161 time stamp server.
  * <a name="WinBuildOptions-timeStampServer"></a>`timeStampServer` = `http://timestamp.verisign.com/scripts/timstamp.dll` String - The URL of the time stamp server.
  * <a name="WinBuildOptions-publisherName"></a>`publisherName` String | Array&lt;String&gt; - [The publisher name](https://github.com/electron-userland/electron-builder/issues/1187#issuecomment-278972073), exactly as in your code signed certificate. Several names can be provided. Defaults to common name from your code signing certificate.
  * <a name="WinBuildOptions-verifyUpdateCodeSignature"></a>`verifyUpdateCodeSignature` = `true` Boolean - Whether to verify the signature of an available update before installation. The [publisher name](WinBuildOptions#publisherName) will be used for the signature verification.
* <a name="Config-nsis"></a>`nsis`<a name="NsisOptions"></a> - NSIS options. See [NSIS target notes](https://github.com/electron-userland/electron-builder/wiki/NSIS).
  * <a name="NsisOptions-oneClick"></a>`oneClick` = `true` Boolean - One-click installation.
  * <a name="NsisOptions-perMachine"></a>`perMachine` = `false` Boolean - If `oneClick` is `true` (default): Install per all users (per-machine).
    
    If `oneClick` is `false`: no install mode installer page (choice per-machine or per-user), always install per-machine.
  * <a name="NsisOptions-allowElevation"></a>`allowElevation` = `true` Boolean - *boring installer only.* Allow requesting for elevation. If false, user will have to restart installer with elevated permissions.
  * <a name="NsisOptions-allowToChangeInstallationDirectory"></a>`allowToChangeInstallationDirectory` = `false` Boolean - *boring installer only.* Whether to allow user to change installation directory.
  * <a name="NsisOptions-runAfterFinish"></a>`runAfterFinish` = `true` Boolean - *one-click installer only.* Run application after finish.
  * <a name="NsisOptions-installerIcon"></a>`installerIcon` String - The path to installer icon, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. Defaults to `build/installerIcon.ico` or application icon.
  * <a name="NsisOptions-uninstallerIcon"></a>`uninstallerIcon` String - The path to uninstaller icon, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. Defaults to `build/uninstallerIcon.ico` or application icon.
  * <a name="NsisOptions-installerHeader"></a>`installerHeader` = `build/installerHeader.bmp` String - *boring installer only.* `MUI_HEADERIMAGE`, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory.
  * <a name="NsisOptions-installerSidebar"></a>`installerSidebar` String - *boring installer only.* `MUI_WELCOMEFINISHPAGE_BITMAP`, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. Defaults to `build/installerSidebar.bmp` or `${NSISDIR}\\Contrib\\Graphics\\Wizard\\nsis3-metro.bmp`
  * <a name="NsisOptions-uninstallerSidebar"></a>`uninstallerSidebar` String - *boring installer only.* `MUI_UNWELCOMEFINISHPAGE_BITMAP`, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. Defaults to `installerSidebar` option or `build/uninstallerSidebar.bmp` or `build/installerSidebar.bmp` or `${NSISDIR}\\Contrib\\Graphics\\Wizard\\nsis3-metro.bmp`
  * <a name="NsisOptions-installerHeaderIcon"></a>`installerHeaderIcon` String - *one-click installer only.* The path to header icon (above the progress bar), relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. Defaults to `build/installerHeaderIcon.ico` or application icon.
  * <a name="NsisOptions-include"></a>`include` String - The path to NSIS include script to customize installer. Defaults to `build/installer.nsh`. See [Custom NSIS script](https://github.com/electron-userland/electron-builder/wiki/NSIS#custom-nsis-script).
  * <a name="NsisOptions-script"></a>`script` String - The path to NSIS script to customize installer. Defaults to `build/installer.nsi`. See [Custom NSIS script](https://github.com/electron-userland/electron-builder/wiki/NSIS#custom-nsis-script).
  * <a name="NsisOptions-license"></a>`license` String - The path to EULA license file. Defaults to `license.rtf` or `license.txt` or `eula.rtf` or `eula.txt` (or uppercase variants, e.g. `EULA.txt` or `LICENSE.TXT`).
    
    Multiple license files in different languages are supported — use lang postfix (e.g. `_de`, `_ru`)). For example, create files `license_de.txt` and `license_en.txt` in the build resources. If OS language is german, `license_de.txt` will be displayed. See map of [language code to name](https://github.com/meikidd/iso-639-1/blob/master/src/data.js).
    
    Appropriate license file will be selected by user OS language.
  * <a name="NsisOptions-language"></a>`language` String - [LCID Dec](https://msdn.microsoft.com/en-au/goglobal/bb964664.aspx), defaults to `1033`(`English - United States`).
  * <a name="NsisOptions-multiLanguageInstaller"></a>`multiLanguageInstaller` Boolean - *boring installer only.* Whether to create multi-language installer. Defaults to `unicode` option value. [Not all strings are translated](https://github.com/electron-userland/electron-builder/issues/646#issuecomment-238155800).
  * <a name="NsisOptions-menuCategory"></a>`menuCategory` = `false` Boolean | String - Whether to create submenu for start menu shortcut and program files directory. If `true`, company name will be used. Or string value.
  * <a name="NsisOptions-uninstallDisplayName"></a>`uninstallDisplayName` = `${productName} ${version}` String - The uninstaller display name in the control panel.
  * <a name="NsisOptions-artifactName"></a>`artifactName` String - The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern). Defaults to `${productName} Setup ${version}.${ext}`.
  * <a name="NsisOptions-deleteAppDataOnUninstall"></a>`deleteAppDataOnUninstall` = `false` Boolean - *one-click installer only.* Whether to delete app data on uninstall.
  * <a name="NsisOptions-packElevateHelper"></a>`packElevateHelper` = `true` Boolean - Whether to pack the elevate executable (required for electron-updater if per-machine installer used or can be used in the future). Ignored if `perMachine` is set to `true`.
  * <a name="NsisOptions-unicode"></a>`unicode` = `true` Boolean - Whether to create [Unicode installer](http://nsis.sourceforge.net/Docs/Chapter1.html#intro-unicode).
  * <a name="NsisOptions-guid"></a>`guid` String - See [GUID vs Application Name](https://github.com/electron-userland/electron-builder/wiki/NSIS#guid-vs-application-name).
  * <a name="NsisOptions-warningsAsErrors"></a>`warningsAsErrors` = `true` Boolean - If `warningsAsErrors` is `true` (default): NSIS will treat warnings as errors. If `warningsAsErrors` is `false`: NSIS will allow warnings.
  * <a name="NsisOptions-publish"></a>`publish` String | [GithubOptions](Publishing-Artifacts#GithubOptions) | [S3Options](Publishing-Artifacts#S3Options) | [GenericServerOptions](Publishing-Artifacts#GenericServerOptions) | [BintrayOptions](Publishing-Artifacts#BintrayOptions) | Array
* <a name="Config-nsisWeb"></a>`nsisWeb`<a name="NsisWebOptions"></a> - Web Installer specific options.
  Inherits [NsisOptions](#NsisOptions) options.
  * <a name="NsisWebOptions-appPackageUrl"></a>`appPackageUrl` String - The application package download URL. Optional — by default computed using publish configuration.
    
    URL like `https://example.com/download/latest` allows web installer to be version independent (installer will download latest application package).
    
    Custom `X-Arch` http header is set to `32` or `64`.
  * <a name="NsisWebOptions-artifactName"></a>`artifactName` String - The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern). Defaults to `${productName} Web Setup ${version}.${ext}`.
* <a name="Config-portable"></a>`portable`<a name="PortableOptions"></a> - Portable specific options.
  * <a name="PortableOptions-requestExecutionLevel"></a>`requestExecutionLevel` = `user` "user" | "highest" | "admin" - The [requested execution level](http://nsis.sourceforge.net/Reference/RequestExecutionLevel) for Windows.
  * <a name="PortableOptions-artifactName"></a>`artifactName` String - The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern).
  * <a name="PortableOptions-publish"></a>`publish` String | [GithubOptions](Publishing-Artifacts#GithubOptions) | [S3Options](Publishing-Artifacts#S3Options) | [GenericServerOptions](Publishing-Artifacts#GenericServerOptions) | [BintrayOptions](Publishing-Artifacts#BintrayOptions) | Array
  * <a name="PortableOptions-unicode"></a>`unicode` = `true` Boolean - Whether to create [Unicode installer](http://nsis.sourceforge.net/Docs/Chapter1.html#intro-unicode).
  * <a name="PortableOptions-guid"></a>`guid` String - See [GUID vs Application Name](https://github.com/electron-userland/electron-builder/wiki/NSIS#guid-vs-application-name).
  * <a name="PortableOptions-warningsAsErrors"></a>`warningsAsErrors` = `true` Boolean - If `warningsAsErrors` is `true` (default): NSIS will treat warnings as errors. If `warningsAsErrors` is `false`: NSIS will allow warnings.
* <a name="Config-appx"></a>`appx`<a name="AppXOptions"></a> - AppX options. See [Windows AppX docs](https://msdn.microsoft.com/en-us/library/windows/apps/br211453.aspx).
  * <a name="AppXOptions-backgroundColor"></a>`backgroundColor` String - The background color of the app tile. See: [Visual Elements](https://msdn.microsoft.com/en-us/library/windows/apps/br211471.aspx).
  * <a name="AppXOptions-publisher"></a>`publisher` String - Describes the publisher information in a form `CN=your name exactly as in your cert`. The Publisher attribute must match the publisher subject information of the certificate used to sign a package. By default will be extracted from code sign certificate.
  * <a name="AppXOptions-displayName"></a>`displayName` String - A friendly name that can be displayed to users. Corresponds to [Properties.DisplayName](https://msdn.microsoft.com/en-us/library/windows/apps/br211432.aspx).
  * <a name="AppXOptions-publisherDisplayName"></a>`publisherDisplayName` String - A friendly name for the publisher that can be displayed to users. Corresponds to [Properties.PublisherDisplayName](https://msdn.microsoft.com/en-us/library/windows/apps/br211460.aspx).
  * <a name="AppXOptions-identityName"></a>`identityName` = `${name}` String - The name. Corresponds to [Identity.Name](https://msdn.microsoft.com/en-us/library/windows/apps/br211441.aspx).
  * <a name="AppXOptions-languages"></a>`languages` Array&lt;String&gt; | String - The list of [supported languages](https://docs.microsoft.com/en-us/windows/uwp/globalizing/manage-language-and-region#specify-the-supported-languages-in-the-apps-manifest) that will be listed in the Windows Store. The first entry (index 0) will be the default language. Defaults to en-US if omitted.
  * <a name="AppXOptions-artifactName"></a>`artifactName` String - The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern).
  * <a name="AppXOptions-publish"></a>`publish` String | [GithubOptions](Publishing-Artifacts#GithubOptions) | [S3Options](Publishing-Artifacts#S3Options) | [GenericServerOptions](Publishing-Artifacts#GenericServerOptions) | [BintrayOptions](Publishing-Artifacts#BintrayOptions) | Array
* <a name="Config-squirrelWindows"></a>`squirrelWindows`<a name="SquirrelWindowsOptions"></a> - Squirrel.Windows options. Squirrel.Windows target is maintained, but deprecated. Please use `nsis` instead.
  
  To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency.
  To build for Squirrel.Windows on macOS, please install `mono`: `brew install mono`.
  Inherits [WinBuildOptions](#WinBuildOptions) options.
  * <a name="SquirrelWindowsOptions-iconUrl"></a>`iconUrl` String - A URL to an ICO file to use as the application icon (displayed in Control Panel > Programs and Features). Defaults to the Electron icon.
    
    Please note — [local icon file url is not accepted](https://github.com/atom/grunt-electron-installer/issues/73), must be https/http.
    
    If you don't plan to build windows installer, you can omit it. If your project repository is public on GitHub, it will be `https://github.com/${u}/${p}/blob/master/build/icon.ico?raw=true` by default.
  * <a name="SquirrelWindowsOptions-loadingGif"></a>`loadingGif` String - The path to a .gif file to display during install. `build/install-spinner.gif` will be used if exists (it is a recommended way to set) (otherwise [default](https://github.com/electron/windows-installer/blob/master/resources/install-spinner.gif)).
  * <a name="SquirrelWindowsOptions-msi"></a>`msi` Boolean - Whether to create an MSI installer. Defaults to `false` (MSI is not created).
  * <a name="SquirrelWindowsOptions-remoteReleases"></a>`remoteReleases` String | Boolean - A URL to your existing updates. Or `true` to automatically set to your GitHub repository. If given, these will be downloaded to create delta updates.
  * <a name="SquirrelWindowsOptions-remoteToken"></a>`remoteToken` String - Authentication token for remote updates
  * <a name="SquirrelWindowsOptions-useAppIdAsId"></a>`useAppIdAsId` Boolean - Use `appId` to identify package instead of `name`.
* <a name="Config-linux"></a>`linux`<a name="LinuxBuildOptions"></a> - Linux options.
  * <a name="LinuxBuildOptions-packageCategory"></a>`packageCategory` String - The [package category](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Section). Not applicable for AppImage.
  * <a name="LinuxBuildOptions-target"></a>`target` = `AppImage` String | [TargetConfig](electron-builder#TargetConfig) | Array - Target package type: list of `AppImage`, `snap`, `deb`, `rpm`, `freebsd`, `pacman`, `p5p`, `apk`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`.
    
    electron-builder [docker image](https://github.com/electron-userland/electron-builder/wiki/Docker) can be used to build Linux targets on any platform. See [Multi platform build](https://github.com/electron-userland/electron-builder/wiki/Multi-Platform-Build). See: [Please do not put an AppImage into another archive like a .zip or .tar.gz](https://github.com/probonopd/AppImageKit/wiki/Creating-AppImages#common-mistake)
  * <a name="LinuxBuildOptions-maintainer"></a>`maintainer` String - The maintainer. Defaults to [author](#Metadata-author).
  * <a name="LinuxBuildOptions-vendor"></a>`vendor` String - The vendor. Defaults to [author](#Metadata-author).
  * <a name="LinuxBuildOptions-executableName"></a>`executableName` String - The executable name. Defaults to `productName`. Cannot be specified per target, allowed only in the `linux`.
  * <a name="LinuxBuildOptions-icon"></a>`icon` String - The path to icon set directory, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. The icon filename must contain the size (e.g. 32x32.png) of the icon. By default will be generated automatically based on the macOS icns file.
  * <a name="LinuxBuildOptions-synopsis"></a>`synopsis` String - The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
  * <a name="LinuxBuildOptions-description"></a>`description` String - As [description](#Metadata-description) from application package.json, but allows you to specify different for Linux.
  * <a name="LinuxBuildOptions-category"></a>`category` String - The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
  * <a name="LinuxBuildOptions-desktop"></a>`desktop` any - The [Desktop file](https://developer.gnome.org/integration-guide/stable/desktop-files.html.en) entries (name to value).
  * <a name="LinuxBuildOptions-afterInstall"></a>`afterInstall` String
  * <a name="LinuxBuildOptions-afterRemove"></a>`afterRemove` String
* <a name="Config-deb"></a>`deb`<a name="DebOptions"></a> - Debian package specific options.
  * <a name="DebOptions-compression"></a>`compression` = `xz` "gz" | "bzip2" | "xz" - The compression type.
  * <a name="DebOptions-priority"></a>`priority` String - The [Priority](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Priority) attribute.
  * <a name="DebOptions-depends"></a>`depends` Array&lt;String&gt; - Package dependencies. Defaults to `["gconf2", "gconf-service", "libnotify4", "libappindicator1", "libxtst6", "libnss3"]`.
  * <a name="DebOptions-icon"></a>`icon` String
* <a name="Config-snap"></a>`snap`<a name="SnapOptions"></a> - [Snap](http://snapcraft.io) options.
  Inherits [LinuxBuildOptions](#LinuxBuildOptions) options.
  * <a name="SnapOptions-confinement"></a>`confinement` = `strict` "devmode" | "strict" | "classic" - The type of [confinement](https://snapcraft.io/docs/reference/confinement) supported by the snap.
  * <a name="SnapOptions-summary"></a>`summary` String - The 78 character long summary. Defaults to [productName](#Config-productName).
  * <a name="SnapOptions-grade"></a>`grade` = `stable` "devel" | "stable" - The quality grade of the snap. It can be either `devel` (i.e. a development version of the snap, so not to be published to the “stable” or “candidate” channels) or “stable” (i.e. a stable release or release candidate, which can be released to all channels).
  * <a name="SnapOptions-assumes"></a>`assumes` Array&lt;String&gt; - The list of features that must be supported by the core in order for this snap to install.
  * <a name="SnapOptions-buildPackages"></a>`buildPackages` Array&lt;String&gt; - The list of debian packages needs to be installed for building this snap.
  * <a name="SnapOptions-stagePackages"></a>`stagePackages` Array&lt;String&gt; - The list of Ubuntu packages to use that are needed to support the `app` part creation. Like `depends` for `deb`. Defaults to `["libnotify4", "libappindicator1", "libxtst6", "libnss3", "libxss1", "fontconfig-config", "gconf2", "libasound2", "pulseaudio"]`.
    
    If list contains `default`, it will be replaced to default list, so, `["default", "foo"]` can be used to add custom package `foo` in addition to defaults.
  * <a name="SnapOptions-plugs"></a>`plugs` Array&lt;String&gt; - The list of [plugs](https://snapcraft.io/docs/reference/interfaces). Defaults to `["home", "x11", "unity7", "browser-support", "network", "gsettings", "pulseaudio", "opengl"]`.
    
    If list contains `default`, it will be replaced to default list, so, `["default", "foo"]` can be used to add custom plug `foo` in addition to defaults.
  * <a name="SnapOptions-after"></a>`after` Array&lt;String&gt; - Specifies any [parts](https://snapcraft.io/docs/reference/parts) that should be built before this part. Defaults to `["desktop-only""]`.
    
    If list contains `default`, it will be replaced to default list, so, `["default", "foo"]` can be used to add custom parts `foo` in addition to defaults.
  * <a name="SnapOptions-ubuntuAppPlatformContent"></a>`ubuntuAppPlatformContent` String - Specify `ubuntu-app-platform1` to use [ubuntu-app-platform](https://insights.ubuntu.com/2016/11/17/how-to-create-snap-packages-on-qt-applications/). Snap size will be greatly reduced, but it is not recommended for now because "the snaps must be connected before running uitk-gallery for the first time".
* <a name="Config-appImage"></a>`appImage` [LinuxTargetSpecificOptions](electron-builder#LinuxTargetSpecificOptions)
* <a name="Config-pacman"></a>`pacman` [LinuxTargetSpecificOptions](electron-builder#LinuxTargetSpecificOptions)
* <a name="Config-rpm"></a>`rpm` [LinuxTargetSpecificOptions](electron-builder#LinuxTargetSpecificOptions)
* <a name="Config-freebsd"></a>`freebsd` [LinuxTargetSpecificOptions](electron-builder#LinuxTargetSpecificOptions)
* <a name="Config-p5p"></a>`p5p` [LinuxTargetSpecificOptions](electron-builder#LinuxTargetSpecificOptions)
* <a name="Config-apk"></a>`apk` [LinuxTargetSpecificOptions](electron-builder#LinuxTargetSpecificOptions)
* <a name="Config-afterPack"></a>`afterPack` callback - *programmatic API only* The function to be run after pack (but before pack into distributable format and sign). Promise must be returned.
* <a name="Config-beforeBuild"></a>`beforeBuild` callback - *programmatic API only* The function to be run before dependencies are installed or rebuilt. Works when `npmRebuild` is set to `true`. Promise must be returned. Resolving to `false` will skip dependencies install or rebuild.

<a name="Metadata"></a>
## `Metadata`
Some standard fields should be defined in the `package.json`.

**Kind**: interface of [<code>electron-builder</code>](#module_electron-builder)  
**Properties**
* <a name="Metadata-name"></a>**`name`** String - The application name.
* <a name="Metadata-description"></a>`description` String - The application description.
* <a name="Metadata-homepage"></a>`homepage` String - The url to the project [homepage](https://docs.npmjs.com/files/package.json#homepage) (NuGet Package `projectUrl` (optional) or Linux Package URL (required)).
  
  If not specified and your project repository is public on GitHub, it will be `https://github.com/${user}/${project}` by default.
* <a name="Metadata-license"></a>`license` String - *linux-only.* The [license](https://docs.npmjs.com/files/package.json#license) name.
* <a name="Metadata-author"></a>`author`<a name="AuthorMetadata"></a>
  * <a name="AuthorMetadata-name"></a>**`name`** String
  * <a name="AuthorMetadata-email"></a>`email` String
* <a name="Metadata-repository"></a>`repository` String | [RepositoryInfo](#RepositoryInfo)<a name="RepositoryInfo"></a> - The [repository](https://docs.npmjs.com/files/package.json#repository).
  * <a name="RepositoryInfo-url"></a>**`url`** String
* <a name="Metadata-build"></a>`build` [Config](#Config) - The electron-builder configuration.


<!-- end of generated block -->

## Build Version Management
`CFBundleVersion` (macOS) and `FileVersion` (Windows) will be set automatically to `version.build_number` on CI server (Travis, AppVeyor, CircleCI and Bamboo supported).