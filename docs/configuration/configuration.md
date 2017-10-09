electron-builder [configuration](#configuration) can be defined
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

  If you want to use [toml](https://en.wikipedia.org/wiki/TOML), please install `yarn add toml --dev`.

Most of the options accept `null` — for example, to explicitly set that DMG icon must be default volume icon from the OS and default rules must be not applied (i.e. use application icon as DMG icon), set `dmg.icon` to `null`.

## Artifact File Name Template

`${ext}` macro is supported in addition to [file macros](/file-patterns.md#file-macros).

## Environment Variables from File

Env file `electron-builder.env` in the current dir ([example](https://github.com/motdotla/dotenv-expand/blob/master/test/.env)). Supported only for CLI usage.

## How to Read Docs

* Name of optional property is normal, **required** is bold.
* Type is specified after property name: `Array<String> | String`. Union like this means that you can specify or string (`**/*`), or array of strings (`["**/*", "!foo.js"]`).

## Configuration

<!-- do not edit. start of generated block -->
* <code id="Configuration-appId">appId</code> = `com.electron.${name}` String - The application id. Used as [CFBundleIdentifier](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070) for MacOS and as [Application User Model ID](https://msdn.microsoft.com/en-us/library/windows/desktop/dd378459(v=vs.85).aspx) for Windows (NSIS target only, Squirrel.Windows not supported). It is strongly recommended that an explicit ID is set.
* <code id="Configuration-productName">productName</code> String - As [name](#Metadata-name), but allows you to specify a product name for your executable which contains spaces and other special characters not allowed in the [name property](https://docs.npmjs.com/files/package.json#name}).
* <code id="Configuration-copyright">copyright</code> = `Copyright © year ${author}` String - The human-readable copyright line for the app.

---

* <code id="Configuration-directories">directories</code><a name="MetadataDirectories"></a>
  * <code id="MetadataDirectories-buildResources">buildResources</code> = `build` String - The path to build resources.
    
    Please note — build resources is not packed into the app. If you need to use some files, e.g. as tray icon, please include required files explicitly: `"files": ["**/*", "build/icon.*"]`
  * <code id="MetadataDirectories-output">output</code> = `dist` String - The output directory.
  * <code id="MetadataDirectories-app">app</code> String - The application directory (containing the application package.json), defaults to `app`, `www` or working directory.

---

* <code id="Configuration-mac">mac</code> [MacConfiguration](mac.md) - Options related to how build macOS targets.
* <code id="Configuration-mas">mas</code> [MasConfiguration](mas.md) - MAS (Mac Application Store) options.
* <code id="Configuration-dmg">dmg</code> [DmgOptions](dmg.md) - macOS DMG options.
* <code id="Configuration-pkg">pkg</code> [PkgOptions](pkg.md) - macOS PKG options.

---

* <code id="Configuration-win">win</code> [WindowsConfiguration](win.md) - Options related to how build Windows targets.
* <code id="Configuration-nsis">nsis</code> [NsisOptions](nsis.md)
* <code id="Configuration-nsisWeb">nsisWeb</code><a name="NsisWebOptions"></a> - Web Installer options.
  Inherits [NsisOptions](nsis.md) options.
  * <code id="NsisWebOptions-appPackageUrl">appPackageUrl</code> String - The application package download URL. Optional — by default computed using publish configuration.
    
    URL like `https://example.com/download/latest` allows web installer to be version independent (installer will download latest application package). Please note — it is [full URL](https://github.com/electron-userland/electron-builder/issues/1810#issuecomment-317650878).
    
    Custom `X-Arch` http header is set to `32` or `64`.
  * <code id="NsisWebOptions-artifactName">artifactName</code> String - The [artifact file name template](/configuration/configuration.md#artifact-file-name-template). Defaults to `${productName} Web Setup ${version}.${ext}`.
* <code id="Configuration-portable">portable</code><a name="PortableOptions"></a> - Portable options.
  * <code id="PortableOptions-requestExecutionLevel">requestExecutionLevel</code> = `user` "user" | "highest" | "admin" - The [requested execution level](http://nsis.sourceforge.net/Reference/RequestExecutionLevel) for Windows.
* <code id="Configuration-appx">appx</code> [AppXOptions](appx.md)
* <code id="Configuration-squirrelWindows">squirrelWindows</code> [SquirrelWindowsOptions](squirrel-windows.md)

---

* <code id="Configuration-linux">linux</code> [LinuxConfiguration](linux.md) - Options related to how build Linux targets.
* <code id="Configuration-deb">deb</code> [DebOptions](/configuration/linux.md#de) - Debian package options.
* <code id="Configuration-snap">snap</code> [SnapOptions](snap.md) - Snap options.
* <code id="Configuration-appImage">appImage</code> [AppImageOptions](/configuration/linux.md#appimageoptions) - AppImage options.
* <code id="Configuration-pacman">pacman</code> [LinuxTargetSpecificOptions](/configuration/linux.md#LinuxTargetSpecificOptions)
* <code id="Configuration-rpm">rpm</code> [LinuxTargetSpecificOptions](/configuration/linux.md#LinuxTargetSpecificOptions)
* <code id="Configuration-freebsd">freebsd</code> [LinuxTargetSpecificOptions](/configuration/linux.md#LinuxTargetSpecificOptions)
* <code id="Configuration-p5p">p5p</code> [LinuxTargetSpecificOptions](/configuration/linux.md#LinuxTargetSpecificOptions)
* <code id="Configuration-apk">apk</code> [LinuxTargetSpecificOptions](/configuration/linux.md#LinuxTargetSpecificOptions)

---

* <code id="Configuration-buildDependenciesFromSource">buildDependenciesFromSource</code> = `false` Boolean - Whether to build the application native dependencies from source.
* <code id="Configuration-nodeGypRebuild">nodeGypRebuild</code> = `false` Boolean - Whether to execute `node-gyp rebuild` before starting to package the app.
  
  Don't [use](https://github.com/electron-userland/electron-builder/issues/683#issuecomment-241214075) [npm](http://electron.atom.io/docs/tutorial/using-native-node-modules/#using-npm) (neither `.npmrc`) for configuring electron headers. Use `electron-builder node-gyp-rebuild` instead.
* <code id="Configuration-npmArgs">npmArgs</code> Array&lt;String&gt; | String - Additional command line arguments to use when installing app native deps.
* <code id="Configuration-npmRebuild">npmRebuild</code> = `true` Boolean - Whether to [rebuild](https://docs.npmjs.com/cli/rebuild) native dependencies before starting to package the app.

---

* <code id="Configuration-buildVersion">buildVersion</code> String - The build version. Maps to the `CFBundleVersion` on macOS, and `FileVersion` metadata property on Windows. Defaults to the `version`. If `TRAVIS_BUILD_NUMBER` or `APPVEYOR_BUILD_NUMBER` or `CIRCLE_BUILD_NUM` or `BUILD_NUMBER` or `bamboo.buildNumber` env defined, it will be used as a build version (`version.build_number`).
* <code id="Configuration-electronCompile">electronCompile</code> Boolean - Whether to use [electron-compile](http://github.com/electron/electron-compile) to compile app. Defaults to `true` if `electron-compile` in the dependencies. And `false` if in the `devDependencies` or doesn't specified.
* <code id="Configuration-electronDist">electronDist</code> String - The path to custom Electron build (e.g. `~/electron/out/R`).
* <code id="Configuration-electronDownload">electronDownload</code><a name="ElectronDownloadOptions"></a> - The [electron-download](https://github.com/electron-userland/electron-download#usage) options.
  * <code id="ElectronDownloadOptions-cache">cache</code> String - The [cache location](https://github.com/electron-userland/electron-download#cache-location).
  * <code id="ElectronDownloadOptions-mirror">mirror</code> String - The mirror.
  * <code id="ElectronDownloadOptions-quiet">quiet</code> Boolean
  * <code id="ElectronDownloadOptions-strictSSL">strictSSL</code> Boolean
  * <code id="ElectronDownloadOptions-verifyChecksum">verifyChecksum</code> Boolean
* <code id="Configuration-electronVersion">electronVersion</code> String - The version of electron you are packaging for. Defaults to version of `electron`, `electron-prebuilt` or `electron-prebuilt-compile` dependency.
* <code id="Configuration-extends">extends</code> String - The name of a built-in configuration preset or path to config file (relative to project dir). Currently, only `react-cra` is supported.
  
  If `react-scripts` in the app dev dependencies, `react-cra` will be set automatically. Set to `null` to disable automatic detection.
* <code id="Configuration-extraMetadata">extraMetadata</code> any - Inject properties to `package.json`.

---

* <code id="Configuration-forceCodeSigning">forceCodeSigning</code> = `false` Boolean - Whether to fail if the application is not signed (to prevent unsigned app if code signing configuration is not correct).
* <code id="Configuration-muonVersion">muonVersion</code> String - The version of muon you are packaging for.

---

* <code id="Configuration-afterPack">afterPack</code> (context: AfterPackContext) => Promise | null - The function (or path to file or module id) to be run after pack (but before pack into distributable format and sign).
* <code id="Configuration-beforeBuild">beforeBuild</code> (context: BeforeBuildContext) => Promise | null - The function (or path to file or module id) to be run before dependencies are installed or rebuilt. Works when `npmRebuild` is set to `true`. Resolving to `false` will skip dependencies install or rebuild.
<!-- end of generated block -->

---

Following options can be set also per platform (top-level keys [mac](mac.md), [linux](linux.md) and [win](win.md)).

{% include "/generated/PlatformSpecificBuildOptions.md" %}

## Metadata
Some standard fields should be defined in the `package.json`.

{% include "/generated/Metadata.md" %}

## Build Version Management
`CFBundleVersion` (macOS) and `FileVersion` (Windows) will be set automatically to `version.build_number` on CI server (Travis, AppVeyor, CircleCI and Bamboo supported).