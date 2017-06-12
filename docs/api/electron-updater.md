Developer API only. See [[Auto Update]] for user documentation.

<!-- do not edit. start of generated block -->
## Modules

<dl>
<dt><a href="#module_electron-updater">electron-updater</a></dt>
<dd></dd>
<dt><a href="#module_electron-updater/out/BintrayProvider">electron-updater/out/BintrayProvider</a></dt>
<dd></dd>
<dt><a href="#module_electron-updater/out/electronHttpExecutor">electron-updater/out/electronHttpExecutor</a></dt>
<dd></dd>
<dt><a href="#module_electron-updater/out/GenericProvider">electron-updater/out/GenericProvider</a></dt>
<dd></dd>
<dt><a href="#module_electron-updater/out/GitHubProvider">electron-updater/out/GitHubProvider</a></dt>
<dd></dd>
<dt><a href="#module_electron-updater/out/MacUpdater">electron-updater/out/MacUpdater</a></dt>
<dd></dd>
<dt><a href="#module_electron-updater/out/NsisUpdater">electron-updater/out/NsisUpdater</a></dt>
<dd></dd>
<dt><a href="#module_electron-updater/out/PrivateGitHubProvider">electron-updater/out/PrivateGitHubProvider</a></dt>
<dd></dd>
</dl>

<a name="module_electron-updater"></a>

## electron-updater

* [electron-updater](#module_electron-updater)
    * [`.FileInfo`](#FileInfo)
    * [`.Logger`](#Logger)
        * [`.error(message)`](#module_electron-updater.Logger+error)
        * [`.info(message)`](#module_electron-updater.Logger+info)
        * [`.warn(message)`](#module_electron-updater.Logger+warn)
    * [`.UpdateCheckResult`](#UpdateCheckResult)
    * [.Provider](#Provider)
        * [`.getLatestVersion()`](#module_electron-updater.Provider+getLatestVersion) ⇒ <code>Promise&lt;module:electron-updater.T&gt;</code>
        * [`.setRequestHeaders(value)`](#module_electron-updater.Provider+setRequestHeaders)
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater.Provider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>
        * [`.validateUpdateInfo(info)`](#module_electron-updater.Provider+validateUpdateInfo)
    * [`.autoUpdater`](#module_electron-updater.autoUpdater) : <code>[AppUpdater](Auto-Update#AppUpdater)</code>
    * [`.formatUrl(url)`](#module_electron-updater.formatUrl) ⇒ <code>String</code>
    * [`.getChannelFilename(channel)`](#module_electron-updater.getChannelFilename) ⇒ <code>String</code>
    * [`.getCurrentPlatform()`](#module_electron-updater.getCurrentPlatform) ⇒ <code>any</code>
    * [`.getCustomChannelName(channel)`](#module_electron-updater.getCustomChannelName) ⇒ <code>String</code>
    * [`.getDefaultChannelName()`](#module_electron-updater.getDefaultChannelName) ⇒ <code>String</code>
    * [`.isUseOldMacProvider()`](#module_electron-updater.isUseOldMacProvider) ⇒ <code>Boolean</code>

<a name="FileInfo"></a>

### `FileInfo`
**Kind**: interface of [<code>electron-updater</code>](Auto-Update#module_electron-updater)  
**Properties**

| Name | Type |
| --- | --- |
| **name**| <code>String</code> | 
| **url**| <code>String</code> | 
| sha2| <code>String</code> | 
| sha512| <code>String</code> | 
| headers| <code>Object</code> | 

<a name="Logger"></a>

### `Logger`
**Kind**: interface of [<code>electron-updater</code>](Auto-Update#module_electron-updater)  

* [`.Logger`](#Logger)
    * [`.error(message)`](#module_electron-updater.Logger+error)
    * [`.info(message)`](#module_electron-updater.Logger+info)
    * [`.warn(message)`](#module_electron-updater.Logger+warn)

<a name="module_electron-updater.Logger+error"></a>

#### `logger.error(message)`
**Kind**: instance method of [<code>Logger</code>](#Logger)  

| Param | Type |
| --- | --- |
| message | <code>any</code> | 

<a name="module_electron-updater.Logger+info"></a>

#### `logger.info(message)`
**Kind**: instance method of [<code>Logger</code>](#Logger)  

| Param | Type |
| --- | --- |
| message | <code>any</code> | 

<a name="module_electron-updater.Logger+warn"></a>

#### `logger.warn(message)`
**Kind**: instance method of [<code>Logger</code>](#Logger)  

| Param | Type |
| --- | --- |
| message | <code>any</code> | 

<a name="UpdateCheckResult"></a>

### `UpdateCheckResult`
**Kind**: interface of [<code>electron-updater</code>](Auto-Update#module_electron-updater)  
**Properties**

| Name | Type |
| --- | --- |
| **versionInfo**| <code>[VersionInfo](Publishing-Artifacts#VersionInfo)</code> | 
| fileInfo| <code>[FileInfo](#FileInfo)</code> | 
| downloadPromise| <code>Promise&lt;any&gt;</code> \| <code>null</code> | 
| cancellationToken| <code>[CancellationToken](electron-builder-http#CancellationToken)</code> | 

<a name="Provider"></a>

### Provider
**Kind**: class of [<code>electron-updater</code>](Auto-Update#module_electron-updater)  

* [.Provider](#Provider)
    * [`.getLatestVersion()`](#module_electron-updater.Provider+getLatestVersion) ⇒ <code>Promise&lt;module:electron-updater.T&gt;</code>
    * [`.setRequestHeaders(value)`](#module_electron-updater.Provider+setRequestHeaders)
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater.Provider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>
    * [`.validateUpdateInfo(info)`](#module_electron-updater.Provider+validateUpdateInfo)

<a name="module_electron-updater.Provider+getLatestVersion"></a>

#### `provider.getLatestVersion()` ⇒ <code>Promise&lt;module:electron-updater.T&gt;</code>
**Kind**: instance method of [<code>Provider</code>](#Provider)  
<a name="module_electron-updater.Provider+setRequestHeaders"></a>

#### `provider.setRequestHeaders(value)`
**Kind**: instance method of [<code>Provider</code>](#Provider)  

| Param | Type |
| --- | --- |
| value | <code>[RequestHeaders](electron-builder-http#RequestHeaders)</code> \| <code>null</code> | 

<a name="module_electron-updater.Provider+getUpdateFile"></a>

#### `provider.getUpdateFile(versionInfo)` ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>
**Kind**: instance method of [<code>Provider</code>](#Provider)  

| Param | Type |
| --- | --- |
| versionInfo | <code>module:electron-updater.T</code> | 

<a name="module_electron-updater.Provider+validateUpdateInfo"></a>

#### `provider.validateUpdateInfo(info)`
**Kind**: instance method of [<code>Provider</code>](#Provider)  

| Param | Type |
| --- | --- |
| info | <code>[UpdateInfo](Publishing-Artifacts#UpdateInfo)</code> | 

<a name="module_electron-updater.autoUpdater"></a>

### `electron-updater.autoUpdater` : <code>[AppUpdater](Auto-Update#AppUpdater)</code>
**Kind**: constant of [<code>electron-updater</code>](Auto-Update#module_electron-updater)  
<a name="module_electron-updater.formatUrl"></a>

### `electron-updater.formatUrl(url)` ⇒ <code>String</code>
**Kind**: method of [<code>electron-updater</code>](Auto-Update#module_electron-updater)  

| Param | Type |
| --- | --- |
| url | <code>module:url.Url</code> | 

<a name="module_electron-updater.getChannelFilename"></a>

### `electron-updater.getChannelFilename(channel)` ⇒ <code>String</code>
**Kind**: method of [<code>electron-updater</code>](Auto-Update#module_electron-updater)  

| Param | Type |
| --- | --- |
| channel | <code>String</code> | 

<a name="module_electron-updater.getCurrentPlatform"></a>

### `electron-updater.getCurrentPlatform()` ⇒ <code>any</code>
**Kind**: method of [<code>electron-updater</code>](Auto-Update#module_electron-updater)  
<a name="module_electron-updater.getCustomChannelName"></a>

### `electron-updater.getCustomChannelName(channel)` ⇒ <code>String</code>
**Kind**: method of [<code>electron-updater</code>](Auto-Update#module_electron-updater)  

| Param | Type |
| --- | --- |
| channel | <code>String</code> | 

<a name="module_electron-updater.getDefaultChannelName"></a>

### `electron-updater.getDefaultChannelName()` ⇒ <code>String</code>
**Kind**: method of [<code>electron-updater</code>](Auto-Update#module_electron-updater)  
<a name="module_electron-updater.isUseOldMacProvider"></a>

### `electron-updater.isUseOldMacProvider()` ⇒ <code>Boolean</code>
**Kind**: method of [<code>electron-updater</code>](Auto-Update#module_electron-updater)  
<a name="module_electron-updater/out/BintrayProvider"></a>

## electron-updater/out/BintrayProvider

* [electron-updater/out/BintrayProvider](#module_electron-updater/out/BintrayProvider)
    * [.BintrayProvider](#BintrayProvider) ⇐ <code>[Provider](#Provider)</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getLatestVersion) ⇒ <code>Promise&lt;[VersionInfo](Publishing-Artifacts#VersionInfo)&gt;</code>
        * [`.setRequestHeaders(value)`](#module_electron-updater/out/BintrayProvider.BintrayProvider+setRequestHeaders)
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>

<a name="BintrayProvider"></a>

### BintrayProvider ⇐ <code>[Provider](#Provider)</code>
**Kind**: class of [<code>electron-updater/out/BintrayProvider</code>](#module_electron-updater/out/BintrayProvider)  
**Extends**: <code>[Provider](#Provider)</code>  

* [.BintrayProvider](#BintrayProvider) ⇐ <code>[Provider](#Provider)</code>
    * [`.getLatestVersion()`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getLatestVersion) ⇒ <code>Promise&lt;[VersionInfo](Publishing-Artifacts#VersionInfo)&gt;</code>
    * [`.setRequestHeaders(value)`](#module_electron-updater/out/BintrayProvider.BintrayProvider+setRequestHeaders)
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>

<a name="module_electron-updater/out/BintrayProvider.BintrayProvider+getLatestVersion"></a>

#### `bintrayProvider.getLatestVersion()` ⇒ <code>Promise&lt;[VersionInfo](Publishing-Artifacts#VersionInfo)&gt;</code>
**Kind**: instance method of [<code>BintrayProvider</code>](#BintrayProvider)  
<a name="module_electron-updater/out/BintrayProvider.BintrayProvider+setRequestHeaders"></a>

#### `bintrayProvider.setRequestHeaders(value)`
**Kind**: instance method of [<code>BintrayProvider</code>](#BintrayProvider)  

| Param | Type |
| --- | --- |
| value | <code>any</code> | 

<a name="module_electron-updater/out/BintrayProvider.BintrayProvider+getUpdateFile"></a>

#### `bintrayProvider.getUpdateFile(versionInfo)` ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>
**Kind**: instance method of [<code>BintrayProvider</code>](#BintrayProvider)  

| Param | Type |
| --- | --- |
| versionInfo | <code>[VersionInfo](Publishing-Artifacts#VersionInfo)</code> | 

<a name="module_electron-updater/out/electronHttpExecutor"></a>

## electron-updater/out/electronHttpExecutor

* [electron-updater/out/electronHttpExecutor](#module_electron-updater/out/electronHttpExecutor)
    * [.ElectronHttpExecutor](#ElectronHttpExecutor) ⇐ <code>[HttpExecutor](electron-builder-http#HttpExecutor)</code>
        * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doApiRequest) ⇒ <code>Promise&lt;module:electron-updater/out/electronHttpExecutor.T&gt;</code>
        * [`.doRequest(options, callback)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doRequest) ⇒ <code>any</code>
        * [`.download(url, destination, options)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+download) ⇒ <code>Promise&lt;String&gt;</code>

<a name="ElectronHttpExecutor"></a>

### ElectronHttpExecutor ⇐ <code>[HttpExecutor](electron-builder-http#HttpExecutor)</code>
**Kind**: class of [<code>electron-updater/out/electronHttpExecutor</code>](#module_electron-updater/out/electronHttpExecutor)  
**Extends**: <code>[HttpExecutor](electron-builder-http#HttpExecutor)</code>  

* [.ElectronHttpExecutor](#ElectronHttpExecutor) ⇐ <code>[HttpExecutor](electron-builder-http#HttpExecutor)</code>
    * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doApiRequest) ⇒ <code>Promise&lt;module:electron-updater/out/electronHttpExecutor.T&gt;</code>
    * [`.doRequest(options, callback)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doRequest) ⇒ <code>any</code>
    * [`.download(url, destination, options)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+download) ⇒ <code>Promise&lt;String&gt;</code>

<a name="module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doApiRequest"></a>

#### `electronHttpExecutor.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)` ⇒ <code>Promise&lt;module:electron-updater/out/electronHttpExecutor.T&gt;</code>
**Kind**: instance method of [<code>ElectronHttpExecutor</code>](#ElectronHttpExecutor)  

| Param | Type |
| --- | --- |
| options | <code>any</code> | 
| cancellationToken | <code>[CancellationToken](electron-builder-http#CancellationToken)</code> | 
| requestProcessor | <code>callback</code> | 
| redirectCount | <code>Number</code> | 

<a name="module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doRequest"></a>

#### `electronHttpExecutor.doRequest(options, callback)` ⇒ <code>any</code>
**Kind**: instance method of [<code>ElectronHttpExecutor</code>](#ElectronHttpExecutor)  

| Param | Type |
| --- | --- |
| options | <code>any</code> | 
| callback | <code>callback</code> | 

<a name="module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+download"></a>

#### `electronHttpExecutor.download(url, destination, options)` ⇒ <code>Promise&lt;String&gt;</code>
**Kind**: instance method of [<code>ElectronHttpExecutor</code>](#ElectronHttpExecutor)  

| Param | Type |
| --- | --- |
| url | <code>String</code> | 
| destination | <code>String</code> | 
| options | <code>[DownloadOptions](electron-builder-http#DownloadOptions)</code> | 

<a name="module_electron-updater/out/GenericProvider"></a>

## electron-updater/out/GenericProvider

* [electron-updater/out/GenericProvider](#module_electron-updater/out/GenericProvider)
    * [.GenericProvider](#GenericProvider) ⇐ <code>[Provider](#Provider)</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/GenericProvider.GenericProvider+getLatestVersion) ⇒ <code>Promise&lt;[UpdateInfo](Publishing-Artifacts#UpdateInfo)&gt;</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GenericProvider.GenericProvider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>

<a name="GenericProvider"></a>

### GenericProvider ⇐ <code>[Provider](#Provider)</code>
**Kind**: class of [<code>electron-updater/out/GenericProvider</code>](#module_electron-updater/out/GenericProvider)  
**Extends**: <code>[Provider](#Provider)</code>  

* [.GenericProvider](#GenericProvider) ⇐ <code>[Provider](#Provider)</code>
    * [`.getLatestVersion()`](#module_electron-updater/out/GenericProvider.GenericProvider+getLatestVersion) ⇒ <code>Promise&lt;[UpdateInfo](Publishing-Artifacts#UpdateInfo)&gt;</code>
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GenericProvider.GenericProvider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>

<a name="module_electron-updater/out/GenericProvider.GenericProvider+getLatestVersion"></a>

#### `genericProvider.getLatestVersion()` ⇒ <code>Promise&lt;[UpdateInfo](Publishing-Artifacts#UpdateInfo)&gt;</code>
**Kind**: instance method of [<code>GenericProvider</code>](#GenericProvider)  
<a name="module_electron-updater/out/GenericProvider.GenericProvider+getUpdateFile"></a>

#### `genericProvider.getUpdateFile(versionInfo)` ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>
**Kind**: instance method of [<code>GenericProvider</code>](#GenericProvider)  

| Param | Type |
| --- | --- |
| versionInfo | <code>[UpdateInfo](Publishing-Artifacts#UpdateInfo)</code> | 

<a name="module_electron-updater/out/GitHubProvider"></a>

## electron-updater/out/GitHubProvider

* [electron-updater/out/GitHubProvider](#module_electron-updater/out/GitHubProvider)
    * [.BaseGitHubProvider](#BaseGitHubProvider) ⇐ <code>[Provider](#Provider)</code>
    * [.GitHubProvider](#GitHubProvider) ⇐ <code>[BaseGitHubProvider](#BaseGitHubProvider)</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getLatestVersion) ⇒ <code>Promise&lt;[UpdateInfo](Publishing-Artifacts#UpdateInfo)&gt;</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>

<a name="BaseGitHubProvider"></a>

### BaseGitHubProvider ⇐ <code>[Provider](#Provider)</code>
**Kind**: class of [<code>electron-updater/out/GitHubProvider</code>](#module_electron-updater/out/GitHubProvider)  
**Extends**: <code>[Provider](#Provider)</code>  
<a name="GitHubProvider"></a>

### GitHubProvider ⇐ <code>[BaseGitHubProvider](#BaseGitHubProvider)</code>
**Kind**: class of [<code>electron-updater/out/GitHubProvider</code>](#module_electron-updater/out/GitHubProvider)  
**Extends**: <code>[BaseGitHubProvider](#BaseGitHubProvider)</code>  

* [.GitHubProvider](#GitHubProvider) ⇐ <code>[BaseGitHubProvider](#BaseGitHubProvider)</code>
    * [`.getLatestVersion()`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getLatestVersion) ⇒ <code>Promise&lt;[UpdateInfo](Publishing-Artifacts#UpdateInfo)&gt;</code>
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>

<a name="module_electron-updater/out/GitHubProvider.GitHubProvider+getLatestVersion"></a>

#### `gitHubProvider.getLatestVersion()` ⇒ <code>Promise&lt;[UpdateInfo](Publishing-Artifacts#UpdateInfo)&gt;</code>
**Kind**: instance method of [<code>GitHubProvider</code>](#GitHubProvider)  
<a name="module_electron-updater/out/GitHubProvider.GitHubProvider+getUpdateFile"></a>

#### `gitHubProvider.getUpdateFile(versionInfo)` ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>
**Kind**: instance method of [<code>GitHubProvider</code>](#GitHubProvider)  

| Param | Type |
| --- | --- |
| versionInfo | <code>[UpdateInfo](Publishing-Artifacts#UpdateInfo)</code> | 

<a name="module_electron-updater/out/MacUpdater"></a>

## electron-updater/out/MacUpdater

* [electron-updater/out/MacUpdater](#module_electron-updater/out/MacUpdater)
    * [.MacUpdater](#MacUpdater) ⇐ <code>[AppUpdater](Auto-Update#AppUpdater)</code>
        * [`.quitAndInstall()`](#module_electron-updater/out/MacUpdater.MacUpdater+quitAndInstall)

<a name="MacUpdater"></a>

### MacUpdater ⇐ <code>[AppUpdater](Auto-Update#AppUpdater)</code>
**Kind**: class of [<code>electron-updater/out/MacUpdater</code>](#module_electron-updater/out/MacUpdater)  
**Extends**: <code>[AppUpdater](Auto-Update#AppUpdater)</code>  
<a name="module_electron-updater/out/MacUpdater.MacUpdater+quitAndInstall"></a>

#### `macUpdater.quitAndInstall()`
**Kind**: instance method of [<code>MacUpdater</code>](#MacUpdater)  
<a name="module_electron-updater/out/NsisUpdater"></a>

## electron-updater/out/NsisUpdater

* [electron-updater/out/NsisUpdater](#module_electron-updater/out/NsisUpdater)
    * [.NsisUpdater](#NsisUpdater) ⇐ <code>[AppUpdater](Auto-Update#AppUpdater)</code>
        * [`.quitAndInstall(isSilent)`](#module_electron-updater/out/NsisUpdater.NsisUpdater+quitAndInstall)

<a name="NsisUpdater"></a>

### NsisUpdater ⇐ <code>[AppUpdater](Auto-Update#AppUpdater)</code>
**Kind**: class of [<code>electron-updater/out/NsisUpdater</code>](#module_electron-updater/out/NsisUpdater)  
**Extends**: <code>[AppUpdater](Auto-Update#AppUpdater)</code>  
<a name="module_electron-updater/out/NsisUpdater.NsisUpdater+quitAndInstall"></a>

#### `nsisUpdater.quitAndInstall(isSilent)`
**Kind**: instance method of [<code>NsisUpdater</code>](#NsisUpdater)  

| Param | Type |
| --- | --- |
| isSilent | <code>Boolean</code> | 

<a name="module_electron-updater/out/PrivateGitHubProvider"></a>

## electron-updater/out/PrivateGitHubProvider

* [electron-updater/out/PrivateGitHubProvider](#module_electron-updater/out/PrivateGitHubProvider)
    * [`.Asset`](#Asset)
    * [`.PrivateGitHubUpdateInfo`](#PrivateGitHubUpdateInfo) ⇐ <code>[UpdateInfo](Publishing-Artifacts#UpdateInfo)</code>
    * [.PrivateGitHubProvider](#PrivateGitHubProvider) ⇐ <code>[BaseGitHubProvider](#BaseGitHubProvider)</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/PrivateGitHubProvider.PrivateGitHubProvider+getLatestVersion) ⇒ <code>Promise&lt;[PrivateGitHubUpdateInfo](#PrivateGitHubUpdateInfo)&gt;</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/PrivateGitHubProvider.PrivateGitHubProvider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>

<a name="Asset"></a>

### `Asset`
**Kind**: interface of [<code>electron-updater/out/PrivateGitHubProvider</code>](#module_electron-updater/out/PrivateGitHubProvider)  
**Properties**

| Name | Type |
| --- | --- |
| **name**| <code>String</code> | 
| **url**| <code>String</code> | 

<a name="PrivateGitHubUpdateInfo"></a>

### `PrivateGitHubUpdateInfo` ⇐ <code>[UpdateInfo](Publishing-Artifacts#UpdateInfo)</code>
**Kind**: interface of [<code>electron-updater/out/PrivateGitHubProvider</code>](#module_electron-updater/out/PrivateGitHubProvider)  
**Extends**: <code>[UpdateInfo](Publishing-Artifacts#UpdateInfo)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **assets**| <code>Array&lt;[Asset](#Asset)&gt;</code> | 

<a name="PrivateGitHubProvider"></a>

### PrivateGitHubProvider ⇐ <code>[BaseGitHubProvider](#BaseGitHubProvider)</code>
**Kind**: class of [<code>electron-updater/out/PrivateGitHubProvider</code>](#module_electron-updater/out/PrivateGitHubProvider)  
**Extends**: <code>[BaseGitHubProvider](#BaseGitHubProvider)</code>  

* [.PrivateGitHubProvider](#PrivateGitHubProvider) ⇐ <code>[BaseGitHubProvider](#BaseGitHubProvider)</code>
    * [`.getLatestVersion()`](#module_electron-updater/out/PrivateGitHubProvider.PrivateGitHubProvider+getLatestVersion) ⇒ <code>Promise&lt;[PrivateGitHubUpdateInfo](#PrivateGitHubUpdateInfo)&gt;</code>
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/PrivateGitHubProvider.PrivateGitHubProvider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>

<a name="module_electron-updater/out/PrivateGitHubProvider.PrivateGitHubProvider+getLatestVersion"></a>

#### `privateGitHubProvider.getLatestVersion()` ⇒ <code>Promise&lt;[PrivateGitHubUpdateInfo](#PrivateGitHubUpdateInfo)&gt;</code>
**Kind**: instance method of [<code>PrivateGitHubProvider</code>](#PrivateGitHubProvider)  
<a name="module_electron-updater/out/PrivateGitHubProvider.PrivateGitHubProvider+getUpdateFile"></a>

#### `privateGitHubProvider.getUpdateFile(versionInfo)` ⇒ <code>Promise&lt;[FileInfo](#FileInfo)&gt;</code>
**Kind**: instance method of [<code>PrivateGitHubProvider</code>](#PrivateGitHubProvider)  

| Param | Type |
| --- | --- |
| versionInfo | <code>[PrivateGitHubUpdateInfo](#PrivateGitHubUpdateInfo)</code> | 


<!-- end of generated block -->
