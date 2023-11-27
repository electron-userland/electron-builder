electron-builder [configuration](#configuration) can be defined
 
* in the `package.json` file of your project using the `build` key on the top level:
   ```json
   "build": {
     "appId": "com.example.app"
   }
   ```
* or through the `--config <path/to/yml-or-json5-or-toml-or-js>` option. Defaults to `electron-builder.yml`. 
   ```yaml
   appId: "com.example.app"
   ```
   
    `json`, [json5](http://json5.org), [toml](https://github.com/toml-lang/toml) or `js`/`ts` (exported configuration or function that produces configuration) formats also supported.

    !!! tip
        If you want to use `js` file, do not name it `electron-builder.js`. It will [conflict](https://github.com/electron-userland/electron-builder/issues/6227) with `electron-builder` package name.

    !!! tip
        If you want to use [toml](https://en.wikipedia.org/wiki/TOML), please install `yarn add toml --dev`.

Most of the options accept `null` — for example, to explicitly set that DMG icon must be default volume icon from the OS and default rules must be not applied (i.e. use application icon as DMG icon), set `dmg.icon` to `null`.

## Artifact File Name Template

`${ext}` macro is supported in addition to [file macros](../file-patterns.md#file-macros).

## Environment Variables from File

Env file `electron-builder.env` in the current dir ([example](https://github.com/motdotla/dotenv-expand/blob/1cc80d02e1f8aa749253a04a2061c0fecb9bdb69/tests/.env)). Supported only for CLI usage.

## How to Read Docs

* Name of optional property is normal, **required** is bold.
* Type is specified after property name: `Array<String> | String`. Union like this means that you can specify or string (`**/*`), or array of strings (`["**/*", "!foo.js"]`).

## Configuration

<!-- do not edit. start of generated block -->
* <code id="Configuration-appId">appId</code> = `com.electron.${name}` String | "undefined" - The application id. Used as [CFBundleIdentifier](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070) for MacOS and as [Application User Model ID](https://msdn.microsoft.com/en-us/library/windows/desktop/dd378459(v=vs.85).aspx) for Windows (NSIS target only, Squirrel.Windows not supported). It is strongly recommended that an explicit ID is set.
* <code id="Configuration-productName">productName</code> String | "undefined" - As [name](#Metadata-name), but allows you to specify a product name for your executable which contains spaces and other special characters not allowed in the [name property](https://docs.npmjs.com/files/package.json#name). If not specified inside of the `build` configuration, `productName` property defined at the top level of `package.json` is used. If not specified at the top level of `package.json`, [name property](https://docs.npmjs.com/files/package.json#name) is used.
* <code id="Configuration-copyright">copyright</code> = `Copyright © year ${author}` String | "undefined" - The human-readable copyright line for the app.

---

* <code id="Configuration-directories">directories</code> [MetadataDirectories](#MetadataDirectories) | "undefined"

---

* <code id="Configuration-mac">mac</code> [MacConfiguration](mac) - Options related to how build macOS targets.
* <code id="Configuration-mas">mas</code> [MasConfiguration](mas) - MAS (Mac Application Store) options.
* <code id="Configuration-masDev">masDev</code> [MasConfiguration](mas) - MAS (Mac Application Store) development options (`mas-dev` target).
* <code id="Configuration-dmg">dmg</code> [DmgOptions](dmg) - macOS DMG options.
* <code id="Configuration-pkg">pkg</code> [PkgOptions](pkg) - macOS PKG options.

---

* <code id="Configuration-win">win</code> [WindowsConfiguration](win) - Options related to how build Windows targets.
* <code id="Configuration-nsis">nsis</code> [NsisOptions](nsis)
* <code id="Configuration-nsisWeb">nsisWeb</code> [NsisWebOptions](#NsisWebOptions) | "undefined"
* <code id="Configuration-portable">portable</code> [PortableOptions](#PortableOptions) | "undefined"
* <code id="Configuration-appx">appx</code> [AppXOptions](appx)
* <code id="Configuration-squirrelWindows">squirrelWindows</code> [SquirrelWindowsOptions](squirrel-windows.md)

---

* <code id="Configuration-linux">linux</code> [LinuxConfiguration](linux) - Options related to how build Linux targets.
* <code id="Configuration-deb">deb</code> [DebOptions](/configuration/linux#deb) - Debian package options.
* <code id="Configuration-snap">snap</code> [SnapOptions](snap) - Snap options.
* <code id="Configuration-appImage">appImage</code> [AppImageOptions](/configuration/linux#appimageoptions) - AppImage options.
* <code id="Configuration-flatpak">flatpak</code> [FlatpakOptions](flatpak) - Flatpak options.
* <code id="Configuration-pacman">pacman</code> [LinuxTargetSpecificOptions](/configuration/linux#LinuxTargetSpecificOptions)
* <code id="Configuration-rpm">rpm</code> [LinuxTargetSpecificOptions](/configuration/linux#LinuxTargetSpecificOptions)
* <code id="Configuration-freebsd">freebsd</code> [LinuxTargetSpecificOptions](/configuration/linux#LinuxTargetSpecificOptions)
* <code id="Configuration-p5p">p5p</code> [LinuxTargetSpecificOptions](/configuration/linux#LinuxTargetSpecificOptions)
* <code id="Configuration-apk">apk</code> [LinuxTargetSpecificOptions](/configuration/linux#LinuxTargetSpecificOptions)
* <code id="Configuration-includeSubNodeModules">includeSubNodeModules</code> = `false` Boolean - Whether to include *all* of the submodules node_modules directories

---

* <code id="Configuration-buildDependenciesFromSource">buildDependenciesFromSource</code> = `false` Boolean - Whether to build the application native dependencies from source.
* <code id="Configuration-nodeGypRebuild">nodeGypRebuild</code> = `false` Boolean - Whether to execute `node-gyp rebuild` before starting to package the app.
    
    Don't [use](https://github.com/electron-userland/electron-builder/issues/683#issuecomment-241214075) [npm](http://electron.atom.io/docs/tutorial/using-native-node-modules/#using-npm) (neither `.npmrc`) for configuring electron headers. Use `electron-builder node-gyp-rebuild` instead.

* <code id="Configuration-npmArgs">npmArgs</code> Array&lt;String&gt; | String | "undefined" - Additional command line arguments to use when installing app native deps.
* <code id="Configuration-npmRebuild">npmRebuild</code> = `true` Boolean - Whether to [rebuild](https://docs.npmjs.com/cli/rebuild) native dependencies before starting to package the app.
* <code id="Configuration-buildNumber">buildNumber</code> String | "undefined" - The build number. Maps to the `--iteration` flag for builds using FPM on Linux. If not defined, then it will fallback to `BUILD_NUMBER` or `TRAVIS_BUILD_NUMBER` or `APPVEYOR_BUILD_NUMBER` or `CIRCLE_BUILD_NUM` or `BUILD_BUILDNUMBER` or `CI_PIPELINE_IID` env.

---

* <code id="Configuration-buildVersion">buildVersion</code> String | "undefined" - The build version. Maps to the `CFBundleVersion` on macOS, and `FileVersion` metadata property on Windows. Defaults to the `version`. If `buildVersion` is not defined and `buildNumber` (or one of the `buildNumber` envs) is defined, it will be used as a build version (`version.buildNumber`).
* <code id="Configuration-downloadAlternateFFmpeg">downloadAlternateFFmpeg</code> Boolean - Whether to download the alternate FFmpeg library from Electron's release assets and replace the default FFmpeg library prior to signing
* <code id="Configuration-electronCompile">electronCompile</code> Boolean - Whether to use [electron-compile](http://github.com/electron/electron-compile) to compile app. Defaults to `true` if `electron-compile` in the dependencies. And `false` if in the `devDependencies` or doesn't specified.
* <code id="Configuration-electronDist">electronDist</code> String | module:app-builder-lib/out/configuration.__type - Returns the path to custom Electron build (e.g. `~/electron/out/R`). Zip files must follow the pattern `electron-v${version}-${platformName}-${arch}.zip`, otherwise it will be assumed to be an unpacked Electron app directory
* <code id="Configuration-electronDownload">electronDownload</code><a name="ElectronDownloadOptions"></a> - The [electron-download](https://github.com/electron-userland/electron-download#usage) options.
    * <code id="ElectronDownloadOptions-version">version</code> String
    * <code id="ElectronDownloadOptions-cache">cache</code> String | "undefined" - The [cache location](https://github.com/electron-userland/electron-download#cache-location).
    * <code id="ElectronDownloadOptions-mirror">mirror</code> String | "undefined" - The mirror.
    * <code id="ElectronDownloadOptions-strictSSL">strictSSL</code> Boolean
    * <code id="ElectronDownloadOptions-isVerifyChecksum">isVerifyChecksum</code> Boolean
    * <code id="ElectronDownloadOptions-platform">platform</code> "darwin" | "linux" | "win32" | "mas"
    * <code id="ElectronDownloadOptions-arch">arch</code> String
* <code id="Configuration-electronBranding">electronBranding</code> ElectronBrandingOptions - The branding used by Electron's distributables. This is needed if a fork has modified Electron's BRANDING.json file.
* <code id="Configuration-electronVersion">electronVersion</code> String | "undefined" - The version of electron you are packaging for. Defaults to version of `electron`, `electron-prebuilt` or `electron-prebuilt-compile` dependency.
* <code id="Configuration-extends">extends</code> Array&lt;String&gt; | String | "undefined" - The name of a built-in configuration preset (currently, only `react-cra` is supported) or any number of paths to config files (relative to project dir).
    
    The latter allows to mixin a config from multiple other configs, as if you `Object.assign` them, but properly combine `files` glob patterns.
    
    If `react-scripts` in the app dependencies, `react-cra` will be set automatically. Set to `null` to disable automatic detection.

* <code id="Configuration-extraMetadata">extraMetadata</code> any - Inject properties to `package.json`.

---

* <code id="Configuration-forceCodeSigning">forceCodeSigning</code> = `false` Boolean - Whether to fail if the application is not signed (to prevent unsigned app if code signing configuration is not correct).
* <code id="Configuration-nodeVersion">nodeVersion</code> String | "undefined" - *libui-based frameworks only* The version of NodeJS you are packaging for. You can set it to `current` to set the Node.js version that you use to run.
* <code id="Configuration-launchUiVersion">launchUiVersion</code> Boolean | String | "undefined" - *libui-based frameworks only* The version of LaunchUI you are packaging for. Applicable for Windows only. Defaults to version suitable for used framework version.
* <code id="Configuration-framework">framework</code> String | "undefined" - The framework name. One of `electron`, `proton`, `libui`. Defaults to `electron`.
* <code id="Configuration-beforePack">beforePack</code> module:app-builder-lib/out/configuration.__type | String | "undefined" - The function (or path to file or module id) to be [run before pack](#beforepack)

---

* <code id="Configuration-afterPack">afterPack</code> - The function (or path to file or module id) to be [run after pack](#afterpack) (but before pack into distributable format and sign).
* <code id="Configuration-afterSign">afterSign</code> - The function (or path to file or module id) to be [run after pack and sign](#aftersign) (but before pack into distributable format).
* <code id="Configuration-artifactBuildStarted">artifactBuildStarted</code> module:app-builder-lib/out/configuration.__type | String | "undefined" - The function (or path to file or module id) to be run on artifact build start.
* <code id="Configuration-artifactBuildCompleted">artifactBuildCompleted</code> module:app-builder-lib/out/configuration.__type | String | "undefined" - The function (or path to file or module id) to be run on artifact build completed.
* <code id="Configuration-afterAllArtifactBuild">afterAllArtifactBuild</code> - The function (or path to file or module id) to be [run after all artifacts are build](#afterAllArtifactBuild).
* <code id="Configuration-msiProjectCreated">msiProjectCreated</code> module:app-builder-lib/out/configuration.__type | String | "undefined" - MSI project created on disk - not packed into .msi package yet.
* <code id="Configuration-appxManifestCreated">appxManifestCreated</code> module:app-builder-lib/out/configuration.__type | String | "undefined" - Appx manifest created on disk - not packed into .appx package yet.
* <code id="Configuration-onNodeModuleFile">onNodeModuleFile</code> - The function (or path to file or module id) to be [run on each node module](#onnodemodulefile) file.
* <code id="Configuration-beforeBuild">beforeBuild</code> (context: BeforeBuildContext) => Promise | null - The function (or path to file or module id) to be run before dependencies are installed or rebuilt. Works when `npmRebuild` is set to `true`. Resolving to `false` will skip dependencies install or rebuild.
    
    If provided and `node_modules` are missing, it will not invoke production dependencies check.

* <code id="Configuration-includePdb">includePdb</code> = `false` Boolean - Whether to include PDB files.
* <code id="Configuration-removePackageScripts">removePackageScripts</code> = `true` Boolean - Whether to remove `scripts` field from `package.json` files.
* <code id="Configuration-removePackageKeywords">removePackageKeywords</code> = `true` Boolean - Whether to remove `keywords` field from `package.json` files.

<!-- end of generated block -->

---

### Overridable per Platform Options

Following options can be set also per platform (top-level keys [mac](mac.md), [linux](linux.md) and [win](win.md)) if need.

{!generated/PlatformSpecificBuildOptions.md!}

## Metadata
Some standard fields should be defined in the `package.json`.

{!generated/Metadata.md!}

## Proton Native

To package [Proton Native](https://proton-native.js.org/) app, set `protonNodeVersion` option to `current` or specific NodeJS version that you are packaging for.
Currently, only macOS and Linux supported.

## Build Version Management
`CFBundleVersion` (macOS) and `FileVersion` (Windows) will be set automatically to `version.build_number` on CI server (Travis, AppVeyor, CircleCI and Bamboo supported).

{!includes/hooks.md!}
