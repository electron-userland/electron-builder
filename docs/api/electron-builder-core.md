<a name="module_electron-builder-core"></a>

## electron-builder-core

* [electron-builder-core](#module_electron-builder-core)
    * [`.BeforeBuildContext`](#BeforeBuildContext)
    * [`.SourceRepositoryInfo`](#SourceRepositoryInfo)
    * [`.TargetConfig`](#TargetConfig)
    * [`.TargetSpecificOptions`](#TargetSpecificOptions)
    * [.Platform](#Platform)
        * [`.createTarget(type, archs)`](#module_electron-builder-core.Platform+createTarget) ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;"undefined" \| "undefined" \| "undefined" \| Array&lt;String&gt;&gt;&gt;</code>
        * [`.current()`](#module_electron-builder-core.Platform+current) ⇒ <code>[Platform](#Platform)</code>
        * [`.fromString(name)`](#module_electron-builder-core.Platform+fromString) ⇒ <code>[Platform](#Platform)</code>
        * [`.toString()`](#module_electron-builder-core.Platform+toString) ⇒ <code>String</code>
    * [.Target](#Target)
        * [`.build(appOutDir, arch)`](#module_electron-builder-core.Target+build) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.Arch`](#Arch) : <code>enum</code>
    * [`.archFromString(name)`](#module_electron-builder-core.archFromString) ⇒ <code>"undefined"</code> \| <code>"undefined"</code> \| <code>"undefined"</code>
    * [`.getArchSuffix(arch)`](#module_electron-builder-core.getArchSuffix) ⇒ <code>String</code>
    * [`.toLinuxArchString(arch)`](#module_electron-builder-core.toLinuxArchString) ⇒ <code>"undefined"</code> \| <code>"undefined"</code> \| <code>"undefined"</code>

<a name="BeforeBuildContext"></a>

### `BeforeBuildContext`
**Kind**: interface of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type |
| --- | --- |
| **appDir**| <code>String</code> | 
| **electronVersion**| <code>String</code> | 
| **platform**| <code>[Platform](#Platform)</code> | 
| **arch**| <code>String</code> | 

<a name="SourceRepositoryInfo"></a>

### `SourceRepositoryInfo`
**Kind**: interface of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type |
| --- | --- |
| type| <code>String</code> | 
| domain| <code>String</code> | 
| **user**| <code>String</code> | 
| **project**| <code>String</code> | 

<a name="TargetConfig"></a>

### `TargetConfig`
**Kind**: interface of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| **target**| <code>String</code> | <a name="TargetConfig-target"></a>The target name. e.g. `snap`. |
| arch| <code>Array&lt;"undefined" \| "undefined" \| "undefined"&gt;</code> \| <code>String</code> | <a name="TargetConfig-arch"></a>The arch or list of archs. |

<a name="TargetSpecificOptions"></a>

### `TargetSpecificOptions`
**Kind**: interface of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| artifactName| <code>String</code> \| <code>null</code> | <a name="TargetSpecificOptions-artifactName"></a>The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern). |
| publish| <code>null</code> \| <code>String</code> \| <code>[GithubOptions](Publishing-Artifacts#GithubOptions)</code> \| <code>[S3Options](Publishing-Artifacts#S3Options)</code> \| <code>[GenericServerOptions](Publishing-Artifacts#GenericServerOptions)</code> \| <code>[BintrayOptions](Publishing-Artifacts#BintrayOptions)</code> \| <code>Array</code> | <a name="TargetSpecificOptions-publish"></a> |

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
    * [`.createTarget(type, archs)`](#module_electron-builder-core.Platform+createTarget) ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;"undefined" \| "undefined" \| "undefined" \| Array&lt;String&gt;&gt;&gt;</code>
    * [`.current()`](#module_electron-builder-core.Platform+current) ⇒ <code>[Platform](#Platform)</code>
    * [`.fromString(name)`](#module_electron-builder-core.Platform+fromString) ⇒ <code>[Platform](#Platform)</code>
    * [`.toString()`](#module_electron-builder-core.Platform+toString) ⇒ <code>String</code>

<a name="module_electron-builder-core.Platform+createTarget"></a>

#### `platform.createTarget(type, archs)` ⇒ <code>Map&lt;[Platform](#Platform) \| Map&lt;"undefined" \| "undefined" \| "undefined" \| Array&lt;String&gt;&gt;&gt;</code>
**Kind**: instance method of [<code>Platform</code>](#Platform)  

| Param | Type |
| --- | --- |
| type | <code>String</code> \| <code>Array&lt;String&gt;</code> \| <code>null</code> | 
| archs | <code>Array&lt;"undefined" \| "undefined" \| "undefined"&gt;</code> | 

<a name="module_electron-builder-core.Platform+current"></a>

#### `platform.current()` ⇒ <code>[Platform](#Platform)</code>
**Kind**: instance method of [<code>Platform</code>](#Platform)  
<a name="module_electron-builder-core.Platform+fromString"></a>

#### `platform.fromString(name)` ⇒ <code>[Platform](#Platform)</code>
**Kind**: instance method of [<code>Platform</code>](#Platform)  

| Param | Type |
| --- | --- |
| name | <code>String</code> | 

<a name="module_electron-builder-core.Platform+toString"></a>

#### `platform.toString()` ⇒ <code>String</code>
**Kind**: instance method of [<code>Platform</code>](#Platform)  
<a name="Target"></a>

### Target
**Kind**: class of [<code>electron-builder-core</code>](#module_electron-builder-core)  
**Properties**

| Name | Type |
| --- | --- |
| outDir| <code>String</code> | 
| options| <code>[TargetSpecificOptions](#TargetSpecificOptions)</code> \| <code>null</code> \| <code>undefined</code> | 


* [.Target](#Target)
    * [`.build(appOutDir, arch)`](#module_electron-builder-core.Target+build) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise&lt;any&gt;</code>

<a name="module_electron-builder-core.Target+build"></a>

#### `target.build(appOutDir, arch)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>Target</code>](#Target)  

| Param | Type |
| --- | --- |
| appOutDir | <code>String</code> | 
| arch | <code>"undefined"</code> \| <code>"undefined"</code> \| <code>"undefined"</code> | 

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

### `electron-builder-core.archFromString(name)` ⇒ <code>"undefined"</code> \| <code>"undefined"</code> \| <code>"undefined"</code>
**Kind**: method of [<code>electron-builder-core</code>](#module_electron-builder-core)  

| Param | Type |
| --- | --- |
| name | <code>String</code> | 

<a name="module_electron-builder-core.getArchSuffix"></a>

### `electron-builder-core.getArchSuffix(arch)` ⇒ <code>String</code>
**Kind**: method of [<code>electron-builder-core</code>](#module_electron-builder-core)  

| Param | Type |
| --- | --- |
| arch | <code>"undefined"</code> \| <code>"undefined"</code> \| <code>"undefined"</code> | 

<a name="module_electron-builder-core.toLinuxArchString"></a>

### `electron-builder-core.toLinuxArchString(arch)` ⇒ <code>"undefined"</code> \| <code>"undefined"</code> \| <code>"undefined"</code>
**Kind**: method of [<code>electron-builder-core</code>](#module_electron-builder-core)  

| Param | Type |
| --- | --- |
| arch | <code>"undefined"</code> \| <code>"undefined"</code> \| <code>"undefined"</code> | 

