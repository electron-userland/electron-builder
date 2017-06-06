Developer API only. See [[Auto Update]] for user documentation.

<!-- do not edit. start of generated block -->
## Modules

<dl>
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

<a name="module_electron-updater/out/BintrayProvider"></a>

## electron-updater/out/BintrayProvider

* [electron-updater/out/BintrayProvider](#module_electron-updater/out/BintrayProvider)
    * [.BintrayProvider](#BintrayProvider) ⇐ <code>[Provider](Auto-Update#Provider)</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getLatestVersion) ⇒ <code>Promise&lt;[VersionInfo](Publishing-Artifacts#VersionInfo)&gt;</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](Auto-Update#FileInfo)&gt;</code>

<a name="BintrayProvider"></a>

### BintrayProvider ⇐ <code>[Provider](Auto-Update#Provider)</code>
**Kind**: class of [<code>electron-updater/out/BintrayProvider</code>](#module_electron-updater/out/BintrayProvider)  
**Extends**: <code>[Provider](Auto-Update#Provider)</code>  

* [.BintrayProvider](#BintrayProvider) ⇐ <code>[Provider](Auto-Update#Provider)</code>
    * [`.getLatestVersion()`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getLatestVersion) ⇒ <code>Promise&lt;[VersionInfo](Publishing-Artifacts#VersionInfo)&gt;</code>
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](Auto-Update#FileInfo)&gt;</code>

<a name="module_electron-updater/out/BintrayProvider.BintrayProvider+getLatestVersion"></a>

#### `bintrayProvider.getLatestVersion()` ⇒ <code>Promise&lt;[VersionInfo](Publishing-Artifacts#VersionInfo)&gt;</code>
**Kind**: instance method of [<code>BintrayProvider</code>](#BintrayProvider)  
<a name="module_electron-updater/out/BintrayProvider.BintrayProvider+getUpdateFile"></a>

#### `bintrayProvider.getUpdateFile(versionInfo)` ⇒ <code>Promise&lt;[FileInfo](Auto-Update#FileInfo)&gt;</code>
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
        * [`.download(url, destination, options)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+download) ⇒ <code>Promise&lt;string&gt;</code>

<a name="ElectronHttpExecutor"></a>

### ElectronHttpExecutor ⇐ <code>[HttpExecutor](electron-builder-http#HttpExecutor)</code>
**Kind**: class of [<code>electron-updater/out/electronHttpExecutor</code>](#module_electron-updater/out/electronHttpExecutor)  
**Extends**: <code>[HttpExecutor](electron-builder-http#HttpExecutor)</code>  

* [.ElectronHttpExecutor](#ElectronHttpExecutor) ⇐ <code>[HttpExecutor](electron-builder-http#HttpExecutor)</code>
    * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doApiRequest) ⇒ <code>Promise&lt;module:electron-updater/out/electronHttpExecutor.T&gt;</code>
    * [`.doRequest(options, callback)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doRequest) ⇒ <code>any</code>
    * [`.download(url, destination, options)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+download) ⇒ <code>Promise&lt;string&gt;</code>

<a name="module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doApiRequest"></a>

#### `electronHttpExecutor.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)` ⇒ <code>Promise&lt;module:electron-updater/out/electronHttpExecutor.T&gt;</code>
**Kind**: instance method of [<code>ElectronHttpExecutor</code>](#ElectronHttpExecutor)  

| Param | Type |
| --- | --- |
| options | <code>any</code> | 
| cancellationToken | <code>[CancellationToken](electron-builder-http#CancellationToken)</code> | 
| requestProcessor | <code>callback</code> | 
| redirectCount | <code>number</code> | 

<a name="module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doRequest"></a>

#### `electronHttpExecutor.doRequest(options, callback)` ⇒ <code>any</code>
**Kind**: instance method of [<code>ElectronHttpExecutor</code>](#ElectronHttpExecutor)  

| Param | Type |
| --- | --- |
| options | <code>any</code> | 
| callback | <code>callback</code> | 

<a name="module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+download"></a>

#### `electronHttpExecutor.download(url, destination, options)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: instance method of [<code>ElectronHttpExecutor</code>](#ElectronHttpExecutor)  

| Param | Type |
| --- | --- |
| url | <code>string</code> | 
| destination | <code>string</code> | 
| options | <code>[DownloadOptions](electron-builder-http#DownloadOptions)</code> | 

<a name="module_electron-updater/out/GenericProvider"></a>

## electron-updater/out/GenericProvider

* [electron-updater/out/GenericProvider](#module_electron-updater/out/GenericProvider)
    * [.GenericProvider](#GenericProvider) ⇐ <code>[Provider](Auto-Update#Provider)</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/GenericProvider.GenericProvider+getLatestVersion) ⇒ <code>Promise&lt;[UpdateInfo](Publishing-Artifacts#UpdateInfo)&gt;</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GenericProvider.GenericProvider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](Auto-Update#FileInfo)&gt;</code>

<a name="GenericProvider"></a>

### GenericProvider ⇐ <code>[Provider](Auto-Update#Provider)</code>
**Kind**: class of [<code>electron-updater/out/GenericProvider</code>](#module_electron-updater/out/GenericProvider)  
**Extends**: <code>[Provider](Auto-Update#Provider)</code>  

* [.GenericProvider](#GenericProvider) ⇐ <code>[Provider](Auto-Update#Provider)</code>
    * [`.getLatestVersion()`](#module_electron-updater/out/GenericProvider.GenericProvider+getLatestVersion) ⇒ <code>Promise&lt;[UpdateInfo](Publishing-Artifacts#UpdateInfo)&gt;</code>
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GenericProvider.GenericProvider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](Auto-Update#FileInfo)&gt;</code>

<a name="module_electron-updater/out/GenericProvider.GenericProvider+getLatestVersion"></a>

#### `genericProvider.getLatestVersion()` ⇒ <code>Promise&lt;[UpdateInfo](Publishing-Artifacts#UpdateInfo)&gt;</code>
**Kind**: instance method of [<code>GenericProvider</code>](#GenericProvider)  
<a name="module_electron-updater/out/GenericProvider.GenericProvider+getUpdateFile"></a>

#### `genericProvider.getUpdateFile(versionInfo)` ⇒ <code>Promise&lt;[FileInfo](Auto-Update#FileInfo)&gt;</code>
**Kind**: instance method of [<code>GenericProvider</code>](#GenericProvider)  

| Param | Type |
| --- | --- |
| versionInfo | <code>[UpdateInfo](Publishing-Artifacts#UpdateInfo)</code> | 

<a name="module_electron-updater/out/GitHubProvider"></a>

## electron-updater/out/GitHubProvider

* [electron-updater/out/GitHubProvider](#module_electron-updater/out/GitHubProvider)
    * [.BaseGitHubProvider](#BaseGitHubProvider) ⇐ <code>[Provider](Auto-Update#Provider)</code>
    * [.GitHubProvider](#GitHubProvider) ⇐ <code>[BaseGitHubProvider](#BaseGitHubProvider)</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getLatestVersion) ⇒ <code>Promise&lt;[UpdateInfo](Publishing-Artifacts#UpdateInfo)&gt;</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](Auto-Update#FileInfo)&gt;</code>

<a name="BaseGitHubProvider"></a>

### BaseGitHubProvider ⇐ <code>[Provider](Auto-Update#Provider)</code>
**Kind**: class of [<code>electron-updater/out/GitHubProvider</code>](#module_electron-updater/out/GitHubProvider)  
**Extends**: <code>[Provider](Auto-Update#Provider)</code>  
**Properties**

| Name | Type |
| --- | --- |
| baseUrl| <code>module:http.RequestOptions</code> | 

<a name="GitHubProvider"></a>

### GitHubProvider ⇐ <code>[BaseGitHubProvider](#BaseGitHubProvider)</code>
**Kind**: class of [<code>electron-updater/out/GitHubProvider</code>](#module_electron-updater/out/GitHubProvider)  
**Extends**: <code>[BaseGitHubProvider](#BaseGitHubProvider)</code>  

* [.GitHubProvider](#GitHubProvider) ⇐ <code>[BaseGitHubProvider](#BaseGitHubProvider)</code>
    * [`.getLatestVersion()`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getLatestVersion) ⇒ <code>Promise&lt;[UpdateInfo](Publishing-Artifacts#UpdateInfo)&gt;</code>
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](Auto-Update#FileInfo)&gt;</code>

<a name="module_electron-updater/out/GitHubProvider.GitHubProvider+getLatestVersion"></a>

#### `gitHubProvider.getLatestVersion()` ⇒ <code>Promise&lt;[UpdateInfo](Publishing-Artifacts#UpdateInfo)&gt;</code>
**Kind**: instance method of [<code>GitHubProvider</code>](#GitHubProvider)  
<a name="module_electron-updater/out/GitHubProvider.GitHubProvider+getUpdateFile"></a>

#### `gitHubProvider.getUpdateFile(versionInfo)` ⇒ <code>Promise&lt;[FileInfo](Auto-Update#FileInfo)&gt;</code>
**Kind**: instance method of [<code>GitHubProvider</code>](#GitHubProvider)  

| Param | Type |
| --- | --- |
| versionInfo | <code>[UpdateInfo](Publishing-Artifacts#UpdateInfo)</code> | 

<a name="module_electron-updater/out/MacUpdater"></a>

## electron-updater/out/MacUpdater

* [electron-updater/out/MacUpdater](#module_electron-updater/out/MacUpdater)
    * [.MacUpdater](#MacUpdater) ⇐ <code>[AppUpdater](Auto-Update#AppUpdater)</code>
        * [`.quitAndInstall()`](#module_electron-updater/out/MacUpdater.MacUpdater+quitAndInstall)
        * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/MacUpdater.MacUpdater+doDownloadUpdate) ⇒ <code>module:bluebird-lst.Bluebird&lt;void&gt;</code>

<a name="MacUpdater"></a>

### MacUpdater ⇐ <code>[AppUpdater](Auto-Update#AppUpdater)</code>
**Kind**: class of [<code>electron-updater/out/MacUpdater</code>](#module_electron-updater/out/MacUpdater)  
**Extends**: <code>[AppUpdater](Auto-Update#AppUpdater)</code>  

* [.MacUpdater](#MacUpdater) ⇐ <code>[AppUpdater](Auto-Update#AppUpdater)</code>
    * [`.quitAndInstall()`](#module_electron-updater/out/MacUpdater.MacUpdater+quitAndInstall)
    * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/MacUpdater.MacUpdater+doDownloadUpdate) ⇒ <code>module:bluebird-lst.Bluebird&lt;void&gt;</code>

<a name="module_electron-updater/out/MacUpdater.MacUpdater+quitAndInstall"></a>

#### `macUpdater.quitAndInstall()`
**Kind**: instance method of [<code>MacUpdater</code>](#MacUpdater)  
<a name="module_electron-updater/out/MacUpdater.MacUpdater+doDownloadUpdate"></a>

#### `macUpdater.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)` ⇒ <code>module:bluebird-lst.Bluebird&lt;void&gt;</code>
**Kind**: instance method of [<code>MacUpdater</code>](#MacUpdater)  
**Access**: protected  

| Param | Type |
| --- | --- |
| versionInfo | <code>[VersionInfo](Publishing-Artifacts#VersionInfo)</code> | 
| fileInfo | <code>[FileInfo](Auto-Update#FileInfo)</code> | 
| cancellationToken | <code>[CancellationToken](electron-builder-http#CancellationToken)</code> | 

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
| isSilent | <code>boolean</code> | 

<a name="module_electron-updater/out/PrivateGitHubProvider"></a>

## electron-updater/out/PrivateGitHubProvider

* [electron-updater/out/PrivateGitHubProvider](#module_electron-updater/out/PrivateGitHubProvider)
    * [`.Asset`](#Asset)
    * [`.PrivateGitHubUpdateInfo`](#PrivateGitHubUpdateInfo) ⇐ <code>[UpdateInfo](Publishing-Artifacts#UpdateInfo)</code>
    * [.PrivateGitHubProvider](#PrivateGitHubProvider) ⇐ <code>[BaseGitHubProvider](#BaseGitHubProvider)</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/PrivateGitHubProvider.PrivateGitHubProvider+getLatestVersion) ⇒ <code>Promise&lt;[PrivateGitHubUpdateInfo](#PrivateGitHubUpdateInfo)&gt;</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/PrivateGitHubProvider.PrivateGitHubProvider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](Auto-Update#FileInfo)&gt;</code>

<a name="Asset"></a>

### `Asset`
**Kind**: interface of [<code>electron-updater/out/PrivateGitHubProvider</code>](#module_electron-updater/out/PrivateGitHubProvider)  
**Properties**

| Name | Type |
| --- | --- |
| **name**| <code>string</code> | 
| **url**| <code>string</code> | 

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
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/PrivateGitHubProvider.PrivateGitHubProvider+getUpdateFile) ⇒ <code>Promise&lt;[FileInfo](Auto-Update#FileInfo)&gt;</code>

<a name="module_electron-updater/out/PrivateGitHubProvider.PrivateGitHubProvider+getLatestVersion"></a>

#### `privateGitHubProvider.getLatestVersion()` ⇒ <code>Promise&lt;[PrivateGitHubUpdateInfo](#PrivateGitHubUpdateInfo)&gt;</code>
**Kind**: instance method of [<code>PrivateGitHubProvider</code>](#PrivateGitHubProvider)  
<a name="module_electron-updater/out/PrivateGitHubProvider.PrivateGitHubProvider+getUpdateFile"></a>

#### `privateGitHubProvider.getUpdateFile(versionInfo)` ⇒ <code>Promise&lt;[FileInfo](Auto-Update#FileInfo)&gt;</code>
**Kind**: instance method of [<code>PrivateGitHubProvider</code>](#PrivateGitHubProvider)  

| Param | Type |
| --- | --- |
| versionInfo | <code>[PrivateGitHubUpdateInfo](#PrivateGitHubUpdateInfo)</code> | 


<!-- end of generated block -->
