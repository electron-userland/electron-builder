<a name="module_electron-builder-core"></a>

## electron-builder-core

* [electron-builder-core](#module_electron-builder-core)
    * [`.AsarOptions`](#AsarOptions)
    * [`.AuthorMetadata`](#AuthorMetadata)
    * [`.BeforeBuildContext`](#BeforeBuildContext)
    * [`.FileAssociation`](#FileAssociation)
    * [`.FilePattern`](#FilePattern)
    * [`.MetadataDirectories`](#MetadataDirectories)
    * [`.PlatformSpecificBuildOptions`](#PlatformSpecificBuildOptions) ⇐ <code>[TargetSpecificOptions](#TargetSpecificOptions)</code>
    * [`.Protocol`](#Protocol)
    * [`.RepositoryInfo`](#RepositoryInfo)
    * [`.SourceRepositoryInfo`](#SourceRepositoryInfo)
    * [`.TargetConfig`](#TargetConfig)
    * [`.TargetSpecificOptions`](#TargetSpecificOptions)
    * [.Platform](#Platform)
        * [`.createTarget(type, archs)`](#module_electron-builder-core.Platform+createTarget) ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;[Arch](#Arch) \| Array&lt;string&gt;&gt;&gt;</code>
        * [`.current()`](#module_electron-builder-core.Platform+current) ⇒ <code>[Platform](#Platform)</code>
        * [`.fromString(name)`](#module_electron-builder-core.Platform+fromString) ⇒ <code>[Platform](#Platform)</code>
        * [`.toString()`](#module_electron-builder-core.Platform+toString) ⇒ <code>string</code>
    * [.Target](#Target)
        * [`.build(appOutDir, arch)`](#module_electron-builder-core.Target+build) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.Arch`](#Arch) : <code>enum</code>
    * [`.archFromString(name)`](#module_electron-builder-core.archFromString) ⇒ <code>[Arch](#Arch)</code>
    * [`.getArchSuffix(arch)`](#module_electron-builder-core.getArchSuffix) ⇒ <code>string</code>
    * [`.toLinuxArchString(arch)`](#module_electron-builder-core.toLinuxArchString) ⇒ <code>"armv7l"</code> \| <code>"i386"</code> \| <code>"amd64"</code>

<a name="AsarOptions"></a>

### `AsarOptions`
**Kind**: interface of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type |
| --- | --- |
| smartUnpack| <code>boolean</code> | 
| ordering| <code>string</code> \| <code>null</code> | 

<a name="AuthorMetadata"></a>

### `AuthorMetadata`
**Kind**: interface of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type |
| --- | --- |
| **name**| <code>string</code> | 
| email| <code>string</code> | 

<a name="BeforeBuildContext"></a>

### `BeforeBuildContext`
**Kind**: interface of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type |
| --- | --- |
| **appDir**| <code>string</code> | 
| **electronVersion**| <code>string</code> | 
| **platform**| <code>[Platform](#Platform)</code> | 
| **arch**| <code>string</code> | 

<a name="FileAssociation"></a>

### `FileAssociation`
File associations.

macOS (corresponds to [CFBundleDocumentTypes](https://developer.apple.com/library/content/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-101685)) and NSIS only.

On Windows works only if [nsis.perMachine](https://github.com/electron-userland/electron-builder/wiki/Options#NsisOptions-perMachine) is set to `true`.

**Kind**: interface of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| **ext**| <code>string</code> \| <code>Array&lt;string&gt;</code> | <a name="FileAssociation-ext"></a>The extension (minus the leading period). e.g. `png`. |
| name| <code>string</code> \| <code>null</code> | <a name="FileAssociation-name"></a>The name. e.g. `PNG`. Defaults to `ext`. |
| description| <code>string</code> \| <code>null</code> | <a name="FileAssociation-description"></a>*windows-only.* The description. |
| icon| <code>string</code> \| <code>null</code> | <a name="FileAssociation-icon"></a>The path to icon (`.icns` for MacOS and `.ico` for Windows), relative to `build` (build resources directory). Defaults to `${firstExt}.icns`/`${firstExt}.ico` (if several extensions specified, first is used) or to application icon. |
| role = <code>&quot;Editor&quot;</code>| <code>string</code> | <a name="FileAssociation-role"></a>*macOS-only* The app’s role with respect to the type. The value can be `Editor`, `Viewer`, `Shell`, or `None`. Corresponds to `CFBundleTypeRole`. |
| isPackage| <code>boolean</code> | <a name="FileAssociation-isPackage"></a>*macOS-only* Whether the document is distributed as a bundle. If set to true, the bundle directory is treated as a file. Corresponds to `LSTypeIsPackage`. |

<a name="FilePattern"></a>

### `FilePattern`
**Kind**: interface of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type |
| --- | --- |
| from| <code>string</code> | 
| to| <code>string</code> | 
| filter| <code>Array&lt;string&gt;</code> \| <code>string</code> | 

<a name="MetadataDirectories"></a>

### `MetadataDirectories`
`directories`

**Kind**: interface of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| buildResources = <code>&quot;build&quot;</code>| <code>string</code> \| <code>null</code> | <a name="MetadataDirectories-buildResources"></a>The path to build resources. |
| output = <code>&quot;dist&quot;</code>| <code>string</code> \| <code>null</code> | <a name="MetadataDirectories-output"></a>The output directory. |
| app| <code>string</code> \| <code>null</code> | <a name="MetadataDirectories-app"></a>The application directory (containing the application package.json), defaults to `app`, `www` or working directory. |

<a name="PlatformSpecificBuildOptions"></a>

### `PlatformSpecificBuildOptions` ⇐ <code>[TargetSpecificOptions](#TargetSpecificOptions)</code>
**Kind**: interface of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Extends**: <code>[TargetSpecificOptions](#TargetSpecificOptions)</code>  
**Properties**

| Name | Type |
| --- | --- |
| files| <code>Array&lt;string&gt;</code> \| <code>string</code> \| <code>null</code> | 
| extraFiles| <code>Array&lt;string \| [FilePattern](#FilePattern)&gt;</code> \| <code>[FilePattern](#FilePattern)</code> \| <code>string</code> \| <code>null</code> | 
| extraResources| <code>Array&lt;string \| [FilePattern](#FilePattern)&gt;</code> \| <code>[FilePattern](#FilePattern)</code> \| <code>string</code> \| <code>null</code> | 
| asarUnpack| <code>Array&lt;string&gt;</code> \| <code>string</code> \| <code>null</code> | 
| asar| <code>[AsarOptions](#AsarOptions)</code> \| <code>boolean</code> \| <code>null</code> | 
| target| <code>Array&lt;string \| [TargetConfig](#TargetConfig)&gt;</code> \| <code>string</code> \| <code>[TargetConfig](#TargetConfig)</code> \| <code>null</code> | 
| icon| <code>string</code> \| <code>null</code> | 
| fileAssociations| <code>Array&lt;[FileAssociation](#FileAssociation)&gt;</code> \| <code>[FileAssociation](#FileAssociation)</code> | 
| forceCodeSigning| <code>boolean</code> | 

<a name="Protocol"></a>

### `Protocol`
URL Protocol Schemes. Protocols to associate the app with. macOS only.

Please note — on macOS [you need to register an `open-url` event handler](http://electron.atom.io/docs/api/app/#event-open-url-macos).

**Kind**: interface of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| **name**| <code>string</code> | <a name="Protocol-name"></a>The name. e.g. `IRC server URL`. |
| role = <code>Editor</code>| <code>"Editor"</code> \| <code>"Viewer"</code> \| <code>"Shell"</code> \| <code>"None"</code> | <a name="Protocol-role"></a>*macOS-only* The app’s role with respect to the type. |
| **schemes**| <code>Array&lt;string&gt;</code> | <a name="Protocol-schemes"></a>The schemes. e.g. `["irc", "ircs"]`. |

<a name="RepositoryInfo"></a>

### `RepositoryInfo`
**Kind**: interface of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type |
| --- | --- |
| **url**| <code>string</code> | 

<a name="SourceRepositoryInfo"></a>

### `SourceRepositoryInfo`
**Kind**: interface of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type |
| --- | --- |
| **type**| <code>string</code> | 
| **domain**| <code>string</code> | 
| **user**| <code>string</code> | 
| **project**| <code>string</code> | 

<a name="TargetConfig"></a>

### `TargetConfig`
**Kind**: interface of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| **target**| <code>string</code> | <a name="TargetConfig-target"></a>The target name. e.g. `snap`. |
| arch| <code>Array&lt;"x64" \| "ia32" \| "armv7l"&gt;</code> \| <code>string</code> | <a name="TargetConfig-arch"></a>The arch or list of archs. |

<a name="TargetSpecificOptions"></a>

### `TargetSpecificOptions`
**Kind**: interface of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| artifactName| <code>string</code> \| <code>null</code> | <a name="TargetSpecificOptions-artifactName"></a>The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern). |
| publish| <code>null</code> \| <code>string</code> \| <code>[GithubOptions](Publishing-Artifacts#GithubOptions)</code> \| <code>[S3Options](Publishing-Artifacts#S3Options)</code> \| <code>[GenericServerOptions](Publishing-Artifacts#GenericServerOptions)</code> \| <code>[BintrayOptions](Publishing-Artifacts#BintrayOptions)</code> \| <code>Array</code> | <a name="TargetSpecificOptions-publish"></a> |

<a name="Platform"></a>

### Platform
**Kind**: class of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type |
| --- | --- |
| MAC = <code>new Platform(&quot;mac&quot;, &quot;mac&quot;, &quot;darwin&quot;)</code>| <code>[Platform](#Platform)</code> | 
| LINUX = <code>new Platform(&quot;linux&quot;, &quot;linux&quot;, &quot;linux&quot;)</code>| <code>[Platform](#Platform)</code> | 
| WINDOWS = <code>new Platform(&quot;windows&quot;, &quot;win&quot;, &quot;win32&quot;)</code>| <code>[Platform](#Platform)</code> | 
| OSX = <code>Platform.MAC</code>| <code>[Platform](#Platform)</code> | 


* [.Platform](#Platform)
    * [`.createTarget(type, archs)`](#module_electron-builder-core.Platform+createTarget) ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;[Arch](#Arch) \| Array&lt;string&gt;&gt;&gt;</code>
    * [`.current()`](#module_electron-builder-core.Platform+current) ⇒ <code>[Platform](#Platform)</code>
    * [`.fromString(name)`](#module_electron-builder-core.Platform+fromString) ⇒ <code>[Platform](#Platform)</code>
    * [`.toString()`](#module_electron-builder-core.Platform+toString) ⇒ <code>string</code>

<a name="module_electron-builder-core.Platform+createTarget"></a>

#### `platform.createTarget(type, archs)` ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;[Arch](#Arch) \| Array&lt;string&gt;&gt;&gt;</code>
**Kind**: instance method of [<code>Platform</code>](#Platform)  

| Param | Type |
| --- | --- |
| type | <code>string</code> \| <code>Array&lt;string&gt;</code> \| <code>null</code> | 
| archs | <code>Array&lt;[Arch](#Arch)&gt;</code> | 

<a name="module_electron-builder-core.Platform+current"></a>

#### `platform.current()` ⇒ <code>[Platform](#Platform)</code>
**Kind**: instance method of [<code>Platform</code>](#Platform)  
<a name="module_electron-builder-core.Platform+fromString"></a>

#### `platform.fromString(name)` ⇒ <code>[Platform](#Platform)</code>
**Kind**: instance method of [<code>Platform</code>](#Platform)  

| Param | Type |
| --- | --- |
| name | <code>string</code> | 

<a name="module_electron-builder-core.Platform+toString"></a>

#### `platform.toString()` ⇒ <code>string</code>
**Kind**: instance method of [<code>Platform</code>](#Platform)  
<a name="Target"></a>

### Target
**Kind**: class of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type |
| --- | --- |
| outDir| <code>string</code> | 
| options| <code>[TargetSpecificOptions](#TargetSpecificOptions)</code> \| <code>null</code> \| <code>undefined</code> | 


* [.Target](#Target)
    * [`.build(appOutDir, arch)`](#module_electron-builder-core.Target+build) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise&lt;any&gt;</code>

<a name="module_electron-builder-core.Target+build"></a>

#### `target.build(appOutDir, arch)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>Target</code>](#Target)  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](#Arch)</code> | 

<a name="module_electron-builder-core.Target+finishBuild"></a>

#### `target.finishBuild()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>Target</code>](#Target)  
<a name="Arch"></a>

### `electron-builder-core.Arch` : <code>enum</code>
**Kind**: enum of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name |
| --- |
| **ia32**| 
| **x64**| 
| **armv7l**| 

<a name="module_electron-builder-core.archFromString"></a>

### `electron-builder-core.archFromString(name)` ⇒ <code>[Arch](#Arch)</code>
**Kind**: method of [<code>electron-builder-core</code>](#module_electron-builder-core)  

| Param | Type |
| --- | --- |
| name | <code>string</code> | 

<a name="module_electron-builder-core.getArchSuffix"></a>

### `electron-builder-core.getArchSuffix(arch)` ⇒ <code>string</code>
**Kind**: method of [<code>electron-builder-core</code>](#module_electron-builder-core)  

| Param | Type |
| --- | --- |
| arch | <code>[Arch](#Arch)</code> | 

<a name="module_electron-builder-core.toLinuxArchString"></a>

### `electron-builder-core.toLinuxArchString(arch)` ⇒ <code>"armv7l"</code> \| <code>"i386"</code> \| <code>"amd64"</code>
**Kind**: method of [<code>electron-builder-core</code>](#module_electron-builder-core)  

| Param | Type |
| --- | --- |
| arch | <code>[Arch](#Arch)</code> | 

