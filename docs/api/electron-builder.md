Developer API only. See [Configuration](/configuration/configuration.md) for user documentation.
  
<!-- do not edit. start of generated block -->
<a name="module_electron-builder"></a>
# electron-builder

* [electron-builder](#module_electron-builder)
    * [`.AfterPackContext`](#AfterPackContext)
    * [`.ArtifactCreated`](#ArtifactCreated) ⇐ <code>module:packages/electron-publish/out/publisher.UploadTask</code>
    * [`.BeforeBuildContext`](#BeforeBuildContext)
    * [`.BuildResult`](#BuildResult)
    * [`.CertificateFromStoreInfo`](#CertificateFromStoreInfo)
    * [`.FileCodeSigningInfo`](#FileCodeSigningInfo)
    * [`.SourceRepositoryInfo`](#SourceRepositoryInfo)
    * [.AppInfo](#AppInfo)
        * [`.computePackageUrl()`](#module_electron-builder.AppInfo+computePackageUrl) ⇒ <code>Promise&lt; \| String&gt;</code>
    * [.Packager](#Packager)
        * [`.addAfterPackHandler(handler)`](#module_electron-builder.Packager+addAfterPackHandler)
        * [`.afterPack(context)`](#module_electron-builder.Packager+afterPack) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.artifactCreated(handler)`](#module_electron-builder.Packager+artifactCreated) ⇒ <code>[Packager](#Packager)</code>
        * [`.build()`](#module_electron-builder.Packager+build) ⇒ <code>Promise&lt;[BuildResult](#BuildResult)&gt;</code>
        * [`.dispatchArtifactCreated(event)`](#module_electron-builder.Packager+dispatchArtifactCreated)
    * [.Platform](#Platform)
        * [`.createTarget(type, archs)`](#module_electron-builder.Platform+createTarget) ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;[Arch](#Arch) \| Array&lt;String&gt;&gt;&gt;</code>
        * [`.current()`](#module_electron-builder.Platform+current) ⇒ <code>[Platform](#Platform)</code>
        * [`.fromString(name)`](#module_electron-builder.Platform+fromString) ⇒ <code>[Platform](#Platform)</code>
        * [`.toString()`](#module_electron-builder.Platform+toString) ⇒ <code>String</code>
    * [.Target](#Target)
        * [`.build(appOutDir, arch)`](#module_electron-builder.Target+build) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.finishBuild()`](#module_electron-builder.Target+finishBuild) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.Arch`](#Arch) : <code>enum</code>
    * [`.build(rawOptions)`](#module_electron-builder.build) ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
    * [`.buildForge(forgeOptions, options)`](#module_electron-builder.buildForge) ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
    * [`.createTargets(platforms, type, arch)`](#module_electron-builder.createTargets) ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;[Arch](#Arch) \| Array&lt;String&gt;&gt;&gt;</code>

<a name="AfterPackContext"></a>
## `AfterPackContext`
**Kind**: interface of [<code>electron-builder</code>](#module_electron-builder)<br/>
**Properties**
* **<code id="AfterPackContext-outDir">outDir</code>** String
* **<code id="AfterPackContext-appOutDir">appOutDir</code>** String
* **<code id="AfterPackContext-packager">packager</code>** PlatformPackager&lt;any&gt;
* **<code id="AfterPackContext-electronPlatformName">electronPlatformName</code>** String
* **<code id="AfterPackContext-arch">arch</code>** [Arch](#Arch)
* **<code id="AfterPackContext-targets">targets</code>** Array&lt;[Target](#Target)&gt;

<a name="ArtifactCreated"></a>
## `ArtifactCreated` ⇐ <code>module:packages/electron-publish/out/publisher.UploadTask</code>
**Kind**: interface of [<code>electron-builder</code>](#module_electron-builder)<br/>
**Extends**: <code>module:packages/electron-publish/out/publisher.UploadTask</code>  
**Properties**
* **<code id="ArtifactCreated-packager">packager</code>** PlatformPackager&lt;any&gt;
* <code id="ArtifactCreated-target">target</code> [Target](#Target)
* <code id="ArtifactCreated-updateInfo">updateInfo</code> any
* <code id="ArtifactCreated-safeArtifactName">safeArtifactName</code> String
* <code id="ArtifactCreated-publishConfig">publishConfig</code> [PublishConfiguration](/configuration/publish.md#publishconfiguration)
* <code id="ArtifactCreated-isWriteUpdateInfo">isWriteUpdateInfo</code> Boolean

<a name="BeforeBuildContext"></a>
## `BeforeBuildContext`
**Kind**: interface of [<code>electron-builder</code>](#module_electron-builder)<br/>
**Properties**
* **<code id="BeforeBuildContext-appDir">appDir</code>** String
* **<code id="BeforeBuildContext-electronVersion">electronVersion</code>** String
* **<code id="BeforeBuildContext-platform">platform</code>** [Platform](#Platform)
* **<code id="BeforeBuildContext-arch">arch</code>** String

<a name="BuildResult"></a>
## `BuildResult`
**Kind**: interface of [<code>electron-builder</code>](#module_electron-builder)<br/>
**Properties**
* **<code id="BuildResult-outDir">outDir</code>** String
* **<code id="BuildResult-platformToTargets">platformToTargets</code>** Map&lt;[Platform](#Platform) | Map&lt;String | [Target](#Target)&gt;&gt;

<a name="CertificateFromStoreInfo"></a>
## `CertificateFromStoreInfo`
**Kind**: interface of [<code>electron-builder</code>](#module_electron-builder)<br/>
**Properties**
* **<code id="CertificateFromStoreInfo-thumbprint">thumbprint</code>** String
* **<code id="CertificateFromStoreInfo-subject">subject</code>** String
* **<code id="CertificateFromStoreInfo-store">store</code>** String
* **<code id="CertificateFromStoreInfo-isLocalMachineStore">isLocalMachineStore</code>** Boolean

<a name="FileCodeSigningInfo"></a>
## `FileCodeSigningInfo`
**Kind**: interface of [<code>electron-builder</code>](#module_electron-builder)<br/>
**Properties**
* **<code id="FileCodeSigningInfo-file">file</code>** String
* <code id="FileCodeSigningInfo-password">password</code> String

<a name="SourceRepositoryInfo"></a>
## `SourceRepositoryInfo`
**Kind**: interface of [<code>electron-builder</code>](#module_electron-builder)<br/>
**Properties**
* <code id="SourceRepositoryInfo-type">type</code> String
* <code id="SourceRepositoryInfo-domain">domain</code> String
* **<code id="SourceRepositoryInfo-user">user</code>** String
* **<code id="SourceRepositoryInfo-project">project</code>** String

<a name="AppInfo"></a>
## AppInfo
**Kind**: class of [<code>electron-builder</code>](#module_electron-builder)<br/>
**Properties**
* <code id="AppInfo-description">description</code> = `smarten(this.info.metadata.description || "")` String
* <code id="AppInfo-version">version</code> String
* <code id="AppInfo-buildNumber">buildNumber</code> String | undefined
* <code id="AppInfo-buildVersion">buildVersion</code> String
* <code id="AppInfo-productName">productName</code> String
* <code id="AppInfo-productFilename">productFilename</code> String
* <code id="AppInfo-channel">channel</code> String
* **<code id="AppInfo-versionInWeirdWindowsForm">versionInWeirdWindowsForm</code>** String
* <code id="AppInfo-companyName">companyName</code> String
* **<code id="AppInfo-id">id</code>** String
* **<code id="AppInfo-name">name</code>** String
* **<code id="AppInfo-sanitizedName">sanitizedName</code>** String
* **<code id="AppInfo-copyright">copyright</code>** String

**Methods**<a name="module_electron-builder.AppInfo+computePackageUrl"></a>
### `appInfo.computePackageUrl()` ⇒ <code>Promise&lt; \| String&gt;</code>
<a name="Packager"></a>
## Packager
**Kind**: class of [<code>electron-builder</code>](#module_electron-builder)<br/>
**Properties**
* <code id="Packager-projectDir">projectDir</code> String
* **<code id="Packager-appDir">appDir</code>** String
* **<code id="Packager-metadata">metadata</code>** [Metadata](#Metadata)
* **<code id="Packager-isPrepackedAppAsar">isPrepackedAppAsar</code>** Boolean
* **<code id="Packager-devMetadata">devMetadata</code>** [Metadata](#Metadata)
* **<code id="Packager-config">config</code>** [Configuration](#Configuration)
* <code id="Packager-isTwoPackageJsonProjectLayoutUsed">isTwoPackageJsonProjectLayoutUsed</code> = `true` Boolean
* <code id="Packager-eventEmitter">eventEmitter</code> = `new EventEmitter()` [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)
* **<code id="Packager-appInfo">appInfo</code>** [AppInfo](#AppInfo)
* <code id="Packager-tempDirManager">tempDirManager</code> = `new TmpDir()` TmpDir
* <code id="Packager-options">options</code> [PackagerOptions](#PackagerOptions)
* <code id="Packager-debugLogger">debugLogger</code> = `new DebugLogger(debug.enabled)` DebugLogger
* **<code id="Packager-repositoryInfo">repositoryInfo</code>** Promise&lt; | [SourceRepositoryInfo](#SourceRepositoryInfo)&gt;
* **<code id="Packager-productionDeps">productionDeps</code>** Lazy&lt;Array&lt;Dependency&gt;&gt;

**Methods**
* [.Packager](#Packager)
    * [`.addAfterPackHandler(handler)`](#module_electron-builder.Packager+addAfterPackHandler)
    * [`.afterPack(context)`](#module_electron-builder.Packager+afterPack) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.artifactCreated(handler)`](#module_electron-builder.Packager+artifactCreated) ⇒ <code>[Packager](#Packager)</code>
    * [`.build()`](#module_electron-builder.Packager+build) ⇒ <code>Promise&lt;[BuildResult](#BuildResult)&gt;</code>
    * [`.dispatchArtifactCreated(event)`](#module_electron-builder.Packager+dispatchArtifactCreated)

<a name="module_electron-builder.Packager+addAfterPackHandler"></a>
### `packager.addAfterPackHandler(handler)`

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 

<a name="module_electron-builder.Packager+afterPack"></a>
### `packager.afterPack(context)` ⇒ <code>Promise&lt;any&gt;</code>

| Param | Type |
| --- | --- |
| context | <code>[AfterPackContext](#AfterPackContext)</code> | 

<a name="module_electron-builder.Packager+artifactCreated"></a>
### `packager.artifactCreated(handler)` ⇒ <code>[Packager](#Packager)</code>

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 

<a name="module_electron-builder.Packager+build"></a>
### `packager.build()` ⇒ <code>Promise&lt;[BuildResult](#BuildResult)&gt;</code>
<a name="module_electron-builder.Packager+dispatchArtifactCreated"></a>
### `packager.dispatchArtifactCreated(event)`

| Param | Type |
| --- | --- |
| event | <code>[ArtifactCreated](#ArtifactCreated)</code> | 

<a name="Platform"></a>
## Platform
**Kind**: class of [<code>electron-builder</code>](#module_electron-builder)<br/>
**Properties**
* <code id="Platform-MAC">MAC</code> = `new Platform("mac", "mac", "darwin")` [Platform](#Platform)
* <code id="Platform-LINUX">LINUX</code> = `new Platform("linux", "linux", "linux")` [Platform](#Platform)
* <code id="Platform-WINDOWS">WINDOWS</code> = `new Platform("windows", "win", "win32")` [Platform](#Platform)
* <code id="Platform-OSX">OSX</code> = `Platform.MAC` [Platform](#Platform)

**Methods**
* [.Platform](#Platform)
    * [`.createTarget(type, archs)`](#module_electron-builder.Platform+createTarget) ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;[Arch](#Arch) \| Array&lt;String&gt;&gt;&gt;</code>
    * [`.current()`](#module_electron-builder.Platform+current) ⇒ <code>[Platform](#Platform)</code>
    * [`.fromString(name)`](#module_electron-builder.Platform+fromString) ⇒ <code>[Platform](#Platform)</code>
    * [`.toString()`](#module_electron-builder.Platform+toString) ⇒ <code>String</code>

<a name="module_electron-builder.Platform+createTarget"></a>
### `platform.createTarget(type, archs)` ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;[Arch](#Arch) \| Array&lt;String&gt;&gt;&gt;</code>

| Param | Type |
| --- | --- |
| type | <code>String</code> \| <code>Array&lt;String&gt;</code> \| <code>null</code> | 
| archs | <code>Array&lt;[Arch](#Arch)&gt;</code> | 

<a name="module_electron-builder.Platform+current"></a>
### `platform.current()` ⇒ <code>[Platform](#Platform)</code>
<a name="module_electron-builder.Platform+fromString"></a>
### `platform.fromString(name)` ⇒ <code>[Platform](#Platform)</code>

| Param | Type |
| --- | --- |
| name | <code>String</code> | 

<a name="module_electron-builder.Platform+toString"></a>
### `platform.toString()` ⇒ <code>String</code>
<a name="Target"></a>
## Target
**Kind**: class of [<code>electron-builder</code>](#module_electron-builder)<br/>
**Properties**
* <code id="Target-outDir">outDir</code> String
* <code id="Target-options">options</code> [TargetSpecificOptions](#TargetSpecificOptions) | undefined

**Methods**
* [.Target](#Target)
    * [`.build(appOutDir, arch)`](#module_electron-builder.Target+build) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.finishBuild()`](#module_electron-builder.Target+finishBuild) ⇒ <code>Promise&lt;any&gt;</code>

<a name="module_electron-builder.Target+build"></a>
### `target.build(appOutDir, arch)` ⇒ <code>Promise&lt;any&gt;</code>

| Param | Type |
| --- | --- |
| appOutDir | <code>String</code> | 
| arch | <code>[Arch](#Arch)</code> | 

<a name="module_electron-builder.Target+finishBuild"></a>
### `target.finishBuild()` ⇒ <code>Promise&lt;any&gt;</code>
<a name="Arch"></a>
## `electron-builder.Arch` : <code>enum</code>
**Kind**: enum of [<code>electron-builder</code>](#module_electron-builder)<br/>
**Properties**
* **<code id="Arch-ia32">ia32</code>** 
* **<code id="Arch-x64">x64</code>** 
* **<code id="Arch-armv7l">armv7l</code>** 

<a name="module_electron-builder.build"></a>
## `electron-builder.build(rawOptions)` ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
**Kind**: method of [<code>electron-builder</code>](#module_electron-builder)<br/>

| Param | Type |
| --- | --- |
| rawOptions | <code>[CliOptions](#CliOptions)</code> | 

<a name="module_electron-builder.buildForge"></a>
## `electron-builder.buildForge(forgeOptions, options)` ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
**Kind**: method of [<code>electron-builder</code>](#module_electron-builder)<br/>

| Param | Type |
| --- | --- |
| forgeOptions | <code>[ForgeOptions](#ForgeOptions)</code> | 
| options | <code>[CliOptions](#CliOptions)</code> | 

<a name="module_electron-builder.createTargets"></a>
## `electron-builder.createTargets(platforms, type, arch)` ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;[Arch](#Arch) \| Array&lt;String&gt;&gt;&gt;</code>
**Kind**: method of [<code>electron-builder</code>](#module_electron-builder)<br/>

| Param | Type |
| --- | --- |
| platforms | <code>Array&lt;[Platform](#Platform)&gt;</code> | 
| type | <code>String</code> \| <code>null</code> | 
| arch | <code>String</code> \| <code>null</code> | 


<!-- end of generated block -->