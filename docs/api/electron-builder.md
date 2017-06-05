Developer API only. See [[Options]] for user documentation.

<!-- do not edit. start of generated block -->
## Modules

<dl>
<dt><a href="#module_electron-builder">electron-builder</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/appInfo">electron-builder/out/appInfo</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/builder">electron-builder/out/builder</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/codeSign">electron-builder/out/codeSign</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/forge/forge-maker">electron-builder/out/forge/forge-maker</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/linuxPackager">electron-builder/out/linuxPackager</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/macPackager">electron-builder/out/macPackager</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/options/linuxOptions">electron-builder/out/options/linuxOptions</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/options/winOptions">electron-builder/out/options/winOptions</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/packager/mac">electron-builder/out/packager/mac</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/packager">electron-builder/out/packager</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/platformPackager">electron-builder/out/platformPackager</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/publish/PublishManager">electron-builder/out/publish/PublishManager</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/targets/appImage">electron-builder/out/targets/appImage</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/targets/appx">electron-builder/out/targets/appx</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/targets/ArchiveTarget">electron-builder/out/targets/ArchiveTarget</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/targets/dmg">electron-builder/out/targets/dmg</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/targets/fpm">electron-builder/out/targets/fpm</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/targets/LinuxTargetHelper">electron-builder/out/targets/LinuxTargetHelper</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/targets/nsis">electron-builder/out/targets/nsis</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/targets/pkg">electron-builder/out/targets/pkg</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/targets/snap">electron-builder/out/targets/snap</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/targets/targetFactory">electron-builder/out/targets/targetFactory</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/targets/WebInstallerTarget">electron-builder/out/targets/WebInstallerTarget</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/util/readPackageJson">electron-builder/out/util/readPackageJson</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/windowsCodeSign">electron-builder/out/windowsCodeSign</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/winPackager">electron-builder/out/winPackager</a></dt>
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
    * [.Packager](#Packager) ⇐ <code>[BuildInfo](#BuildInfo)</code>
        * [`.addAfterPackHandler(handler)`](#module_electron-builder.Packager+addAfterPackHandler)
        * [`.afterPack(context)`](#module_electron-builder.Packager+afterPack) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.artifactCreated(handler)`](#module_electron-builder.Packager+artifactCreated) ⇒ <code>[Packager](#Packager)</code>
        * [`.build()`](#module_electron-builder.Packager+build) ⇒ <code>Promise&lt;[BuildResult](#BuildResult)&gt;</code>
        * [`.dispatchArtifactCreated(event)`](#module_electron-builder.Packager+dispatchArtifactCreated)
    * [`.build(rawOptions)`](#module_electron-builder.build) ⇒ <code>Promise&lt;Array&lt;string&gt;&gt;</code>
    * [`.buildForge(forgeOptions, options)`](#module_electron-builder.buildForge) ⇒ <code>Promise&lt;Array&lt;string&gt;&gt;</code>
    * [`.createTargets(platforms, type, arch)`](#module_electron-builder.createTargets) ⇒ <code>Map&lt;[Platform](electron-builder-core#Platform) \| Map&lt;[Arch](electron-builder-core#Arch) \| Array&lt;string&gt;&gt;&gt;</code>

<a name="AfterPackContext"></a>

### `AfterPackContext`
**Kind**: interface of [<code>electron-builder</code>](Options#module_electron-builder)  
**Properties**

| Name | Type |
| --- | --- |
| **appOutDir**| <code>string</code> | 
| **packager**| <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 
| **electronPlatformName**| <code>string</code> | 
| **arch**| <code>[Arch](electron-builder-core#Arch)</code> | 
| **targets**| <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 

<a name="ArtifactCreated"></a>

### `ArtifactCreated`
**Kind**: interface of [<code>electron-builder</code>](Options#module_electron-builder)  
**Properties**

| Name | Type |
| --- | --- |
| **packager**| <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 
| target| <code>[Target](electron-builder-core#Target)</code> \| <code>null</code> | 
| arch| <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 
| file| <code>string</code> | 
| data| <code>Buffer</code> | 
| safeArtifactName| <code>string</code> | 
| publishConfig| <code>[PublishConfiguration](Publishing-Artifacts#PublishConfiguration)</code> | 

<a name="BuildInfo"></a>

### `BuildInfo`
**Kind**: interface of [<code>electron-builder</code>](Options#module_electron-builder)  
**Properties**

| Name | Type |
| --- | --- |
| **options**| <code>[PackagerOptions](Options#PackagerOptions)</code> | 
| **metadata**| <code>[Metadata](Options#Metadata)</code> | 
| **devMetadata**| <code>[Metadata](Options#Metadata)</code> | 
| **config**| <code>[Config](Options#Config)</code> | 
| **projectDir**| <code>string</code> | 
| **appDir**| <code>string</code> | 
| **electronVersion**| <code>string</code> | 
| muonVersion| <code>string</code> \| <code>null</code> | 
| **isTwoPackageJsonProjectLayoutUsed**| <code>boolean</code> | 
| **appInfo**| <code>[AppInfo](#AppInfo)</code> | 
| **tempDirManager**| <code>[TmpDir](electron-builder-util#TmpDir)</code> | 
| **repositoryInfo**| <code>Promise&lt; \| [SourceRepositoryInfo](electron-builder-core#SourceRepositoryInfo)&gt;</code> | 
| **isPrepackedAppAsar**| <code>boolean</code> | 
| prepackaged| <code>string</code> \| <code>null</code> | 
| **cancellationToken**| <code>[CancellationToken](electron-builder-http#CancellationToken)</code> | 


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
| **outDir**| <code>string</code> | 
| **platformToTargets**| <code>Map&lt;[Platform](electron-builder-core#Platform) \| Map&lt;String \| [Target](electron-builder-core#Target)&gt;&gt;</code> | 

<a name="Packager"></a>

### Packager ⇐ <code>[BuildInfo](#BuildInfo)</code>
**Kind**: class of [<code>electron-builder</code>](Options#module_electron-builder)  
**Extends**: <code>[BuildInfo](#BuildInfo)</code>  
**Properties**

| Name | Type |
| --- | --- |
| projectDir| <code>string</code> | 
| **appDir**| <code>string</code> | 
| **metadata**| <code>[Metadata](Options#Metadata)</code> | 
| **devMetadata**| <code>[Metadata](Options#Metadata)</code> | 
| isTwoPackageJsonProjectLayoutUsed = <code>true</code>| <code>boolean</code> | 
| **electronVersion**| <code>string</code> | 
| muonVersion| <code>string</code> \| <code>null</code> | 
| eventEmitter = <code>new EventEmitter()</code>| <code>internal:EventEmitter</code> | 
| **appInfo**| <code>[AppInfo](#AppInfo)</code> | 
| tempDirManager = <code>new TmpDir()</code>| <code>[TmpDir](electron-builder-util#TmpDir)</code> | 
| prepackaged| <code>string</code> \| <code>null</code> | 


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

<a name="module_electron-builder.build"></a>

### `electron-builder.build(rawOptions)` ⇒ <code>Promise&lt;Array&lt;string&gt;&gt;</code>
**Kind**: method of [<code>electron-builder</code>](Options#module_electron-builder)  

| Param | Type |
| --- | --- |
| rawOptions | <code>[CliOptions](Options#CliOptions)</code> | 

<a name="module_electron-builder.buildForge"></a>

### `electron-builder.buildForge(forgeOptions, options)` ⇒ <code>Promise&lt;Array&lt;string&gt;&gt;</code>
**Kind**: method of [<code>electron-builder</code>](Options#module_electron-builder)  

| Param | Type |
| --- | --- |
| forgeOptions | <code>[ForgeOptions](#ForgeOptions)</code> | 
| options | <code>[CliOptions](Options#CliOptions)</code> | 

<a name="module_electron-builder.createTargets"></a>

### `electron-builder.createTargets(platforms, type, arch)` ⇒ <code>Map&lt;[Platform](electron-builder-core#Platform) \| Map&lt;[Arch](electron-builder-core#Arch) \| Array&lt;string&gt;&gt;&gt;</code>
**Kind**: method of [<code>electron-builder</code>](Options#module_electron-builder)  

| Param | Type |
| --- | --- |
| platforms | <code>Array&lt;[Platform](electron-builder-core#Platform)&gt;</code> | 
| type | <code>string</code> \| <code>null</code> | 
| arch | <code>string</code> \| <code>null</code> | 

<a name="module_electron-builder/out/appInfo"></a>

## electron-builder/out/appInfo

* [electron-builder/out/appInfo](#module_electron-builder/out/appInfo)
    * [.AppInfo](#AppInfo)
        * [`.computePackageUrl()`](#module_electron-builder/out/appInfo.AppInfo+computePackageUrl) ⇒ <code>Promise&lt; \| string&gt;</code>

<a name="AppInfo"></a>

### AppInfo
**Kind**: class of [<code>electron-builder/out/appInfo</code>](#module_electron-builder/out/appInfo)  
**Properties**

| Name | Type |
| --- | --- |
| description = <code>&quot;smarten(this.metadata.description || \&quot;\&quot;)&quot;</code>| <code>string</code> | 
| version| <code>string</code> | 
| buildNumber| <code>string</code> | 
| buildVersion| <code>string</code> | 
| productName| <code>string</code> | 
| productFilename| <code>string</code> | 

<a name="module_electron-builder/out/appInfo.AppInfo+computePackageUrl"></a>

#### `appInfo.computePackageUrl()` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of [<code>AppInfo</code>](#AppInfo)  
<a name="module_electron-builder/out/builder"></a>

## electron-builder/out/builder
<a name="module_electron-builder/out/builder.normalizeOptions"></a>

### `electron-builder/out/builder.normalizeOptions(args)` ⇒ <code>[BuildOptions](Options#BuildOptions)</code>
**Kind**: method of [<code>electron-builder/out/builder</code>](#module_electron-builder/out/builder)  

| Param | Type |
| --- | --- |
| args | <code>[CliOptions](Options#CliOptions)</code> | 

<a name="module_electron-builder/out/codeSign"></a>

## electron-builder/out/codeSign

* [electron-builder/out/codeSign](#module_electron-builder/out/codeSign)
    * [`.CodeSigningInfo`](#CodeSigningInfo)
    * [`.CreateKeychainOptions`](#CreateKeychainOptions)
    * [`.findIdentityRawResult`](#module_electron-builder/out/codeSign.findIdentityRawResult) : <code>Promise&lt;Array&lt;string&gt;&gt;</code> \| <code>null</code>
    * [`.createKeychain(undefined)`](#module_electron-builder/out/codeSign.createKeychain) ⇒ <code>Promise&lt;[CodeSigningInfo](#CodeSigningInfo)&gt;</code>
    * [`.downloadCertificate(urlOrBase64, tmpDir, currentDir)`](#module_electron-builder/out/codeSign.downloadCertificate) ⇒ <code>Promise&lt;string&gt;</code>
    * [`.findIdentity(certType, qualifier, keychain)`](#module_electron-builder/out/codeSign.findIdentity) ⇒ <code>Promise&lt; \| string&gt;</code>
    * [`.sign(path, name, keychain)`](#module_electron-builder/out/codeSign.sign) ⇒ <code>Promise&lt;any&gt;</code>

<a name="CodeSigningInfo"></a>

### `CodeSigningInfo`
**Kind**: interface of [<code>electron-builder/out/codeSign</code>](#module_electron-builder/out/codeSign)  
**Properties**

| Name | Type |
| --- | --- |
| keychainName| <code>string</code> \| <code>null</code> | 

<a name="CreateKeychainOptions"></a>

### `CreateKeychainOptions`
**Kind**: interface of [<code>electron-builder/out/codeSign</code>](#module_electron-builder/out/codeSign)  
**Properties**

| Name | Type |
| --- | --- |
| **tmpDir**| <code>[TmpDir](electron-builder-util#TmpDir)</code> | 
| **cscLink**| <code>string</code> | 
| **cscKeyPassword**| <code>string</code> | 
| cscILink| <code>string</code> \| <code>null</code> | 
| cscIKeyPassword| <code>string</code> \| <code>null</code> | 
| **currentDir**| <code>string</code> | 

<a name="module_electron-builder/out/codeSign.findIdentityRawResult"></a>

### `electron-builder/out/codeSign.findIdentityRawResult` : <code>Promise&lt;Array&lt;string&gt;&gt;</code> \| <code>null</code>
**Kind**: property of [<code>electron-builder/out/codeSign</code>](#module_electron-builder/out/codeSign)  
<a name="module_electron-builder/out/codeSign.createKeychain"></a>

### `electron-builder/out/codeSign.createKeychain(undefined)` ⇒ <code>Promise&lt;[CodeSigningInfo](#CodeSigningInfo)&gt;</code>
**Kind**: method of [<code>electron-builder/out/codeSign</code>](#module_electron-builder/out/codeSign)  

| Param | Type |
| --- | --- |
| undefined | <code>[CreateKeychainOptions](#CreateKeychainOptions)</code> | 

<a name="module_electron-builder/out/codeSign.downloadCertificate"></a>

### `electron-builder/out/codeSign.downloadCertificate(urlOrBase64, tmpDir, currentDir)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: method of [<code>electron-builder/out/codeSign</code>](#module_electron-builder/out/codeSign)  

| Param | Type |
| --- | --- |
| urlOrBase64 | <code>string</code> | 
| tmpDir | <code>[TmpDir](electron-builder-util#TmpDir)</code> | 
| currentDir | <code>string</code> | 

<a name="module_electron-builder/out/codeSign.findIdentity"></a>

### `electron-builder/out/codeSign.findIdentity(certType, qualifier, keychain)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: method of [<code>electron-builder/out/codeSign</code>](#module_electron-builder/out/codeSign)  

| Param | Type |
| --- | --- |
| certType | <code>"Developer ID Application"</code> \| <code>"Developer ID Installer"</code> \| <code>"3rd Party Mac Developer Application"</code> \| <code>"3rd Party Mac Developer Installer"</code> \| <code>"Mac Developer"</code> | 
| qualifier | <code>string</code> \| <code>null</code> | 
| keychain | <code>string</code> \| <code>null</code> | 

<a name="module_electron-builder/out/codeSign.sign"></a>

### `electron-builder/out/codeSign.sign(path, name, keychain)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: method of [<code>electron-builder/out/codeSign</code>](#module_electron-builder/out/codeSign)  

| Param | Type |
| --- | --- |
| path | <code>string</code> | 
| name | <code>string</code> | 
| keychain | <code>string</code> | 

<a name="module_electron-builder/out/forge/forge-maker"></a>

## electron-builder/out/forge/forge-maker
<a name="ForgeOptions"></a>

### `ForgeOptions`
**Kind**: interface of [<code>electron-builder/out/forge/forge-maker</code>](#module_electron-builder/out/forge/forge-maker)  
**Properties**

| Name | Type |
| --- | --- |
| **dir**| <code>string</code> | 

<a name="module_electron-builder/out/linuxPackager"></a>

## electron-builder/out/linuxPackager

* [electron-builder/out/linuxPackager](#module_electron-builder/out/linuxPackager)
    * [.LinuxPackager](#LinuxPackager) ⇐ <code>[PlatformPackager](#PlatformPackager)</code>
        * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/linuxPackager.LinuxPackager+createTargets)
        * [`.postInitApp(appOutDir)`](#module_electron-builder/out/linuxPackager.LinuxPackager+postInitApp) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise&lt; \| string&gt;</code>
        * [`.dispatchArtifactCreated(file, target, arch, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
        * [`.getElectronDestDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronDestDir) ⇒ <code>string</code>
        * [`.getElectronSrcDir(dist)`](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronSrcDir) ⇒ <code>string</code>
        * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
        * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
        * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
        * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
        * [`.getIconPath()`](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath) ⇒ <code>Promise&lt; \| string&gt;</code>
        * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
        * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+pack) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise&lt; \| string&gt;</code>
        * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
        * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise&lt;string&gt;</code>
        * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
        * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
        * [`.doGetCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword) ⇒ <code>any</code>
        * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
        * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo) ⇒ <code>[AppInfo](#AppInfo)</code>

<a name="LinuxPackager"></a>

### LinuxPackager ⇐ <code>[PlatformPackager](#PlatformPackager)</code>
**Kind**: class of [<code>electron-builder/out/linuxPackager</code>](#module_electron-builder/out/linuxPackager)  
**Extends**: <code>[PlatformPackager](#PlatformPackager)</code>  
**Properties**

| Name | Type |
| --- | --- |
| executableName| <code>string</code> | 


* [.LinuxPackager](#LinuxPackager) ⇐ <code>[PlatformPackager](#PlatformPackager)</code>
    * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/linuxPackager.LinuxPackager+createTargets)
    * [`.postInitApp(appOutDir)`](#module_electron-builder/out/linuxPackager.LinuxPackager+postInitApp) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise&lt; \| string&gt;</code>
    * [`.dispatchArtifactCreated(file, target, arch, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
    * [`.getElectronDestDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronDestDir) ⇒ <code>string</code>
    * [`.getElectronSrcDir(dist)`](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronSrcDir) ⇒ <code>string</code>
    * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
    * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
    * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
    * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
    * [`.getIconPath()`](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath) ⇒ <code>Promise&lt; \| string&gt;</code>
    * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
    * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+pack) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise&lt; \| string&gt;</code>
    * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
    * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise&lt;string&gt;</code>
    * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
    * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
    * [`.doGetCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword) ⇒ <code>any</code>
    * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
    * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo) ⇒ <code>[AppInfo](#AppInfo)</code>

<a name="module_electron-builder/out/linuxPackager.LinuxPackager+createTargets"></a>

#### `linuxPackager.createTargets(targets, mapper, cleanupTasks)`
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  
**Overrides**: [<code>createTargets</code>](#module_electron-builder/out/platformPackager.PlatformPackager+createTargets)  

| Param | Type |
| --- | --- |
| targets | <code>Array&lt;string&gt;</code> | 
| mapper | <code>callback</code> | 
| cleanupTasks | <code>Array&lt;module:electron-builder/out/linuxPackager.__type&gt;</code> | 

<a name="module_electron-builder/out/linuxPackager.LinuxPackager+postInitApp"></a>

#### `linuxPackager.postInitApp(appOutDir)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  
**Overrides**: [<code>postInitApp</code>](#module_electron-builder/out/platformPackager.PlatformPackager+postInitApp)  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon"></a>

#### `linuxPackager.getDefaultIcon(ext)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  

| Param | Type |
| --- | --- |
| ext | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated"></a>

#### `linuxPackager.dispatchArtifactCreated(file, target, arch, safeArtifactName)`
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| target | <code>[Target](electron-builder-core#Target)</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 
| safeArtifactName | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getElectronDestDir"></a>

#### `linuxPackager.getElectronDestDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getElectronSrcDir"></a>

#### `linuxPackager.getElectronSrcDir(dist)` ⇒ <code>string</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  

| Param | Type |
| --- | --- |
| dist | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern"></a>

#### `linuxPackager.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)` ⇒ <code>string</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[TargetSpecificOptions](electron-builder-core#TargetSpecificOptions)</code> \| <code>undefined</code> \| <code>null</code> | 
| ext | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 
| defaultPattern | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandMacro"></a>

#### `linuxPackager.expandMacro(pattern, arch, extra)` ⇒ <code>string</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  

| Param | Type |
| --- | --- |
| pattern | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>undefined</code> \| <code>null</code> | 
| extra | <code>any</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName"></a>

#### `linuxPackager.generateName(ext, arch, deployment, classifier)` ⇒ <code>string</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  

| Param | Type |
| --- | --- |
| ext | <code>string</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| deployment | <code>boolean</code> | 
| classifier | <code>string</code> \| <code>null</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName2"></a>

#### `linuxPackager.generateName2(ext, classifier, deployment)` ⇒ <code>string</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  

| Param | Type |
| --- | --- |
| ext | <code>string</code> \| <code>null</code> | 
| classifier | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 
| deployment | <code>boolean</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getIconPath"></a>

#### `linuxPackager.getIconPath()` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir"></a>

#### `linuxPackager.getMacOsResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+pack"></a>

#### `linuxPackager.pack(outDir, arch, targets, postAsyncTasks)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 
| postAsyncTasks | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResource"></a>

#### `linuxPackager.getResource(custom, names)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  

| Param | Type |
| --- | --- |
| custom | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 
| names | <code>Array&lt;string&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir"></a>

#### `linuxPackager.getResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getTempFile"></a>

#### `linuxPackager.getTempFile(suffix)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  

| Param | Type |
| --- | --- |
| suffix | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir"></a>

#### `linuxPackager.computeAppOutDir(outDir, arch)` ⇒ <code>string</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword"></a>

#### `linuxPackager.getCscPassword()` ⇒ <code>string</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  
**Access**: protected  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword"></a>

#### `linuxPackager.doGetCscPassword()` ⇒ <code>any</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  
**Access**: protected  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+doPack"></a>

#### `linuxPackager.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| appOutDir | <code>string</code> | 
| platformName | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| platformSpecificBuildOptions | <code>module:electron-builder/out/platformPackager.DC</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat"></a>

#### `linuxPackager.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 
| postAsyncTasks | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo"></a>

#### `linuxPackager.prepareAppInfo(appInfo)` ⇒ <code>[AppInfo](#AppInfo)</code>
**Kind**: instance method of [<code>LinuxPackager</code>](#LinuxPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| appInfo | <code>[AppInfo](#AppInfo)</code> | 

<a name="module_electron-builder/out/macPackager"></a>

## electron-builder/out/macPackager

* [electron-builder/out/macPackager](#module_electron-builder/out/macPackager)
    * [.MacPackager](#MacPackager) ⇐ <code>[PlatformPackager](#PlatformPackager)</code>
        * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/macPackager.MacPackager+createTargets)
        * [`.getElectronDestDir(appOutDir)`](#module_electron-builder/out/macPackager.MacPackager+getElectronDestDir) ⇒ <code>string</code>
        * [`.getElectronSrcDir(dist)`](#module_electron-builder/out/macPackager.MacPackager+getElectronSrcDir) ⇒ <code>string</code>
        * [`.getIconPath()`](#module_electron-builder/out/macPackager.MacPackager+getIconPath) ⇒ <code>Promise&lt; \| string&gt;</code>
        * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/macPackager.MacPackager+pack) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.doFlat(appPath, outFile, identity, keychain)`](#module_electron-builder/out/macPackager.MacPackager+doFlat) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.doSign(opts)`](#module_electron-builder/out/macPackager.MacPackager+doSign) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/macPackager.MacPackager+prepareAppInfo) ⇒ <code>[AppInfo](#AppInfo)</code>
        * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise&lt; \| string&gt;</code>
        * [`.dispatchArtifactCreated(file, target, arch, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
        * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
        * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
        * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
        * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
        * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
        * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise&lt; \| string&gt;</code>
        * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
        * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise&lt;string&gt;</code>
        * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
        * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
        * [`.doGetCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword) ⇒ <code>any</code>
        * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
        * [`.postInitApp(executableFile)`](#module_electron-builder/out/platformPackager.PlatformPackager+postInitApp) ⇒ <code>Promise&lt;any&gt;</code>

<a name="MacPackager"></a>

### MacPackager ⇐ <code>[PlatformPackager](#PlatformPackager)</code>
**Kind**: class of [<code>electron-builder/out/macPackager</code>](#module_electron-builder/out/macPackager)  
**Extends**: <code>[PlatformPackager](#PlatformPackager)</code>  
**Properties**

| Name | Type |
| --- | --- |
| codeSigningInfo| <code>Promise&lt;[CodeSigningInfo](#CodeSigningInfo)&gt;</code> | 


* [.MacPackager](#MacPackager) ⇐ <code>[PlatformPackager](#PlatformPackager)</code>
    * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/macPackager.MacPackager+createTargets)
    * [`.getElectronDestDir(appOutDir)`](#module_electron-builder/out/macPackager.MacPackager+getElectronDestDir) ⇒ <code>string</code>
    * [`.getElectronSrcDir(dist)`](#module_electron-builder/out/macPackager.MacPackager+getElectronSrcDir) ⇒ <code>string</code>
    * [`.getIconPath()`](#module_electron-builder/out/macPackager.MacPackager+getIconPath) ⇒ <code>Promise&lt; \| string&gt;</code>
    * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/macPackager.MacPackager+pack) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.doFlat(appPath, outFile, identity, keychain)`](#module_electron-builder/out/macPackager.MacPackager+doFlat) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.doSign(opts)`](#module_electron-builder/out/macPackager.MacPackager+doSign) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/macPackager.MacPackager+prepareAppInfo) ⇒ <code>[AppInfo](#AppInfo)</code>
    * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise&lt; \| string&gt;</code>
    * [`.dispatchArtifactCreated(file, target, arch, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
    * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
    * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
    * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
    * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
    * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
    * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise&lt; \| string&gt;</code>
    * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
    * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise&lt;string&gt;</code>
    * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
    * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
    * [`.doGetCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword) ⇒ <code>any</code>
    * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
    * [`.postInitApp(executableFile)`](#module_electron-builder/out/platformPackager.PlatformPackager+postInitApp) ⇒ <code>Promise&lt;any&gt;</code>

<a name="module_electron-builder/out/macPackager.MacPackager+createTargets"></a>

#### `macPackager.createTargets(targets, mapper, cleanupTasks)`
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  
**Overrides**: [<code>createTargets</code>](#module_electron-builder/out/platformPackager.PlatformPackager+createTargets)  

| Param | Type |
| --- | --- |
| targets | <code>Array&lt;string&gt;</code> | 
| mapper | <code>callback</code> | 
| cleanupTasks | <code>Array&lt;module:electron-builder/out/macPackager.__type&gt;</code> | 

<a name="module_electron-builder/out/macPackager.MacPackager+getElectronDestDir"></a>

#### `macPackager.getElectronDestDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  
**Overrides**: [<code>getElectronDestDir</code>](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronDestDir)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/macPackager.MacPackager+getElectronSrcDir"></a>

#### `macPackager.getElectronSrcDir(dist)` ⇒ <code>string</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  
**Overrides**: [<code>getElectronSrcDir</code>](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronSrcDir)  

| Param | Type |
| --- | --- |
| dist | <code>string</code> | 

<a name="module_electron-builder/out/macPackager.MacPackager+getIconPath"></a>

#### `macPackager.getIconPath()` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  
**Overrides**: [<code>getIconPath</code>](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath)  
<a name="module_electron-builder/out/macPackager.MacPackager+pack"></a>

#### `macPackager.pack(outDir, arch, targets, postAsyncTasks)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  
**Overrides**: [<code>pack</code>](#module_electron-builder/out/platformPackager.PlatformPackager+pack)  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 
| postAsyncTasks | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder/out/macPackager.MacPackager+doFlat"></a>

#### `macPackager.doFlat(appPath, outFile, identity, keychain)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| appPath | <code>string</code> | 
| outFile | <code>string</code> | 
| identity | <code>string</code> | 
| keychain | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 

<a name="module_electron-builder/out/macPackager.MacPackager+doSign"></a>

#### `macPackager.doSign(opts)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| opts | <code>module:electron-osx-sign.SignOptions</code> | 

<a name="module_electron-builder/out/macPackager.MacPackager+prepareAppInfo"></a>

#### `macPackager.prepareAppInfo(appInfo)` ⇒ <code>[AppInfo](#AppInfo)</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  
**Overrides**: [<code>prepareAppInfo</code>](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo)  
**Access**: protected  

| Param | Type |
| --- | --- |
| appInfo | <code>[AppInfo](#AppInfo)</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon"></a>

#### `macPackager.getDefaultIcon(ext)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  

| Param | Type |
| --- | --- |
| ext | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated"></a>

#### `macPackager.dispatchArtifactCreated(file, target, arch, safeArtifactName)`
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| target | <code>[Target](electron-builder-core#Target)</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 
| safeArtifactName | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern"></a>

#### `macPackager.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)` ⇒ <code>string</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[TargetSpecificOptions](electron-builder-core#TargetSpecificOptions)</code> \| <code>undefined</code> \| <code>null</code> | 
| ext | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 
| defaultPattern | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandMacro"></a>

#### `macPackager.expandMacro(pattern, arch, extra)` ⇒ <code>string</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  

| Param | Type |
| --- | --- |
| pattern | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>undefined</code> \| <code>null</code> | 
| extra | <code>any</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName"></a>

#### `macPackager.generateName(ext, arch, deployment, classifier)` ⇒ <code>string</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  

| Param | Type |
| --- | --- |
| ext | <code>string</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| deployment | <code>boolean</code> | 
| classifier | <code>string</code> \| <code>null</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName2"></a>

#### `macPackager.generateName2(ext, classifier, deployment)` ⇒ <code>string</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  

| Param | Type |
| --- | --- |
| ext | <code>string</code> \| <code>null</code> | 
| classifier | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 
| deployment | <code>boolean</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir"></a>

#### `macPackager.getMacOsResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResource"></a>

#### `macPackager.getResource(custom, names)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  

| Param | Type |
| --- | --- |
| custom | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 
| names | <code>Array&lt;string&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir"></a>

#### `macPackager.getResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getTempFile"></a>

#### `macPackager.getTempFile(suffix)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  

| Param | Type |
| --- | --- |
| suffix | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir"></a>

#### `macPackager.computeAppOutDir(outDir, arch)` ⇒ <code>string</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword"></a>

#### `macPackager.getCscPassword()` ⇒ <code>string</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  
**Access**: protected  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword"></a>

#### `macPackager.doGetCscPassword()` ⇒ <code>any</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  
**Access**: protected  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+doPack"></a>

#### `macPackager.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| appOutDir | <code>string</code> | 
| platformName | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| platformSpecificBuildOptions | <code>module:electron-builder/out/platformPackager.DC</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat"></a>

#### `macPackager.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 
| postAsyncTasks | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+postInitApp"></a>

#### `macPackager.postInitApp(executableFile)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>MacPackager</code>](#MacPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| executableFile | <code>string</code> | 

<a name="module_electron-builder/out/options/linuxOptions"></a>

## electron-builder/out/options/linuxOptions

* [electron-builder/out/options/linuxOptions](#module_electron-builder/out/options/linuxOptions)
    * [`.CommonLinuxOptions`](#CommonLinuxOptions)
    * [`.LinuxTargetSpecificOptions`](#LinuxTargetSpecificOptions) ⇐ <code>[CommonLinuxOptions](#CommonLinuxOptions)</code>

<a name="CommonLinuxOptions"></a>

### `CommonLinuxOptions`
**Kind**: interface of [<code>electron-builder/out/options/linuxOptions</code>](#module_electron-builder/out/options/linuxOptions)  
**Properties**

| Name | Type |
| --- | --- |
| synopsis| <code>string</code> \| <code>null</code> | 
| description| <code>string</code> \| <code>null</code> | 
| category| <code>string</code> \| <code>null</code> | 
| packageCategory| <code>string</code> \| <code>null</code> | 
| desktop| <code>Object&lt;string, any&gt;</code> \| <code>null</code> | 
| vendor| <code>string</code> \| <code>null</code> | 
| maintainer| <code>string</code> \| <code>null</code> | 
| afterInstall| <code>string</code> \| <code>null</code> | 
| afterRemove| <code>string</code> \| <code>null</code> | 

<a name="LinuxTargetSpecificOptions"></a>

### `LinuxTargetSpecificOptions` ⇐ <code>[CommonLinuxOptions](#CommonLinuxOptions)</code>
**Kind**: interface of [<code>electron-builder/out/options/linuxOptions</code>](#module_electron-builder/out/options/linuxOptions)  
**Extends**: <code>[CommonLinuxOptions](#CommonLinuxOptions)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| depends| <code>Array&lt;string&gt;</code> \| <code>null</code> | <a name="LinuxTargetSpecificOptions-depends"></a>Package dependencies. |
| icon| <code>string</code> | <a name="LinuxTargetSpecificOptions-icon"></a> |

<a name="module_electron-builder/out/options/winOptions"></a>

## electron-builder/out/options/winOptions
<a name="CommonNsisOptions"></a>

### `CommonNsisOptions`
**Kind**: interface of [<code>electron-builder/out/options/winOptions</code>](#module_electron-builder/out/options/winOptions)  
**Properties**

| Name | Type |
| --- | --- |
| unicode| <code>boolean</code> | 
| guid| <code>string</code> \| <code>null</code> | 
| warningsAsErrors| <code>boolean</code> | 

<a name="module_electron-builder/out/packager/mac"></a>

## electron-builder/out/packager/mac

* [electron-builder/out/packager/mac](#module_electron-builder/out/packager/mac)
    * [`.createApp(packager, appOutDir, asarIntegrity)`](#module_electron-builder/out/packager/mac.createApp) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.filterCFBundleIdentifier(identifier)`](#module_electron-builder/out/packager/mac.filterCFBundleIdentifier) ⇒ <code>string</code>

<a name="module_electron-builder/out/packager/mac.createApp"></a>

### `electron-builder/out/packager/mac.createApp(packager, appOutDir, asarIntegrity)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: method of [<code>electron-builder/out/packager/mac</code>](#module_electron-builder/out/packager/mac)  

| Param | Type |
| --- | --- |
| packager | <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 
| appOutDir | <code>string</code> | 
| asarIntegrity | <code>module:asar-integrity.AsarIntegrity</code> | 

<a name="module_electron-builder/out/packager/mac.filterCFBundleIdentifier"></a>

### `electron-builder/out/packager/mac.filterCFBundleIdentifier(identifier)` ⇒ <code>string</code>
**Kind**: method of [<code>electron-builder/out/packager/mac</code>](#module_electron-builder/out/packager/mac)  

| Param | Type |
| --- | --- |
| identifier | <code>string</code> | 

<a name="module_electron-builder/out/packager"></a>

## electron-builder/out/packager
<a name="module_electron-builder/out/packager.normalizePlatforms"></a>

### `electron-builder/out/packager.normalizePlatforms(rawPlatforms)` ⇒ <code>Array&lt;[Platform](electron-builder-core#Platform)&gt;</code>
**Kind**: method of [<code>electron-builder/out/packager</code>](#module_electron-builder/out/packager)  

| Param | Type |
| --- | --- |
| rawPlatforms | <code>Array&lt;string \| [Platform](electron-builder-core#Platform)&gt;</code> \| <code>string</code> \| <code>[Platform](electron-builder-core#Platform)</code> \| <code>undefined</code> \| <code>null</code> | 

<a name="module_electron-builder/out/platformPackager"></a>

## electron-builder/out/platformPackager

* [electron-builder/out/platformPackager](#module_electron-builder/out/platformPackager)
    * [.PlatformPackager](#PlatformPackager)
        * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+createTargets)
        * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise&lt; \| string&gt;</code>
        * [`.dispatchArtifactCreated(file, target, arch, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
        * [`.getElectronDestDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronDestDir) ⇒ <code>string</code>
        * [`.getElectronSrcDir(dist)`](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronSrcDir) ⇒ <code>string</code>
        * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
        * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
        * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
        * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
        * [`.getIconPath()`](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath) ⇒ <code>Promise&lt; \| string&gt;</code>
        * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
        * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+pack) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise&lt; \| string&gt;</code>
        * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
        * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise&lt;string&gt;</code>
        * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
        * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
        * [`.doGetCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword) ⇒ <code>any</code>
        * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
        * [`.postInitApp(executableFile)`](#module_electron-builder/out/platformPackager.PlatformPackager+postInitApp) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo) ⇒ <code>[AppInfo](#AppInfo)</code>
    * [`.normalizeExt(ext)`](#module_electron-builder/out/platformPackager.normalizeExt) ⇒ <code>string</code>

<a name="PlatformPackager"></a>

### PlatformPackager
**Kind**: class of [<code>electron-builder/out/platformPackager</code>](#module_electron-builder/out/platformPackager)  
**Properties**

| Name | Type |
| --- | --- |
| packagerOptions| <code>[PackagerOptions](Options#PackagerOptions)</code> | 
| projectDir| <code>string</code> | 
| buildResourcesDir| <code>string</code> | 
| config| <code>[Config](Options#Config)</code> | 
| platformSpecificBuildOptions| <code>module:electron-builder/out/platformPackager.DC</code> | 
| appInfo| <code>[AppInfo](#AppInfo)</code> | 


* [.PlatformPackager](#PlatformPackager)
    * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+createTargets)
    * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise&lt; \| string&gt;</code>
    * [`.dispatchArtifactCreated(file, target, arch, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
    * [`.getElectronDestDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronDestDir) ⇒ <code>string</code>
    * [`.getElectronSrcDir(dist)`](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronSrcDir) ⇒ <code>string</code>
    * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
    * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
    * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
    * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
    * [`.getIconPath()`](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath) ⇒ <code>Promise&lt; \| string&gt;</code>
    * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
    * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+pack) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise&lt; \| string&gt;</code>
    * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
    * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise&lt;string&gt;</code>
    * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
    * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
    * [`.doGetCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword) ⇒ <code>any</code>
    * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
    * [`.postInitApp(executableFile)`](#module_electron-builder/out/platformPackager.PlatformPackager+postInitApp) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo) ⇒ <code>[AppInfo](#AppInfo)</code>

<a name="module_electron-builder/out/platformPackager.PlatformPackager+createTargets"></a>

#### `platformPackager.createTargets(targets, mapper, cleanupTasks)`
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| targets | <code>Array&lt;string&gt;</code> | 
| mapper | <code>callback</code> | 
| cleanupTasks | <code>Array&lt;module:electron-builder/out/platformPackager.__type&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon"></a>

#### `platformPackager.getDefaultIcon(ext)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| ext | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated"></a>

#### `platformPackager.dispatchArtifactCreated(file, target, arch, safeArtifactName)`
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| target | <code>[Target](electron-builder-core#Target)</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 
| safeArtifactName | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getElectronDestDir"></a>

#### `platformPackager.getElectronDestDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getElectronSrcDir"></a>

#### `platformPackager.getElectronSrcDir(dist)` ⇒ <code>string</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| dist | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern"></a>

#### `platformPackager.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)` ⇒ <code>string</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[TargetSpecificOptions](electron-builder-core#TargetSpecificOptions)</code> \| <code>undefined</code> \| <code>null</code> | 
| ext | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 
| defaultPattern | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandMacro"></a>

#### `platformPackager.expandMacro(pattern, arch, extra)` ⇒ <code>string</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| pattern | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>undefined</code> \| <code>null</code> | 
| extra | <code>any</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName"></a>

#### `platformPackager.generateName(ext, arch, deployment, classifier)` ⇒ <code>string</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| ext | <code>string</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| deployment | <code>boolean</code> | 
| classifier | <code>string</code> \| <code>null</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName2"></a>

#### `platformPackager.generateName2(ext, classifier, deployment)` ⇒ <code>string</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| ext | <code>string</code> \| <code>null</code> | 
| classifier | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 
| deployment | <code>boolean</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getIconPath"></a>

#### `platformPackager.getIconPath()` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir"></a>

#### `platformPackager.getMacOsResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+pack"></a>

#### `platformPackager.pack(outDir, arch, targets, postAsyncTasks)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 
| postAsyncTasks | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResource"></a>

#### `platformPackager.getResource(custom, names)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| custom | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 
| names | <code>Array&lt;string&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir"></a>

#### `platformPackager.getResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getTempFile"></a>

#### `platformPackager.getTempFile(suffix)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  

| Param | Type |
| --- | --- |
| suffix | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir"></a>

#### `platformPackager.computeAppOutDir(outDir, arch)` ⇒ <code>string</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword"></a>

#### `platformPackager.getCscPassword()` ⇒ <code>string</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  
**Access**: protected  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword"></a>

#### `platformPackager.doGetCscPassword()` ⇒ <code>any</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  
**Access**: protected  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+doPack"></a>

#### `platformPackager.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| appOutDir | <code>string</code> | 
| platformName | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| platformSpecificBuildOptions | <code>module:electron-builder/out/platformPackager.DC</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat"></a>

#### `platformPackager.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 
| postAsyncTasks | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+postInitApp"></a>

#### `platformPackager.postInitApp(executableFile)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| executableFile | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo"></a>

#### `platformPackager.prepareAppInfo(appInfo)` ⇒ <code>[AppInfo](#AppInfo)</code>
**Kind**: instance method of [<code>PlatformPackager</code>](#PlatformPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| appInfo | <code>[AppInfo](#AppInfo)</code> | 

<a name="module_electron-builder/out/platformPackager.normalizeExt"></a>

### `electron-builder/out/platformPackager.normalizeExt(ext)` ⇒ <code>string</code>
**Kind**: method of [<code>electron-builder/out/platformPackager</code>](#module_electron-builder/out/platformPackager)  

| Param | Type |
| --- | --- |
| ext | <code>string</code> | 

<a name="module_electron-builder/out/publish/PublishManager"></a>

## electron-builder/out/publish/PublishManager

* [electron-builder/out/publish/PublishManager](#module_electron-builder/out/publish/PublishManager)
    * [.PublishManager](#PublishManager) ⇐ <code>[PublishContext](electron-publish#PublishContext)</code>
        * [`.awaitTasks()`](#module_electron-builder/out/publish/PublishManager.PublishManager+awaitTasks) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.cancelTasks()`](#module_electron-builder/out/publish/PublishManager.PublishManager+cancelTasks)
    * [`.computeDownloadUrl(publishConfig, fileName, packager)`](#module_electron-builder/out/publish/PublishManager.computeDownloadUrl) ⇒ <code>string</code>
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

### `electron-builder/out/publish/PublishManager.computeDownloadUrl(publishConfig, fileName, packager)` ⇒ <code>string</code>
**Kind**: method of [<code>electron-builder/out/publish/PublishManager</code>](#module_electron-builder/out/publish/PublishManager)  

| Param | Type |
| --- | --- |
| publishConfig | <code>[PublishConfiguration](Publishing-Artifacts#PublishConfiguration)</code> | 
| fileName | <code>string</code> \| <code>null</code> | 
| packager | <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 

<a name="module_electron-builder/out/publish/PublishManager.createPublisher"></a>

### `electron-builder/out/publish/PublishManager.createPublisher(context, version, publishConfig, options)` ⇒ <code>null</code> \| <code>[Publisher](electron-publish#Publisher)</code>
**Kind**: method of [<code>electron-builder/out/publish/PublishManager</code>](#module_electron-builder/out/publish/PublishManager)  

| Param | Type |
| --- | --- |
| context | <code>[PublishContext](electron-publish#PublishContext)</code> | 
| version | <code>string</code> | 
| publishConfig | <code>[PublishConfiguration](Publishing-Artifacts#PublishConfiguration)</code> | 
| options | <code>[PublishOptions](electron-publish#PublishOptions)</code> | 

<a name="module_electron-builder/out/publish/PublishManager.getPublishConfigs"></a>

### `electron-builder/out/publish/PublishManager.getPublishConfigs(packager, targetSpecificOptions, arch)` ⇒ <code>Promise&lt; \| Array&gt;</code>
**Kind**: method of [<code>electron-builder/out/publish/PublishManager</code>](#module_electron-builder/out/publish/PublishManager)  

| Param | Type |
| --- | --- |
| packager | <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 
| targetSpecificOptions | <code>[PlatformSpecificBuildOptions](electron-builder-core#PlatformSpecificBuildOptions)</code> \| <code>null</code> \| <code>undefined</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 

<a name="module_electron-builder/out/publish/PublishManager.getPublishConfigsForUpdateInfo"></a>

### `electron-builder/out/publish/PublishManager.getPublishConfigsForUpdateInfo(packager, publishConfigs, arch)` ⇒ <code>Promise&lt; \| Array&gt;</code>
**Kind**: method of [<code>electron-builder/out/publish/PublishManager</code>](#module_electron-builder/out/publish/PublishManager)  

| Param | Type |
| --- | --- |
| packager | <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 
| publishConfigs | <code>Array&lt;[PublishConfiguration](Publishing-Artifacts#PublishConfiguration)&gt;</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 

<a name="module_electron-builder/out/targets/appImage"></a>

## electron-builder/out/targets/appImage

* [electron-builder/out/targets/appImage](#module_electron-builder/out/targets/appImage)
    * [.AppImageTarget](#AppImageTarget) ⇐ <code>[Target](electron-builder-core#Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/appImage.AppImageTarget+build) ⇒ <code>Promise&lt;any&gt;</code>

<a name="AppImageTarget"></a>

### AppImageTarget ⇐ <code>[Target](electron-builder-core#Target)</code>
**Kind**: class of [<code>electron-builder/out/targets/appImage</code>](#module_electron-builder/out/targets/appImage)  
**Extends**: <code>[Target](electron-builder-core#Target)</code>  
**Properties**

| Name | Type |
| --- | --- |
| options = <code>Object.assign({}, this.packager.platformSpecificBuildOptions, (&lt;any&gt;this.packager.config)[this.name])</code>| <code>[LinuxBuildOptions](Options#LinuxBuildOptions)</code> | 

<a name="module_electron-builder/out/targets/appImage.AppImageTarget+build"></a>

#### `appImageTarget.build(appOutDir, arch)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>AppImageTarget</code>](#AppImageTarget)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/targets/appx"></a>

## electron-builder/out/targets/appx

* [electron-builder/out/targets/appx](#module_electron-builder/out/targets/appx)
    * [.AppXTarget](#AppXTarget) ⇐ <code>[Target](electron-builder-core#Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/appx.AppXTarget+build) ⇒ <code>Promise&lt;any&gt;</code>

<a name="AppXTarget"></a>

### AppXTarget ⇐ <code>[Target](electron-builder-core#Target)</code>
**Kind**: class of [<code>electron-builder/out/targets/appx</code>](#module_electron-builder/out/targets/appx)  
**Extends**: <code>[Target](electron-builder-core#Target)</code>  
**Properties**

| Name | Type |
| --- | --- |
| options = <code>Object.assign({}, this.packager.platformSpecificBuildOptions, this.packager.config.appx)</code>| <code>[AppXOptions](Options#AppXOptions)</code> | 

<a name="module_electron-builder/out/targets/appx.AppXTarget+build"></a>

#### `appXTarget.build(appOutDir, arch)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>AppXTarget</code>](#AppXTarget)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/targets/ArchiveTarget"></a>

## electron-builder/out/targets/ArchiveTarget

* [electron-builder/out/targets/ArchiveTarget](#module_electron-builder/out/targets/ArchiveTarget)
    * [.ArchiveTarget](#ArchiveTarget) ⇐ <code>[Target](electron-builder-core#Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/ArchiveTarget.ArchiveTarget+build) ⇒ <code>Promise&lt;any&gt;</code>

<a name="ArchiveTarget"></a>

### ArchiveTarget ⇐ <code>[Target](electron-builder-core#Target)</code>
**Kind**: class of [<code>electron-builder/out/targets/ArchiveTarget</code>](#module_electron-builder/out/targets/ArchiveTarget)  
**Extends**: <code>[Target](electron-builder-core#Target)</code>  
**Properties**

| Name | Type |
| --- | --- |
| options = <code>(&lt;any&gt;this.packager.config)[this.name]</code>| <code>any</code> | 

<a name="module_electron-builder/out/targets/ArchiveTarget.ArchiveTarget+build"></a>

#### `archiveTarget.build(appOutDir, arch)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>ArchiveTarget</code>](#ArchiveTarget)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/targets/dmg"></a>

## electron-builder/out/targets/dmg

* [electron-builder/out/targets/dmg](#module_electron-builder/out/targets/dmg)
    * [.DmgTarget](#DmgTarget) ⇐ <code>[Target](electron-builder-core#Target)</code>
        * [`.build(appPath, arch)`](#module_electron-builder/out/targets/dmg.DmgTarget+build) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.computeDmgOptions()`](#module_electron-builder/out/targets/dmg.DmgTarget+computeDmgOptions) ⇒ <code>Promise&lt;[DmgOptions](Options#DmgOptions)&gt;</code>
        * [`.computeVolumeName(custom)`](#module_electron-builder/out/targets/dmg.DmgTarget+computeVolumeName) ⇒ <code>string</code>
    * [`.attachAndExecute(dmgPath, readWrite, task)`](#module_electron-builder/out/targets/dmg.attachAndExecute) ⇒ <code>Promise&lt;any&gt;</code>

<a name="DmgTarget"></a>

### DmgTarget ⇐ <code>[Target](electron-builder-core#Target)</code>
**Kind**: class of [<code>electron-builder/out/targets/dmg</code>](#module_electron-builder/out/targets/dmg)  
**Extends**: <code>[Target](electron-builder-core#Target)</code>  
**Properties**

| Name | Type |
| --- | --- |
| options = <code>this.packager.config.dmg</code>| <code>undefined</code> \| <code>null</code> \| <code>[DmgOptions](Options#DmgOptions)</code> | 


* [.DmgTarget](#DmgTarget) ⇐ <code>[Target](electron-builder-core#Target)</code>
    * [`.build(appPath, arch)`](#module_electron-builder/out/targets/dmg.DmgTarget+build) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.computeDmgOptions()`](#module_electron-builder/out/targets/dmg.DmgTarget+computeDmgOptions) ⇒ <code>Promise&lt;[DmgOptions](Options#DmgOptions)&gt;</code>
    * [`.computeVolumeName(custom)`](#module_electron-builder/out/targets/dmg.DmgTarget+computeVolumeName) ⇒ <code>string</code>

<a name="module_electron-builder/out/targets/dmg.DmgTarget+build"></a>

#### `dmgTarget.build(appPath, arch)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of [<code>DmgTarget</code>](#DmgTarget)  

| Param | Type |
| --- | --- |
| appPath | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/targets/dmg.DmgTarget+computeDmgOptions"></a>

#### `dmgTarget.computeDmgOptions()` ⇒ <code>Promise&lt;[DmgOptions](Options#DmgOptions)&gt;</code>
**Kind**: instance method of [<code>DmgTarget</code>](#DmgTarget)  
<a name="module_electron-builder/out/targets/dmg.DmgTarget+computeVolumeName"></a>

#### `dmgTarget.computeVolumeName(custom)` ⇒ <code>string</code>
**Kind**: instance method of [<code>DmgTarget</code>](#DmgTarget)  

| Param | Type |
| --- | --- |
| custom | <code>string</code> \| <code>null</code> | 

<a name="module_electron-builder/out/targets/dmg.attachAndExecute"></a>

### `electron-builder/out/targets/dmg.attachAndExecute(dmgPath, readWrite, task)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: method of [<code>electron-builder/out/targets/dmg</code>](#module_electron-builder/out/targets/dmg)  

| Param | Type |
| --- | --- |
| dmgPath | <code>string</code> | 
| readWrite | <code>boolean</code> | 
| task | <code>callback</code> | 

<a name="module_electron-builder/out/targets/fpm"></a>

## electron-builder/out/targets/fpm

* [electron-builder/out/targets/fpm](#module_electron-builder/out/targets/fpm)
    * [.FpmTarget](#FpmTarget) ⇐ <code>[Target](electron-builder-core#Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/fpm.FpmTarget+build) ⇒ <code>Promise&lt;any&gt;</code>

<a name="FpmTarget"></a>

### FpmTarget ⇐ <code>[Target](electron-builder-core#Target)</code>
**Kind**: class of [<code>electron-builder/out/targets/fpm</code>](#module_electron-builder/out/targets/fpm)  
**Extends**: <code>[Target](electron-builder-core#Target)</code>  
**Properties**

| Name | Type |
| --- | --- |
| options = <code>Object.assign({}, this.packager.platformSpecificBuildOptions, (&lt;any&gt;this.packager.config)[this.name])</code>| <code>[LinuxTargetSpecificOptions](#LinuxTargetSpecificOptions)</code> | 

<a name="module_electron-builder/out/targets/fpm.FpmTarget+build"></a>

#### `fpmTarget.build(appOutDir, arch)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>FpmTarget</code>](#FpmTarget)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/targets/LinuxTargetHelper"></a>

## electron-builder/out/targets/LinuxTargetHelper

* [electron-builder/out/targets/LinuxTargetHelper](#module_electron-builder/out/targets/LinuxTargetHelper)
    * [.LinuxTargetHelper](#LinuxTargetHelper)
        * [`.computeDesktopEntry(targetSpecificOptions, exec, destination, extra)`](#module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper+computeDesktopEntry) ⇒ <code>Promise&lt;string&gt;</code>
        * [`.getDescription(options)`](#module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper+getDescription) ⇒ <code>string</code>

<a name="LinuxTargetHelper"></a>

### LinuxTargetHelper
**Kind**: class of [<code>electron-builder/out/targets/LinuxTargetHelper</code>](#module_electron-builder/out/targets/LinuxTargetHelper)  
**Properties**

| Name | Type |
| --- | --- |
| icons| <code>Promise&lt;Array&lt;Array&lt;string&gt;&gt;&gt;</code> | 
| maxIconPath| <code>string</code> \| <code>null</code> | 


* [.LinuxTargetHelper](#LinuxTargetHelper)
    * [`.computeDesktopEntry(targetSpecificOptions, exec, destination, extra)`](#module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper+computeDesktopEntry) ⇒ <code>Promise&lt;string&gt;</code>
    * [`.getDescription(options)`](#module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper+getDescription) ⇒ <code>string</code>

<a name="module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper+computeDesktopEntry"></a>

#### `linuxTargetHelper.computeDesktopEntry(targetSpecificOptions, exec, destination, extra)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: instance method of [<code>LinuxTargetHelper</code>](#LinuxTargetHelper)  

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[LinuxTargetSpecificOptions](#LinuxTargetSpecificOptions)</code> | 
| exec | <code>string</code> | 
| destination | <code>string</code> \| <code>null</code> | 
| extra | <code>Object&lt;string, any&gt;</code> | 

<a name="module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper+getDescription"></a>

#### `linuxTargetHelper.getDescription(options)` ⇒ <code>string</code>
**Kind**: instance method of [<code>LinuxTargetHelper</code>](#LinuxTargetHelper)  

| Param | Type |
| --- | --- |
| options | <code>[LinuxBuildOptions](Options#LinuxBuildOptions)</code> | 

<a name="module_electron-builder/out/targets/nsis"></a>

## electron-builder/out/targets/nsis

* [electron-builder/out/targets/nsis](#module_electron-builder/out/targets/nsis)
    * [.AppPackageHelper](#AppPackageHelper)
        * [`.finishBuild()`](#module_electron-builder/out/targets/nsis.AppPackageHelper+finishBuild) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.packArch(arch, target)`](#module_electron-builder/out/targets/nsis.AppPackageHelper+packArch) ⇒ <code>Promise&lt;string&gt;</code>
    * [.NsisTarget](#NsisTarget) ⇐ <code>[Target](electron-builder-core#Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/nsis.NsisTarget+build) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.finishBuild()`](#module_electron-builder/out/targets/nsis.NsisTarget+finishBuild) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.configureDefines(oneClick, defines)`](#module_electron-builder/out/targets/nsis.NsisTarget+configureDefines) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.generateGitHubInstallerName()`](#module_electron-builder/out/targets/nsis.NsisTarget+generateGitHubInstallerName) ⇒ <code>string</code>

<a name="AppPackageHelper"></a>

### AppPackageHelper
**Kind**: class of [<code>electron-builder/out/targets/nsis</code>](#module_electron-builder/out/targets/nsis)  

* [.AppPackageHelper](#AppPackageHelper)
    * [`.finishBuild()`](#module_electron-builder/out/targets/nsis.AppPackageHelper+finishBuild) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.packArch(arch, target)`](#module_electron-builder/out/targets/nsis.AppPackageHelper+packArch) ⇒ <code>Promise&lt;string&gt;</code>

<a name="module_electron-builder/out/targets/nsis.AppPackageHelper+finishBuild"></a>

#### `appPackageHelper.finishBuild()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>AppPackageHelper</code>](#AppPackageHelper)  
<a name="module_electron-builder/out/targets/nsis.AppPackageHelper+packArch"></a>

#### `appPackageHelper.packArch(arch, target)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: instance method of [<code>AppPackageHelper</code>](#AppPackageHelper)  

| Param | Type |
| --- | --- |
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| target | <code>[NsisTarget](#NsisTarget)</code> | 

<a name="NsisTarget"></a>

### NsisTarget ⇐ <code>[Target](electron-builder-core#Target)</code>
**Kind**: class of [<code>electron-builder/out/targets/nsis</code>](#module_electron-builder/out/targets/nsis)  
**Extends**: <code>[Target](electron-builder-core#Target)</code>  
**Properties**

| Name | Type |
| --- | --- |
| options| <code>[NsisOptions](Options#NsisOptions)</code> | 


* [.NsisTarget](#NsisTarget) ⇐ <code>[Target](electron-builder-core#Target)</code>
    * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/nsis.NsisTarget+build) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.finishBuild()`](#module_electron-builder/out/targets/nsis.NsisTarget+finishBuild) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.configureDefines(oneClick, defines)`](#module_electron-builder/out/targets/nsis.NsisTarget+configureDefines) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.generateGitHubInstallerName()`](#module_electron-builder/out/targets/nsis.NsisTarget+generateGitHubInstallerName) ⇒ <code>string</code>

<a name="module_electron-builder/out/targets/nsis.NsisTarget+build"></a>

#### `nsisTarget.build(appOutDir, arch)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of [<code>NsisTarget</code>](#NsisTarget)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/targets/nsis.NsisTarget+finishBuild"></a>

#### `nsisTarget.finishBuild()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>NsisTarget</code>](#NsisTarget)  
<a name="module_electron-builder/out/targets/nsis.NsisTarget+configureDefines"></a>

#### `nsisTarget.configureDefines(oneClick, defines)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of [<code>NsisTarget</code>](#NsisTarget)  
**Access**: protected  

| Param | Type |
| --- | --- |
| oneClick | <code>boolean</code> | 
| defines | <code>any</code> | 

<a name="module_electron-builder/out/targets/nsis.NsisTarget+generateGitHubInstallerName"></a>

#### `nsisTarget.generateGitHubInstallerName()` ⇒ <code>string</code>
**Kind**: instance method of [<code>NsisTarget</code>](#NsisTarget)  
**Access**: protected  
<a name="module_electron-builder/out/targets/pkg"></a>

## electron-builder/out/targets/pkg

* [electron-builder/out/targets/pkg](#module_electron-builder/out/targets/pkg)
    * [.PkgTarget](#PkgTarget) ⇐ <code>[Target](electron-builder-core#Target)</code>
        * [`.build(appPath, arch)`](#module_electron-builder/out/targets/pkg.PkgTarget+build) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.prepareProductBuildArgs(identity, keychain)`](#module_electron-builder/out/targets/pkg.prepareProductBuildArgs) ⇒ <code>Array&lt;string&gt;</code>

<a name="PkgTarget"></a>

### PkgTarget ⇐ <code>[Target](electron-builder-core#Target)</code>
**Kind**: class of [<code>electron-builder/out/targets/pkg</code>](#module_electron-builder/out/targets/pkg)  
**Extends**: <code>[Target](electron-builder-core#Target)</code>  
**Properties**

| Name | Type |
| --- | --- |
| options = <code>this.packager.config.pkg || Object.create(null)</code>| <code>[PkgOptions](Options#PkgOptions)</code> | 

<a name="module_electron-builder/out/targets/pkg.PkgTarget+build"></a>

#### `pkgTarget.build(appPath, arch)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>PkgTarget</code>](#PkgTarget)  

| Param | Type |
| --- | --- |
| appPath | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/targets/pkg.prepareProductBuildArgs"></a>

### `electron-builder/out/targets/pkg.prepareProductBuildArgs(identity, keychain)` ⇒ <code>Array&lt;string&gt;</code>
**Kind**: method of [<code>electron-builder/out/targets/pkg</code>](#module_electron-builder/out/targets/pkg)  

| Param | Type |
| --- | --- |
| identity | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 
| keychain | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 

<a name="module_electron-builder/out/targets/snap"></a>

## electron-builder/out/targets/snap

* [electron-builder/out/targets/snap](#module_electron-builder/out/targets/snap)
    * [.SnapTarget](#SnapTarget) ⇐ <code>[Target](electron-builder-core#Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/snap.SnapTarget+build) ⇒ <code>Promise&lt;any&gt;</code>

<a name="SnapTarget"></a>

### SnapTarget ⇐ <code>[Target](electron-builder-core#Target)</code>
**Kind**: class of [<code>electron-builder/out/targets/snap</code>](#module_electron-builder/out/targets/snap)  
**Extends**: <code>[Target](electron-builder-core#Target)</code>  
**Properties**

| Name | Type |
| --- | --- |
| options = <code>Object.assign({}, this.packager.platformSpecificBuildOptions, (&lt;any&gt;this.packager.config)[this.name])</code>| <code>[SnapOptions](Options#SnapOptions)</code> | 

<a name="module_electron-builder/out/targets/snap.SnapTarget+build"></a>

#### `snapTarget.build(appOutDir, arch)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>SnapTarget</code>](#SnapTarget)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/targets/targetFactory"></a>

## electron-builder/out/targets/targetFactory

* [electron-builder/out/targets/targetFactory](#module_electron-builder/out/targets/targetFactory)
    * [.NoOpTarget](#NoOpTarget) ⇐ <code>[Target](electron-builder-core#Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/targetFactory.NoOpTarget+build) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.computeArchToTargetNamesMap(raw, options, platform)`](#module_electron-builder/out/targets/targetFactory.computeArchToTargetNamesMap) ⇒ <code>Map&lt;[Arch](electron-builder-core#Arch) \| Array&lt;string&gt;&gt;</code>
    * [`.createCommonTarget(target, outDir, packager)`](#module_electron-builder/out/targets/targetFactory.createCommonTarget) ⇒ <code>[Target](electron-builder-core#Target)</code>
    * [`.createTargets(nameToTarget, rawList, outDir, packager, cleanupTasks)`](#module_electron-builder/out/targets/targetFactory.createTargets) ⇒ <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code>

<a name="NoOpTarget"></a>

### NoOpTarget ⇐ <code>[Target](electron-builder-core#Target)</code>
**Kind**: class of [<code>electron-builder/out/targets/targetFactory</code>](#module_electron-builder/out/targets/targetFactory)  
**Extends**: <code>[Target](electron-builder-core#Target)</code>  
**Properties**

| Name | Type |
| --- | --- |
| options| <code>null</code> | 

<a name="module_electron-builder/out/targets/targetFactory.NoOpTarget+build"></a>

#### `noOpTarget.build(appOutDir, arch)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>NoOpTarget</code>](#NoOpTarget)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/targets/targetFactory.computeArchToTargetNamesMap"></a>

### `electron-builder/out/targets/targetFactory.computeArchToTargetNamesMap(raw, options, platform)` ⇒ <code>Map&lt;[Arch](electron-builder-core#Arch) \| Array&lt;string&gt;&gt;</code>
**Kind**: method of [<code>electron-builder/out/targets/targetFactory</code>](#module_electron-builder/out/targets/targetFactory)  

| Param | Type |
| --- | --- |
| raw | <code>Map&lt;[Arch](electron-builder-core#Arch) \| Array&lt;string&gt;&gt;</code> | 
| options | <code>[PlatformSpecificBuildOptions](electron-builder-core#PlatformSpecificBuildOptions)</code> | 
| platform | <code>[Platform](electron-builder-core#Platform)</code> | 

<a name="module_electron-builder/out/targets/targetFactory.createCommonTarget"></a>

### `electron-builder/out/targets/targetFactory.createCommonTarget(target, outDir, packager)` ⇒ <code>[Target](electron-builder-core#Target)</code>
**Kind**: method of [<code>electron-builder/out/targets/targetFactory</code>](#module_electron-builder/out/targets/targetFactory)  

| Param | Type |
| --- | --- |
| target | <code>string</code> | 
| outDir | <code>string</code> | 
| packager | <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 

<a name="module_electron-builder/out/targets/targetFactory.createTargets"></a>

### `electron-builder/out/targets/targetFactory.createTargets(nameToTarget, rawList, outDir, packager, cleanupTasks)` ⇒ <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code>
**Kind**: method of [<code>electron-builder/out/targets/targetFactory</code>](#module_electron-builder/out/targets/targetFactory)  

| Param | Type |
| --- | --- |
| nameToTarget | <code>Map&lt;String \| [Target](electron-builder-core#Target)&gt;</code> | 
| rawList | <code>Array&lt;string&gt;</code> | 
| outDir | <code>string</code> | 
| packager | <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 
| cleanupTasks | <code>Array&lt;module:electron-builder/out/targets/targetFactory.__type&gt;</code> | 

<a name="module_electron-builder/out/targets/WebInstallerTarget"></a>

## electron-builder/out/targets/WebInstallerTarget

* [electron-builder/out/targets/WebInstallerTarget](#module_electron-builder/out/targets/WebInstallerTarget)
    * [.WebInstallerTarget](#WebInstallerTarget) ⇐ <code>[NsisTarget](#NsisTarget)</code>
        * [`.configureDefines(oneClick, defines)`](#module_electron-builder/out/targets/WebInstallerTarget.WebInstallerTarget+configureDefines) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.generateGitHubInstallerName()`](#module_electron-builder/out/targets/WebInstallerTarget.WebInstallerTarget+generateGitHubInstallerName) ⇒ <code>string</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/nsis.NsisTarget+build) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.finishBuild()`](#module_electron-builder/out/targets/nsis.NsisTarget+finishBuild) ⇒ <code>Promise&lt;any&gt;</code>

<a name="WebInstallerTarget"></a>

### WebInstallerTarget ⇐ <code>[NsisTarget](#NsisTarget)</code>
**Kind**: class of [<code>electron-builder/out/targets/WebInstallerTarget</code>](#module_electron-builder/out/targets/WebInstallerTarget)  
**Extends**: <code>[NsisTarget](#NsisTarget)</code>  

* [.WebInstallerTarget](#WebInstallerTarget) ⇐ <code>[NsisTarget](#NsisTarget)</code>
    * [`.configureDefines(oneClick, defines)`](#module_electron-builder/out/targets/WebInstallerTarget.WebInstallerTarget+configureDefines) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.generateGitHubInstallerName()`](#module_electron-builder/out/targets/WebInstallerTarget.WebInstallerTarget+generateGitHubInstallerName) ⇒ <code>string</code>
    * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/nsis.NsisTarget+build) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.finishBuild()`](#module_electron-builder/out/targets/nsis.NsisTarget+finishBuild) ⇒ <code>Promise&lt;any&gt;</code>

<a name="module_electron-builder/out/targets/WebInstallerTarget.WebInstallerTarget+configureDefines"></a>

#### `webInstallerTarget.configureDefines(oneClick, defines)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of [<code>WebInstallerTarget</code>](#WebInstallerTarget)  
**Overrides**: [<code>configureDefines</code>](#module_electron-builder/out/targets/nsis.NsisTarget+configureDefines)  
**Access**: protected  

| Param | Type |
| --- | --- |
| oneClick | <code>boolean</code> | 
| defines | <code>any</code> | 

<a name="module_electron-builder/out/targets/WebInstallerTarget.WebInstallerTarget+generateGitHubInstallerName"></a>

#### `webInstallerTarget.generateGitHubInstallerName()` ⇒ <code>string</code>
**Kind**: instance method of [<code>WebInstallerTarget</code>](#WebInstallerTarget)  
**Overrides**: [<code>generateGitHubInstallerName</code>](#module_electron-builder/out/targets/nsis.NsisTarget+generateGitHubInstallerName)  
**Access**: protected  
<a name="module_electron-builder/out/targets/nsis.NsisTarget+build"></a>

#### `webInstallerTarget.build(appOutDir, arch)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of [<code>WebInstallerTarget</code>](#WebInstallerTarget)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/targets/nsis.NsisTarget+finishBuild"></a>

#### `webInstallerTarget.finishBuild()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>WebInstallerTarget</code>](#WebInstallerTarget)  
<a name="module_electron-builder/out/util/readPackageJson"></a>

## electron-builder/out/util/readPackageJson

* [electron-builder/out/util/readPackageJson](#module_electron-builder/out/util/readPackageJson)
    * [`.doLoadConfig(configFile, projectDir)`](#module_electron-builder/out/util/readPackageJson.doLoadConfig) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getElectronVersion(config, projectDir, projectMetadata)`](#module_electron-builder/out/util/readPackageJson.getElectronVersion) ⇒ <code>Promise&lt;string&gt;</code>
    * [`.loadConfig(projectDir)`](#module_electron-builder/out/util/readPackageJson.loadConfig) ⇒ <code>Promise&lt; \| [Config](Options#Config)&gt;</code>
    * [`.readPackageJson(file)`](#module_electron-builder/out/util/readPackageJson.readPackageJson) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.validateConfig(config)`](#module_electron-builder/out/util/readPackageJson.validateConfig) ⇒ <code>Promise&lt;void&gt;</code>

<a name="module_electron-builder/out/util/readPackageJson.doLoadConfig"></a>

### `electron-builder/out/util/readPackageJson.doLoadConfig(configFile, projectDir)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: method of [<code>electron-builder/out/util/readPackageJson</code>](#module_electron-builder/out/util/readPackageJson)  

| Param | Type |
| --- | --- |
| configFile | <code>string</code> | 
| projectDir | <code>string</code> | 

<a name="module_electron-builder/out/util/readPackageJson.getElectronVersion"></a>

### `electron-builder/out/util/readPackageJson.getElectronVersion(config, projectDir, projectMetadata)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: method of [<code>electron-builder/out/util/readPackageJson</code>](#module_electron-builder/out/util/readPackageJson)  

| Param | Type |
| --- | --- |
| config | <code>[Config](Options#Config)</code> \| <code>null</code> \| <code>undefined</code> | 
| projectDir | <code>string</code> | 
| projectMetadata | <code>any</code> \| <code>null</code> | 

<a name="module_electron-builder/out/util/readPackageJson.loadConfig"></a>

### `electron-builder/out/util/readPackageJson.loadConfig(projectDir)` ⇒ <code>Promise&lt; \| [Config](Options#Config)&gt;</code>
**Kind**: method of [<code>electron-builder/out/util/readPackageJson</code>](#module_electron-builder/out/util/readPackageJson)  

| Param | Type |
| --- | --- |
| projectDir | <code>string</code> | 

<a name="module_electron-builder/out/util/readPackageJson.readPackageJson"></a>

### `electron-builder/out/util/readPackageJson.readPackageJson(file)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: method of [<code>electron-builder/out/util/readPackageJson</code>](#module_electron-builder/out/util/readPackageJson)  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 

<a name="module_electron-builder/out/util/readPackageJson.validateConfig"></a>

### `electron-builder/out/util/readPackageJson.validateConfig(config)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: method of [<code>electron-builder/out/util/readPackageJson</code>](#module_electron-builder/out/util/readPackageJson)  

| Param | Type |
| --- | --- |
| config | <code>[Config](Options#Config)</code> | 

<a name="module_electron-builder/out/windowsCodeSign"></a>

## electron-builder/out/windowsCodeSign

* [electron-builder/out/windowsCodeSign](#module_electron-builder/out/windowsCodeSign)
    * [`.FileCodeSigningInfo`](#FileCodeSigningInfo)
    * [`.SignOptions`](#SignOptions)
    * [`.getSignVendorPath()`](#module_electron-builder/out/windowsCodeSign.getSignVendorPath) ⇒ <code>Promise&lt;string&gt;</code>
    * [`.getToolPath()`](#module_electron-builder/out/windowsCodeSign.getToolPath) ⇒ <code>Promise&lt;string&gt;</code>
    * [`.sign(options)`](#module_electron-builder/out/windowsCodeSign.sign) ⇒ <code>Promise&lt;void&gt;</code>

<a name="FileCodeSigningInfo"></a>

### `FileCodeSigningInfo`
**Kind**: interface of [<code>electron-builder/out/windowsCodeSign</code>](#module_electron-builder/out/windowsCodeSign)  
**Properties**

| Name | Type |
| --- | --- |
| file| <code>string</code> \| <code>null</code> | 
| password| <code>string</code> \| <code>null</code> | 
| subjectName| <code>string</code> \| <code>null</code> | 
| certificateSha1| <code>string</code> \| <code>null</code> | 

<a name="SignOptions"></a>

### `SignOptions`
**Kind**: interface of [<code>electron-builder/out/windowsCodeSign</code>](#module_electron-builder/out/windowsCodeSign)  
**Properties**

| Name | Type |
| --- | --- |
| **path**| <code>string</code> | 
| cert| <code>string</code> \| <code>null</code> | 
| name| <code>string</code> \| <code>null</code> | 
| password| <code>string</code> \| <code>null</code> | 
| site| <code>string</code> \| <code>null</code> | 
| **options**| <code>[WinBuildOptions](Options#WinBuildOptions)</code> | 

<a name="module_electron-builder/out/windowsCodeSign.getSignVendorPath"></a>

### `electron-builder/out/windowsCodeSign.getSignVendorPath()` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: method of [<code>electron-builder/out/windowsCodeSign</code>](#module_electron-builder/out/windowsCodeSign)  
<a name="module_electron-builder/out/windowsCodeSign.getToolPath"></a>

### `electron-builder/out/windowsCodeSign.getToolPath()` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: method of [<code>electron-builder/out/windowsCodeSign</code>](#module_electron-builder/out/windowsCodeSign)  
<a name="module_electron-builder/out/windowsCodeSign.sign"></a>

### `electron-builder/out/windowsCodeSign.sign(options)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: method of [<code>electron-builder/out/windowsCodeSign</code>](#module_electron-builder/out/windowsCodeSign)  

| Param | Type |
| --- | --- |
| options | <code>[SignOptions](#SignOptions)</code> | 

<a name="module_electron-builder/out/winPackager"></a>

## electron-builder/out/winPackager

* [electron-builder/out/winPackager](#module_electron-builder/out/winPackager)
    * [.WinPackager](#WinPackager) ⇐ <code>[PlatformPackager](#PlatformPackager)</code>
        * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/winPackager.WinPackager+createTargets)
        * [`.getIconPath()`](#module_electron-builder/out/winPackager.WinPackager+getIconPath) ⇒ <code>Promise&lt;string&gt;</code>
        * [`.sign(file, logMessagePrefix)`](#module_electron-builder/out/winPackager.WinPackager+sign) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.signAndEditResources(file)`](#module_electron-builder/out/winPackager.WinPackager+signAndEditResources) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.doGetCscPassword()`](#module_electron-builder/out/winPackager.WinPackager+doGetCscPassword) ⇒ <code>string</code>
        * [`.doSign(options)`](#module_electron-builder/out/winPackager.WinPackager+doSign) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.postInitApp(appOutDir)`](#module_electron-builder/out/winPackager.WinPackager+postInitApp) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise&lt; \| string&gt;</code>
        * [`.dispatchArtifactCreated(file, target, arch, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
        * [`.getElectronDestDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronDestDir) ⇒ <code>string</code>
        * [`.getElectronSrcDir(dist)`](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronSrcDir) ⇒ <code>string</code>
        * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
        * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
        * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
        * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
        * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
        * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+pack) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise&lt; \| string&gt;</code>
        * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
        * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise&lt;string&gt;</code>
        * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
        * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
        * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
        * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo) ⇒ <code>[AppInfo](#AppInfo)</code>

<a name="WinPackager"></a>

### WinPackager ⇐ <code>[PlatformPackager](#PlatformPackager)</code>
**Kind**: class of [<code>electron-builder/out/winPackager</code>](#module_electron-builder/out/winPackager)  
**Extends**: <code>[PlatformPackager](#PlatformPackager)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **[cscInfo=new Lazy&lt;FileCodeSigningInfo | null&gt;(() =&gt; {
    const platformSpecificBuildOptions = this.platformSpecificBuildOptions
    const subjectName = platformSpecificBuildOptions.certificateSubjectName
    if (subjectName != null) {
      return BluebirdPromise.resolve({subjectName})
    }

    const certificateSha1 = platformSpecificBuildOptions.certificateSha1
    if (certificateSha1 != null) {
      return BluebirdPromise.resolve({certificateSha1})
    }

    const certificateFile = platformSpecificBuildOptions.certificateFile
    if (certificateFile != null) {
      const certificatePassword = this.getCscPassword()
      return BluebirdPromise.resolve({
        file: certificateFile,
        password: certificatePassword == null ? null : certificatePassword.trim(),
      })
    }
    else {
      const cscLink = process.env.WIN_CSC_LINK || this.packagerOptions.cscLink
      if (cscLink != null) {
        return downloadCertificate(cscLink, this.info.tempDirManager, this.projectDir)
          .then(path =&gt; {
            return {
              file: path,
              password: this.getCscPassword(),
            }
          })
      }
      else {
        return BluebirdPromise.resolve(null)
      }
    }
  })]**| <code>[Lazy](electron-builder-util#Lazy)&lt; \| [FileCodeSigningInfo](#FileCodeSigningInfo)&gt;</code> | 
| **[computedPublisherName=new Lazy&lt;Array&lt;string&gt; | null&gt;(async () =&gt; {
    let publisherName = (&lt;WinBuildOptions&gt;this.platformSpecificBuildOptions).publisherName
    if (publisherName === null) {
      return null
    }

    const cscInfo = await this.cscInfo.value
    if (cscInfo == null) {
      return null
    }

    if (publisherName == null &amp;&amp; cscInfo.file != null) {
      try {
        // https://github.com/digitalbazaar/forge/issues/338#issuecomment-164831585
        const p12Asn1 = forge.asn1.fromDer(await readFile(cscInfo.file, &quot;binary&quot;), false)
        const p12 = (&lt;any&gt;forge).pkcs12.pkcs12FromAsn1(p12Asn1, false, cscInfo.password)
        const bagType = (&lt;any&gt;forge.pki.oids).certBag
        publisherName = p12.getBags({bagType: bagType})[bagType][0].cert.subject.getField(&quot;CN&quot;).value
      }
      catch (e) {
        throw new Error(&#x60;Cannot extract publisher name from code signing certificate, please file issue. As workaround, set win.publisherName: ${e.stack || e}&#x60;)
      }
    }

    return publisherName == null ? null : asArray(publisherName)
  })]**| <code>[Lazy](electron-builder-util#Lazy)&lt; \| Array&gt;</code> | 


* [.WinPackager](#WinPackager) ⇐ <code>[PlatformPackager](#PlatformPackager)</code>
    * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/winPackager.WinPackager+createTargets)
    * [`.getIconPath()`](#module_electron-builder/out/winPackager.WinPackager+getIconPath) ⇒ <code>Promise&lt;string&gt;</code>
    * [`.sign(file, logMessagePrefix)`](#module_electron-builder/out/winPackager.WinPackager+sign) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.signAndEditResources(file)`](#module_electron-builder/out/winPackager.WinPackager+signAndEditResources) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.doGetCscPassword()`](#module_electron-builder/out/winPackager.WinPackager+doGetCscPassword) ⇒ <code>string</code>
    * [`.doSign(options)`](#module_electron-builder/out/winPackager.WinPackager+doSign) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.postInitApp(appOutDir)`](#module_electron-builder/out/winPackager.WinPackager+postInitApp) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise&lt; \| string&gt;</code>
    * [`.dispatchArtifactCreated(file, target, arch, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
    * [`.getElectronDestDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronDestDir) ⇒ <code>string</code>
    * [`.getElectronSrcDir(dist)`](#module_electron-builder/out/platformPackager.PlatformPackager+getElectronSrcDir) ⇒ <code>string</code>
    * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
    * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
    * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
    * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
    * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
    * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+pack) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise&lt; \| string&gt;</code>
    * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
    * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise&lt;string&gt;</code>
    * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
    * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
    * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
    * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo) ⇒ <code>[AppInfo](#AppInfo)</code>

<a name="module_electron-builder/out/winPackager.WinPackager+createTargets"></a>

#### `winPackager.createTargets(targets, mapper, cleanupTasks)`
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  
**Overrides**: [<code>createTargets</code>](#module_electron-builder/out/platformPackager.PlatformPackager+createTargets)  

| Param | Type |
| --- | --- |
| targets | <code>Array&lt;string&gt;</code> | 
| mapper | <code>callback</code> | 
| cleanupTasks | <code>Array&lt;module:electron-builder/out/winPackager.__type&gt;</code> | 

<a name="module_electron-builder/out/winPackager.WinPackager+getIconPath"></a>

#### `winPackager.getIconPath()` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  
**Overrides**: [<code>getIconPath</code>](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath)  
<a name="module_electron-builder/out/winPackager.WinPackager+sign"></a>

#### `winPackager.sign(file, logMessagePrefix)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| logMessagePrefix | <code>string</code> | 

<a name="module_electron-builder/out/winPackager.WinPackager+signAndEditResources"></a>

#### `winPackager.signAndEditResources(file)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 

<a name="module_electron-builder/out/winPackager.WinPackager+doGetCscPassword"></a>

#### `winPackager.doGetCscPassword()` ⇒ <code>string</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  
**Overrides**: [<code>doGetCscPassword</code>](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword)  
**Access**: protected  
<a name="module_electron-builder/out/winPackager.WinPackager+doSign"></a>

#### `winPackager.doSign(options)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| options | <code>[SignOptions](#SignOptions)</code> | 

<a name="module_electron-builder/out/winPackager.WinPackager+postInitApp"></a>

#### `winPackager.postInitApp(appOutDir)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  
**Overrides**: [<code>postInitApp</code>](#module_electron-builder/out/platformPackager.PlatformPackager+postInitApp)  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon"></a>

#### `winPackager.getDefaultIcon(ext)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  

| Param | Type |
| --- | --- |
| ext | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated"></a>

#### `winPackager.dispatchArtifactCreated(file, target, arch, safeArtifactName)`
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| target | <code>[Target](electron-builder-core#Target)</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 
| safeArtifactName | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getElectronDestDir"></a>

#### `winPackager.getElectronDestDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getElectronSrcDir"></a>

#### `winPackager.getElectronSrcDir(dist)` ⇒ <code>string</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  

| Param | Type |
| --- | --- |
| dist | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern"></a>

#### `winPackager.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)` ⇒ <code>string</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[TargetSpecificOptions](electron-builder-core#TargetSpecificOptions)</code> \| <code>undefined</code> \| <code>null</code> | 
| ext | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 
| defaultPattern | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandMacro"></a>

#### `winPackager.expandMacro(pattern, arch, extra)` ⇒ <code>string</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  

| Param | Type |
| --- | --- |
| pattern | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>undefined</code> \| <code>null</code> | 
| extra | <code>any</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName"></a>

#### `winPackager.generateName(ext, arch, deployment, classifier)` ⇒ <code>string</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  

| Param | Type |
| --- | --- |
| ext | <code>string</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| deployment | <code>boolean</code> | 
| classifier | <code>string</code> \| <code>null</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName2"></a>

#### `winPackager.generateName2(ext, classifier, deployment)` ⇒ <code>string</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  

| Param | Type |
| --- | --- |
| ext | <code>string</code> \| <code>null</code> | 
| classifier | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 
| deployment | <code>boolean</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir"></a>

#### `winPackager.getMacOsResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+pack"></a>

#### `winPackager.pack(outDir, arch, targets, postAsyncTasks)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 
| postAsyncTasks | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResource"></a>

#### `winPackager.getResource(custom, names)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  

| Param | Type |
| --- | --- |
| custom | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 
| names | <code>Array&lt;string&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir"></a>

#### `winPackager.getResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getTempFile"></a>

#### `winPackager.getTempFile(suffix)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  

| Param | Type |
| --- | --- |
| suffix | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir"></a>

#### `winPackager.computeAppOutDir(outDir, arch)` ⇒ <code>string</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword"></a>

#### `winPackager.getCscPassword()` ⇒ <code>string</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  
**Access**: protected  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+doPack"></a>

#### `winPackager.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| appOutDir | <code>string</code> | 
| platformName | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| platformSpecificBuildOptions | <code>module:electron-builder/out/platformPackager.DC</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat"></a>

#### `winPackager.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 
| postAsyncTasks | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo"></a>

#### `winPackager.prepareAppInfo(appInfo)` ⇒ <code>[AppInfo](#AppInfo)</code>
**Kind**: instance method of [<code>WinPackager</code>](#WinPackager)  
**Access**: protected  

| Param | Type |
| --- | --- |
| appInfo | <code>[AppInfo](#AppInfo)</code> | 


<!-- end of generated block -->