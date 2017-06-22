  Developer API only. See [[Options]] for user documentation.
  
  <!-- do not edit. start of generated block -->
## Modules

<dl>
<dt><a href="#module_electron-builder">electron-builder</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/appInfo">electron-builder/out/appInfo</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/core">electron-builder/out/core</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/packager">electron-builder/out/packager</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/platformPackager">electron-builder/out/platformPackager</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/publish/PublishManager">electron-builder/out/publish/PublishManager</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/util/flags">electron-builder/out/util/flags</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/util/timer">electron-builder/out/util/timer</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/windowsCodeSign">electron-builder/out/windowsCodeSign</a></dt>
<dd></dd>
</dl>

<a name="module_electron-builder"></a>
## electron-builder

* [electron-builder](#module_electron-builder)
    * [`.AfterPackContext`](#AfterPackContext)
    * [`.ArtifactCreated`](#ArtifactCreated)
    * [`.BuildInfo`](#BuildInfo)
        * [`.afterPack(context)`](#module_electron-builder.BuildInfo+afterPack) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.dispatchArtifactCreated(event)`](#module_electron-builder.BuildInfo+dispatchArtifactCreated)
    * [`.BuildResult`](#BuildResult)
    * [`.CommonLinuxOptions`](#CommonLinuxOptions)
    * [`.CommonNsisOptions`](#CommonNsisOptions)
    * [`.ForgeOptions`](#ForgeOptions)
    * [`.LinuxTargetSpecificOptions`](#LinuxTargetSpecificOptions) ⇐ <code>[CommonLinuxOptions](#CommonLinuxOptions)</code>
    * [`.PlatformSpecificBuildOptions`](#PlatformSpecificBuildOptions) ⇐ <code>[TargetSpecificOptions](#TargetSpecificOptions)</code>
    * [.Packager](#Packager) ⇐ <code>[BuildInfo](#BuildInfo)</code>
        * [`.addAfterPackHandler(handler)`](#module_electron-builder.Packager+addAfterPackHandler)
        * [`.afterPack(context)`](#module_electron-builder.Packager+afterPack) ⇒ <code>Promise&lt;void&gt;</code>
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
    * [`.archFromString(name)`](#module_electron-builder.archFromString) ⇒ <code>[Arch](#Arch)</code>
    * [`.build(rawOptions)`](#module_electron-builder.build) ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
    * [`.buildForge(forgeOptions, options)`](#module_electron-builder.buildForge) ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
    * [`.createTargets(platforms, type, arch)`](#module_electron-builder.createTargets) ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;[Arch](#Arch) \| Array&lt;String&gt;&gt;&gt;</code>
    * [`.getArchSuffix(arch)`](#module_electron-builder.getArchSuffix) ⇒ <code>String</code>

<a name="AfterPackContext"></a>
### `AfterPackContext`
**Kind**: interface of [<code>electron-builder</code>](Options#module_electron-builder)  
**Properties**

| Name | Type |
| --- | --- |
| **appOutDir**| <code>String</code> | 
| **packager**| <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 
| **electronPlatformName**| <code>String</code> | 
| **arch**| <code>[Arch](#Arch)</code> | 
| **targets**| <code>Array&lt;[Target](#Target)&gt;</code> | 

<a name="ArtifactCreated"></a>
### `ArtifactCreated`
**Kind**: interface of [<code>electron-builder</code>](Options#module_electron-builder)  
**Properties**

| Name | Type |
| --- | --- |
| **packager**| <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 
| target| <code>[Target](#Target)</code> \| <code>null</code> | 
| arch| <code>[Arch](#Arch)</code> \| <code>null</code> | 
| file| <code>String</code> | 
| data| <code>Buffer</code> | 
| safeArtifactName| <code>String</code> | 
| publishConfig| <code>[PublishConfiguration](Publishing-Artifacts#PublishConfiguration)</code> | 

<a name="BuildInfo"></a>
### `BuildInfo`
**Kind**: interface of [<code>electron-builder</code>](Options#module_electron-builder)  
**Properties**

| Name | Type |
| --- | --- |
| **options**| <code>[PackagerOptions](Options#PackagerOptions)</code> | 
| **metadata**| <code>[Metadata](Options#Metadata)</code> | 
| **config**| <code>[Config](Options#Config)</code> | 
| **projectDir**| <code>String</code> | 
| **appDir**| <code>String</code> | 
| **isTwoPackageJsonProjectLayoutUsed**| <code>Boolean</code> | 
| **appInfo**| <code>[AppInfo](#AppInfo)</code> | 
| **tempDirManager**| <code>module:electron-builder-util/out/tmp.TmpDir</code> | 
| **repositoryInfo**| <code>Promise&lt; \| [SourceRepositoryInfo](#SourceRepositoryInfo)&gt;</code> | 
| **isPrepackedAppAsar**| <code>Boolean</code> | 
| **cancellationToken**| <code>[CancellationToken](electron-builder-http#CancellationToken)</code> | 
| **outDir**| <code>String</code> | 


* [`.BuildInfo`](#BuildInfo)
    * [`.afterPack(context)`](#module_electron-builder.BuildInfo+afterPack) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.dispatchArtifactCreated(event)`](#module_electron-builder.BuildInfo+dispatchArtifactCreated)

<a name="module_electron-builder.BuildInfo+afterPack"></a>
#### `buildInfo.afterPack(context)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of [<code>BuildInfo</code>](#BuildInfo)  

| Param | Type |
| --- | --- |
| context | <code>[AfterPackContext](#AfterPackContext)</code> | 

<a name="module_electron-builder.BuildInfo+dispatchArtifactCreated"></a>
#### `buildInfo.dispatchArtifactCreated(event)`
**Kind**: instance method of [<code>BuildInfo</code>](#BuildInfo)  

| Param | Type |
| --- | --- |
| event | <code>[ArtifactCreated](#ArtifactCreated)</code> | 

<a name="BuildResult"></a>
### `BuildResult`
**Kind**: interface of [<code>electron-builder</code>](Options#module_electron-builder)  
**Properties**

| Name | Type |
| --- | --- |
| **outDir**| <code>String</code> | 
| **platformToTargets**| <code>Map&lt;[Platform](#Platform) \| Map&lt;String \| [Target](#Target)&gt;&gt;</code> | 

<a name="CommonLinuxOptions"></a>
### `CommonLinuxOptions`
**Kind**: interface of [<code>electron-builder</code>](Options#module_electron-builder)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| synopsis| <code>String</code> \| <code>null</code> | <a name="CommonLinuxOptions-synopsis"></a>The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description). |
| description| <code>String</code> \| <code>null</code> | <a name="CommonLinuxOptions-description"></a>As [description](#Metadata-description) from application package.json, but allows you to specify different for Linux. |
| category| <code>String</code> \| <code>null</code> | <a name="CommonLinuxOptions-category"></a>The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry). |
| packageCategory| <code>String</code> \| <code>null</code> | <a name="CommonLinuxOptions-packageCategory"></a> |
| desktop| <code>any</code> \| <code>null</code> | <a name="CommonLinuxOptions-desktop"></a>The [Desktop file](https://developer.gnome.org/integration-guide/stable/desktop-files.html.en) entries (name to value). |
| vendor| <code>String</code> \| <code>null</code> | <a name="CommonLinuxOptions-vendor"></a> |
| maintainer| <code>String</code> \| <code>null</code> | <a name="CommonLinuxOptions-maintainer"></a> |
| afterInstall| <code>String</code> \| <code>null</code> | <a name="CommonLinuxOptions-afterInstall"></a> |
| afterRemove| <code>String</code> \| <code>null</code> | <a name="CommonLinuxOptions-afterRemove"></a> |

<a name="CommonNsisOptions"></a>
### `CommonNsisOptions`
**Kind**: interface of [<code>electron-builder</code>](Options#module_electron-builder)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| unicode = <code>true</code>| <code>Boolean</code> | <a name="CommonNsisOptions-unicode"></a>Whether to create [Unicode installer](http://nsis.sourceforge.net/Docs/Chapter1.html#intro-unicode). |
| guid| <code>String</code> \| <code>null</code> | <a name="CommonNsisOptions-guid"></a>See [GUID vs Application Name](https://github.com/electron-userland/electron-builder/wiki/NSIS#guid-vs-application-name). |
| warningsAsErrors = <code>true</code>| <code>Boolean</code> | <a name="CommonNsisOptions-warningsAsErrors"></a>If `warningsAsErrors` is `true` (default): NSIS will treat warnings as errors. If `warningsAsErrors` is `false`: NSIS will allow warnings. |

<a name="ForgeOptions"></a>
### `ForgeOptions`
**Kind**: interface of [<code>electron-builder</code>](Options#module_electron-builder)  
**Properties**

| Name | Type |
| --- | --- |
| **dir**| <code>String</code> | 

<a name="LinuxTargetSpecificOptions"></a>
### `LinuxTargetSpecificOptions` ⇐ <code>[CommonLinuxOptions](#CommonLinuxOptions)</code>
**Kind**: interface of [<code>electron-builder</code>](Options#module_electron-builder)  
**Extends**: <code>[CommonLinuxOptions](#CommonLinuxOptions)</code>, <code>[TargetSpecificOptions](#TargetSpecificOptions)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| depends| <code>Array&lt;String&gt;</code> \| <code>null</code> | <a name="LinuxTargetSpecificOptions-depends"></a>Package dependencies. |
| icon| <code>String</code> | <a name="LinuxTargetSpecificOptions-icon"></a> |

<a name="PlatformSpecificBuildOptions"></a>
### `PlatformSpecificBuildOptions` ⇐ <code>[TargetSpecificOptions](#TargetSpecificOptions)</code>
**Kind**: interface of [<code>electron-builder</code>](Options#module_electron-builder)  
**Extends**: <code>[TargetSpecificOptions](#TargetSpecificOptions)</code>  
**Properties**

| Name | Type |
| --- | --- |
| files| <code>Array&lt;String&gt;</code> \| <code>String</code> \| <code>null</code> | 
| extraFiles| <code>Array&lt;String \| [FilePattern](Options#FilePattern)&gt;</code> \| <code>[FilePattern](Options#FilePattern)</code> \| <code>String</code> \| <code>null</code> | 
| extraResources| <code>Array&lt;String \| [FilePattern](Options#FilePattern)&gt;</code> \| <code>[FilePattern](Options#FilePattern)</code> \| <code>String</code> \| <code>null</code> | 
| asarUnpack| <code>Array&lt;String&gt;</code> \| <code>String</code> \| <code>null</code> | 
| asar| <code>[AsarOptions](Options#AsarOptions)</code> \| <code>Boolean</code> \| <code>null</code> | 
| target| <code>Array&lt;String \| [TargetConfig](#TargetConfig)&gt;</code> \| <code>String</code> \| <code>[TargetConfig](#TargetConfig)</code> \| <code>null</code> | 
| icon| <code>String</code> \| <code>null</code> | 
| fileAssociations| <code>Array&lt;[FileAssociation](Options#FileAssociation)&gt;</code> \| <code>[FileAssociation](Options#FileAssociation)</code> | 
| forceCodeSigning| <code>Boolean</code> | 

<a name="Packager"></a>
### Packager ⇐ <code>[BuildInfo](#BuildInfo)</code>
**Kind**: class of [<code>electron-builder</code>](Options#module_electron-builder)  
**Extends**: <code>[BuildInfo](#BuildInfo)</code>  
**Properties**

| Name | Type |
| --- | --- |
| projectDir| <code>String</code> | 
| **appDir**| <code>String</code> | 
| **metadata**| <code>[Metadata](Options#Metadata)</code> | 
| **isPrepackedAppAsar**| <code>Boolean</code> | 
| **config**| <code>[Config](Options#Config)</code> | 
| isTwoPackageJsonProjectLayoutUsed = <code>true</code>| <code>Boolean</code> | 
| eventEmitter = <code>new EventEmitter()</code>| <code>internal:EventEmitter</code> | 
| **appInfo**| <code>[AppInfo](#AppInfo)</code> | 
| tempDirManager = <code>new TmpDir()</code>| <code>module:electron-builder-util/out/tmp.TmpDir</code> | 
| options| <code>[PackagerOptions](Options#PackagerOptions)</code> | 
| **repositoryInfo**| <code>Promise&lt; \| [SourceRepositoryInfo](#SourceRepositoryInfo)&gt;</code> | 
| **outDir**| <code>String</code> | 


* [.Packager](#Packager) ⇐ <code>[BuildInfo](#BuildInfo)</code>
    * [`.addAfterPackHandler(handler)`](#module_electron-builder.Packager+addAfterPackHandler)
    * [`.afterPack(context)`](#module_electron-builder.Packager+afterPack) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.artifactCreated(handler)`](#module_electron-builder.Packager+artifactCreated) ⇒ <code>[Packager](#Packager)</code>
    * [`.build()`](#module_electron-builder.Packager+build) ⇒ <code>Promise&lt;[BuildResult](#BuildResult)&gt;</code>
    * [`.dispatchArtifactCreated(event)`](#module_electron-builder.Packager+dispatchArtifactCreated)

<a name="module_electron-builder.Packager+addAfterPackHandler"></a>
#### `packager.addAfterPackHandler(handler)`
**Kind**: instance method of [<code>Packager</code>](#Packager)  

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 

<a name="module_electron-builder.Packager+afterPack"></a>
#### `packager.afterPack(context)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of [<code>Packager</code>](#Packager)  
**Overrides**: [<code>afterPack</code>](#module_electron-builder.BuildInfo+afterPack)  

| Param | Type |
| --- | --- |
| context | <code>[AfterPackContext](#AfterPackContext)</code> | 

<a name="module_electron-builder.Packager+artifactCreated"></a>
#### `packager.artifactCreated(handler)` ⇒ <code>[Packager](#Packager)</code>
**Kind**: instance method of [<code>Packager</code>](#Packager)  

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 

<a name="module_electron-builder.Packager+build"></a>
#### `packager.build()` ⇒ <code>Promise&lt;[BuildResult](#BuildResult)&gt;</code>
**Kind**: instance method of [<code>Packager</code>](#Packager)  
<a name="module_electron-builder.Packager+dispatchArtifactCreated"></a>
#### `packager.dispatchArtifactCreated(event)`
**Kind**: instance method of [<code>Packager</code>](#Packager)  
**Overrides**: [<code>dispatchArtifactCreated</code>](#module_electron-builder.BuildInfo+dispatchArtifactCreated)  

| Param | Type |
| --- | --- |
| event | <code>[ArtifactCreated](#ArtifactCreated)</code> | 

<a name="Platform"></a>
### Platform
**Kind**: class of [<code>electron-builder</code>](Options#module_electron-builder)  
**Properties**

| Name | Type |
| --- | --- |
| MAC = <code>new Platform(&quot;mac&quot;, &quot;mac&quot;, &quot;darwin&quot;)</code>| <code>[Platform](#Platform)</code> | 
| LINUX = <code>new Platform(&quot;linux&quot;, &quot;linux&quot;, &quot;linux&quot;)</code>| <code>[Platform](#Platform)</code> | 
| WINDOWS = <code>new Platform(&quot;windows&quot;, &quot;win&quot;, &quot;win32&quot;)</code>| <code>[Platform](#Platform)</code> | 
| OSX = <code>Platform.MAC</code>| <code>[Platform](#Platform)</code> | 


* [.Platform](#Platform)
    * [`.createTarget(type, archs)`](#module_electron-builder.Platform+createTarget) ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;[Arch](#Arch) \| Array&lt;String&gt;&gt;&gt;</code>
    * [`.current()`](#module_electron-builder.Platform+current) ⇒ <code>[Platform](#Platform)</code>
    * [`.fromString(name)`](#module_electron-builder.Platform+fromString) ⇒ <code>[Platform](#Platform)</code>
    * [`.toString()`](#module_electron-builder.Platform+toString) ⇒ <code>String</code>

<a name="module_electron-builder.Platform+createTarget"></a>
#### `platform.createTarget(type, archs)` ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;[Arch](#Arch) \| Array&lt;String&gt;&gt;&gt;</code>
**Kind**: instance method of [<code>Platform</code>](#Platform)  

| Param | Type |
| --- | --- |
| type | <code>String</code> \| <code>Array&lt;String&gt;</code> \| <code>null</code> | 
| archs | <code>Array&lt;[Arch](#Arch)&gt;</code> | 

<a name="module_electron-builder.Platform+current"></a>
#### `platform.current()` ⇒ <code>[Platform](#Platform)</code>
**Kind**: instance method of [<code>Platform</code>](#Platform)  
<a name="module_electron-builder.Platform+fromString"></a>
#### `platform.fromString(name)` ⇒ <code>[Platform](#Platform)</code>
**Kind**: instance method of [<code>Platform</code>](#Platform)  

| Param | Type |
| --- | --- |
| name | <code>String</code> | 

<a name="module_electron-builder.Platform+toString"></a>
#### `platform.toString()` ⇒ <code>String</code>
**Kind**: instance method of [<code>Platform</code>](#Platform)  
<a name="Target"></a>
### Target
**Kind**: class of [<code>electron-builder</code>](Options#module_electron-builder)  
**Properties**

| Name | Type |
| --- | --- |
| outDir| <code>String</code> | 
| options| <code>[TargetSpecificOptions](#TargetSpecificOptions)</code> \| <code>null</code> \| <code>undefined</code> | 


* [.Target](#Target)
    * [`.build(appOutDir, arch)`](#module_electron-builder.Target+build) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.finishBuild()`](#module_electron-builder.Target+finishBuild) ⇒ <code>Promise&lt;any&gt;</code>

<a name="module_electron-builder.Target+build"></a>
#### `target.build(appOutDir, arch)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>Target</code>](#Target)  

| Param | Type |
| --- | --- |
| appOutDir | <code>String</code> | 
| arch | <code>[Arch](#Arch)</code> | 

<a name="module_electron-builder.Target+finishBuild"></a>
#### `target.finishBuild()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>Target</code>](#Target)  
<a name="Arch"></a>
### `electron-builder.Arch` : <code>enum</code>
**Kind**: enum of [<code>electron-builder</code>](Options#module_electron-builder)  
**Properties**

| Name |
| --- |
| **ia32**| 
| **x64**| 
| **armv7l**| 

<a name="module_electron-builder.archFromString"></a>
### `electron-builder.archFromString(name)` ⇒ <code>[Arch](#Arch)</code>
**Kind**: method of [<code>electron-builder</code>](Options#module_electron-builder)  

| Param | Type |
| --- | --- |
| name | <code>String</code> | 

<a name="module_electron-builder.build"></a>
### `electron-builder.build(rawOptions)` ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
**Kind**: method of [<code>electron-builder</code>](Options#module_electron-builder)  

| Param | Type |
| --- | --- |
| rawOptions | <code>[CliOptions](Options#CliOptions)</code> | 

<a name="module_electron-builder.buildForge"></a>
### `electron-builder.buildForge(forgeOptions, options)` ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
**Kind**: method of [<code>electron-builder</code>](Options#module_electron-builder)  

| Param | Type |
| --- | --- |
| forgeOptions | <code>[ForgeOptions](#ForgeOptions)</code> | 
| options | <code>[CliOptions](Options#CliOptions)</code> | 

<a name="module_electron-builder.createTargets"></a>
### `electron-builder.createTargets(platforms, type, arch)` ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;[Arch](#Arch) \| Array&lt;String&gt;&gt;&gt;</code>
**Kind**: method of [<code>electron-builder</code>](Options#module_electron-builder)  

| Param | Type |
| --- | --- |
| platforms | <code>Array&lt;[Platform](#Platform)&gt;</code> | 
| type | <code>String</code> \| <code>null</code> | 
| arch | <code>String</code> \| <code>null</code> | 

<a name="module_electron-builder.getArchSuffix"></a>
### `electron-builder.getArchSuffix(arch)` ⇒ <code>String</code>
**Kind**: method of [<code>electron-builder</code>](Options#module_electron-builder)  

| Param | Type |
| --- | --- |
| arch | <code>[Arch](#Arch)</code> | 

<a name="module_electron-builder/out/appInfo"></a>
## electron-builder/out/appInfo

* [electron-builder/out/appInfo](#module_electron-builder/out/appInfo)
    * [.AppInfo](#AppInfo)
        * [`.computePackageUrl()`](#module_electron-builder/out/appInfo.AppInfo+computePackageUrl) ⇒ <code>Promise&lt; \| String&gt;</code>

<a name="AppInfo"></a>
### AppInfo
**Kind**: class of [<code>electron-builder/out/appInfo</code>](#module_electron-builder/out/appInfo)  
**Properties**

| Name | Type |
| --- | --- |
| description = <code>&quot;smarten(this.info.metadata.description || \&quot;\&quot;)&quot;</code>| <code>String</code> | 
| version| <code>String</code> | 
| buildNumber| <code>String</code> | 
| buildVersion| <code>String</code> | 
| productName| <code>String</code> | 
| productFilename| <code>String</code> | 
| **versionInWeirdWindowsForm**| <code>String</code> | 
| companyName| <code>String</code> \| <code>null</code> | 
| **id**| <code>String</code> | 
| **name**| <code>String</code> | 
| **copyright**| <code>String</code> | 

<a name="module_electron-builder/out/appInfo.AppInfo+computePackageUrl"></a>
#### `appInfo.computePackageUrl()` ⇒ <code>Promise&lt; \| String&gt;</code>
**Kind**: instance method of [<code>AppInfo</code>](#AppInfo)  
<a name="module_electron-builder/out/core"></a>
## electron-builder/out/core

* [electron-builder/out/core](#module_electron-builder/out/core)
    * [`.BeforeBuildContext`](#BeforeBuildContext)
    * [`.SourceRepositoryInfo`](#SourceRepositoryInfo)
    * [`.TargetConfig`](#TargetConfig)
    * [`.TargetSpecificOptions`](#TargetSpecificOptions)
    * [`.toLinuxArchString(arch)`](#module_electron-builder/out/core.toLinuxArchString) ⇒ <code>"armv7l"</code> \| <code>"i386"</code> \| <code>"amd64"</code>

<a name="BeforeBuildContext"></a>
### `BeforeBuildContext`
**Kind**: interface of [<code>electron-builder/out/core</code>](#module_electron-builder/out/core)  
**Properties**

| Name | Type |
| --- | --- |
| **appDir**| <code>String</code> | 
| **electronVersion**| <code>String</code> | 
| **platform**| <code>[Platform](#Platform)</code> | 
| **arch**| <code>String</code> | 

<a name="SourceRepositoryInfo"></a>
### `SourceRepositoryInfo`
**Kind**: interface of [<code>electron-builder/out/core</code>](#module_electron-builder/out/core)  
**Properties**

| Name | Type |
| --- | --- |
| type| <code>String</code> | 
| domain| <code>String</code> | 
| **user**| <code>String</code> | 
| **project**| <code>String</code> | 

<a name="TargetConfig"></a>
### `TargetConfig`
**Kind**: interface of [<code>electron-builder/out/core</code>](#module_electron-builder/out/core)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| **target**| <code>String</code> | <a name="TargetConfig-target"></a>The target name. e.g. `snap`. |
| arch| <code>Array&lt;"x64" \| "ia32" \| "armv7l"&gt;</code> \| <code>String</code> | <a name="TargetConfig-arch"></a>The arch or list of archs. |

<a name="TargetSpecificOptions"></a>
### `TargetSpecificOptions`
**Kind**: interface of [<code>electron-builder/out/core</code>](#module_electron-builder/out/core)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| artifactName| <code>String</code> \| <code>null</code> | <a name="TargetSpecificOptions-artifactName"></a>The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern). |
| publish| <code>null</code> \| <code>String</code> \| <code>[GithubOptions](Publishing-Artifacts#GithubOptions)</code> \| <code>[S3Options](Publishing-Artifacts#S3Options)</code> \| <code>[GenericServerOptions](Publishing-Artifacts#GenericServerOptions)</code> \| <code>[BintrayOptions](Publishing-Artifacts#BintrayOptions)</code> \| <code>Array</code> | <a name="TargetSpecificOptions-publish"></a> |

<a name="module_electron-builder/out/core.toLinuxArchString"></a>
### `electron-builder/out/core.toLinuxArchString(arch)` ⇒ <code>"armv7l"</code> \| <code>"i386"</code> \| <code>"amd64"</code>
**Kind**: method of [<code>electron-builder/out/core</code>](#module_electron-builder/out/core)  

| Param | Type |
| --- | --- |
| arch | <code>[Arch](#Arch)</code> | 

<a name="module_electron-builder/out/packager"></a>
## electron-builder/out/packager
<a name="module_electron-builder/out/packager.normalizePlatforms"></a>
### `electron-builder/out/packager.normalizePlatforms(rawPlatforms)` ⇒ <code>Array&lt;[Platform](#Platform)&gt;</code>
**Kind**: method of [<code>electron-builder/out/packager</code>](#module_electron-builder/out/packager)  

| Param | Type |
| --- | --- |
| rawPlatforms | <code>Array&lt;String \| [Platform](#Platform)&gt;</code> \| <code>String</code> \| <code>[Platform](#Platform)</code> \| <code>undefined</code> \| <code>null</code> | 

<a name="module_electron-builder/out/platformPackager"></a>
## electron-builder/out/platformPackager

* [electron-builder/out/platformPackager](#module_electron-builder/out/platformPackager)
    * [.PlatformPackager](#PlatformPackager)
        * [`.computeSafeArtifactName(ext, arch, skipArchIfX64)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeSafeArtifactName) ⇒ <code>String</code>
        * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+createTargets)
        * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise&lt; \| String&gt;</code>
        * [`.dispatchArtifactCreated(file, target, arch, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
        * [`.getElectronDestDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronDestDir) ⇒ <code>String</code>
        * [`.getElectronSrcDir(dist)`](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronSrcDir) ⇒ <code>String</code>
        * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern, skipArchIfX64)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>String</code>
        * [`.expandMacro(pattern, arch, extra, isProductNameSanitized)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>String</code>
        * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>String</code>
        * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>String</code>
        * [`.getIconPath()`](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath) ⇒ <code>Promise&lt; \| String&gt;</code>
        * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>String</code>
        * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+pack) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise&lt; \| String&gt;</code>
        * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>String</code>
        * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise&lt;String&gt;</code>
    * [`.normalizeExt(ext)`](#module_electron-builder/out/platformPackager.normalizeExt) ⇒ <code>String</code>

<a name="PlatformPackager"></a>
### PlatformPackager
**Kind**: class of [<code>electron-builder/out/platformPackager</code>](#module_electron-builder/out/platformPackager)  
**Properties**

| Name | Type |
| --- | --- |
| packagerOptions| <code>[PackagerOptions](Options#PackagerOptions)</code> | 
| projectDir| <code>String</code> | 
| buildResourcesDir| <code>String</code> | 
| config| <code>[Config](Options#Config)</code> | 
| platformSpecificBuildOptions| <code>module:electron-builder/out/platformPackager.DC</code> | 
| **resourceList**| <code>Promise&lt;Array&lt;String&gt;&gt;</code> | 
| **platform**| <code>[Platform](#Platform)</code> | 
| appInfo| <code>[AppInfo](#AppInfo)</code> | 
| **defaultTarget**| <code>Array&lt;String&gt;</code> | 
| **relativeBuildResourcesDirname**| <code>String</code> | 
| **electronDistMacOsAppName**| <code>"Electron.app"</code> \| <code>"Brave.app"</code> | 
| **electronDistExecutableName**| <code>"electron"</code> \| <code>"brave"</code> | 
| **electronDistMacOsExecutableName**| <code>"Electron"</code> \| <code>"Brave"</code> | 
| **fileAssociations**| <code>Array&lt;[FileAssociation](Options#FileAssociation)&gt;</code> | 
| **forceCodeSigning**| <code>Boolean</code> | 


* [.PlatformPackager](#PlatformPackager)
    * [`.computeSafeArtifactName(ext, arch, skipArchIfX64)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeSafeArtifactName) ⇒ <code>String</code>
    * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+createTargets)
    * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise&lt; \| String&gt;</code>
    * [`.dispatchArtifactCreated(file, target, arch, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
    * [`.getElectronDestDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronDestDir) ⇒ <code>String</code>
    * [`.getElectronSrcDir(dist)`](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronSrcDir) ⇒ <code>String</code>
    * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern, skipArchIfX64)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>String</code>
    * [`.expandMacro(pattern, arch, extra, isProductNameSanitized)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>String</code>
    * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>String</code>
    * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>String</code>
    * [`.getIconPath()`](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath) ⇒ <code>Promise&lt; \| String&gt;</code>
    * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>String</code>
    * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+pack) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise&lt; \| String&gt;</code>
    * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>String</code>
    * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise&lt;String&gt;</code>

<a name="module_electron-builder/out/platformPackager.PlatformPackager+computeSafeArtifactName"></a>
#### `platformPackager.computeSafeArtifactName(ext, arch, skipArchIfX64)` ⇒ <code>String</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| ext | <code>String</code> | 
| arch | <code>[Arch](#Arch)</code> \| <code>null</code> | 
| skipArchIfX64 |  | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+createTargets"></a>
#### `platformPackager.createTargets(targets, mapper, cleanupTasks)`
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| targets | <code>Array&lt;String&gt;</code> | 
| mapper | <code>callback</code> | 
| cleanupTasks | <code>Array&lt;module:electron-builder/out/platformPackager.__type&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon"></a>
#### `platformPackager.getDefaultIcon(ext)` ⇒ <code>Promise&lt; \| String&gt;</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| ext | <code>String</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated"></a>
#### `platformPackager.dispatchArtifactCreated(file, target, arch, safeArtifactName)`
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| file | <code>String</code> | 
| target | <code>[Target](#Target)</code> \| <code>null</code> | 
| arch | <code>[Arch](#Arch)</code> \| <code>null</code> | 
| safeArtifactName | <code>String</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getElectronDestDir"></a>
#### `platformPackager.getElectronDestDir(appOutDir)` ⇒ <code>String</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| appOutDir | <code>String</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getElectronSrcDir"></a>
#### `platformPackager.getElectronSrcDir(dist)` ⇒ <code>String</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| dist | <code>String</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern"></a>
#### `platformPackager.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern, skipArchIfX64)` ⇒ <code>String</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[TargetSpecificOptions](#TargetSpecificOptions)</code> \| <code>undefined</code> \| <code>null</code> | 
| ext | <code>String</code> | 
| arch | <code>[Arch](#Arch)</code> \| <code>null</code> | 
| defaultPattern | <code>String</code> | 
| skipArchIfX64 |  | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandMacro"></a>
#### `platformPackager.expandMacro(pattern, arch, extra, isProductNameSanitized)` ⇒ <code>String</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| pattern | <code>String</code> | 
| arch | <code>String</code> \| <code>null</code> | 
| extra | <code>any</code> | 
| isProductNameSanitized |  | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName"></a>
#### `platformPackager.generateName(ext, arch, deployment, classifier)` ⇒ <code>String</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| ext | <code>String</code> \| <code>null</code> | 
| arch | <code>[Arch](#Arch)</code> | 
| deployment | <code>Boolean</code> | 
| classifier | <code>String</code> \| <code>null</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName2"></a>
#### `platformPackager.generateName2(ext, classifier, deployment)` ⇒ <code>String</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| ext | <code>String</code> \| <code>null</code> | 
| classifier | <code>String</code> \| <code>undefined</code> \| <code>null</code> | 
| deployment | <code>Boolean</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getIconPath"></a>
#### `platformPackager.getIconPath()` ⇒ <code>Promise&lt; \| String&gt;</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir"></a>
#### `platformPackager.getMacOsResourcesDir(appOutDir)` ⇒ <code>String</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| appOutDir | <code>String</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+pack"></a>
#### `platformPackager.pack(outDir, arch, targets, postAsyncTasks)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| outDir | <code>String</code> | 
| arch | <code>[Arch](#Arch)</code> | 
| targets | <code>Array&lt;[Target](#Target)&gt;</code> | 
| postAsyncTasks | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResource"></a>
#### `platformPackager.getResource(custom, names)` ⇒ <code>Promise&lt; \| String&gt;</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| custom | <code>String</code> \| <code>undefined</code> \| <code>null</code> | 
| names | <code>Array&lt;String&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir"></a>
#### `platformPackager.getResourcesDir(appOutDir)` ⇒ <code>String</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| appOutDir | <code>String</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getTempFile"></a>
#### `platformPackager.getTempFile(suffix)` ⇒ <code>Promise&lt;String&gt;</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| suffix | <code>String</code> | 

<a name="module_electron-builder/out/platformPackager.normalizeExt"></a>
### `electron-builder/out/platformPackager.normalizeExt(ext)` ⇒ <code>String</code>
**Kind**: method of [<code>electron-builder/out/platformPackager</code>](#module_electron-builder/out/platformPackager)  

| Param | Type |
| --- | --- |
| ext | <code>String</code> | 

<a name="module_electron-builder/out/publish/PublishManager"></a>
## electron-builder/out/publish/PublishManager

* [electron-builder/out/publish/PublishManager](#module_electron-builder/out/publish/PublishManager)
    * [.PublishManager](#PublishManager) ⇐ <code>[PublishContext](electron-publish#PublishContext)</code>
        * [`.awaitTasks()`](#module_electron-builder/out/publish/PublishManager.PublishManager+awaitTasks) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.cancelTasks()`](#module_electron-builder/out/publish/PublishManager.PublishManager+cancelTasks)
    * [`.computeDownloadUrl(publishConfig, fileName, packager)`](#module_electron-builder/out/publish/PublishManager.computeDownloadUrl) ⇒ <code>String</code>
    * [`.createPublisher(context, version, publishConfig, options)`](#module_electron-builder/out/publish/PublishManager.createPublisher) ⇒ <code>null</code> \| <code>[Publisher](electron-publish#Publisher)</code>
    * [`.getPublishConfigs(packager, targetSpecificOptions, arch)`](#module_electron-builder/out/publish/PublishManager.getPublishConfigs) ⇒ <code>Promise&lt; \| Array&gt;</code>
    * [`.getPublishConfigsForUpdateInfo(packager, publishConfigs, arch)`](#module_electron-builder/out/publish/PublishManager.getPublishConfigsForUpdateInfo) ⇒ <code>Promise&lt; \| Array&gt;</code>

<a name="PublishManager"></a>
### PublishManager ⇐ <code>[PublishContext](electron-publish#PublishContext)</code>
**Kind**: class of [<code>electron-builder/out/publish/PublishManager</code>](#module_electron-builder/out/publish/PublishManager)  
**Extends**: <code>[PublishContext](electron-publish#PublishContext)</code>  
**Properties**

| Name | Type |
| --- | --- |
| publishTasks=| <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 
| progress = <code>(&lt;TtyWriteStream&gt;process.stdout).isTTY ? new MultiProgress() : null</code>| <code>null</code> \| <code>[MultiProgress](electron-publish#MultiProgress)</code> | 


* [.PublishManager](#PublishManager) ⇐ <code>[PublishContext](electron-publish#PublishContext)</code>
    * [`.awaitTasks()`](#module_electron-builder/out/publish/PublishManager.PublishManager+awaitTasks) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.cancelTasks()`](#module_electron-builder/out/publish/PublishManager.PublishManager+cancelTasks)

<a name="module_electron-builder/out/publish/PublishManager.PublishManager+awaitTasks"></a>
#### `publishManager.awaitTasks()` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of [<code>PublishManager</code>](#PublishManager)  
<a name="module_electron-builder/out/publish/PublishManager.PublishManager+cancelTasks"></a>
#### `publishManager.cancelTasks()`
**Kind**: instance method of [<code>PublishManager</code>](#PublishManager)  
<a name="module_electron-builder/out/publish/PublishManager.computeDownloadUrl"></a>
### `electron-builder/out/publish/PublishManager.computeDownloadUrl(publishConfig, fileName, packager)` ⇒ <code>String</code>
**Kind**: method of [<code>electron-builder/out/publish/PublishManager</code>](#module_electron-builder/out/publish/PublishManager)  

| Param | Type |
| --- | --- |
| publishConfig | <code>[PublishConfiguration](Publishing-Artifacts#PublishConfiguration)</code> | 
| fileName | <code>String</code> \| <code>null</code> | 
| packager | <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 

<a name="module_electron-builder/out/publish/PublishManager.createPublisher"></a>
### `electron-builder/out/publish/PublishManager.createPublisher(context, version, publishConfig, options)` ⇒ <code>null</code> \| <code>[Publisher](electron-publish#Publisher)</code>
**Kind**: method of [<code>electron-builder/out/publish/PublishManager</code>](#module_electron-builder/out/publish/PublishManager)  

| Param | Type |
| --- | --- |
| context | <code>[PublishContext](electron-publish#PublishContext)</code> | 
| version | <code>String</code> | 
| publishConfig | <code>[PublishConfiguration](Publishing-Artifacts#PublishConfiguration)</code> | 
| options | <code>[PublishOptions](electron-publish#PublishOptions)</code> | 

<a name="module_electron-builder/out/publish/PublishManager.getPublishConfigs"></a>
### `electron-builder/out/publish/PublishManager.getPublishConfigs(packager, targetSpecificOptions, arch)` ⇒ <code>Promise&lt; \| Array&gt;</code>
**Kind**: method of [<code>electron-builder/out/publish/PublishManager</code>](#module_electron-builder/out/publish/PublishManager)  

| Param | Type |
| --- | --- |
| packager | <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 
| targetSpecificOptions | <code>[PlatformSpecificBuildOptions](#PlatformSpecificBuildOptions)</code> \| <code>null</code> \| <code>undefined</code> | 
| arch | <code>[Arch](#Arch)</code> \| <code>null</code> | 

<a name="module_electron-builder/out/publish/PublishManager.getPublishConfigsForUpdateInfo"></a>
### `electron-builder/out/publish/PublishManager.getPublishConfigsForUpdateInfo(packager, publishConfigs, arch)` ⇒ <code>Promise&lt; \| Array&gt;</code>
**Kind**: method of [<code>electron-builder/out/publish/PublishManager</code>](#module_electron-builder/out/publish/PublishManager)  

| Param | Type |
| --- | --- |
| packager | <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 
| publishConfigs | <code>Array&lt;[PublishConfiguration](Publishing-Artifacts#PublishConfiguration)&gt;</code> \| <code>null</code> | 
| arch | <code>[Arch](#Arch)</code> \| <code>null</code> | 

<a name="module_electron-builder/out/util/flags"></a>
## electron-builder/out/util/flags

* [electron-builder/out/util/flags](#module_electron-builder/out/util/flags)
    * [`.isUseSystemSigncode()`](#module_electron-builder/out/util/flags.isUseSystemSigncode) ⇒ <code>Boolean</code>
    * [`.isUseSystemWine()`](#module_electron-builder/out/util/flags.isUseSystemWine) ⇒ <code>Boolean</code>

<a name="module_electron-builder/out/util/flags.isUseSystemSigncode"></a>
### `electron-builder/out/util/flags.isUseSystemSigncode()` ⇒ <code>Boolean</code>
**Kind**: method of [<code>electron-builder/out/util/flags</code>](#module_electron-builder/out/util/flags)  
<a name="module_electron-builder/out/util/flags.isUseSystemWine"></a>
### `electron-builder/out/util/flags.isUseSystemWine()` ⇒ <code>Boolean</code>
**Kind**: method of [<code>electron-builder/out/util/flags</code>](#module_electron-builder/out/util/flags)  
<a name="module_electron-builder/out/util/timer"></a>
## electron-builder/out/util/timer

* [electron-builder/out/util/timer](#module_electron-builder/out/util/timer)
    * [`.Timer`](#Timer)
        * [`.end()`](#module_electron-builder/out/util/timer.Timer+end)
    * [`.time(label)`](#module_electron-builder/out/util/timer.time) ⇒ <code>[Timer](#Timer)</code>

<a name="Timer"></a>
### `Timer`
**Kind**: interface of [<code>electron-builder/out/util/timer</code>](#module_electron-builder/out/util/timer)  
<a name="module_electron-builder/out/util/timer.Timer+end"></a>
#### `timer.end()`
**Kind**: instance method of [<code>Timer</code>](#Timer)  
<a name="module_electron-builder/out/util/timer.time"></a>
### `electron-builder/out/util/timer.time(label)` ⇒ <code>[Timer](#Timer)</code>
**Kind**: method of [<code>electron-builder/out/util/timer</code>](#module_electron-builder/out/util/timer)  

| Param | Type |
| --- | --- |
| label | <code>String</code> | 

<a name="module_electron-builder/out/windowsCodeSign"></a>
## electron-builder/out/windowsCodeSign
<a name="SignOptions"></a>
### `SignOptions`
**Kind**: interface of [<code>electron-builder/out/windowsCodeSign</code>](#module_electron-builder/out/windowsCodeSign)  
**Properties**

| Name | Type |
| --- | --- |
| **path**| <code>String</code> | 
| cert| <code>String</code> \| <code>null</code> | 
| name| <code>String</code> \| <code>null</code> | 
| password| <code>String</code> \| <code>null</code> | 
| site| <code>String</code> \| <code>null</code> | 
| **options**| <code>[WinBuildOptions](Options#WinBuildOptions)</code> | 


<!-- end of generated block -->