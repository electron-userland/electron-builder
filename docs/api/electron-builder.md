Developer API only. See [Configuration](../configuration/configuration.md) for user documentation.
  
<!-- do not edit. start of generated block -->
# Modules

<dl>
<dt><a href="#module_electron-builder">electron-builder</a></dt>
<dd></dd>
<dt><a href="#module_app-builder-lib">app-builder-lib</a></dt>
<dd></dd>
<dt><a href="#module_electron-publish">electron-publish</a></dt>
<dd></dd>
<dt><a href="#module_electron-updater">electron-updater</a></dt>
<dd></dd>
</dl>

<a name="module_electron-builder"></a>
# electron-builder

* [electron-builder](#module_electron-builder)
    * [`.Arch`](#Arch) : <code>enum</code>
    * [`.build(rawOptions)`](#module_electron-builder.build) ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
    * [`.createTargets(platforms, type, arch)`](#module_electron-builder.createTargets) ⇒ <code>Map&lt;Platform \| Map&lt;[Arch](#Arch) \| Array&lt;String&gt;&gt;&gt;</code>

<a name="Arch"></a>
## `electron-builder.Arch` : <code>enum</code>
**Kind**: enum of [<code>electron-builder</code>](#module_electron-builder)<br/>
**Properties**
<ul>
<li><b><code id="Arch-ia32">ia32</code></b></li> 
<li><b><code id="Arch-x64">x64</code></b></li> 
<li><b><code id="Arch-armv7l">armv7l</code></b></li> 
<li><b><code id="Arch-arm64">arm64</code></b></li> 
<li><b><code id="Arch-universal">universal</code></b></li> 
</ul>

<a name="module_electron-builder.build"></a>
## `electron-builder.build(rawOptions)` ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
**Kind**: method of [<code>electron-builder</code>](#module_electron-builder)<br/>

| Param | Type |
| --- | --- |
| rawOptions | <code>[CliOptions](#CliOptions)</code> | 

<a name="module_electron-builder.createTargets"></a>
## `electron-builder.createTargets(platforms, type, arch)` ⇒ <code>Map&lt;Platform \| Map&lt;[Arch](#Arch) \| Array&lt;String&gt;&gt;&gt;</code>
**Kind**: method of [<code>electron-builder</code>](#module_electron-builder)<br/>

| Param | Type |
| --- | --- |
| platforms | <code>Array&lt;Platform&gt;</code> | 
| type | <code>String</code> \| <code>"undefined"</code> | 
| arch | <code>String</code> \| <code>"undefined"</code> | 

<a name="module_app-builder-lib"></a>
# app-builder-lib

* [app-builder-lib](#module_app-builder-lib)
    * [`.ArtifactBuildStarted`](#ArtifactBuildStarted)
    * [`.ArtifactCreated`](#ArtifactCreated) ⇐ <code>module:packages/electron-publish/out/publisher.UploadTask</code>
    * [`.BeforeBuildContext`](#BeforeBuildContext)
    * [`.BuildResult`](#BuildResult)
    * [`.CertificateFromStoreInfo`](#CertificateFromStoreInfo)
    * [`.FileCodeSigningInfo`](#FileCodeSigningInfo)
    * [`.Framework`](#Framework)
        * [`.afterPack(context)`](#module_app-builder-lib.Framework+afterPack) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.beforeCopyExtraFiles(options)`](#module_app-builder-lib.Framework+beforeCopyExtraFiles) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.createTransformer()`](#module_app-builder-lib.Framework+createTransformer) ⇒ <code>null</code> \| <code>module:packages/builder-util/out/fs.__type</code>
        * [`.getDefaultIcon(platform)`](#module_app-builder-lib.Framework+getDefaultIcon) ⇒ <code>null</code> \| <code>String</code>
        * [`.getExcludedDependencies(platform)`](#module_app-builder-lib.Framework+getExcludedDependencies) ⇒ <code>null</code> \| <code>Array</code>
        * [`.getMainFile(platform)`](#module_app-builder-lib.Framework+getMainFile) ⇒ <code>null</code> \| <code>String</code>
        * [`.prepareApplicationStageDirectory(options)`](#module_app-builder-lib.Framework+prepareApplicationStageDirectory) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.SourceRepositoryInfo`](#SourceRepositoryInfo)
    * [.AppInfo](#AppInfo)
        * [`.computePackageUrl()`](#module_app-builder-lib.AppInfo+computePackageUrl) ⇒ <code>Promise&lt; \| String&gt;</code>
        * [`.getVersionInWeirdWindowsForm(isSetBuildNumber)`](#module_app-builder-lib.AppInfo+getVersionInWeirdWindowsForm) ⇒ <code>String</code>
    * [.Packager](#Packager)
        * [`._build(configuration, metadata, devMetadata, repositoryInfo)`](#module_app-builder-lib.Packager+_build) ⇒ <code>Promise&lt;[BuildResult](#BuildResult)&gt;</code>
        * [`.addAfterPackHandler(handler)`](#module_app-builder-lib.Packager+addAfterPackHandler)
        * [`.afterPack(context)`](#module_app-builder-lib.Packager+afterPack) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.artifactCreated(handler)`](#module_app-builder-lib.Packager+artifactCreated) ⇒ <code>[Packager](#Packager)</code>
        * [`.build()`](#module_app-builder-lib.Packager+build) ⇒ <code>Promise&lt;[BuildResult](#BuildResult)&gt;</code>
        * [`.callAppxManifestCreated(path)`](#module_app-builder-lib.Packager+callAppxManifestCreated) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.callArtifactBuildCompleted(event)`](#module_app-builder-lib.Packager+callArtifactBuildCompleted) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.callArtifactBuildStarted(event, logFields)`](#module_app-builder-lib.Packager+callArtifactBuildStarted) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.callMsiProjectCreated(path)`](#module_app-builder-lib.Packager+callMsiProjectCreated) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.dispatchArtifactCreated(event)`](#module_app-builder-lib.Packager+dispatchArtifactCreated)
        * [`.disposeOnBuildFinish(disposer)`](#module_app-builder-lib.Packager+disposeOnBuildFinish)
        * [`.installAppDependencies(platform, arch)`](#module_app-builder-lib.Packager+installAppDependencies) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getNodeDependencyInfo(platform)`](#module_app-builder-lib.Packager+getNodeDependencyInfo) ⇒ <code>Lazy&lt;Array&lt;module:app-builder-lib/out/util/packageDependencies.NodeModuleDirInfo&gt;&gt;</code>
    * [.Platform](#Platform)
        * [`.createTarget(type, archs)`](#module_app-builder-lib.Platform+createTarget) ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;[Arch](#Arch) \| Array&lt;String&gt;&gt;&gt;</code>
        * [`.current()`](#module_app-builder-lib.Platform+current) ⇒ <code>[Platform](#Platform)</code>
        * [`.fromString(name)`](#module_app-builder-lib.Platform+fromString) ⇒ <code>[Platform](#Platform)</code>
        * [`.toString()`](#module_app-builder-lib.Platform+toString) ⇒ <code>String</code>
    * [.PlatformPackager](#PlatformPackager)
        * [`.artifactPatternConfig(targetSpecificOptions, defaultPattern)`](#module_app-builder-lib.PlatformPackager+artifactPatternConfig) ⇒ <code>module:app-builder-lib/out/platformPackager.__object</code>
        * [`.computeSafeArtifactName(suggestedName, ext, arch, skipDefaultArch, defaultArch, safePattern)`](#module_app-builder-lib.PlatformPackager+computeSafeArtifactName) ⇒ <code>null</code> \| <code>String</code>
        * [`.createTargets(targets, mapper)`](#module_app-builder-lib.PlatformPackager+createTargets)
        * [`.getDefaultFrameworkIcon()`](#module_app-builder-lib.PlatformPackager+getDefaultFrameworkIcon) ⇒ <code>null</code> \| <code>String</code>
        * [`.dispatchArtifactCreated(file, target, arch, safeArtifactName)`](#module_app-builder-lib.PlatformPackager+dispatchArtifactCreated) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.getElectronDestinationDir(appOutDir)`](#module_app-builder-lib.PlatformPackager+getElectronDestinationDir) ⇒ <code>String</code>
        * [`.getElectronSrcDir(dist)`](#module_app-builder-lib.PlatformPackager+getElectronSrcDir) ⇒ <code>String</code>
        * [`.expandArtifactBeautyNamePattern(targetSpecificOptions, ext, arch)`](#module_app-builder-lib.PlatformPackager+expandArtifactBeautyNamePattern) ⇒ <code>String</code>
        * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern, skipDefaultArch, defaultArch)`](#module_app-builder-lib.PlatformPackager+expandArtifactNamePattern) ⇒ <code>String</code>
        * [`.expandMacro(pattern, arch, extra, isProductNameSanitized)`](#module_app-builder-lib.PlatformPackager+expandMacro) ⇒ <code>String</code>
        * [`.generateName2(ext, classifier, deployment)`](#module_app-builder-lib.PlatformPackager+generateName2) ⇒ <code>String</code>
        * [`.getIconPath()`](#module_app-builder-lib.PlatformPackager+getIconPath) ⇒ <code>Promise&lt; \| String&gt;</code>
        * [`.getMacOsResourcesDir(appOutDir)`](#module_app-builder-lib.PlatformPackager+getMacOsResourcesDir) ⇒ <code>String</code>
        * [`.pack(outDir, arch, targets, taskManager)`](#module_app-builder-lib.PlatformPackager+pack) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.resolveIcon(sources, fallbackSources, outputFormat)`](#module_app-builder-lib.PlatformPackager+resolveIcon) ⇒ <code>Promise&lt;Array&lt;module:app-builder-lib/out/platformPackager.IconInfo&gt;&gt;</code>
        * [`.getResource(custom, names)`](#module_app-builder-lib.PlatformPackager+getResource) ⇒ <code>Promise&lt; \| String&gt;</code>
        * [`.getResourcesDir(appOutDir)`](#module_app-builder-lib.PlatformPackager+getResourcesDir) ⇒ <code>String</code>
        * [`.getTempFile(suffix)`](#module_app-builder-lib.PlatformPackager+getTempFile) ⇒ <code>Promise&lt;String&gt;</code>
    * [.PublishManager](#PublishManager) ⇐ <code>module:packages/electron-publish/out/publisher.PublishContext</code>
        * [`.awaitTasks()`](#module_app-builder-lib.PublishManager+awaitTasks) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.cancelTasks()`](#module_app-builder-lib.PublishManager+cancelTasks)
        * [`.getGlobalPublishConfigurations()`](#module_app-builder-lib.PublishManager+getGlobalPublishConfigurations) ⇒ <code>Promise&lt; \| Array&gt;</code>
    * [.Target](#Target)
        * [`.build(appOutDir, arch)`](#module_app-builder-lib.Target+build) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.finishBuild()`](#module_app-builder-lib.Target+finishBuild) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.build(options, packager)`](#module_app-builder-lib.build) ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
    * [`.buildForge(forgeOptions, options)`](#module_app-builder-lib.buildForge) ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>

<a name="ArtifactBuildStarted"></a>
## `ArtifactBuildStarted`
**Kind**: interface of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
<ul>
<li><b><code id="ArtifactBuildStarted-targetPresentableName">targetPresentableName</code></b></li> String
<li><b><code id="ArtifactBuildStarted-file">file</code></b></li> String
<li><b><code id="ArtifactBuildStarted-arch">arch</code></b></li> [Arch](#Arch) | "undefined"
</ul>

<a name="ArtifactCreated"></a>
## `ArtifactCreated` ⇐ <code>module:packages/electron-publish/out/publisher.UploadTask</code>
**Kind**: interface of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Extends**: <code>module:packages/electron-publish/out/publisher.UploadTask</code>  
**Properties**
<ul>
<li><b><code id="ArtifactCreated-packager">packager</code></b></li> [PlatformPackager](#PlatformPackager)&lt;any&gt;
<li><b><code id="ArtifactCreated-target">target</code></b></li> [Target](#Target) | "undefined"
<li><><code id="ArtifactCreated-updateInfo">updateInfo</code></></li> any
<li><><code id="ArtifactCreated-safeArtifactName">safeArtifactName</code></></li> String | "undefined"
<li><><code id="ArtifactCreated-publishConfig">publishConfig</code></></li> [PublishConfiguration](/configuration/publish#publishconfiguration) | "undefined"
<li><><code id="ArtifactCreated-isWriteUpdateInfo">isWriteUpdateInfo</code></></li> Boolean
</ul>

<a name="BeforeBuildContext"></a>
## `BeforeBuildContext`
**Kind**: interface of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
<ul>
<li><b><code id="BeforeBuildContext-appDir">appDir</code></b></li> String
<li><b><code id="BeforeBuildContext-electronVersion">electronVersion</code></b></li> String
<li><b><code id="BeforeBuildContext-platform">platform</code></b></li> [Platform](#Platform)
<li><b><code id="BeforeBuildContext-arch">arch</code></b></li> String
</ul>

<a name="BuildResult"></a>
## `BuildResult`
**Kind**: interface of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
<ul>
<li><b><code id="BuildResult-outDir">outDir</code></b></li> String
<li><b><code id="BuildResult-artifactPaths">artifactPaths</code></b></li> Array&lt;String&gt;
<li><b><code id="BuildResult-platformToTargets">platformToTargets</code></b></li> Map&lt;[Platform](#Platform) | Map&lt;String | [Target](#Target)&gt;&gt;
<li><b><code id="BuildResult-configuration">configuration</code></b></li> [Configuration](#Configuration)
</ul>

<a name="CertificateFromStoreInfo"></a>
## `CertificateFromStoreInfo`
**Kind**: interface of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
<ul>
<li><b><code id="CertificateFromStoreInfo-thumbprint">thumbprint</code></b></li> String
<li><b><code id="CertificateFromStoreInfo-subject">subject</code></b></li> String
<li><b><code id="CertificateFromStoreInfo-store">store</code></b></li> String
<li><b><code id="CertificateFromStoreInfo-isLocalMachineStore">isLocalMachineStore</code></b></li> Boolean
</ul>

<a name="FileCodeSigningInfo"></a>
## `FileCodeSigningInfo`
**Kind**: interface of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
<ul>
<li><b><code id="FileCodeSigningInfo-file">file</code></b></li> String
<li><b><code id="FileCodeSigningInfo-password">password</code></b></li> String | "undefined"
</ul>

<a name="Framework"></a>
## `Framework`
**Kind**: interface of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
<ul>
<li><b><code id="Framework-name">name</code></b></li> String
<li><b><code id="Framework-version">version</code></b></li> String
<li><b><code id="Framework-distMacOsAppName">distMacOsAppName</code></b></li> String
<li><b><code id="Framework-macOsDefaultTargets">macOsDefaultTargets</code></b></li> Array&lt;String&gt;
<li><b><code id="Framework-defaultAppIdPrefix">defaultAppIdPrefix</code></b></li> String
<li><b><code id="Framework-isNpmRebuildRequired">isNpmRebuildRequired</code></b></li> Boolean
<li><b><code id="Framework-isCopyElevateHelper">isCopyElevateHelper</code></b></li> Boolean
</ul>

**Methods**
* [`.Framework`](#Framework)
    * [`.afterPack(context)`](#module_app-builder-lib.Framework+afterPack) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.beforeCopyExtraFiles(options)`](#module_app-builder-lib.Framework+beforeCopyExtraFiles) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.createTransformer()`](#module_app-builder-lib.Framework+createTransformer) ⇒ <code>null</code> \| <code>module:packages/builder-util/out/fs.__type</code>
    * [`.getDefaultIcon(platform)`](#module_app-builder-lib.Framework+getDefaultIcon) ⇒ <code>null</code> \| <code>String</code>
    * [`.getExcludedDependencies(platform)`](#module_app-builder-lib.Framework+getExcludedDependencies) ⇒ <code>null</code> \| <code>Array</code>
    * [`.getMainFile(platform)`](#module_app-builder-lib.Framework+getMainFile) ⇒ <code>null</code> \| <code>String</code>
    * [`.prepareApplicationStageDirectory(options)`](#module_app-builder-lib.Framework+prepareApplicationStageDirectory) ⇒ <code>Promise&lt;any&gt;</code>

<a name="module_app-builder-lib.Framework+afterPack"></a>
### `framework.afterPack(context)` ⇒ <code>Promise&lt;any&gt;</code>

| Param | Type |
| --- | --- |
| context | <code>module:app-builder-lib/out/configuration.PackContext</code> | 

<a name="module_app-builder-lib.Framework+beforeCopyExtraFiles"></a>
### `framework.beforeCopyExtraFiles(options)` ⇒ <code>Promise&lt;any&gt;</code>

| Param | Type |
| --- | --- |
| options | <code>module:app-builder-lib/out/Framework.BeforeCopyExtraFilesOptions</code> | 

<a name="module_app-builder-lib.Framework+createTransformer"></a>
### `framework.createTransformer()` ⇒ <code>null</code> \| <code>module:packages/builder-util/out/fs.__type</code>
<a name="module_app-builder-lib.Framework+getDefaultIcon"></a>
### `framework.getDefaultIcon(platform)` ⇒ <code>null</code> \| <code>String</code>

| Param | Type |
| --- | --- |
| platform | <code>[Platform](#Platform)</code> | 

<a name="module_app-builder-lib.Framework+getExcludedDependencies"></a>
### `framework.getExcludedDependencies(platform)` ⇒ <code>null</code> \| <code>Array</code>

| Param | Type |
| --- | --- |
| platform | <code>[Platform](#Platform)</code> | 

<a name="module_app-builder-lib.Framework+getMainFile"></a>
### `framework.getMainFile(platform)` ⇒ <code>null</code> \| <code>String</code>

| Param | Type |
| --- | --- |
| platform | <code>[Platform](#Platform)</code> | 

<a name="module_app-builder-lib.Framework+prepareApplicationStageDirectory"></a>
### `framework.prepareApplicationStageDirectory(options)` ⇒ <code>Promise&lt;any&gt;</code>

| Param | Type |
| --- | --- |
| options | <code>[PrepareApplicationStageDirectoryOptions](#PrepareApplicationStageDirectoryOptions)</code> | 

<a name="SourceRepositoryInfo"></a>
## `SourceRepositoryInfo`
**Kind**: interface of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
<ul>
<li><><code id="SourceRepositoryInfo-type">type</code></></li> String
<li><><code id="SourceRepositoryInfo-domain">domain</code></></li> String
<li><b><code id="SourceRepositoryInfo-user">user</code></b></li> String
<li><b><code id="SourceRepositoryInfo-project">project</code></b></li> String
</ul>

<a name="AppInfo"></a>
## AppInfo
**Kind**: class of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
<ul>
<li><><code id="AppInfo-description">description</code></> = `smarten(this.info.metadata.description || "")`</li> String
<li><><code id="AppInfo-version">version</code></></li> String
<li><><code id="AppInfo-shortVersion">shortVersion</code></></li> String | undefined
<li><><code id="AppInfo-shortVersionWindows">shortVersionWindows</code></></li> String | undefined
<li><><code id="AppInfo-buildNumber">buildNumber</code></></li> String | undefined
<li><><code id="AppInfo-buildVersion">buildVersion</code></></li> String
<li><><code id="AppInfo-productName">productName</code></></li> String
<li><><code id="AppInfo-sanitizedProductName">sanitizedProductName</code></></li> String
<li><><code id="AppInfo-productFilename">productFilename</code></></li> String
<li><b><code id="AppInfo-channel">channel</code></b></li> String | "undefined"
<li><b><code id="AppInfo-companyName">companyName</code></b></li> String | "undefined"
<li><b><code id="AppInfo-id">id</code></b></li> String
<li><b><code id="AppInfo-macBundleIdentifier">macBundleIdentifier</code></b></li> String
<li><b><code id="AppInfo-name">name</code></b></li> String
<li><b><code id="AppInfo-linuxPackageName">linuxPackageName</code></b></li> String
<li><b><code id="AppInfo-sanitizedName">sanitizedName</code></b></li> String
<li><b><code id="AppInfo-updaterCacheDirName">updaterCacheDirName</code></b></li> String
<li><b><code id="AppInfo-copyright">copyright</code></b></li> String
</ul>

**Methods**
* [.AppInfo](#AppInfo)
    * [`.computePackageUrl()`](#module_app-builder-lib.AppInfo+computePackageUrl) ⇒ <code>Promise&lt; \| String&gt;</code>
    * [`.getVersionInWeirdWindowsForm(isSetBuildNumber)`](#module_app-builder-lib.AppInfo+getVersionInWeirdWindowsForm) ⇒ <code>String</code>

<a name="module_app-builder-lib.AppInfo+computePackageUrl"></a>
### `appInfo.computePackageUrl()` ⇒ <code>Promise&lt; \| String&gt;</code>
<a name="module_app-builder-lib.AppInfo+getVersionInWeirdWindowsForm"></a>
### `appInfo.getVersionInWeirdWindowsForm(isSetBuildNumber)` ⇒ <code>String</code>

| Param |
| --- |
| isSetBuildNumber | 

<a name="Packager"></a>
## Packager
**Kind**: class of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
<ul>
<li><><code id="Packager-projectDir">projectDir</code></></li> String
<li><b><code id="Packager-appDir">appDir</code></b></li> String
<li><b><code id="Packager-metadata">metadata</code></b></li> [Metadata](#Metadata)
<li><b><code id="Packager-areNodeModulesHandledExternally">areNodeModulesHandledExternally</code></b></li> Boolean
<li><b><code id="Packager-isPrepackedAppAsar">isPrepackedAppAsar</code></b></li> Boolean
<li><b><code id="Packager-devMetadata">devMetadata</code></b></li> [Metadata](#Metadata) | "undefined"
<li><b><code id="Packager-config">config</code></b></li> [Configuration](#Configuration)
<li><><code id="Packager-isTwoPackageJsonProjectLayoutUsed">isTwoPackageJsonProjectLayoutUsed</code></> = `false`</li> Boolean
<li><><code id="Packager-eventEmitter">eventEmitter</code></> = `new EventEmitter()`</li> module:events.EventEmitter
<li><b><code id="Packager-_appInfo">_appInfo</code></b></li> [AppInfo](#AppInfo) | "undefined"
<li><b><code id="Packager-appInfo">appInfo</code></b></li> [AppInfo](#AppInfo)
<li><><code id="Packager-tempDirManager">tempDirManager</code></> = `new TmpDir("packager")`</li> TmpDir
<li><><code id="Packager-options">options</code></></li> [PackagerOptions](#PackagerOptions)
<li><><code id="Packager-debugLogger">debugLogger</code></> = `new DebugLogger(log.isDebugEnabled)`</li> DebugLogger
<li><b><code id="Packager-repositoryInfo">repositoryInfo</code></b></li> Promise&lt; | [SourceRepositoryInfo](#SourceRepositoryInfo)&gt;
<li><b><code id="Packager-[stageDirPathCustomizer=(target, packager, arch) => {
    return path.join(target.outDir, `__${target.name}-${getArtifactArchName(arch, target.name)}`)
  }]">[stageDirPathCustomizer=(target, packager, arch) => {
    return path.join(target.outDir, `__${target.name}-${getArtifactArchName(arch, target.name)}`)
  }]</code></b></li> callback
<li><b><code id="Packager-buildResourcesDir">buildResourcesDir</code></b></li> String
<li><b><code id="Packager-relativeBuildResourcesDirname">relativeBuildResourcesDirname</code></b></li> String
<li><b><code id="Packager-framework">framework</code></b></li> [Framework](#Framework)
</ul>

**Methods**
* [.Packager](#Packager)
    * [`._build(configuration, metadata, devMetadata, repositoryInfo)`](#module_app-builder-lib.Packager+_build) ⇒ <code>Promise&lt;[BuildResult](#BuildResult)&gt;</code>
    * [`.addAfterPackHandler(handler)`](#module_app-builder-lib.Packager+addAfterPackHandler)
    * [`.afterPack(context)`](#module_app-builder-lib.Packager+afterPack) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.artifactCreated(handler)`](#module_app-builder-lib.Packager+artifactCreated) ⇒ <code>[Packager](#Packager)</code>
    * [`.build()`](#module_app-builder-lib.Packager+build) ⇒ <code>Promise&lt;[BuildResult](#BuildResult)&gt;</code>
    * [`.callAppxManifestCreated(path)`](#module_app-builder-lib.Packager+callAppxManifestCreated) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.callArtifactBuildCompleted(event)`](#module_app-builder-lib.Packager+callArtifactBuildCompleted) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.callArtifactBuildStarted(event, logFields)`](#module_app-builder-lib.Packager+callArtifactBuildStarted) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.callMsiProjectCreated(path)`](#module_app-builder-lib.Packager+callMsiProjectCreated) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.dispatchArtifactCreated(event)`](#module_app-builder-lib.Packager+dispatchArtifactCreated)
    * [`.disposeOnBuildFinish(disposer)`](#module_app-builder-lib.Packager+disposeOnBuildFinish)
    * [`.installAppDependencies(platform, arch)`](#module_app-builder-lib.Packager+installAppDependencies) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getNodeDependencyInfo(platform)`](#module_app-builder-lib.Packager+getNodeDependencyInfo) ⇒ <code>Lazy&lt;Array&lt;module:app-builder-lib/out/util/packageDependencies.NodeModuleDirInfo&gt;&gt;</code>

<a name="module_app-builder-lib.Packager+_build"></a>
### `packager._build(configuration, metadata, devMetadata, repositoryInfo)` ⇒ <code>Promise&lt;[BuildResult](#BuildResult)&gt;</code>

| Param | Type |
| --- | --- |
| configuration | <code>[Configuration](#Configuration)</code> | 
| metadata | <code>[Metadata](#Metadata)</code> | 
| devMetadata | <code>[Metadata](#Metadata)</code> \| <code>"undefined"</code> | 
| repositoryInfo | <code>[SourceRepositoryInfo](#SourceRepositoryInfo)</code> | 

<a name="module_app-builder-lib.Packager+addAfterPackHandler"></a>
### `packager.addAfterPackHandler(handler)`

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 

<a name="module_app-builder-lib.Packager+afterPack"></a>
### `packager.afterPack(context)` ⇒ <code>Promise&lt;any&gt;</code>

| Param | Type |
| --- | --- |
| context | <code>module:app-builder-lib/out/configuration.PackContext</code> | 

<a name="module_app-builder-lib.Packager+artifactCreated"></a>
### `packager.artifactCreated(handler)` ⇒ <code>[Packager](#Packager)</code>

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 

<a name="module_app-builder-lib.Packager+build"></a>
### `packager.build()` ⇒ <code>Promise&lt;[BuildResult](#BuildResult)&gt;</code>
<a name="module_app-builder-lib.Packager+callAppxManifestCreated"></a>
### `packager.callAppxManifestCreated(path)` ⇒ <code>Promise&lt;void&gt;</code>

| Param | Type |
| --- | --- |
| path | <code>String</code> | 

<a name="module_app-builder-lib.Packager+callArtifactBuildCompleted"></a>
### `packager.callArtifactBuildCompleted(event)` ⇒ <code>Promise&lt;void&gt;</code>

| Param | Type |
| --- | --- |
| event | <code>[ArtifactCreated](#ArtifactCreated)</code> | 

<a name="module_app-builder-lib.Packager+callArtifactBuildStarted"></a>
### `packager.callArtifactBuildStarted(event, logFields)` ⇒ <code>Promise&lt;void&gt;</code>

| Param | Type |
| --- | --- |
| event | <code>[ArtifactBuildStarted](#ArtifactBuildStarted)</code> | 
| logFields | <code>any</code> | 

<a name="module_app-builder-lib.Packager+callMsiProjectCreated"></a>
### `packager.callMsiProjectCreated(path)` ⇒ <code>Promise&lt;void&gt;</code>

| Param | Type |
| --- | --- |
| path | <code>String</code> | 

<a name="module_app-builder-lib.Packager+dispatchArtifactCreated"></a>
### `packager.dispatchArtifactCreated(event)`
Only for sub artifacts (update info), for main artifacts use `callArtifactBuildCompleted`.


| Param | Type |
| --- | --- |
| event | <code>[ArtifactCreated](#ArtifactCreated)</code> | 

<a name="module_app-builder-lib.Packager+disposeOnBuildFinish"></a>
### `packager.disposeOnBuildFinish(disposer)`

| Param | Type |
| --- | --- |
| disposer | <code>callback</code> | 

<a name="module_app-builder-lib.Packager+installAppDependencies"></a>
### `packager.installAppDependencies(platform, arch)` ⇒ <code>Promise&lt;any&gt;</code>

| Param | Type |
| --- | --- |
| platform | <code>[Platform](#Platform)</code> | 
| arch | <code>[Arch](#Arch)</code> | 

<a name="module_app-builder-lib.Packager+getNodeDependencyInfo"></a>
### `packager.getNodeDependencyInfo(platform)` ⇒ <code>Lazy&lt;Array&lt;module:app-builder-lib/out/util/packageDependencies.NodeModuleDirInfo&gt;&gt;</code>

| Param | Type |
| --- | --- |
| platform | <code>[Platform](#Platform)</code> \| <code>"undefined"</code> | 

<a name="Platform"></a>
## Platform
**Kind**: class of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
<ul>
<li><><code id="Platform-MAC">MAC</code></> = `new Platform("mac", "mac", "darwin")`</li> [Platform](#Platform)
<li><><code id="Platform-LINUX">LINUX</code></> = `new Platform("linux", "linux", "linux")`</li> [Platform](#Platform)
<li><><code id="Platform-WINDOWS">WINDOWS</code></> = `new Platform("windows", "win", "win32")`</li> [Platform](#Platform)
</ul>

**Methods**
* [.Platform](#Platform)
    * [`.createTarget(type, archs)`](#module_app-builder-lib.Platform+createTarget) ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;[Arch](#Arch) \| Array&lt;String&gt;&gt;&gt;</code>
    * [`.current()`](#module_app-builder-lib.Platform+current) ⇒ <code>[Platform](#Platform)</code>
    * [`.fromString(name)`](#module_app-builder-lib.Platform+fromString) ⇒ <code>[Platform](#Platform)</code>
    * [`.toString()`](#module_app-builder-lib.Platform+toString) ⇒ <code>String</code>

<a name="module_app-builder-lib.Platform+createTarget"></a>
### `platform.createTarget(type, archs)` ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;[Arch](#Arch) \| Array&lt;String&gt;&gt;&gt;</code>

| Param | Type |
| --- | --- |
| type | <code>String</code> \| <code>Array&lt;String&gt;</code> \| <code>"undefined"</code> | 
| archs | <code>Array&lt;[Arch](#Arch)&gt;</code> | 

<a name="module_app-builder-lib.Platform+current"></a>
### `platform.current()` ⇒ <code>[Platform](#Platform)</code>
<a name="module_app-builder-lib.Platform+fromString"></a>
### `platform.fromString(name)` ⇒ <code>[Platform](#Platform)</code>

| Param | Type |
| --- | --- |
| name | <code>String</code> | 

<a name="module_app-builder-lib.Platform+toString"></a>
### `platform.toString()` ⇒ <code>String</code>
<a name="PlatformPackager"></a>
## PlatformPackager
**Kind**: class of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
<ul>
<li><b><code id="PlatformPackager-packagerOptions">packagerOptions</code></b></li> [PackagerOptions](#PackagerOptions)
<li><b><code id="PlatformPackager-buildResourcesDir">buildResourcesDir</code></b></li> String
<li><b><code id="PlatformPackager-projectDir">projectDir</code></b></li> String
<li><b><code id="PlatformPackager-config">config</code></b></li> [Configuration](#Configuration)
<li><><code id="PlatformPackager-platformSpecificBuildOptions">platformSpecificBuildOptions</code></></li> module:app-builder-lib/out/platformPackager.DC
<li><b><code id="PlatformPackager-resourceList">resourceList</code></b></li> Promise&lt;Array&lt;String&gt;&gt;
<li><><code id="PlatformPackager-appInfo">appInfo</code></></li> [AppInfo](#AppInfo)
<li><b><code id="PlatformPackager-compression">compression</code></b></li> "store" | "normal" | "maximum"
<li><b><code id="PlatformPackager-debugLogger">debugLogger</code></b></li> DebugLogger
<li><b><code id="PlatformPackager-defaultTarget">defaultTarget</code></b></li> Array&lt;String&gt;
<li><b><code id="PlatformPackager-fileAssociations">fileAssociations</code></b></li> Array&lt;[FileAssociation](#FileAssociation)&gt;
<li><b><code id="PlatformPackager-forceCodeSigning">forceCodeSigning</code></b></li> Boolean
</ul>

**Methods**
* [.PlatformPackager](#PlatformPackager)
    * [`.artifactPatternConfig(targetSpecificOptions, defaultPattern)`](#module_app-builder-lib.PlatformPackager+artifactPatternConfig) ⇒ <code>module:app-builder-lib/out/platformPackager.__object</code>
    * [`.computeSafeArtifactName(suggestedName, ext, arch, skipDefaultArch, defaultArch, safePattern)`](#module_app-builder-lib.PlatformPackager+computeSafeArtifactName) ⇒ <code>null</code> \| <code>String</code>
    * [`.createTargets(targets, mapper)`](#module_app-builder-lib.PlatformPackager+createTargets)
    * [`.getDefaultFrameworkIcon()`](#module_app-builder-lib.PlatformPackager+getDefaultFrameworkIcon) ⇒ <code>null</code> \| <code>String</code>
    * [`.dispatchArtifactCreated(file, target, arch, safeArtifactName)`](#module_app-builder-lib.PlatformPackager+dispatchArtifactCreated) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.getElectronDestinationDir(appOutDir)`](#module_app-builder-lib.PlatformPackager+getElectronDestinationDir) ⇒ <code>String</code>
    * [`.getElectronSrcDir(dist)`](#module_app-builder-lib.PlatformPackager+getElectronSrcDir) ⇒ <code>String</code>
    * [`.expandArtifactBeautyNamePattern(targetSpecificOptions, ext, arch)`](#module_app-builder-lib.PlatformPackager+expandArtifactBeautyNamePattern) ⇒ <code>String</code>
    * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern, skipDefaultArch, defaultArch)`](#module_app-builder-lib.PlatformPackager+expandArtifactNamePattern) ⇒ <code>String</code>
    * [`.expandMacro(pattern, arch, extra, isProductNameSanitized)`](#module_app-builder-lib.PlatformPackager+expandMacro) ⇒ <code>String</code>
    * [`.generateName2(ext, classifier, deployment)`](#module_app-builder-lib.PlatformPackager+generateName2) ⇒ <code>String</code>
    * [`.getIconPath()`](#module_app-builder-lib.PlatformPackager+getIconPath) ⇒ <code>Promise&lt; \| String&gt;</code>
    * [`.getMacOsResourcesDir(appOutDir)`](#module_app-builder-lib.PlatformPackager+getMacOsResourcesDir) ⇒ <code>String</code>
    * [`.pack(outDir, arch, targets, taskManager)`](#module_app-builder-lib.PlatformPackager+pack) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.resolveIcon(sources, fallbackSources, outputFormat)`](#module_app-builder-lib.PlatformPackager+resolveIcon) ⇒ <code>Promise&lt;Array&lt;module:app-builder-lib/out/platformPackager.IconInfo&gt;&gt;</code>
    * [`.getResource(custom, names)`](#module_app-builder-lib.PlatformPackager+getResource) ⇒ <code>Promise&lt; \| String&gt;</code>
    * [`.getResourcesDir(appOutDir)`](#module_app-builder-lib.PlatformPackager+getResourcesDir) ⇒ <code>String</code>
    * [`.getTempFile(suffix)`](#module_app-builder-lib.PlatformPackager+getTempFile) ⇒ <code>Promise&lt;String&gt;</code>

<a name="module_app-builder-lib.PlatformPackager+artifactPatternConfig"></a>
### `platformPackager.artifactPatternConfig(targetSpecificOptions, defaultPattern)` ⇒ <code>module:app-builder-lib/out/platformPackager.__object</code>

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[TargetSpecificOptions](#TargetSpecificOptions)</code> \| <code>"undefined"</code> \| <code>undefined</code> | 
| defaultPattern | <code>String</code> \| <code>undefined</code> | 

<a name="module_app-builder-lib.PlatformPackager+computeSafeArtifactName"></a>
### `platformPackager.computeSafeArtifactName(suggestedName, ext, arch, skipDefaultArch, defaultArch, safePattern)` ⇒ <code>null</code> \| <code>String</code>

| Param | Type |
| --- | --- |
| suggestedName | <code>String</code> \| <code>"undefined"</code> | 
| ext | <code>String</code> | 
| arch | <code>[Arch](#Arch)</code> \| <code>"undefined"</code> | 
| skipDefaultArch |  | 
| defaultArch | <code>String</code> | 
| safePattern |  | 

<a name="module_app-builder-lib.PlatformPackager+createTargets"></a>
### `platformPackager.createTargets(targets, mapper)`

| Param | Type |
| --- | --- |
| targets | <code>Array&lt;String&gt;</code> | 
| mapper | <code>callback</code> | 

<a name="module_app-builder-lib.PlatformPackager+getDefaultFrameworkIcon"></a>
### `platformPackager.getDefaultFrameworkIcon()` ⇒ <code>null</code> \| <code>String</code>
<a name="module_app-builder-lib.PlatformPackager+dispatchArtifactCreated"></a>
### `platformPackager.dispatchArtifactCreated(file, target, arch, safeArtifactName)` ⇒ <code>Promise&lt;void&gt;</code>

| Param | Type |
| --- | --- |
| file | <code>String</code> | 
| target | <code>[Target](#Target)</code> \| <code>"undefined"</code> | 
| arch | <code>[Arch](#Arch)</code> \| <code>"undefined"</code> | 
| safeArtifactName | <code>String</code> \| <code>"undefined"</code> | 

<a name="module_app-builder-lib.PlatformPackager+getElectronDestinationDir"></a>
### `platformPackager.getElectronDestinationDir(appOutDir)` ⇒ <code>String</code>

| Param | Type |
| --- | --- |
| appOutDir | <code>String</code> | 

<a name="module_app-builder-lib.PlatformPackager+getElectronSrcDir"></a>
### `platformPackager.getElectronSrcDir(dist)` ⇒ <code>String</code>

| Param | Type |
| --- | --- |
| dist | <code>String</code> | 

<a name="module_app-builder-lib.PlatformPackager+expandArtifactBeautyNamePattern"></a>
### `platformPackager.expandArtifactBeautyNamePattern(targetSpecificOptions, ext, arch)` ⇒ <code>String</code>

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[TargetSpecificOptions](#TargetSpecificOptions)</code> \| <code>"undefined"</code> \| <code>undefined</code> | 
| ext | <code>String</code> | 
| arch | <code>[Arch](#Arch)</code> \| <code>"undefined"</code> | 

<a name="module_app-builder-lib.PlatformPackager+expandArtifactNamePattern"></a>
### `platformPackager.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern, skipDefaultArch, defaultArch)` ⇒ <code>String</code>

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[TargetSpecificOptions](#TargetSpecificOptions)</code> \| <code>"undefined"</code> \| <code>undefined</code> | 
| ext | <code>String</code> | 
| arch | <code>[Arch](#Arch)</code> \| <code>"undefined"</code> | 
| defaultPattern | <code>String</code> | 
| skipDefaultArch |  | 
| defaultArch | <code>String</code> | 

<a name="module_app-builder-lib.PlatformPackager+expandMacro"></a>
### `platformPackager.expandMacro(pattern, arch, extra, isProductNameSanitized)` ⇒ <code>String</code>

| Param | Type |
| --- | --- |
| pattern | <code>String</code> | 
| arch | <code>String</code> \| <code>"undefined"</code> | 
| extra | <code>any</code> | 
| isProductNameSanitized |  | 

<a name="module_app-builder-lib.PlatformPackager+generateName2"></a>
### `platformPackager.generateName2(ext, classifier, deployment)` ⇒ <code>String</code>

| Param | Type |
| --- | --- |
| ext | <code>String</code> \| <code>"undefined"</code> | 
| classifier | <code>String</code> \| <code>"undefined"</code> \| <code>undefined</code> | 
| deployment | <code>Boolean</code> | 

<a name="module_app-builder-lib.PlatformPackager+getIconPath"></a>
### `platformPackager.getIconPath()` ⇒ <code>Promise&lt; \| String&gt;</code>
<a name="module_app-builder-lib.PlatformPackager+getMacOsResourcesDir"></a>
### `platformPackager.getMacOsResourcesDir(appOutDir)` ⇒ <code>String</code>

| Param | Type |
| --- | --- |
| appOutDir | <code>String</code> | 

<a name="module_app-builder-lib.PlatformPackager+pack"></a>
### `platformPackager.pack(outDir, arch, targets, taskManager)` ⇒ <code>Promise&lt;any&gt;</code>

| Param | Type |
| --- | --- |
| outDir | <code>String</code> | 
| arch | <code>[Arch](#Arch)</code> | 
| targets | <code>Array&lt;[Target](#Target)&gt;</code> | 
| taskManager | <code>AsyncTaskManager</code> | 

<a name="module_app-builder-lib.PlatformPackager+resolveIcon"></a>
### `platformPackager.resolveIcon(sources, fallbackSources, outputFormat)` ⇒ <code>Promise&lt;Array&lt;module:app-builder-lib/out/platformPackager.IconInfo&gt;&gt;</code>

| Param | Type |
| --- | --- |
| sources | <code>Array&lt;String&gt;</code> | 
| fallbackSources | <code>Array&lt;String&gt;</code> | 
| outputFormat | <code>"icns"</code> \| <code>"ico"</code> \| <code>"set"</code> | 

<a name="module_app-builder-lib.PlatformPackager+getResource"></a>
### `platformPackager.getResource(custom, names)` ⇒ <code>Promise&lt; \| String&gt;</code>

| Param | Type |
| --- | --- |
| custom | <code>String</code> \| <code>"undefined"</code> \| <code>undefined</code> | 
| names | <code>Array&lt;String&gt;</code> | 

<a name="module_app-builder-lib.PlatformPackager+getResourcesDir"></a>
### `platformPackager.getResourcesDir(appOutDir)` ⇒ <code>String</code>

| Param | Type |
| --- | --- |
| appOutDir | <code>String</code> | 

<a name="module_app-builder-lib.PlatformPackager+getTempFile"></a>
### `platformPackager.getTempFile(suffix)` ⇒ <code>Promise&lt;String&gt;</code>

| Param | Type |
| --- | --- |
| suffix | <code>String</code> | 

<a name="PublishManager"></a>
## PublishManager ⇐ <code>module:packages/electron-publish/out/publisher.PublishContext</code>
**Kind**: class of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Extends**: <code>module:packages/electron-publish/out/publisher.PublishContext</code>  
**Properties**
<ul>
<li><><code id="PublishManager-isPublish">isPublish</code></> = `false`</li> Boolean
<li><><code id="PublishManager-progress">progress</code></> = `(process.stdout as TtyWriteStream).isTTY ? new MultiProgress() : null`</li> MultiProgress
</ul>

**Methods**
* [.PublishManager](#PublishManager) ⇐ <code>module:packages/electron-publish/out/publisher.PublishContext</code>
    * [`.awaitTasks()`](#module_app-builder-lib.PublishManager+awaitTasks) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.cancelTasks()`](#module_app-builder-lib.PublishManager+cancelTasks)
    * [`.getGlobalPublishConfigurations()`](#module_app-builder-lib.PublishManager+getGlobalPublishConfigurations) ⇒ <code>Promise&lt; \| Array&gt;</code>

<a name="module_app-builder-lib.PublishManager+awaitTasks"></a>
### `publishManager.awaitTasks()` ⇒ <code>Promise&lt;void&gt;</code>
<a name="module_app-builder-lib.PublishManager+cancelTasks"></a>
### `publishManager.cancelTasks()`
<a name="module_app-builder-lib.PublishManager+getGlobalPublishConfigurations"></a>
### `publishManager.getGlobalPublishConfigurations()` ⇒ <code>Promise&lt; \| Array&gt;</code>
<a name="Target"></a>
## Target
**Kind**: class of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
<ul>
<li><><code id="Target-outDir">outDir</code></></li> String
<li><><code id="Target-options">options</code></></li> [TargetSpecificOptions](#TargetSpecificOptions) | "undefined" | undefined
</ul>

**Methods**
* [.Target](#Target)
    * [`.build(appOutDir, arch)`](#module_app-builder-lib.Target+build) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.finishBuild()`](#module_app-builder-lib.Target+finishBuild) ⇒ <code>Promise&lt;any&gt;</code>

<a name="module_app-builder-lib.Target+build"></a>
### `target.build(appOutDir, arch)` ⇒ <code>Promise&lt;any&gt;</code>

| Param | Type |
| --- | --- |
| appOutDir | <code>String</code> | 
| arch | <code>[Arch](#Arch)</code> | 

<a name="module_app-builder-lib.Target+finishBuild"></a>
### `target.finishBuild()` ⇒ <code>Promise&lt;any&gt;</code>
<a name="module_app-builder-lib.build"></a>
## `app-builder-lib.build(options, packager)` ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
**Kind**: method of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>

| Param | Type |
| --- | --- |
| options | <code>[PackagerOptions](#PackagerOptions)</code> \| <code>module:packages/electron-publish/out/publisher.PublishOptions</code> | 
| packager | <code>[Packager](#Packager)</code> | 

<a name="module_app-builder-lib.buildForge"></a>
## `app-builder-lib.buildForge(forgeOptions, options)` ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
**Kind**: method of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>

| Param | Type |
| --- | --- |
| forgeOptions | <code>[ForgeOptions](#ForgeOptions)</code> | 
| options | <code>[PackagerOptions](#PackagerOptions)</code> | 

<a name="module_electron-publish"></a>
# electron-publish

* [electron-publish](#module_electron-publish)
    * [`.PublishContext`](#PublishContext)
    * [`.UploadTask`](#UploadTask)
    * [.HttpPublisher](#HttpPublisher) ⇐ <code>[Publisher](#Publisher)</code>
        * [`.upload(task)`](#module_electron-publish.HttpPublisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.toString()`](#module_electron-publish.Publisher+toString) ⇒ <code>String</code>
    * [.ProgressCallback](#ProgressCallback)
        * [`.update(transferred, total)`](#module_electron-publish.ProgressCallback+update)
    * [.Publisher](#Publisher)
        * [`.toString()`](#module_electron-publish.Publisher+toString) ⇒ <code>String</code>
        * [`.upload(task)`](#module_electron-publish.Publisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getCiTag()`](#module_electron-publish.getCiTag) ⇒ <code>null</code> \| <code>String</code>

<a name="PublishContext"></a>
## `PublishContext`
**Kind**: interface of [<code>electron-publish</code>](#module_electron-publish)<br/>
**Properties**
<ul>
<li><b><code id="PublishContext-cancellationToken">cancellationToken</code></b></li> CancellationToken
<li><b><code id="PublishContext-progress">progress</code></b></li> module:electron-publish/out/multiProgress.MultiProgress | "undefined"
</ul>

<a name="UploadTask"></a>
## `UploadTask`
**Kind**: interface of [<code>electron-publish</code>](#module_electron-publish)<br/>
**Properties**
<ul>
<li><b><code id="UploadTask-file">file</code></b></li> String
<li><><code id="UploadTask-fileContent">fileContent</code></></li> module:global.Buffer | "undefined"
<li><b><code id="UploadTask-arch">arch</code></b></li> [Arch](#Arch) | "undefined"
<li><><code id="UploadTask-safeArtifactName">safeArtifactName</code></></li> String | "undefined"
</ul>

<a name="HttpPublisher"></a>
## HttpPublisher ⇐ <code>[Publisher](#Publisher)</code>
**Kind**: class of [<code>electron-publish</code>](#module_electron-publish)<br/>
**Extends**: <code>[Publisher](#Publisher)</code>  

* [.HttpPublisher](#HttpPublisher) ⇐ <code>[Publisher](#Publisher)</code>
    * [`.upload(task)`](#module_electron-publish.HttpPublisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.toString()`](#module_electron-publish.Publisher+toString) ⇒ <code>String</code>

<a name="module_electron-publish.HttpPublisher+upload"></a>
### `httpPublisher.upload(task)` ⇒ <code>Promise&lt;any&gt;</code>
**Overrides**: [<code>upload</code>](#module_electron-publish.Publisher+upload)  

| Param | Type |
| --- | --- |
| task | <code>[UploadTask](#UploadTask)</code> | 

<a name="module_electron-publish.Publisher+toString"></a>
### `httpPublisher.toString()` ⇒ <code>String</code>
<a name="ProgressCallback"></a>
## ProgressCallback
**Kind**: class of [<code>electron-publish</code>](#module_electron-publish)<br/>
<a name="module_electron-publish.ProgressCallback+update"></a>
### `progressCallback.update(transferred, total)`

| Param | Type |
| --- | --- |
| transferred | <code>Number</code> | 
| total | <code>Number</code> | 

<a name="Publisher"></a>
## Publisher
**Kind**: class of [<code>electron-publish</code>](#module_electron-publish)<br/>
**Properties**
<ul>
<li><b><code id="Publisher-providerName">providerName</code></b></li> String
</ul>

**Methods**
* [.Publisher](#Publisher)
    * [`.toString()`](#module_electron-publish.Publisher+toString) ⇒ <code>String</code>
    * [`.upload(task)`](#module_electron-publish.Publisher+upload) ⇒ <code>Promise&lt;any&gt;</code>

<a name="module_electron-publish.Publisher+toString"></a>
### `publisher.toString()` ⇒ <code>String</code>
<a name="module_electron-publish.Publisher+upload"></a>
### `publisher.upload(task)` ⇒ <code>Promise&lt;any&gt;</code>

| Param | Type |
| --- | --- |
| task | <code>[UploadTask](#UploadTask)</code> | 

<a name="module_electron-publish.getCiTag"></a>
## `electron-publish.getCiTag()` ⇒ <code>null</code> \| <code>String</code>
**Kind**: method of [<code>electron-publish</code>](#module_electron-publish)<br/>
<a name="module_electron-updater"></a>
# electron-updater

* [electron-updater](#module_electron-updater)
    * [`.Logger`](#Logger)
        * [`.debug(message)`](#module_electron-updater.Logger+debug)
        * [`.error(message)`](#module_electron-updater.Logger+error)
        * [`.info(message)`](#module_electron-updater.Logger+info)
        * [`.warn(message)`](#module_electron-updater.Logger+warn)
    * [`.ResolvedUpdateFileInfo`](#ResolvedUpdateFileInfo)
    * [`.UpdateCheckResult`](#UpdateCheckResult)
    * [`.UpdateDownloadedEvent`](#UpdateDownloadedEvent) ⇐ <code>module:builder-util-runtime.UpdateInfo</code>
    * [.AppImageUpdater](#AppImageUpdater) ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>
        * [`.isUpdaterActive()`](#module_electron-updater.AppImageUpdater+isUpdaterActive) ⇒ <code>Boolean</code>
    * [.AppUpdater](#AppUpdater) ⇐ <code>module:events.EventEmitter</code>
        * [`.addAuthHeader(token)`](#module_electron-updater.AppUpdater+addAuthHeader)
        * [`.checkForUpdates()`](#module_electron-updater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
        * [`.checkForUpdatesAndNotify(downloadNotification)`](#module_electron-updater.AppUpdater+checkForUpdatesAndNotify) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
        * [`.downloadUpdate(cancellationToken)`](#module_electron-updater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getFeedURL()`](#module_electron-updater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
        * [`.setFeedURL(options)`](#module_electron-updater.AppUpdater+setFeedURL)
        * [`.isUpdaterActive()`](#module_electron-updater.AppUpdater+isUpdaterActive) ⇒ <code>Boolean</code>
        * [`.quitAndInstall(isSilent, isForceRunAfter)`](#module_electron-updater.AppUpdater+quitAndInstall)
    * [.MacUpdater](#MacUpdater) ⇐ <code>[AppUpdater](#AppUpdater)</code>
        * [`.quitAndInstall()`](#module_electron-updater.MacUpdater+quitAndInstall)
        * [`.addAuthHeader(token)`](#module_electron-updater.AppUpdater+addAuthHeader)
        * [`.checkForUpdates()`](#module_electron-updater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
        * [`.checkForUpdatesAndNotify(downloadNotification)`](#module_electron-updater.AppUpdater+checkForUpdatesAndNotify) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
        * [`.downloadUpdate(cancellationToken)`](#module_electron-updater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getFeedURL()`](#module_electron-updater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
        * [`.setFeedURL(options)`](#module_electron-updater.AppUpdater+setFeedURL)
        * [`.isUpdaterActive()`](#module_electron-updater.AppUpdater+isUpdaterActive) ⇒ <code>Boolean</code>
    * [.NsisUpdater](#NsisUpdater) ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>
    * [.Provider](#Provider)
        * [`.getLatestVersion()`](#module_electron-updater.Provider+getLatestVersion) ⇒ <code>Promise&lt;module:electron-updater/out/providers/Provider.T&gt;</code>
        * [`.setRequestHeaders(value)`](#module_electron-updater.Provider+setRequestHeaders)
        * [`.resolveFiles(updateInfo)`](#module_electron-updater.Provider+resolveFiles) ⇒ <code>Array&lt;[ResolvedUpdateFileInfo](#ResolvedUpdateFileInfo)&gt;</code>
    * [.UpdaterSignal](#UpdaterSignal)
        * [`.login(handler)`](#module_electron-updater.UpdaterSignal+login)
        * [`.progress(handler)`](#module_electron-updater.UpdaterSignal+progress)
        * [`.updateCancelled(handler)`](#module_electron-updater.UpdaterSignal+updateCancelled)
        * [`.updateDownloaded(handler)`](#module_electron-updater.UpdaterSignal+updateDownloaded)
    * [`.autoUpdater`](#module_electron-updater.autoUpdater) : <code>[AppUpdater](#AppUpdater)</code>
    * [`.DOWNLOAD_PROGRESS`](#module_electron-updater.DOWNLOAD_PROGRESS) : <code>"login"</code> \| <code>"checking-for-update"</code> \| <code>"update-available"</code> \| <code>"update-not-available"</code> \| <code>"update-cancelled"</code> \| <code>"download-progress"</code> \| <code>"update-downloaded"</code> \| <code>"error"</code>
    * [`.UPDATE_DOWNLOADED`](#module_electron-updater.UPDATE_DOWNLOADED) : <code>"login"</code> \| <code>"checking-for-update"</code> \| <code>"update-available"</code> \| <code>"update-not-available"</code> \| <code>"update-cancelled"</code> \| <code>"download-progress"</code> \| <code>"update-downloaded"</code> \| <code>"error"</code>

<a name="Logger"></a>
## `Logger`
**Kind**: interface of [<code>electron-updater</code>](#module_electron-updater)<br/>

* [`.Logger`](#Logger)
    * [`.debug(message)`](#module_electron-updater.Logger+debug)
    * [`.error(message)`](#module_electron-updater.Logger+error)
    * [`.info(message)`](#module_electron-updater.Logger+info)
    * [`.warn(message)`](#module_electron-updater.Logger+warn)

<a name="module_electron-updater.Logger+debug"></a>
### `logger.debug(message)`

| Param | Type |
| --- | --- |
| message | <code>String</code> | 

<a name="module_electron-updater.Logger+error"></a>
### `logger.error(message)`

| Param | Type |
| --- | --- |
| message | <code>any</code> | 

<a name="module_electron-updater.Logger+info"></a>
### `logger.info(message)`

| Param | Type |
| --- | --- |
| message | <code>any</code> | 

<a name="module_electron-updater.Logger+warn"></a>
### `logger.warn(message)`

| Param | Type |
| --- | --- |
| message | <code>any</code> | 

<a name="ResolvedUpdateFileInfo"></a>
## `ResolvedUpdateFileInfo`
**Kind**: interface of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Properties**
<ul>
<li><b><code id="ResolvedUpdateFileInfo-url">url</code></b></li> module:url.URL
<li><b><code id="ResolvedUpdateFileInfo-info">info</code></b></li> module:builder-util-runtime.UpdateFileInfo
<li><><code id="ResolvedUpdateFileInfo-packageInfo">packageInfo</code></></li> module:builder-util-runtime.PackageFileInfo
</ul>

<a name="UpdateCheckResult"></a>
## `UpdateCheckResult`
**Kind**: interface of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Properties**
<ul>
<li><b><code id="UpdateCheckResult-updateInfo">updateInfo</code></b></li> module:builder-util-runtime.UpdateInfo
<li><><code id="UpdateCheckResult-downloadPromise">downloadPromise</code></></li> Promise&lt;Array&lt;String&gt;&gt; | "undefined"
<li><><code id="UpdateCheckResult-cancellationToken">cancellationToken</code></></li> CancellationToken
<li><b><code id="UpdateCheckResult-versionInfo">versionInfo</code></b></li> module:builder-util-runtime.UpdateInfo - Deprecated: {tag.description}
</ul>

<a name="UpdateDownloadedEvent"></a>
## `UpdateDownloadedEvent` ⇐ <code>module:builder-util-runtime.UpdateInfo</code>
**Kind**: interface of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>module:builder-util-runtime.UpdateInfo</code>  
**Properties**
<ul>
<li><b><code id="UpdateDownloadedEvent-downloadedFile">downloadedFile</code></b></li> String
</ul>

<a name="AppImageUpdater"></a>
## AppImageUpdater ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>  
<a name="module_electron-updater.AppImageUpdater+isUpdaterActive"></a>
### `appImageUpdater.isUpdaterActive()` ⇒ <code>Boolean</code>
<a name="AppUpdater"></a>
## AppUpdater ⇐ <code>module:events.EventEmitter</code>
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>module:events.EventEmitter</code>  
**Properties**
<ul>
<li><><code id="AppUpdater-autoDownload">autoDownload</code></> = `true`</li> Boolean - Whether to automatically download an update when it is found.
<li><><code id="AppUpdater-autoInstallOnAppQuit">autoInstallOnAppQuit</code></> = `true`</li> Boolean - Whether to automatically install a downloaded update on app quit (if `quitAndInstall` was not called before).
<li><><code id="AppUpdater-allowPrerelease">allowPrerelease</code></> = `false`</li> Boolean - *GitHub provider only.* Whether to allow update to pre-release versions. Defaults to `true` if application version contains prerelease components (e.g. `0.12.1-alpha.1`, here `alpha` is a prerelease component), otherwise `false`.
  
  If `true`, downgrade will be allowed (`allowDowngrade` will be set to `true`).
<li><><code id="AppUpdater-fullChangelog">fullChangelog</code></> = `false`</li> Boolean - *GitHub provider only.* Get all release notes (from current version to latest), not just the latest.
<li><><code id="AppUpdater-allowDowngrade">allowDowngrade</code></> = `false`</li> Boolean - Whether to allow version downgrade (when a user from the beta channel wants to go back to the stable channel).
  
  Taken in account only if channel differs (pre-release version component in terms of semantic versioning).
<li><><code id="AppUpdater-currentVersion">currentVersion</code></></li> SemVer - The current application version.
<li><b><code id="AppUpdater-channel">channel</code></b></li> String | "undefined" - Get the update channel. Not applicable for GitHub. Doesn't return `channel` from the update configuration, only if was previously set.
<li><b><code id="AppUpdater-requestHeaders">requestHeaders</code></b></li> [key: string]: string | "undefined" - The request headers.
<li><b><code id="AppUpdater-netSession">netSession</code></b></li> Electron:Session
<li><b><code id="AppUpdater-logger">logger</code></b></li> [Logger](#Logger) | "undefined" - The logger. You can pass [electron-log](https://github.com/megahertz/electron-log), [winston](https://github.com/winstonjs/winston) or another logger with the following interface: `{ info(), warn(), error() }`. Set it to `null` if you would like to disable a logging feature.
<li><><code id="AppUpdater-signals">signals</code></> = `new UpdaterSignal(this)`</li> [UpdaterSignal](#UpdaterSignal)
<li><><code id="AppUpdater-configOnDisk">configOnDisk</code></> = `new Lazy<any>(() => this.loadUpdateConfig())`</li> Lazy&lt;any&gt;
<li><><code id="AppUpdater-httpExecutor">httpExecutor</code></></li> module:electron-updater/out/electronHttpExecutor.ElectronHttpExecutor
<li><b><code id="AppUpdater-isAddNoCacheQuery">isAddNoCacheQuery</code></b></li> Boolean
</ul>

**Methods**
* [.AppUpdater](#AppUpdater) ⇐ <code>module:events.EventEmitter</code>
    * [`.addAuthHeader(token)`](#module_electron-updater.AppUpdater+addAuthHeader)
    * [`.checkForUpdates()`](#module_electron-updater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.checkForUpdatesAndNotify(downloadNotification)`](#module_electron-updater.AppUpdater+checkForUpdatesAndNotify) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.downloadUpdate(cancellationToken)`](#module_electron-updater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getFeedURL()`](#module_electron-updater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
    * [`.setFeedURL(options)`](#module_electron-updater.AppUpdater+setFeedURL)
    * [`.isUpdaterActive()`](#module_electron-updater.AppUpdater+isUpdaterActive) ⇒ <code>Boolean</code>
    * [`.quitAndInstall(isSilent, isForceRunAfter)`](#module_electron-updater.AppUpdater+quitAndInstall)

<a name="module_electron-updater.AppUpdater+addAuthHeader"></a>
### `appUpdater.addAuthHeader(token)`
Shortcut for explicitly adding auth tokens to request headers


| Param | Type |
| --- | --- |
| token | <code>String</code> | 

<a name="module_electron-updater.AppUpdater+checkForUpdates"></a>
### `appUpdater.checkForUpdates()` ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
Asks the server whether there is an update.

<a name="module_electron-updater.AppUpdater+checkForUpdatesAndNotify"></a>
### `appUpdater.checkForUpdatesAndNotify(downloadNotification)` ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>

| Param | Type |
| --- | --- |
| downloadNotification | <code>module:electron-updater/out/AppUpdater.DownloadNotification</code> | 

<a name="module_electron-updater.AppUpdater+downloadUpdate"></a>
### `appUpdater.downloadUpdate(cancellationToken)` ⇒ <code>Promise&lt;any&gt;</code>
Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.

**Returns**: <code>Promise&lt;any&gt;</code> - Path to downloaded file.  

| Param | Type |
| --- | --- |
| cancellationToken | <code>CancellationToken</code> | 

<a name="module_electron-updater.AppUpdater+getFeedURL"></a>
### `appUpdater.getFeedURL()` ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
<a name="module_electron-updater.AppUpdater+setFeedURL"></a>
### `appUpdater.setFeedURL(options)`
Configure update provider. If value is `string`, [GenericServerOptions](/configuration/publish#genericserveroptions) will be set with value as `url`.


| Param | Type | Description |
| --- | --- | --- |
| options | <code>[PublishConfiguration](/configuration/publish#publishconfiguration)</code> \| <code>String</code> \| <code>[GithubOptions](/configuration/publish#githuboptions)</code> \| <code>[S3Options](/configuration/publish#s3options)</code> \| <code>[SpacesOptions](/configuration/publish#spacesoptions)</code> \| <code>[GenericServerOptions](/configuration/publish#genericserveroptions)</code> \| <code>[BintrayOptions](/configuration/publish#bintrayoptions)</code> \| <code>module:builder-util-runtime/out/publishOptions.CustomPublishOptions</code> \| <code>module:builder-util-runtime/out/publishOptions.KeygenOptions</code> \| <code>[SnapStoreOptions](/configuration/publish#snapstoreoptions)</code> \| <code>String</code> | If you want to override configuration in the `app-update.yml`. |

<a name="module_electron-updater.AppUpdater+isUpdaterActive"></a>
### `appUpdater.isUpdaterActive()` ⇒ <code>Boolean</code>
<a name="module_electron-updater.AppUpdater+quitAndInstall"></a>
### `appUpdater.quitAndInstall(isSilent, isForceRunAfter)`
Restarts the app and installs the update after it has been downloaded.
It should only be called after `update-downloaded` has been emitted.

**Note:** `autoUpdater.quitAndInstall()` will close all application windows first and only emit `before-quit` event on `app` after that.
This is different from the normal quit event sequence.


| Param | Type | Description |
| --- | --- | --- |
| isSilent | <code>Boolean</code> | *windows-only* Runs the installer in silent mode. Defaults to `false`. |
| isForceRunAfter | <code>Boolean</code> | Run the app after finish even on silent install. Not applicable for macOS. Ignored if `isSilent` is set to `false`. |

<a name="MacUpdater"></a>
## MacUpdater ⇐ <code>[AppUpdater](#AppUpdater)</code>
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>[AppUpdater](#AppUpdater)</code>  

* [.MacUpdater](#MacUpdater) ⇐ <code>[AppUpdater](#AppUpdater)</code>
    * [`.quitAndInstall()`](#module_electron-updater.MacUpdater+quitAndInstall)
    * [`.addAuthHeader(token)`](#module_electron-updater.AppUpdater+addAuthHeader)
    * [`.checkForUpdates()`](#module_electron-updater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.checkForUpdatesAndNotify(downloadNotification)`](#module_electron-updater.AppUpdater+checkForUpdatesAndNotify) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.downloadUpdate(cancellationToken)`](#module_electron-updater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getFeedURL()`](#module_electron-updater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
    * [`.setFeedURL(options)`](#module_electron-updater.AppUpdater+setFeedURL)
    * [`.isUpdaterActive()`](#module_electron-updater.AppUpdater+isUpdaterActive) ⇒ <code>Boolean</code>

<a name="module_electron-updater.MacUpdater+quitAndInstall"></a>
### `macUpdater.quitAndInstall()`
**Overrides**: [<code>quitAndInstall</code>](#module_electron-updater.AppUpdater+quitAndInstall)  
<a name="module_electron-updater.AppUpdater+addAuthHeader"></a>
### `macUpdater.addAuthHeader(token)`
Shortcut for explicitly adding auth tokens to request headers


| Param | Type |
| --- | --- |
| token | <code>String</code> | 

<a name="module_electron-updater.AppUpdater+checkForUpdates"></a>
### `macUpdater.checkForUpdates()` ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
Asks the server whether there is an update.

<a name="module_electron-updater.AppUpdater+checkForUpdatesAndNotify"></a>
### `macUpdater.checkForUpdatesAndNotify(downloadNotification)` ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>

| Param | Type |
| --- | --- |
| downloadNotification | <code>module:electron-updater/out/AppUpdater.DownloadNotification</code> | 

<a name="module_electron-updater.AppUpdater+downloadUpdate"></a>
### `macUpdater.downloadUpdate(cancellationToken)` ⇒ <code>Promise&lt;any&gt;</code>
Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.

**Returns**: <code>Promise&lt;any&gt;</code> - Path to downloaded file.  

| Param | Type |
| --- | --- |
| cancellationToken | <code>CancellationToken</code> | 

<a name="module_electron-updater.AppUpdater+getFeedURL"></a>
### `macUpdater.getFeedURL()` ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
<a name="module_electron-updater.AppUpdater+setFeedURL"></a>
### `macUpdater.setFeedURL(options)`
Configure update provider. If value is `string`, [GenericServerOptions](/configuration/publish#genericserveroptions) will be set with value as `url`.


| Param | Type | Description |
| --- | --- | --- |
| options | <code>[PublishConfiguration](/configuration/publish#publishconfiguration)</code> \| <code>String</code> \| <code>[GithubOptions](/configuration/publish#githuboptions)</code> \| <code>[S3Options](/configuration/publish#s3options)</code> \| <code>[SpacesOptions](/configuration/publish#spacesoptions)</code> \| <code>[GenericServerOptions](/configuration/publish#genericserveroptions)</code> \| <code>[BintrayOptions](/configuration/publish#bintrayoptions)</code> \| <code>module:builder-util-runtime/out/publishOptions.CustomPublishOptions</code> \| <code>module:builder-util-runtime/out/publishOptions.KeygenOptions</code> \| <code>[SnapStoreOptions](/configuration/publish#snapstoreoptions)</code> \| <code>String</code> | If you want to override configuration in the `app-update.yml`. |

<a name="module_electron-updater.AppUpdater+isUpdaterActive"></a>
### `macUpdater.isUpdaterActive()` ⇒ <code>Boolean</code>
<a name="NsisUpdater"></a>
## NsisUpdater ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>  
<a name="Provider"></a>
## Provider
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Properties**
<ul>
<li><b><code id="Provider-isUseMultipleRangeRequest">isUseMultipleRangeRequest</code></b></li> Boolean
<li><b><code id="Provider-fileExtraDownloadHeaders">fileExtraDownloadHeaders</code></b></li> [key: string]: string | "undefined"
</ul>

**Methods**
* [.Provider](#Provider)
    * [`.getLatestVersion()`](#module_electron-updater.Provider+getLatestVersion) ⇒ <code>Promise&lt;module:electron-updater/out/providers/Provider.T&gt;</code>
    * [`.setRequestHeaders(value)`](#module_electron-updater.Provider+setRequestHeaders)
    * [`.resolveFiles(updateInfo)`](#module_electron-updater.Provider+resolveFiles) ⇒ <code>Array&lt;[ResolvedUpdateFileInfo](#ResolvedUpdateFileInfo)&gt;</code>

<a name="module_electron-updater.Provider+getLatestVersion"></a>
### `provider.getLatestVersion()` ⇒ <code>Promise&lt;module:electron-updater/out/providers/Provider.T&gt;</code>
<a name="module_electron-updater.Provider+setRequestHeaders"></a>
### `provider.setRequestHeaders(value)`

| Param | Type |
| --- | --- |
| value | <code>[key: string]: string</code> \| <code>"undefined"</code> | 

<a name="module_electron-updater.Provider+resolveFiles"></a>
### `provider.resolveFiles(updateInfo)` ⇒ <code>Array&lt;[ResolvedUpdateFileInfo](#ResolvedUpdateFileInfo)&gt;</code>

| Param | Type |
| --- | --- |
| updateInfo | <code>module:electron-updater/out/providers/Provider.T</code> | 

<a name="UpdaterSignal"></a>
## UpdaterSignal
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>

* [.UpdaterSignal](#UpdaterSignal)
    * [`.login(handler)`](#module_electron-updater.UpdaterSignal+login)
    * [`.progress(handler)`](#module_electron-updater.UpdaterSignal+progress)
    * [`.updateCancelled(handler)`](#module_electron-updater.UpdaterSignal+updateCancelled)
    * [`.updateDownloaded(handler)`](#module_electron-updater.UpdaterSignal+updateDownloaded)

<a name="module_electron-updater.UpdaterSignal+login"></a>
### `updaterSignal.login(handler)`
Emitted when an authenticating proxy is [asking for user credentials](https://github.com/electron/electron/blob/master/docs/api/client-request.md#event-login).


| Param | Type |
| --- | --- |
| handler | <code>module:electron-updater.__type</code> | 

<a name="module_electron-updater.UpdaterSignal+progress"></a>
### `updaterSignal.progress(handler)`

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 

<a name="module_electron-updater.UpdaterSignal+updateCancelled"></a>
### `updaterSignal.updateCancelled(handler)`

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 

<a name="module_electron-updater.UpdaterSignal+updateDownloaded"></a>
### `updaterSignal.updateDownloaded(handler)`

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 

<a name="module_electron-updater.autoUpdater"></a>
## `electron-updater.autoUpdater` : <code>[AppUpdater](#AppUpdater)</code>
**Kind**: constant of [<code>electron-updater</code>](#module_electron-updater)<br/>
<a name="module_electron-updater.DOWNLOAD_PROGRESS"></a>
## `electron-updater.DOWNLOAD_PROGRESS` : <code>"login"</code> \| <code>"checking-for-update"</code> \| <code>"update-available"</code> \| <code>"update-not-available"</code> \| <code>"update-cancelled"</code> \| <code>"download-progress"</code> \| <code>"update-downloaded"</code> \| <code>"error"</code>
**Kind**: constant of [<code>electron-updater</code>](#module_electron-updater)<br/>
<a name="module_electron-updater.UPDATE_DOWNLOADED"></a>
## `electron-updater.UPDATE_DOWNLOADED` : <code>"login"</code> \| <code>"checking-for-update"</code> \| <code>"update-available"</code> \| <code>"update-not-available"</code> \| <code>"update-cancelled"</code> \| <code>"download-progress"</code> \| <code>"update-downloaded"</code> \| <code>"error"</code>
**Kind**: constant of [<code>electron-updater</code>](#module_electron-updater)<br/>

<!-- end of generated block -->
