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
        If you want to use `js` file, do not name it `electron-builder.js`. It will [conflict](https://github.com/electron-userland/electron-builder/issues/6227) with `electron-builder` package name.

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
<li><code id="Configuration-appId">appId</code> = <code>com.electron.${name}</code> String | “undefined” - The application id. Used as <a href="https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070">CFBundleIdentifier</a> for MacOS and as <a href="https://msdn.microsoft.com/en-us/library/windows/desktop/dd378459(v=vs.85).aspx">Application User Model ID</a> for Windows (NSIS target only, Squirrel.Windows not supported). It is strongly recommended that an explicit ID is set.</li>
<li><code id="Configuration-productName">productName</code> String | “undefined” - As <a href="#Metadata-name">name</a>, but allows you to specify a product name for your executable which contains spaces and other special characters not allowed in the <a href="https://docs.npmjs.com/files/package.json#name">name property</a>.</li>
<li><code id="Configuration-copyright">copyright</code> = <code>Copyright © year ${author}</code> String | “undefined” - The human-readable copyright line for the app.</li>
</ul>
<hr>
<ul>
<li><code id="Configuration-directories">directories</code> <a href="#MetadataDirectories">MetadataDirectories</a> | “undefined”</li>
</ul>
<hr>
<ul>
<li><code id="Configuration-mac">mac</code> <a href="mac">MacConfiguration</a> - Options related to how build macOS targets.</li>
<li><code id="Configuration-mas">mas</code> <a href="mas">MasConfiguration</a> - MAS (Mac Application Store) options.</li>
<li><code id="Configuration-masDev">masDev</code> <a href="mas">MasConfiguration</a> - MAS (Mac Application Store) development options (<code>mas-dev</code> target).</li>
<li><code id="Configuration-dmg">dmg</code> <a href="dmg">DmgOptions</a> - macOS DMG options.</li>
<li><code id="Configuration-pkg">pkg</code> <a href="pkg">PkgOptions</a> - macOS PKG options.</li>
</ul>
<hr>
<ul>
<li><code id="Configuration-win">win</code> <a href="win">WindowsConfiguration</a> - Options related to how build Windows targets.</li>
<li><code id="Configuration-nsis">nsis</code> <a href="nsis">NsisOptions</a></li>
<li><code id="Configuration-nsisWeb">nsisWeb</code> <a href="#NsisWebOptions">NsisWebOptions</a> | “undefined”</li>
<li><code id="Configuration-portable">portable</code> <a href="#PortableOptions">PortableOptions</a> | “undefined”</li>
<li><code id="Configuration-appx">appx</code> <a href="appx">AppXOptions</a></li>
<li><code id="Configuration-squirrelWindows">squirrelWindows</code> <a href="squirrel-windows.md">SquirrelWindowsOptions</a></li>
</ul>
<hr>
<ul>
<li><code id="Configuration-linux">linux</code> <a href="linux">LinuxConfiguration</a> - Options related to how build Linux targets.</li>
<li><code id="Configuration-deb">deb</code> <a href="/configuration/linux#de">DebOptions</a> - Debian package options.</li>
<li><code id="Configuration-snap">snap</code> <a href="snap">SnapOptions</a> - Snap options.</li>
<li><code id="Configuration-appImage">appImage</code> <a href="/configuration/linux#appimageoptions">AppImageOptions</a> - AppImage options.</li>
<li><code id="Configuration-flatpak">flatpak</code> <a href="#FlatpakOptions">FlatpakOptions</a> | “undefined” - Flatpak options.</li>
<li><code id="Configuration-pacman">pacman</code> <a href="/configuration/linux#LinuxTargetSpecificOptions">LinuxTargetSpecificOptions</a></li>
<li><code id="Configuration-rpm">rpm</code> <a href="/configuration/linux#LinuxTargetSpecificOptions">LinuxTargetSpecificOptions</a></li>
<li><code id="Configuration-freebsd">freebsd</code> <a href="/configuration/linux#LinuxTargetSpecificOptions">LinuxTargetSpecificOptions</a></li>
<li><code id="Configuration-p5p">p5p</code> <a href="/configuration/linux#LinuxTargetSpecificOptions">LinuxTargetSpecificOptions</a></li>
<li><code id="Configuration-apk">apk</code> <a href="/configuration/linux#LinuxTargetSpecificOptions">LinuxTargetSpecificOptions</a></li>
<li><code id="Configuration-includeSubNodeModules">includeSubNodeModules</code> = <code>false</code> Boolean - Whether to include <em>all</em> of the submodules node_modules directories</li>
</ul>
<hr>
<ul>
<li>
<p><code id="Configuration-buildDependenciesFromSource">buildDependenciesFromSource</code> = <code>false</code> Boolean - Whether to build the application native dependencies from source.</p>
</li>
<li>
<p><code id="Configuration-nodeGypRebuild">nodeGypRebuild</code> = <code>false</code> Boolean - Whether to execute <code>node-gyp rebuild</code> before starting to package the app.</p>
<p>Don’t <a href="https://github.com/electron-userland/electron-builder/issues/683#issuecomment-241214075">use</a> <a href="http://electron.atom.io/docs/tutorial/using-native-node-modules/#using-npm">npm</a> (neither <code>.npmrc</code>) for configuring electron headers. Use <code>electron-builder node-gyp-rebuild</code> instead.</p>
</li>
<li>
<p><code id="Configuration-npmArgs">npmArgs</code> Array&lt;String&gt; | String | “undefined” - Additional command line arguments to use when installing app native deps.</p>
</li>
<li>
<p><code id="Configuration-npmRebuild">npmRebuild</code> = <code>true</code> Boolean - Whether to <a href="https://docs.npmjs.com/cli/rebuild">rebuild</a> native dependencies before starting to package the app.</p>
</li>
</ul>
<hr>
<ul>
<li>
<p><code id="Configuration-buildVersion">buildVersion</code> String | “undefined” - The build version. Maps to the <code>CFBundleVersion</code> on macOS, and <code>FileVersion</code> metadata property on Windows. Defaults to the <code>version</code>. If <code>TRAVIS_BUILD_NUMBER</code> or <code>APPVEYOR_BUILD_NUMBER</code> or <code>CIRCLE_BUILD_NUM</code> or <code>BUILD_NUMBER</code> or <code>bamboo.buildNumber</code> or <code>CI_PIPELINE_IID</code> env defined, it will be used as a build version (<code>version.build_number</code>).</p>
</li>
<li>
<p><code id="Configuration-electronCompile">electronCompile</code> Boolean - Whether to use <a href="http://github.com/electron/electron-compile">electron-compile</a> to compile app. Defaults to <code>true</code> if <code>electron-compile</code> in the dependencies. And <code>false</code> if in the <code>devDependencies</code> or doesn’t specified.</p>
</li>
<li>
<p><code id="Configuration-electronDist">electronDist</code> String | module:app-builder-lib/out/configuration.__type - Returns the path to custom Electron build (e.g. <code>~/electron/out/R</code>). Zip files must follow the pattern <code>electron-v${version}-${platformName}-${arch}.zip</code>, otherwise it will be assumed to be an unpacked Electron app directory</p>
</li>
<li>
<p><code id="Configuration-electronDownload">electronDownload</code><a name="ElectronDownloadOptions"></a> - The <a href="https://github.com/electron-userland/electron-download#usage">electron-download</a> options.</p>
<ul>
<li><code id="ElectronDownloadOptions-version">version</code> String</li>
<li><code id="ElectronDownloadOptions-cache">cache</code> String | “undefined” - The <a href="https://github.com/electron-userland/electron-download#cache-location">cache location</a>.</li>
<li><code id="ElectronDownloadOptions-mirror">mirror</code> String | “undefined” - The mirror.</li>
<li><code id="ElectronDownloadOptions-strictSSL">strictSSL</code> Boolean</li>
<li><code id="ElectronDownloadOptions-isVerifyChecksum">isVerifyChecksum</code> Boolean</li>
<li><code id="ElectronDownloadOptions-platform">platform</code> “darwin” | “linux” | “win32” | “mas”</li>
<li><code id="ElectronDownloadOptions-arch">arch</code> String</li>
</ul>
</li>
<li>
<p><code id="Configuration-electronBranding">electronBranding</code> ElectronBrandingOptions - The branding used by Electron’s distributables. This is needed if a fork has modified Electron’s BRANDING.json file.</p>
</li>
<li>
<p><code id="Configuration-electronVersion">electronVersion</code> String | “undefined” - The version of electron you are packaging for. Defaults to version of <code>electron</code>, <code>electron-prebuilt</code> or <code>electron-prebuilt-compile</code> dependency.</p>
</li>
<li>
<p><code id="Configuration-extends">extends</code> Array&lt;String&gt; | String | “undefined” - The name of a built-in configuration preset (currently, only <code>react-cra</code> is supported) or any number of paths to config files (relative to project dir).</p>
<p>The latter allows to mixin a config from multiple other configs, as if you <code>Object.assign</code> them, but properly combine <code>files</code> glob patterns.</p>
<p>If <code>react-scripts</code> in the app dependencies, <code>react-cra</code> will be set automatically. Set to <code>null</code> to disable automatic detection.</p>
</li>
<li>
<p><code id="Configuration-extraMetadata">extraMetadata</code> any - Inject properties to <code>package.json</code>.</p>
</li>
</ul>
<hr>
<ul>
<li><code id="Configuration-forceCodeSigning">forceCodeSigning</code> = <code>false</code> Boolean - Whether to fail if the application is not signed (to prevent unsigned app if code signing configuration is not correct).</li>
<li><code id="Configuration-nodeVersion">nodeVersion</code> String | “undefined” - <em>libui-based frameworks only</em> The version of NodeJS you are packaging for. You can set it to <code>current</code> to set the Node.js version that you use to run.</li>
<li><code id="Configuration-launchUiVersion">launchUiVersion</code> Boolean | String | “undefined” - <em>libui-based frameworks only</em> The version of LaunchUI you are packaging for. Applicable for Windows only. Defaults to version suitable for used framework version.</li>
<li><code id="Configuration-framework">framework</code> String | “undefined” - The framework name. One of <code>electron</code>, <code>proton</code>, <code>libui</code>. Defaults to <code>electron</code>.</li>
<li><code id="Configuration-beforePack">beforePack</code> module:app-builder-lib/out/configuration.__type | String | “undefined” - The function (or path to file or module id) to be <a href="#beforepack">run before pack</a></li>
</ul>
<hr>
<ul>
<li>
<p><code id="Configuration-afterPack">afterPack</code> - The function (or path to file or module id) to be <a href="#afterpack">run after pack</a> (but before pack into distributable format and sign).</p>
</li>
<li>
<p><code id="Configuration-afterSign">afterSign</code> - The function (or path to file or module id) to be <a href="#aftersign">run after pack and sign</a> (but before pack into distributable format).</p>
</li>
<li>
<p><code id="Configuration-artifactBuildStarted">artifactBuildStarted</code> module:app-builder-lib/out/configuration.__type | String | “undefined” - The function (or path to file or module id) to be run on artifact build start.</p>
</li>
<li>
<p><code id="Configuration-artifactBuildCompleted">artifactBuildCompleted</code> module:app-builder-lib/out/configuration.__type | String | “undefined” - The function (or path to file or module id) to be run on artifact build completed.</p>
</li>
<li>
<p><code id="Configuration-afterAllArtifactBuild">afterAllArtifactBuild</code> - The function (or path to file or module id) to be <a href="#afterAllArtifactBuild">run after all artifacts are build</a>.</p>
</li>
<li>
<p><code id="Configuration-msiProjectCreated">msiProjectCreated</code> module:app-builder-lib/out/configuration.__type | String | “undefined” - MSI project created on disk - not packed into .msi package yet.</p>
</li>
<li>
<p><code id="Configuration-appxManifestCreated">appxManifestCreated</code> module:app-builder-lib/out/configuration.__type | String | “undefined” - Appx manifest created on disk - not packed into .appx package yet.</p>
</li>
<li>
<p><code id="Configuration-onNodeModuleFile">onNodeModuleFile</code> - The function (or path to file or module id) to be <a href="#onnodemodulefile">run on each node module</a> file.</p>
</li>
<li>
<p><code id="Configuration-beforeBuild">beforeBuild</code> (context: BeforeBuildContext) =&gt; Promise | null - The function (or path to file or module id) to be run before dependencies are installed or rebuilt. Works when <code>npmRebuild</code> is set to <code>true</code>. Resolving to <code>false</code> will skip dependencies install or rebuild.</p>
<p>If provided and <code>node_modules</code> are missing, it will not invoke production dependencies check.</p>
</li>
</ul>
<hr>
<ul>
<li><code id="Configuration-remoteBuild">remoteBuild</code> = <code>true</code> Boolean - Whether to build using Electron Build Service if target not supported on current OS.</li>
<li><code id="Configuration-includePdb">includePdb</code> = <code>false</code> Boolean - Whether to include PDB files.</li>
<li><code id="Configuration-removePackageScripts">removePackageScripts</code> = <code>true</code> Boolean - Whether to remove <code>scripts</code> field from <code>package.json</code> files.</li>
<li><code id="Configuration-removePackageKeywords">removePackageKeywords</code> = <code>true</code> Boolean - Whether to remove <code>keywords</code> field from <code>package.json</code> files.</li>
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
