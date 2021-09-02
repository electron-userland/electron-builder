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
   
    `json`, [json5](http://json5.org), [toml](https://github.com/toml-lang/toml) or `js` (exported configuration or function that produces configuration) formats also supported.

    !!! tip
        If you want to use [toml](https://en.wikipedia.org/wiki/TOML), please install `yarn add toml --dev`.

Most of the options accept `null` — for example, to explicitly set that DMG icon must be default volume icon from the OS and default rules must be not applied (i.e. use application icon as DMG icon), set `dmg.icon` to `null`.

## Artifact File Name Template

`${ext}` macro is supported in addition to [file macros](../file-patterns.md#file-macros).

## Environment Variables from File

Env file `electron-builder.env` in the current dir ([example](https://github.com/motdotla/dotenv-expand/blob/master/test/.env)). Supported only for CLI usage.

## How to Read Docs

* Name of optional property is normal, **required** is bold.
* Type is specified after property name: `Array<String> | String`. Union like this means that you can specify or string (`**/*`), or array of strings (`["**/*", "!foo.js"]`).

## Configuration

<!-- do not edit. start of generated block -->
<ul>
<li><code id="Configuration-appId">appId</code> = `com.electron.${name}` String | "undefined" - The application id. Used as [CFBundleIdentifier](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070) for MacOS and as [Application User Model ID](https://msdn.microsoft.com/en-us/library/windows/desktop/dd378459(v=vs.85).aspx) for Windows (NSIS target only, Squirrel.Windows not supported). It is strongly recommended that an explicit ID is set.</li>
<li><code id="Configuration-productName">productName</code> String | "undefined" - As [name](#Metadata-name), but allows you to specify a product name for your executable which contains spaces and other special characters not allowed in the [name property](https://docs.npmjs.com/files/package.json#name).</li>
<li><code id="Configuration-copyright">copyright</code> = `Copyright © year ${author}` String | "undefined" - The human-readable copyright line for the app.</li>
<hr>
<li><code id="Configuration-directories">directories</code> [MetadataDirectories](#MetadataDirectories) | "undefined"</li>
<hr>
<li><code id="Configuration-mac">mac</code> [MacConfiguration](mac) - Options related to how build macOS targets.</li>
<li><code id="Configuration-mas">mas</code> [MasConfiguration](mas) - MAS (Mac Application Store) options.</li>
<li><code id="Configuration-masDev">masDev</code> [MasConfiguration](mas) - MAS (Mac Application Store) development options (`mas-dev` target).</li>
<li><code id="Configuration-dmg">dmg</code> [DmgOptions](dmg) - macOS DMG options.</li>
<li><code id="Configuration-pkg">pkg</code> [PkgOptions](pkg) - macOS PKG options.</li>
<hr>
<li><code id="Configuration-win">win</code> [WindowsConfiguration](win) - Options related to how build Windows targets.</li>
<li><code id="Configuration-nsis">nsis</code> [NsisOptions](nsis)</li>
<li><code id="Configuration-nsisWeb">nsisWeb</code> [NsisWebOptions](#NsisWebOptions) | "undefined"</li>
<li><code id="Configuration-portable">portable</code> [PortableOptions](#PortableOptions) | "undefined"</li>
<li><code id="Configuration-appx">appx</code> [AppXOptions](appx)</li>
<li><code id="Configuration-squirrelWindows">squirrelWindows</code> [SquirrelWindowsOptions](squirrel-windows.md)</li>
<hr>
<li><code id="Configuration-linux">linux</code> [LinuxConfiguration](linux) - Options related to how build Linux targets.</li>
<li><code id="Configuration-deb">deb</code> [DebOptions](/configuration/linux#de) - Debian package options.</li>
<li><code id="Configuration-snap">snap</code> [SnapOptions](snap) - Snap options.</li>
<li><code id="Configuration-appImage">appImage</code> [AppImageOptions](/configuration/linux#appimageoptions) - AppImage options.</li>
<li><code id="Configuration-flatpak">flatpak</code> [FlatpakOptions](#FlatpakOptions) | "undefined" - Flatpak options.</li>
<li><code id="Configuration-pacman">pacman</code> [LinuxTargetSpecificOptions](/configuration/linux#LinuxTargetSpecificOptions)</li>
<li><code id="Configuration-rpm">rpm</code> [LinuxTargetSpecificOptions](/configuration/linux#LinuxTargetSpecificOptions)</li>
<li><code id="Configuration-freebsd">freebsd</code> [LinuxTargetSpecificOptions](/configuration/linux#LinuxTargetSpecificOptions)</li>
<li><code id="Configuration-p5p">p5p</code> [LinuxTargetSpecificOptions](/configuration/linux#LinuxTargetSpecificOptions)</li>
<li><code id="Configuration-apk">apk</code> [LinuxTargetSpecificOptions](/configuration/linux#LinuxTargetSpecificOptions)</li>
<li><code id="Configuration-includeSubNodeModules">includeSubNodeModules</code> = `false` Boolean - Whether to include *all* of the submodules node_modules directories</li>
<hr>
<li><code id="Configuration-buildDependenciesFromSource">buildDependenciesFromSource</code> = `false` Boolean - Whether to build the application native dependencies from source.</li>
<li><code id="Configuration-nodeGypRebuild">nodeGypRebuild</code> = `false` Boolean - Whether to execute `node-gyp rebuild` before starting to package the app.
<pre><code class="hljs">Don't [use](https://github.com/electron-userland/electron-builder/issues/683#issuecomment-241214075) [npm](http://electron.atom.io/docs/tutorial/using-native-node-modules/#using-npm) (neither `.npmrc`) for configuring electron headers. Use `electron-builder node-gyp-rebuild` instead.
</code></pre>
</li>
<li><code id="Configuration-npmArgs">npmArgs</code> Array&lt;String&gt; | String | "undefined" - Additional command line arguments to use when installing app native deps.</li>
<li><code id="Configuration-npmRebuild">npmRebuild</code> = `true` Boolean - Whether to [rebuild](https://docs.npmjs.com/cli/rebuild) native dependencies before starting to package the app.</li>
<hr>
<li><code id="Configuration-buildVersion">buildVersion</code> String | "undefined" - The build version. Maps to the `CFBundleVersion` on macOS, and `FileVersion` metadata property on Windows. Defaults to the `version`. If `TRAVIS_BUILD_NUMBER` or `APPVEYOR_BUILD_NUMBER` or `CIRCLE_BUILD_NUM` or `BUILD_NUMBER` or `bamboo.buildNumber` or `CI_PIPELINE_IID` env defined, it will be used as a build version (`version.build_number`).</li>
<li><code id="Configuration-electronCompile">electronCompile</code> Boolean - Whether to use [electron-compile](http://github.com/electron/electron-compile) to compile app. Defaults to `true` if `electron-compile` in the dependencies. And `false` if in the `devDependencies` or doesn't specified.</li>
<li><code id="Configuration-electronDist">electronDist</code> String | module:app-builder-lib/out/configuration.__type - Returns the path to custom Electron build (e.g. `~/electron/out/R`). Zip files must follow the pattern `electron-v${version}-${platformName}-${arch}.zip`, otherwise it will be assumed to be an unpacked Electron app directory</li>
<li><code id="Configuration-electronDownload">electronDownload</code><a name="ElectronDownloadOptions"></a> - The [electron-download](https://github.com/electron-userland/electron-download#usage) options.
<ul>
<li><code id="ElectronDownloadOptions-version">version</code> String</li>
<li><code id="ElectronDownloadOptions-cache">cache</code> String | "undefined" - The [cache location](https://github.com/electron-userland/electron-download#cache-location).</li>
<li><code id="ElectronDownloadOptions-mirror">mirror</code> String | "undefined" - The mirror.</li>
<li><code id="ElectronDownloadOptions-strictSSL">strictSSL</code> Boolean</li>
<li><code id="ElectronDownloadOptions-isVerifyChecksum">isVerifyChecksum</code> Boolean</li>
<li><code id="ElectronDownloadOptions-platform">platform</code> "darwin" | "linux" | "win32" | "mas"</li>
<li><code id="ElectronDownloadOptions-arch">arch</code> String</li>
</ul></li>
<li><code id="Configuration-electronBranding">electronBranding</code> ElectronBrandingOptions - The branding used by Electron's distributables. This is needed if a fork has modified Electron's BRANDING.json file.</li>
<li><code id="Configuration-electronVersion">electronVersion</code> String | "undefined" - The version of electron you are packaging for. Defaults to version of `electron`, `electron-prebuilt` or `electron-prebuilt-compile` dependency.</li>
<li><code id="Configuration-extends">extends</code> Array&lt;String&gt; | String | "undefined" - The name of a built-in configuration preset (currently, only `react-cra` is supported) or any number of paths to config files (relative to project dir).
<pre><code class="hljs">The latter allows to mixin a config from multiple other configs, as if you `Object.assign` them, but properly combine `files` glob patterns.

If `react-scripts` in the app dependencies, `react-cra` will be set automatically. Set to `null` to disable automatic detection.
</code></pre>
</li>
<li><code id="Configuration-extraMetadata">extraMetadata</code> any - Inject properties to `package.json`.</li>
<hr>
<li><code id="Configuration-forceCodeSigning">forceCodeSigning</code> = `false` Boolean - Whether to fail if the application is not signed (to prevent unsigned app if code signing configuration is not correct).</li>
<li><code id="Configuration-nodeVersion">nodeVersion</code> String | "undefined" - *libui-based frameworks only* The version of NodeJS you are packaging for. You can set it to `current` to set the Node.js version that you use to run.</li>
<li><code id="Configuration-launchUiVersion">launchUiVersion</code> Boolean | String | "undefined" - *libui-based frameworks only* The version of LaunchUI you are packaging for. Applicable for Windows only. Defaults to version suitable for used framework version.</li>
<li><code id="Configuration-framework">framework</code> String | "undefined" - The framework name. One of `electron`, `proton`, `libui`. Defaults to `electron`.</li>
<li><code id="Configuration-beforePack">beforePack</code> module:app-builder-lib/out/configuration.__type | String | "undefined" - The function (or path to file or module id) to be [run before pack](#beforepack)</li>
<hr>
<li><code id="Configuration-afterPack">afterPack</code> - The function (or path to file or module id) to be [run after pack](#afterpack) (but before pack into distributable format and sign).</li>
<li><code id="Configuration-afterSign">afterSign</code> - The function (or path to file or module id) to be [run after pack and sign](#aftersign) (but before pack into distributable format).</li>
<li><code id="Configuration-artifactBuildStarted">artifactBuildStarted</code> module:app-builder-lib/out/configuration.__type | String | "undefined" - The function (or path to file or module id) to be run on artifact build start.</li>
<li><code id="Configuration-artifactBuildCompleted">artifactBuildCompleted</code> module:app-builder-lib/out/configuration.__type | String | "undefined" - The function (or path to file or module id) to be run on artifact build completed.</li>
<li><code id="Configuration-afterAllArtifactBuild">afterAllArtifactBuild</code> - The function (or path to file or module id) to be [run after all artifacts are build](#afterAllArtifactBuild).</li>
<li><code id="Configuration-msiProjectCreated">msiProjectCreated</code> module:app-builder-lib/out/configuration.__type | String | "undefined" - MSI project created on disk - not packed into .msi package yet.</li>
<li><code id="Configuration-appxManifestCreated">appxManifestCreated</code> module:app-builder-lib/out/configuration.__type | String | "undefined" - Appx manifest created on disk - not packed into .appx package yet.</li>
<li><code id="Configuration-onNodeModuleFile">onNodeModuleFile</code> - The function (or path to file or module id) to be [run on each node module](#onnodemodulefile) file.</li>
<li><code id="Configuration-beforeBuild">beforeBuild</code> (context: BeforeBuildContext) => Promise | null - The function (or path to file or module id) to be run before dependencies are installed or rebuilt. Works when `npmRebuild` is set to `true`. Resolving to `false` will skip dependencies install or rebuild.
<pre><code class="hljs">If provided and `node_modules` are missing, it will not invoke production dependencies check.
</code></pre>
</li>
<hr>
<li><code id="Configuration-remoteBuild">remoteBuild</code> = `true` Boolean - Whether to build using Electron Build Service if target not supported on current OS.</li>
<li><code id="Configuration-includePdb">includePdb</code> = `false` Boolean - Whether to include PDB files.</li>
<li><code id="Configuration-removePackageScripts">removePackageScripts</code> = `true` Boolean - Whether to remove `scripts` field from `package.json` files.</li>
<li><code id="Configuration-removePackageKeywords">removePackageKeywords</code> = `true` Boolean - Whether to remove `keywords` field from `package.json` files.</li>
</ul>

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
