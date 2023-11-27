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
* **<code id="Arch-ia32">ia32</code>** 
* **<code id="Arch-x64">x64</code>** 
* **<code id="Arch-armv7l">armv7l</code>** 
* **<code id="Arch-arm64">arm64</code>** 
* **<code id="Arch-universal">universal</code>** 

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
    * [`.PlugDescriptor`](#PlugDescriptor)
    * [`.SlotDescriptor`](#SlotDescriptor)
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
* **<code id="ArtifactBuildStarted-targetPresentableName">targetPresentableName</code>** String
* **<code id="ArtifactBuildStarted-file">file</code>** String
* **<code id="ArtifactBuildStarted-arch">arch</code>** [Arch](#Arch) | "undefined"

<a name="ArtifactCreated"></a>
## `ArtifactCreated` ⇐ <code>module:packages/electron-publish/out/publisher.UploadTask</code>
**Kind**: interface of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Extends**: <code>module:packages/electron-publish/out/publisher.UploadTask</code>  
**Properties**
* **<code id="ArtifactCreated-packager">packager</code>** [PlatformPackager](#PlatformPackager)&lt;any&gt;
* **<code id="ArtifactCreated-target">target</code>** [Target](#Target) | "undefined"
* <code id="ArtifactCreated-updateInfo">updateInfo</code> any
* <code id="ArtifactCreated-safeArtifactName">safeArtifactName</code> String | "undefined"
* <code id="ArtifactCreated-publishConfig">publishConfig</code> [PublishConfiguration](/configuration/publish#publishconfiguration) | "undefined"
* <code id="ArtifactCreated-isWriteUpdateInfo">isWriteUpdateInfo</code> Boolean

<a name="BeforeBuildContext"></a>
## `BeforeBuildContext`
**Kind**: interface of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
* **<code id="BeforeBuildContext-appDir">appDir</code>** String
* **<code id="BeforeBuildContext-electronVersion">electronVersion</code>** String
* **<code id="BeforeBuildContext-platform">platform</code>** [Platform](#Platform)
* **<code id="BeforeBuildContext-arch">arch</code>** String

<a name="BuildResult"></a>
## `BuildResult`
**Kind**: interface of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
* **<code id="BuildResult-outDir">outDir</code>** String
* **<code id="BuildResult-artifactPaths">artifactPaths</code>** Array&lt;String&gt;
* **<code id="BuildResult-platformToTargets">platformToTargets</code>** Map&lt;[Platform](#Platform) | Map&lt;String | [Target](#Target)&gt;&gt;
* **<code id="BuildResult-configuration">configuration</code>** [Configuration](#Configuration)

<a name="CertificateFromStoreInfo"></a>
## `CertificateFromStoreInfo`
**Kind**: interface of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
* **<code id="CertificateFromStoreInfo-thumbprint">thumbprint</code>** String
* **<code id="CertificateFromStoreInfo-subject">subject</code>** String
* **<code id="CertificateFromStoreInfo-store">store</code>** String
* **<code id="CertificateFromStoreInfo-isLocalMachineStore">isLocalMachineStore</code>** Boolean

<a name="FileCodeSigningInfo"></a>
## `FileCodeSigningInfo`
**Kind**: interface of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
* **<code id="FileCodeSigningInfo-file">file</code>** String
* **<code id="FileCodeSigningInfo-password">password</code>** String | "undefined"

<a name="Framework"></a>
## `Framework`
**Kind**: interface of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
* **<code id="Framework-name">name</code>** String
* **<code id="Framework-version">version</code>** String
* **<code id="Framework-distMacOsAppName">distMacOsAppName</code>** String
* **<code id="Framework-macOsDefaultTargets">macOsDefaultTargets</code>** Array&lt;String&gt;
* **<code id="Framework-defaultAppIdPrefix">defaultAppIdPrefix</code>** String
* **<code id="Framework-isNpmRebuildRequired">isNpmRebuildRequired</code>** Boolean
* **<code id="Framework-isCopyElevateHelper">isCopyElevateHelper</code>** Boolean

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

<a name="PlugDescriptor"></a>
## `PlugDescriptor`
**Kind**: interface of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
<a name="SlotDescriptor"></a>
## `SlotDescriptor`
**Kind**: interface of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
<a name="SourceRepositoryInfo"></a>
## `SourceRepositoryInfo`
**Kind**: interface of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
* <code id="SourceRepositoryInfo-type">type</code> String
* <code id="SourceRepositoryInfo-domain">domain</code> String
* **<code id="SourceRepositoryInfo-user">user</code>** String
* **<code id="SourceRepositoryInfo-project">project</code>** String

<a name="AppInfo"></a>
## AppInfo
**Kind**: class of [<code>app-builder-lib</code>](#module_app-builder-lib)<br/>
**Properties**
* <code id="AppInfo-description">description</code> = `smarten(this.info.metadata.description || "")` String
* <code id="AppInfo-version">version</code> String
* <code id="AppInfo-shortVersion">shortVersion</code> String | undefined
* <code id="AppInfo-shortVersionWindows">shortVersionWindows</code> String | undefined
* <code id="AppInfo-buildNumber">buildNumber</code> String | undefined
* <code id="AppInfo-buildVersion">buildVersion</code> String
* <code id="AppInfo-productName">productName</code> String
* <code id="AppInfo-sanitizedProductName">sanitizedProductName</code> String
* <code id="AppInfo-productFilename">productFilename</code> String
* **<code id="AppInfo-channel">channel</code>** String | "undefined"
* **<code id="AppInfo-companyName">companyName</code>** String | "undefined"
* **<code id="AppInfo-id">id</code>** String
* **<code id="AppInfo-macBundleIdentifier">macBundleIdentifier</code>** String
* **<code id="AppInfo-name">name</code>** String
* **<code id="AppInfo-linuxPackageName">linuxPackageName</code>** String
* **<code id="AppInfo-sanitizedName">sanitizedName</code>** String
* **<code id="AppInfo-updaterCacheDirName">updaterCacheDirName</code>** String
* **<code id="AppInfo-copyright">copyright</code>** String

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
* <code id="Packager-projectDir">projectDir</code> String
* **<code id="Packager-appDir">appDir</code>** String
* **<code id="Packager-metadata">metadata</code>** [Metadata](#Metadata)
* **<code id="Packager-areNodeModulesHandledExternally">areNodeModulesHandledExternally</code>** Boolean
* **<code id="Packager-isPrepackedAppAsar">isPrepackedAppAsar</code>** Boolean
* **<code id="Packager-devMetadata">devMetadata</code>** [Metadata](#Metadata) | "undefined"
* **<code id="Packager-config">config</code>** [Configuration](#Configuration)
* <code id="Packager-isTwoPackageJsonProjectLayoutUsed">isTwoPackageJsonProjectLayoutUsed</code> = `false` Boolean
* <code id="Packager-eventEmitter">eventEmitter</code> = `new EventEmitter()` module:events.EventEmitter
* **<code id="Packager-_appInfo">_appInfo</code>** [AppInfo](#AppInfo) | "undefined"
* **<code id="Packager-appInfo">appInfo</code>** [AppInfo](#AppInfo)
* <code id="Packager-tempDirManager">tempDirManager</code> = `new TmpDir("packager")` TmpDir
* <code id="Packager-options">options</code> [PackagerOptions](#PackagerOptions)
* <code id="Packager-debugLogger">debugLogger</code> = `new DebugLogger(log.isDebugEnabled)` DebugLogger
* **<code id="Packager-repositoryInfo">repositoryInfo</code>** Promise&lt; | [SourceRepositoryInfo](#SourceRepositoryInfo)&gt;
* **<code id="Packager-[stageDirPathCustomizer=(target, packager, arch) => {
    return path.join(target.outDir, `__${target.name}-${getArtifactArchName(arch, target.name)}`)
  }]">[stageDirPathCustomizer=(target, packager, arch) => {
    return path.join(target.outDir, `__${target.name}-${getArtifactArchName(arch, target.name)}`)
  }]</code>** callback
* **<code id="Packager-buildResourcesDir">buildResourcesDir</code>** String
* **<code id="Packager-relativeBuildResourcesDirname">relativeBuildResourcesDirname</code>** String
* **<code id="Packager-framework">framework</code>** [Framework](#Framework)

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
* <code id="Platform-MAC">MAC</code> = `new Platform("mac", "mac", "darwin")` [Platform](#Platform)
* <code id="Platform-LINUX">LINUX</code> = `new Platform("linux", "linux", "linux")` [Platform](#Platform)
* <code id="Platform-WINDOWS">WINDOWS</code> = `new Platform("windows", "win", "win32")` [Platform](#Platform)

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
* **<code id="PlatformPackager-packagerOptions">packagerOptions</code>** [PackagerOptions](#PackagerOptions)
* **<code id="PlatformPackager-buildResourcesDir">buildResourcesDir</code>** String
* **<code id="PlatformPackager-projectDir">projectDir</code>** String
* **<code id="PlatformPackager-config">config</code>** [Configuration](#Configuration)
* <code id="PlatformPackager-platformSpecificBuildOptions">platformSpecificBuildOptions</code> module:app-builder-lib/out/platformPackager.DC
* **<code id="PlatformPackager-resourceList">resourceList</code>** Promise&lt;Array&lt;String&gt;&gt;
* <code id="PlatformPackager-appInfo">appInfo</code> [AppInfo](#AppInfo)
* **<code id="PlatformPackager-compression">compression</code>** "store" | "normal" | "maximum"
* **<code id="PlatformPackager-debugLogger">debugLogger</code>** DebugLogger
* **<code id="PlatformPackager-defaultTarget">defaultTarget</code>** Array&lt;String&gt;
* **<code id="PlatformPackager-fileAssociations">fileAssociations</code>** Array&lt;[FileAssociation](#FileAssociation)&gt;
* **<code id="PlatformPackager-forceCodeSigning">forceCodeSigning</code>** Boolean

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
| outputFormat | <code>"set"</code> \| <code>"icns"</code> \| <code>"ico"</code> | 

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
* <code id="PublishManager-isPublish">isPublish</code> = `false` Boolean
* <code id="PublishManager-progress">progress</code> = `(process.stdout as TtyWriteStream).isTTY ? new MultiProgress() : null` MultiProgress

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
* <code id="Target-outDir">outDir</code> String
* <code id="Target-options">options</code> [TargetSpecificOptions](#TargetSpecificOptions) | "undefined" | undefined

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
* **<code id="PublishContext-cancellationToken">cancellationToken</code>** CancellationToken
* **<code id="PublishContext-progress">progress</code>** module:electron-publish/out/multiProgress.MultiProgress | "undefined"

<a name="UploadTask"></a>
## `UploadTask`
**Kind**: interface of [<code>electron-publish</code>](#module_electron-publish)<br/>
**Properties**
* **<code id="UploadTask-file">file</code>** String
* <code id="UploadTask-fileContent">fileContent</code> module:global.Buffer | "undefined"
* **<code id="UploadTask-arch">arch</code>** [Arch](#Arch) | "undefined"
* <code id="UploadTask-safeArtifactName">safeArtifactName</code> String | "undefined"
* <code id="UploadTask-timeout">timeout</code> Number | "undefined"

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
* **<code id="Publisher-providerName">providerName</code>** "github" | "s3" | "spaces" | "generic" | "custom" | "snapStore" | "keygen" | "bitbucket"

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
    * [.AppUpdater](#AppUpdater) ⇐ <code>module:tiny-typed-emitter/lib/index.TypedEmitter</code>
        * [`.addAuthHeader(token)`](#module_electron-updater.AppUpdater+addAuthHeader)
        * [`.checkForUpdates()`](#module_electron-updater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
        * [`.checkForUpdatesAndNotify(downloadNotification)`](#module_electron-updater.AppUpdater+checkForUpdatesAndNotify) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
        * [`.downloadUpdate(cancellationToken)`](#module_electron-updater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
        * [`.getFeedURL()`](#module_electron-updater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
        * [`.setFeedURL(options)`](#module_electron-updater.AppUpdater+setFeedURL)
        * [`.isUpdaterActive()`](#module_electron-updater.AppUpdater+isUpdaterActive) ⇒ <code>Boolean</code>
        * [`.quitAndInstall(isSilent, isForceRunAfter)`](#module_electron-updater.AppUpdater+quitAndInstall)
    * [.DebUpdater](#DebUpdater) ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>
    * [.MacUpdater](#MacUpdater) ⇐ <code>[AppUpdater](#AppUpdater)</code>
        * [`.quitAndInstall()`](#module_electron-updater.MacUpdater+quitAndInstall)
        * [`.addAuthHeader(token)`](#module_electron-updater.AppUpdater+addAuthHeader)
        * [`.checkForUpdates()`](#module_electron-updater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
        * [`.checkForUpdatesAndNotify(downloadNotification)`](#module_electron-updater.AppUpdater+checkForUpdatesAndNotify) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
        * [`.downloadUpdate(cancellationToken)`](#module_electron-updater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
        * [`.getFeedURL()`](#module_electron-updater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
        * [`.setFeedURL(options)`](#module_electron-updater.AppUpdater+setFeedURL)
        * [`.isUpdaterActive()`](#module_electron-updater.AppUpdater+isUpdaterActive) ⇒ <code>Boolean</code>
    * [.NsisUpdater](#NsisUpdater) ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>
    * [.Provider](#Provider)
        * [`.getLatestVersion()`](#module_electron-updater.Provider+getLatestVersion) ⇒ <code>Promise&lt;module:electron-updater/out/providers/Provider.T&gt;</code>
        * [`.setRequestHeaders(value)`](#module_electron-updater.Provider+setRequestHeaders)
        * [`.resolveFiles(updateInfo)`](#module_electron-updater.Provider+resolveFiles) ⇒ <code>Array&lt;[ResolvedUpdateFileInfo](#ResolvedUpdateFileInfo)&gt;</code>
    * [.RpmUpdater](#RpmUpdater) ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>
    * [.UpdaterSignal](#UpdaterSignal)
        * [`.login(handler)`](#module_electron-updater.UpdaterSignal+login)
        * [`.progress(handler)`](#module_electron-updater.UpdaterSignal+progress)
        * [`.updateCancelled(handler)`](#module_electron-updater.UpdaterSignal+updateCancelled)
        * [`.updateDownloaded(handler)`](#module_electron-updater.UpdaterSignal+updateDownloaded)
    * [`.autoUpdater`](#module_electron-updater.autoUpdater) : <code>[AppUpdater](#AppUpdater)</code>

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
* **<code id="ResolvedUpdateFileInfo-url">url</code>** module:url.URL
* **<code id="ResolvedUpdateFileInfo-info">info</code>** module:builder-util-runtime.UpdateFileInfo
* <code id="ResolvedUpdateFileInfo-packageInfo">packageInfo</code> module:builder-util-runtime.PackageFileInfo

<a name="UpdateCheckResult"></a>
## `UpdateCheckResult`
**Kind**: interface of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Properties**
* **<code id="UpdateCheckResult-updateInfo">updateInfo</code>** module:builder-util-runtime.UpdateInfo
* <code id="UpdateCheckResult-downloadPromise">downloadPromise</code> Promise&lt;Array&lt;String&gt;&gt; | "undefined"
* <code id="UpdateCheckResult-cancellationToken">cancellationToken</code> CancellationToken
* **<code id="UpdateCheckResult-versionInfo">versionInfo</code>** module:builder-util-runtime.UpdateInfo - Deprecated: {tag.description}

<a name="UpdateDownloadedEvent"></a>
## `UpdateDownloadedEvent` ⇐ <code>module:builder-util-runtime.UpdateInfo</code>
**Kind**: interface of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>module:builder-util-runtime.UpdateInfo</code>  
**Properties**
* **<code id="UpdateDownloadedEvent-downloadedFile">downloadedFile</code>** String

<a name="AppImageUpdater"></a>
## AppImageUpdater ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>  
<a name="module_electron-updater.AppImageUpdater+isUpdaterActive"></a>
### `appImageUpdater.isUpdaterActive()` ⇒ <code>Boolean</code>
<a name="AppUpdater"></a>
## AppUpdater ⇐ <code>module:tiny-typed-emitter/lib/index.TypedEmitter</code>
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>module:tiny-typed-emitter/lib/index.TypedEmitter</code>  
**Properties**
* <code id="AppUpdater-autoDownload">autoDownload</code> = `true` Boolean - Whether to automatically download an update when it is found.
* <code id="AppUpdater-autoInstallOnAppQuit">autoInstallOnAppQuit</code> = `true` Boolean - Whether to automatically install a downloaded update on app quit (if `quitAndInstall` was not called before).
* <code id="AppUpdater-autoRunAppAfterInstall">autoRunAppAfterInstall</code> = `true` Boolean - *windows-only* Whether to run the app after finish install when run the installer NOT in silent mode.
* <code id="AppUpdater-allowPrerelease">allowPrerelease</code> = `false` Boolean - *GitHub provider only.* Whether to allow update to pre-release versions. Defaults to `true` if application version contains prerelease components (e.g. `0.12.1-alpha.1`, here `alpha` is a prerelease component), otherwise `false`.
  
  If `true`, downgrade will be allowed (`allowDowngrade` will be set to `true`).
* <code id="AppUpdater-fullChangelog">fullChangelog</code> = `false` Boolean - *GitHub provider only.* Get all release notes (from current version to latest), not just the latest.
* <code id="AppUpdater-allowDowngrade">allowDowngrade</code> = `false` Boolean - Whether to allow version downgrade (when a user from the beta channel wants to go back to the stable channel).
  
  Taken in account only if channel differs (pre-release version component in terms of semantic versioning).
* <code id="AppUpdater-disableWebInstaller">disableWebInstaller</code> = `false` Boolean - Web installer files might not have signature verification, this switch prevents to load them unless it is needed.
  
  Currently false to prevent breaking the current API, but it should be changed to default true at some point that breaking changes are allowed.
* <code id="AppUpdater-forceDevUpdateConfig">forceDevUpdateConfig</code> = `false` Boolean - Allows developer to force the updater to work in "dev" mode, looking for "dev-app-update.yml" instead of "app-update.yml" Dev: `path.join(this.app.getAppPath(), "dev-app-update.yml")` Prod: `path.join(process.resourcesPath!, "app-update.yml")`
* <code id="AppUpdater-currentVersion">currentVersion</code> SemVer - The current application version.
* **<code id="AppUpdater-channel">channel</code>** String | "undefined" - Get the update channel. Not applicable for GitHub. Doesn't return `channel` from the update configuration, only if was previously set.
* **<code id="AppUpdater-requestHeaders">requestHeaders</code>** [key: string]: string | "undefined" - The request headers.
* **<code id="AppUpdater-netSession">netSession</code>** Electron:Session
* **<code id="AppUpdater-logger">logger</code>** [Logger](#Logger) | "undefined" - The logger. You can pass [electron-log](https://github.com/megahertz/electron-log), [winston](https://github.com/winstonjs/winston) or another logger with the following interface: `{ info(), warn(), error() }`. Set it to `null` if you would like to disable a logging feature.
* <code id="AppUpdater-signals">signals</code> = `new UpdaterSignal(this)` [UpdaterSignal](#UpdaterSignal)
* <code id="AppUpdater-configOnDisk">configOnDisk</code> = `new Lazy<any>(() => this.loadUpdateConfig())` Lazy&lt;any&gt;
* <code id="AppUpdater-httpExecutor">httpExecutor</code> module:electron-updater/out/electronHttpExecutor.ElectronHttpExecutor
* **<code id="AppUpdater-isAddNoCacheQuery">isAddNoCacheQuery</code>** Boolean

**Methods**
* [.AppUpdater](#AppUpdater) ⇐ <code>module:tiny-typed-emitter/lib/index.TypedEmitter</code>
    * [`.addAuthHeader(token)`](#module_electron-updater.AppUpdater+addAuthHeader)
    * [`.checkForUpdates()`](#module_electron-updater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.checkForUpdatesAndNotify(downloadNotification)`](#module_electron-updater.AppUpdater+checkForUpdatesAndNotify) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.downloadUpdate(cancellationToken)`](#module_electron-updater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
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
### `appUpdater.checkForUpdates()` ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
Asks the server whether there is an update.

<a name="module_electron-updater.AppUpdater+checkForUpdatesAndNotify"></a>
### `appUpdater.checkForUpdatesAndNotify(downloadNotification)` ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>

| Param | Type |
| --- | --- |
| downloadNotification | <code>module:electron-updater/out/AppUpdater.DownloadNotification</code> | 

<a name="module_electron-updater.AppUpdater+downloadUpdate"></a>
### `appUpdater.downloadUpdate(cancellationToken)` ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.

**Returns**: <code>Promise&lt;Array&lt;String&gt;&gt;</code> - Paths to downloaded files.  

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
| options | <code>[PublishConfiguration](/configuration/publish#publishconfiguration)</code> \| <code>String</code> \| <code>[GithubOptions](/configuration/publish#githuboptions)</code> \| <code>[S3Options](/configuration/publish#s3options)</code> \| <code>[SpacesOptions](/configuration/publish#spacesoptions)</code> \| <code>[GenericServerOptions](/configuration/publish#genericserveroptions)</code> \| <code>module:builder-util-runtime/out/publishOptions.CustomPublishOptions</code> \| <code>module:builder-util-runtime/out/publishOptions.KeygenOptions</code> \| <code>[SnapStoreOptions](/configuration/publish#snapstoreoptions)</code> \| <code>module:builder-util-runtime/out/publishOptions.BitbucketOptions</code> \| <code>String</code> | If you want to override configuration in the `app-update.yml`. |

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
| isForceRunAfter | <code>Boolean</code> | Run the app after finish even on silent install. Not applicable for macOS. Ignored if `isSilent` is set to `false`(In this case you can still set `autoRunAppAfterInstall` to `false` to prevent run the app after finish). |

<a name="DebUpdater"></a>
## DebUpdater ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>  
<a name="MacUpdater"></a>
## MacUpdater ⇐ <code>[AppUpdater](#AppUpdater)</code>
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>[AppUpdater](#AppUpdater)</code>  

* [.MacUpdater](#MacUpdater) ⇐ <code>[AppUpdater](#AppUpdater)</code>
    * [`.quitAndInstall()`](#module_electron-updater.MacUpdater+quitAndInstall)
    * [`.addAuthHeader(token)`](#module_electron-updater.AppUpdater+addAuthHeader)
    * [`.checkForUpdates()`](#module_electron-updater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.checkForUpdatesAndNotify(downloadNotification)`](#module_electron-updater.AppUpdater+checkForUpdatesAndNotify) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.downloadUpdate(cancellationToken)`](#module_electron-updater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
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
### `macUpdater.checkForUpdates()` ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
Asks the server whether there is an update.

<a name="module_electron-updater.AppUpdater+checkForUpdatesAndNotify"></a>
### `macUpdater.checkForUpdatesAndNotify(downloadNotification)` ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>

| Param | Type |
| --- | --- |
| downloadNotification | <code>module:electron-updater/out/AppUpdater.DownloadNotification</code> | 

<a name="module_electron-updater.AppUpdater+downloadUpdate"></a>
### `macUpdater.downloadUpdate(cancellationToken)` ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.

**Returns**: <code>Promise&lt;Array&lt;String&gt;&gt;</code> - Paths to downloaded files.  

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
| options | <code>[PublishConfiguration](/configuration/publish#publishconfiguration)</code> \| <code>String</code> \| <code>[GithubOptions](/configuration/publish#githuboptions)</code> \| <code>[S3Options](/configuration/publish#s3options)</code> \| <code>[SpacesOptions](/configuration/publish#spacesoptions)</code> \| <code>[GenericServerOptions](/configuration/publish#genericserveroptions)</code> \| <code>module:builder-util-runtime/out/publishOptions.CustomPublishOptions</code> \| <code>module:builder-util-runtime/out/publishOptions.KeygenOptions</code> \| <code>[SnapStoreOptions](/configuration/publish#snapstoreoptions)</code> \| <code>module:builder-util-runtime/out/publishOptions.BitbucketOptions</code> \| <code>String</code> | If you want to override configuration in the `app-update.yml`. |

<a name="module_electron-updater.AppUpdater+isUpdaterActive"></a>
### `macUpdater.isUpdaterActive()` ⇒ <code>Boolean</code>
<a name="NsisUpdater"></a>
## NsisUpdater ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>  
**Properties**
* <code id="NsisUpdater-installDirectory">installDirectory</code> String - Specify custom install directory path
* **<code id="NsisUpdater-verifyUpdateCodeSignature">verifyUpdateCodeSignature</code>** module:electron-updater.__type - The verifyUpdateCodeSignature. You can pass [win-verify-signature](https://github.com/beyondkmp/win-verify-trust) or another custom verify function: ` (publisherName: string[], path: string) => Promise<string | null>`. The default verify function uses [windowsExecutableCodeSignatureVerifier](https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/windowsExecutableCodeSignatureVerifier.ts)

<a name="Provider"></a>
## Provider
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Properties**
* **<code id="Provider-isUseMultipleRangeRequest">isUseMultipleRangeRequest</code>** Boolean
* **<code id="Provider-fileExtraDownloadHeaders">fileExtraDownloadHeaders</code>** [key: string]: string | "undefined"

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

<a name="RpmUpdater"></a>
## RpmUpdater ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>  
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

<!-- end of generated block -->
