## Modules

<dl>
<dt><a href="#module_electron-builder/out/appInfo">electron-builder/out/appInfo</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/asar">electron-builder/out/asar</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/asarUtil">electron-builder/out/asarUtil</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/builder">electron-builder/out/builder</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/cli/cliOptions">electron-builder/out/cli/cliOptions</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/codeSign">electron-builder/out/codeSign</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/fileMatcher">electron-builder/out/fileMatcher</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/fileTransformer">electron-builder/out/fileTransformer</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/linuxPackager">electron-builder/out/linuxPackager</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/macPackager">electron-builder/out/macPackager</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/options/linuxOptions">electron-builder/out/options/linuxOptions</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/options/winOptions">electron-builder/out/options/winOptions</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/packager/dirPackager">electron-builder/out/packager/dirPackager</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/packager/mac">electron-builder/out/packager/mac</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/packager">electron-builder/out/packager</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/platformPackager">electron-builder/out/platformPackager</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/publish/PublishManager">electron-builder/out/publish/PublishManager</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/readInstalled">electron-builder/out/readInstalled</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/repositoryInfo">electron-builder/out/repositoryInfo</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/targets/appImage">electron-builder/out/targets/appImage</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/targets/appx">electron-builder/out/targets/appx</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/targets/archive">electron-builder/out/targets/archive</a></dt>
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
<dt><a href="#module_electron-builder/out/util/filter">electron-builder/out/util/filter</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/util/readPackageJson">electron-builder/out/util/readPackageJson</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/windowsCodeSign">electron-builder/out/windowsCodeSign</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/winPackager">electron-builder/out/winPackager</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder/out/yarn">electron-builder/out/yarn</a></dt>
<dd></dd>
</dl>

<a name="module_electron-builder/out/appInfo"></a>

## electron-builder/out/appInfo

* [electron-builder/out/appInfo](#module_electron-builder/out/appInfo)
    * [.AppInfo](#AppInfo)
        * [`.computePackageUrl()`](#module_electron-builder/out/appInfo.AppInfo+computePackageUrl) ⇒ <code>Promise&lt; \| string&gt;</code>

<a name="AppInfo"></a>

### AppInfo
**Kind**: class of <code>[electron-builder/out/appInfo](#module_electron-builder/out/appInfo)</code>  
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
**Kind**: instance method of <code>[AppInfo](#AppInfo)</code>  
<a name="module_electron-builder/out/asar"></a>

## electron-builder/out/asar

* [electron-builder/out/asar](#module_electron-builder/out/asar)
    * [.AsarFilesystem](#AsarFilesystem)
        * [`.getFile(p, followLinks)`](#module_electron-builder/out/asar.AsarFilesystem+getFile) ⇒ <code>[Node](#Node)</code>
        * [`.insertDirectory(p, unpacked)`](#module_electron-builder/out/asar.AsarFilesystem+insertDirectory) ⇒ <code>module:electron-builder/out/asar.__type</code>
        * [`.insertFileNode(node, stat, file)`](#module_electron-builder/out/asar.AsarFilesystem+insertFileNode)
        * [`.getNode(p)`](#module_electron-builder/out/asar.AsarFilesystem+getNode) ⇒ <code>[Node](#Node)</code>
        * [`.getOrCreateNode(p)`](#module_electron-builder/out/asar.AsarFilesystem+getOrCreateNode) ⇒ <code>[Node](#Node)</code>
        * [`.readFile(file)`](#module_electron-builder/out/asar.AsarFilesystem+readFile) ⇒ <code>Promise&lt;Buffer&gt;</code>
        * [`.readJson(file)`](#module_electron-builder/out/asar.AsarFilesystem+readJson) ⇒ <code>Promise&lt;Buffer&gt;</code>
        * [`.searchNodeFromDirectory(p)`](#module_electron-builder/out/asar.AsarFilesystem+searchNodeFromDirectory) ⇒ <code>[Node](#Node)</code>
    * [.Node](#Node)
    * [`.readAsar(archive)`](#module_electron-builder/out/asar.readAsar) ⇒ <code>Promise&lt;[AsarFilesystem](#AsarFilesystem)&gt;</code>
    * [`.readAsarJson(archive, file)`](#module_electron-builder/out/asar.readAsarJson) ⇒ <code>Promise&lt;Buffer&gt;</code>

<a name="AsarFilesystem"></a>

### AsarFilesystem
**Kind**: class of <code>[electron-builder/out/asar](#module_electron-builder/out/asar)</code>  

* [.AsarFilesystem](#AsarFilesystem)
    * [`.getFile(p, followLinks)`](#module_electron-builder/out/asar.AsarFilesystem+getFile) ⇒ <code>[Node](#Node)</code>
    * [`.insertDirectory(p, unpacked)`](#module_electron-builder/out/asar.AsarFilesystem+insertDirectory) ⇒ <code>module:electron-builder/out/asar.__type</code>
    * [`.insertFileNode(node, stat, file)`](#module_electron-builder/out/asar.AsarFilesystem+insertFileNode)
    * [`.getNode(p)`](#module_electron-builder/out/asar.AsarFilesystem+getNode) ⇒ <code>[Node](#Node)</code>
    * [`.getOrCreateNode(p)`](#module_electron-builder/out/asar.AsarFilesystem+getOrCreateNode) ⇒ <code>[Node](#Node)</code>
    * [`.readFile(file)`](#module_electron-builder/out/asar.AsarFilesystem+readFile) ⇒ <code>Promise&lt;Buffer&gt;</code>
    * [`.readJson(file)`](#module_electron-builder/out/asar.AsarFilesystem+readJson) ⇒ <code>Promise&lt;Buffer&gt;</code>
    * [`.searchNodeFromDirectory(p)`](#module_electron-builder/out/asar.AsarFilesystem+searchNodeFromDirectory) ⇒ <code>[Node](#Node)</code>

<a name="module_electron-builder/out/asar.AsarFilesystem+getFile"></a>

#### `asarFilesystem.getFile(p, followLinks)` ⇒ <code>[Node](#Node)</code>
**Kind**: instance method of <code>[AsarFilesystem](#AsarFilesystem)</code>  

| Param | Type |
| --- | --- |
| p | <code>string</code> | 
| followLinks | <code>boolean</code> | 

<a name="module_electron-builder/out/asar.AsarFilesystem+insertDirectory"></a>

#### `asarFilesystem.insertDirectory(p, unpacked)` ⇒ <code>module:electron-builder/out/asar.__type</code>
**Kind**: instance method of <code>[AsarFilesystem](#AsarFilesystem)</code>  

| Param | Type |
| --- | --- |
| p | <code>string</code> | 
| unpacked | <code>boolean</code> | 

<a name="module_electron-builder/out/asar.AsarFilesystem+insertFileNode"></a>

#### `asarFilesystem.insertFileNode(node, stat, file)`
**Kind**: instance method of <code>[AsarFilesystem](#AsarFilesystem)</code>  

| Param | Type |
| --- | --- |
| node | <code>[Node](#Node)</code> | 
| stat | <code>module:fs.Stats</code> | 
| file | <code>string</code> | 

<a name="module_electron-builder/out/asar.AsarFilesystem+getNode"></a>

#### `asarFilesystem.getNode(p)` ⇒ <code>[Node](#Node)</code>
**Kind**: instance method of <code>[AsarFilesystem](#AsarFilesystem)</code>  

| Param | Type |
| --- | --- |
| p | <code>string</code> | 

<a name="module_electron-builder/out/asar.AsarFilesystem+getOrCreateNode"></a>

#### `asarFilesystem.getOrCreateNode(p)` ⇒ <code>[Node](#Node)</code>
**Kind**: instance method of <code>[AsarFilesystem](#AsarFilesystem)</code>  

| Param | Type |
| --- | --- |
| p | <code>string</code> | 

<a name="module_electron-builder/out/asar.AsarFilesystem+readFile"></a>

#### `asarFilesystem.readFile(file)` ⇒ <code>Promise&lt;Buffer&gt;</code>
**Kind**: instance method of <code>[AsarFilesystem](#AsarFilesystem)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 

<a name="module_electron-builder/out/asar.AsarFilesystem+readJson"></a>

#### `asarFilesystem.readJson(file)` ⇒ <code>Promise&lt;Buffer&gt;</code>
**Kind**: instance method of <code>[AsarFilesystem](#AsarFilesystem)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 

<a name="module_electron-builder/out/asar.AsarFilesystem+searchNodeFromDirectory"></a>

#### `asarFilesystem.searchNodeFromDirectory(p)` ⇒ <code>[Node](#Node)</code>
**Kind**: instance method of <code>[AsarFilesystem](#AsarFilesystem)</code>  

| Param | Type |
| --- | --- |
| p | <code>string</code> | 

<a name="Node"></a>

### Node
**Kind**: class of <code>[electron-builder/out/asar](#module_electron-builder/out/asar)</code>  
**Properties**

| Name | Type |
| --- | --- |
| files| <code>Object&lt;string, any&gt;</code> | 
| unpacked| <code>boolean</code> | 
| **size**| <code>number</code> | 
| **offset**| <code>number</code> | 
| executable| <code>boolean</code> | 
| link| <code>string</code> | 

<a name="module_electron-builder/out/asar.readAsar"></a>

### `electron-builder/out/asar.readAsar(archive)` ⇒ <code>Promise&lt;[AsarFilesystem](#AsarFilesystem)&gt;</code>
**Kind**: method of <code>[electron-builder/out/asar](#module_electron-builder/out/asar)</code>  

| Param | Type |
| --- | --- |
| archive | <code>string</code> | 

<a name="module_electron-builder/out/asar.readAsarJson"></a>

### `electron-builder/out/asar.readAsarJson(archive, file)` ⇒ <code>Promise&lt;Buffer&gt;</code>
**Kind**: method of <code>[electron-builder/out/asar](#module_electron-builder/out/asar)</code>  

| Param | Type |
| --- | --- |
| archive | <code>string</code> | 
| file | <code>string</code> | 

<a name="module_electron-builder/out/asarUtil"></a>

## electron-builder/out/asarUtil

* [electron-builder/out/asarUtil](#module_electron-builder/out/asarUtil)
    * [.AsarPackager](#AsarPackager)
        * [`.compileUsingElectronCompile(files)`](#module_electron-builder/out/asarUtil.AsarPackager+compileUsingElectronCompile) ⇒ <code>Promise&lt;Array&lt;string&gt;&gt;</code>
        * [`.createPackageFromFiles(files)`](#module_electron-builder/out/asarUtil.AsarPackager+createPackageFromFiles) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.detectUnpackedDirs(files, autoUnpackDirs, unpackedDest)`](#module_electron-builder/out/asarUtil.AsarPackager+detectUnpackedDirs) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.pack(filter, isElectronCompile)`](#module_electron-builder/out/asarUtil.AsarPackager+pack) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.checkFileInArchive(asarFile, relativeFile, messagePrefix)`](#module_electron-builder/out/asarUtil.checkFileInArchive) ⇒ <code>Promise&lt;void&gt;</code>

<a name="AsarPackager"></a>

### AsarPackager
**Kind**: class of <code>[electron-builder/out/asarUtil](#module_electron-builder/out/asarUtil)</code>  

* [.AsarPackager](#AsarPackager)
    * [`.compileUsingElectronCompile(files)`](#module_electron-builder/out/asarUtil.AsarPackager+compileUsingElectronCompile) ⇒ <code>Promise&lt;Array&lt;string&gt;&gt;</code>
    * [`.createPackageFromFiles(files)`](#module_electron-builder/out/asarUtil.AsarPackager+createPackageFromFiles) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.detectUnpackedDirs(files, autoUnpackDirs, unpackedDest)`](#module_electron-builder/out/asarUtil.AsarPackager+detectUnpackedDirs) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.pack(filter, isElectronCompile)`](#module_electron-builder/out/asarUtil.AsarPackager+pack) ⇒ <code>Promise&lt;void&gt;</code>

<a name="module_electron-builder/out/asarUtil.AsarPackager+compileUsingElectronCompile"></a>

#### `asarPackager.compileUsingElectronCompile(files)` ⇒ <code>Promise&lt;Array&lt;string&gt;&gt;</code>
**Kind**: instance method of <code>[AsarPackager](#AsarPackager)</code>  

| Param | Type |
| --- | --- |
| files | <code>Array&lt;string&gt;</code> | 

<a name="module_electron-builder/out/asarUtil.AsarPackager+createPackageFromFiles"></a>

#### `asarPackager.createPackageFromFiles(files)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of <code>[AsarPackager](#AsarPackager)</code>  

| Param | Type |
| --- | --- |
| files | <code>Array&lt;string&gt;</code> | 

<a name="module_electron-builder/out/asarUtil.AsarPackager+detectUnpackedDirs"></a>

#### `asarPackager.detectUnpackedDirs(files, autoUnpackDirs, unpackedDest)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of <code>[AsarPackager](#AsarPackager)</code>  

| Param | Type |
| --- | --- |
| files | <code>Array&lt;string&gt;</code> | 
| autoUnpackDirs | <code>Set&lt;string&gt;</code> | 
| unpackedDest | <code>string</code> | 

<a name="module_electron-builder/out/asarUtil.AsarPackager+pack"></a>

#### `asarPackager.pack(filter, isElectronCompile)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of <code>[AsarPackager](#AsarPackager)</code>  

| Param | Type |
| --- | --- |
| filter | <code>module:electron-builder-util/out/fs.__type</code> | 
| isElectronCompile | <code>boolean</code> | 

<a name="module_electron-builder/out/asarUtil.checkFileInArchive"></a>

### `electron-builder/out/asarUtil.checkFileInArchive(asarFile, relativeFile, messagePrefix)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: method of <code>[electron-builder/out/asarUtil](#module_electron-builder/out/asarUtil)</code>  

| Param | Type |
| --- | --- |
| asarFile | <code>string</code> | 
| relativeFile | <code>string</code> | 
| messagePrefix | <code>string</code> | 

<a name="module_electron-builder/out/builder"></a>

## electron-builder/out/builder
<a name="module_electron-builder/out/builder.normalizeOptions"></a>

### `electron-builder/out/builder.normalizeOptions(args)` ⇒ <code>[BuildOptions](Options#BuildOptions)</code>
**Kind**: method of <code>[electron-builder/out/builder](#module_electron-builder/out/builder)</code>  

| Param | Type |
| --- | --- |
| args | <code>[CliOptions](Options#CliOptions)</code> | 

<a name="module_electron-builder/out/cli/cliOptions"></a>

## electron-builder/out/cli/cliOptions
<a name="module_electron-builder/out/cli/cliOptions.createYargs"></a>

### `electron-builder/out/cli/cliOptions.createYargs()` ⇒ <code>any</code>
**Kind**: method of <code>[electron-builder/out/cli/cliOptions](#module_electron-builder/out/cli/cliOptions)</code>  
<a name="module_electron-builder/out/codeSign"></a>

## electron-builder/out/codeSign

* [electron-builder/out/codeSign](#module_electron-builder/out/codeSign)
    * [`.CodeSigningInfo`](#CodeSigningInfo)
    * [`.findIdentityRawResult`](#module_electron-builder/out/codeSign.findIdentityRawResult) : <code>Promise&lt;Array&lt;string&gt;&gt;</code> \| <code>null</code>
    * [`.createKeychain(tmpDir, cscLink, cscKeyPassword, cscILink, cscIKeyPassword)`](#module_electron-builder/out/codeSign.createKeychain) ⇒ <code>Promise&lt;[CodeSigningInfo](#CodeSigningInfo)&gt;</code>
    * [`.downloadCertificate(urlOrBase64, tmpDir)`](#module_electron-builder/out/codeSign.downloadCertificate) ⇒ <code>Promise&lt;string&gt;</code>
    * [`.findIdentity(certType, qualifier, keychain)`](#module_electron-builder/out/codeSign.findIdentity) ⇒ <code>Promise&lt; \| string&gt;</code>
    * [`.sign(path, name, keychain)`](#module_electron-builder/out/codeSign.sign) ⇒ <code>Promise&lt;any&gt;</code>

<a name="CodeSigningInfo"></a>

### `CodeSigningInfo`
**Kind**: interface of <code>[electron-builder/out/codeSign](#module_electron-builder/out/codeSign)</code>  
**Properties**

| Name | Type |
| --- | --- |
| keychainName| <code>string</code> \| <code>null</code> | 

<a name="module_electron-builder/out/codeSign.findIdentityRawResult"></a>

### `electron-builder/out/codeSign.findIdentityRawResult` : <code>Promise&lt;Array&lt;string&gt;&gt;</code> \| <code>null</code>
**Kind**: property of <code>[electron-builder/out/codeSign](#module_electron-builder/out/codeSign)</code>  
<a name="module_electron-builder/out/codeSign.createKeychain"></a>

### `electron-builder/out/codeSign.createKeychain(tmpDir, cscLink, cscKeyPassword, cscILink, cscIKeyPassword)` ⇒ <code>Promise&lt;[CodeSigningInfo](#CodeSigningInfo)&gt;</code>
**Kind**: method of <code>[electron-builder/out/codeSign](#module_electron-builder/out/codeSign)</code>  

| Param | Type |
| --- | --- |
| tmpDir | <code>[TmpDir](electron-builder-util#TmpDir)</code> | 
| cscLink | <code>string</code> | 
| cscKeyPassword | <code>string</code> | 
| cscILink | <code>string</code> \| <code>null</code> | 
| cscIKeyPassword | <code>string</code> \| <code>null</code> | 

<a name="module_electron-builder/out/codeSign.downloadCertificate"></a>

### `electron-builder/out/codeSign.downloadCertificate(urlOrBase64, tmpDir)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: method of <code>[electron-builder/out/codeSign](#module_electron-builder/out/codeSign)</code>  

| Param | Type |
| --- | --- |
| urlOrBase64 | <code>string</code> | 
| tmpDir | <code>[TmpDir](electron-builder-util#TmpDir)</code> | 

<a name="module_electron-builder/out/codeSign.findIdentity"></a>

### `electron-builder/out/codeSign.findIdentity(certType, qualifier, keychain)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: method of <code>[electron-builder/out/codeSign](#module_electron-builder/out/codeSign)</code>  

| Param | Type |
| --- | --- |
| certType | <code>"Developer ID Application"</code> \| <code>"Developer ID Installer"</code> \| <code>"3rd Party Mac Developer Application"</code> \| <code>"3rd Party Mac Developer Installer"</code> \| <code>"Mac Developer"</code> | 
| qualifier | <code>string</code> \| <code>null</code> | 
| keychain | <code>string</code> \| <code>null</code> | 

<a name="module_electron-builder/out/codeSign.sign"></a>

### `electron-builder/out/codeSign.sign(path, name, keychain)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: method of <code>[electron-builder/out/codeSign](#module_electron-builder/out/codeSign)</code>  

| Param | Type |
| --- | --- |
| path | <code>string</code> | 
| name | <code>string</code> | 
| keychain | <code>string</code> | 

<a name="module_electron-builder/out/fileMatcher"></a>

## electron-builder/out/fileMatcher

* [electron-builder/out/fileMatcher](#module_electron-builder/out/fileMatcher)
    * [.FileMatcher](#FileMatcher)
        * [`.addAllPattern()`](#module_electron-builder/out/fileMatcher.FileMatcher+addAllPattern)
        * [`.addPattern(pattern)`](#module_electron-builder/out/fileMatcher.FileMatcher+addPattern)
        * [`.computeParsedPatterns(result, fromDir)`](#module_electron-builder/out/fileMatcher.FileMatcher+computeParsedPatterns)
        * [`.containsOnlyIgnore()`](#module_electron-builder/out/fileMatcher.FileMatcher+containsOnlyIgnore) ⇒ <code>boolean</code>
        * [`.createFilter(ignoreFiles, rawFilter, excludePatterns)`](#module_electron-builder/out/fileMatcher.FileMatcher+createFilter) ⇒ <code>module:electron-builder-util/out/fs.__type</code>
        * [`.isEmpty()`](#module_electron-builder/out/fileMatcher.FileMatcher+isEmpty) ⇒ <code>boolean</code>
    * [`.copyFiles(patterns)`](#module_electron-builder/out/fileMatcher.copyFiles) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.createFileMatcher(info, appDir, resourcesPath, macroExpander, platformSpecificBuildOptions)`](#module_electron-builder/out/fileMatcher.createFileMatcher) ⇒ <code>[FileMatcher](#FileMatcher)</code>
    * [`.getFileMatchers(config, name, defaultSrc, defaultDest, allowAdvancedMatching, macroExpander, customBuildOptions)`](#module_electron-builder/out/fileMatcher.getFileMatchers) ⇒ <code>null</code> \| <code>Array</code>

<a name="FileMatcher"></a>

### FileMatcher
**Kind**: class of <code>[electron-builder/out/fileMatcher](#module_electron-builder/out/fileMatcher)</code>  
**Properties**

| Name | Type |
| --- | --- |
| from| <code>string</code> | 
| to| <code>string</code> | 
| patterns| <code>Array&lt;string&gt;</code> | 


* [.FileMatcher](#FileMatcher)
    * [`.addAllPattern()`](#module_electron-builder/out/fileMatcher.FileMatcher+addAllPattern)
    * [`.addPattern(pattern)`](#module_electron-builder/out/fileMatcher.FileMatcher+addPattern)
    * [`.computeParsedPatterns(result, fromDir)`](#module_electron-builder/out/fileMatcher.FileMatcher+computeParsedPatterns)
    * [`.containsOnlyIgnore()`](#module_electron-builder/out/fileMatcher.FileMatcher+containsOnlyIgnore) ⇒ <code>boolean</code>
    * [`.createFilter(ignoreFiles, rawFilter, excludePatterns)`](#module_electron-builder/out/fileMatcher.FileMatcher+createFilter) ⇒ <code>module:electron-builder-util/out/fs.__type</code>
    * [`.isEmpty()`](#module_electron-builder/out/fileMatcher.FileMatcher+isEmpty) ⇒ <code>boolean</code>

<a name="module_electron-builder/out/fileMatcher.FileMatcher+addAllPattern"></a>

#### `fileMatcher.addAllPattern()`
**Kind**: instance method of <code>[FileMatcher](#FileMatcher)</code>  
<a name="module_electron-builder/out/fileMatcher.FileMatcher+addPattern"></a>

#### `fileMatcher.addPattern(pattern)`
**Kind**: instance method of <code>[FileMatcher](#FileMatcher)</code>  

| Param | Type |
| --- | --- |
| pattern | <code>string</code> | 

<a name="module_electron-builder/out/fileMatcher.FileMatcher+computeParsedPatterns"></a>

#### `fileMatcher.computeParsedPatterns(result, fromDir)`
**Kind**: instance method of <code>[FileMatcher](#FileMatcher)</code>  

| Param | Type |
| --- | --- |
| result | <code>Array&lt;minimatch:Minimatch&gt;</code> | 
| fromDir | <code>string</code> | 

<a name="module_electron-builder/out/fileMatcher.FileMatcher+containsOnlyIgnore"></a>

#### `fileMatcher.containsOnlyIgnore()` ⇒ <code>boolean</code>
**Kind**: instance method of <code>[FileMatcher](#FileMatcher)</code>  
<a name="module_electron-builder/out/fileMatcher.FileMatcher+createFilter"></a>

#### `fileMatcher.createFilter(ignoreFiles, rawFilter, excludePatterns)` ⇒ <code>module:electron-builder-util/out/fs.__type</code>
**Kind**: instance method of <code>[FileMatcher](#FileMatcher)</code>  

| Param | Type |
| --- | --- |
| ignoreFiles | <code>Set&lt;string&gt;</code> | 
| rawFilter | <code>callback</code> | 
| excludePatterns | <code>Array&lt;minimatch:Minimatch&gt;</code> \| <code>undefined</code> \| <code>null</code> | 

<a name="module_electron-builder/out/fileMatcher.FileMatcher+isEmpty"></a>

#### `fileMatcher.isEmpty()` ⇒ <code>boolean</code>
**Kind**: instance method of <code>[FileMatcher](#FileMatcher)</code>  
<a name="module_electron-builder/out/fileMatcher.copyFiles"></a>

### `electron-builder/out/fileMatcher.copyFiles(patterns)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: method of <code>[electron-builder/out/fileMatcher](#module_electron-builder/out/fileMatcher)</code>  

| Param | Type |
| --- | --- |
| patterns | <code>Array&lt;[FileMatcher](#FileMatcher)&gt;</code> \| <code>null</code> | 

<a name="module_electron-builder/out/fileMatcher.createFileMatcher"></a>

### `electron-builder/out/fileMatcher.createFileMatcher(info, appDir, resourcesPath, macroExpander, platformSpecificBuildOptions)` ⇒ <code>[FileMatcher](#FileMatcher)</code>
**Kind**: method of <code>[electron-builder/out/fileMatcher](#module_electron-builder/out/fileMatcher)</code>  

| Param | Type |
| --- | --- |
| info | <code>[BuildInfo](Options#BuildInfo)</code> | 
| appDir | <code>string</code> | 
| resourcesPath | <code>string</code> | 
| macroExpander | <code>callback</code> | 
| platformSpecificBuildOptions | <code>[PlatformSpecificBuildOptions](electron-builder-core#PlatformSpecificBuildOptions)</code> | 

<a name="module_electron-builder/out/fileMatcher.getFileMatchers"></a>

### `electron-builder/out/fileMatcher.getFileMatchers(config, name, defaultSrc, defaultDest, allowAdvancedMatching, macroExpander, customBuildOptions)` ⇒ <code>null</code> \| <code>Array</code>
**Kind**: method of <code>[electron-builder/out/fileMatcher](#module_electron-builder/out/fileMatcher)</code>  

| Param | Type |
| --- | --- |
| config | <code>[Config](Options#Config)</code> | 
| name | <code>"files"</code> \| <code>"extraFiles"</code> \| <code>"extraResources"</code> \| <code>"asarUnpack"</code> | 
| defaultSrc | <code>string</code> | 
| defaultDest | <code>string</code> | 
| allowAdvancedMatching | <code>boolean</code> | 
| macroExpander | <code>callback</code> | 
| customBuildOptions | <code>[PlatformSpecificBuildOptions](electron-builder-core#PlatformSpecificBuildOptions)</code> | 

<a name="module_electron-builder/out/fileTransformer"></a>

## electron-builder/out/fileTransformer

* [electron-builder/out/fileTransformer](#module_electron-builder/out/fileTransformer)
    * [`.CompilerHost`](#CompilerHost)
        * [`.compile(file)`](#module_electron-builder/out/fileTransformer.CompilerHost+compile) ⇒ <code>any</code>
        * [`.saveConfiguration()`](#module_electron-builder/out/fileTransformer.CompilerHost+saveConfiguration) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.createElectronCompilerHost(projectDir, cacheDir)`](#module_electron-builder/out/fileTransformer.createElectronCompilerHost) ⇒ <code>Promise&lt;[CompilerHost](#CompilerHost)&gt;</code>
    * [`.createTransformer(srcDir, extraMetadata)`](#module_electron-builder/out/fileTransformer.createTransformer) ⇒ <code>Promise&lt;module:electron-builder-util/out/fs.__type&gt;</code>
    * [`.isElectronCompileUsed(info)`](#module_electron-builder/out/fileTransformer.isElectronCompileUsed) ⇒ <code>boolean</code>

<a name="CompilerHost"></a>

### `CompilerHost`
**Kind**: interface of <code>[electron-builder/out/fileTransformer](#module_electron-builder/out/fileTransformer)</code>  

* [`.CompilerHost`](#CompilerHost)
    * [`.compile(file)`](#module_electron-builder/out/fileTransformer.CompilerHost+compile) ⇒ <code>any</code>
    * [`.saveConfiguration()`](#module_electron-builder/out/fileTransformer.CompilerHost+saveConfiguration) ⇒ <code>Promise&lt;any&gt;</code>

<a name="module_electron-builder/out/fileTransformer.CompilerHost+compile"></a>

#### `compilerHost.compile(file)` ⇒ <code>any</code>
**Kind**: instance method of <code>[CompilerHost](#CompilerHost)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 

<a name="module_electron-builder/out/fileTransformer.CompilerHost+saveConfiguration"></a>

#### `compilerHost.saveConfiguration()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[CompilerHost](#CompilerHost)</code>  
<a name="module_electron-builder/out/fileTransformer.createElectronCompilerHost"></a>

### `electron-builder/out/fileTransformer.createElectronCompilerHost(projectDir, cacheDir)` ⇒ <code>Promise&lt;[CompilerHost](#CompilerHost)&gt;</code>
**Kind**: method of <code>[electron-builder/out/fileTransformer](#module_electron-builder/out/fileTransformer)</code>  

| Param | Type |
| --- | --- |
| projectDir | <code>string</code> | 
| cacheDir | <code>string</code> | 

<a name="module_electron-builder/out/fileTransformer.createTransformer"></a>

### `electron-builder/out/fileTransformer.createTransformer(srcDir, extraMetadata)` ⇒ <code>Promise&lt;module:electron-builder-util/out/fs.__type&gt;</code>
**Kind**: method of <code>[electron-builder/out/fileTransformer](#module_electron-builder/out/fileTransformer)</code>  

| Param | Type |
| --- | --- |
| srcDir | <code>string</code> | 
| extraMetadata | <code>any</code> | 

<a name="module_electron-builder/out/fileTransformer.isElectronCompileUsed"></a>

### `electron-builder/out/fileTransformer.isElectronCompileUsed(info)` ⇒ <code>boolean</code>
**Kind**: method of <code>[electron-builder/out/fileTransformer](#module_electron-builder/out/fileTransformer)</code>  

| Param | Type |
| --- | --- |
| info | <code>[BuildInfo](Options#BuildInfo)</code> | 

<a name="module_electron-builder/out/linuxPackager"></a>

## electron-builder/out/linuxPackager

* [electron-builder/out/linuxPackager](#module_electron-builder/out/linuxPackager)
    * [.LinuxPackager](#LinuxPackager) ⇐ <code>[PlatformPackager](#PlatformPackager)</code>
        * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/linuxPackager.LinuxPackager+createTargets)
        * [`.postInitApp(appOutDir)`](#module_electron-builder/out/linuxPackager.LinuxPackager+postInitApp) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise&lt; \| string&gt;</code>
        * [`.dispatchArtifactCreated(file, target, arch, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
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
**Kind**: class of <code>[electron-builder/out/linuxPackager](#module_electron-builder/out/linuxPackager)</code>  
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
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  
**Overrides**: <code>[createTargets](#module_electron-builder/out/platformPackager.PlatformPackager+createTargets)</code>  

| Param | Type |
| --- | --- |
| targets | <code>Array&lt;string&gt;</code> | 
| mapper | <code>callback</code> | 
| cleanupTasks | <code>Array&lt;module:electron-builder/out/linuxPackager.__type&gt;</code> | 

<a name="module_electron-builder/out/linuxPackager.LinuxPackager+postInitApp"></a>

#### `linuxPackager.postInitApp(appOutDir)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  
**Overrides**: <code>[postInitApp](#module_electron-builder/out/platformPackager.PlatformPackager+postInitApp)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon"></a>

#### `linuxPackager.getDefaultIcon(ext)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated"></a>

#### `linuxPackager.dispatchArtifactCreated(file, target, arch, safeArtifactName)`
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| target | <code>[Target](electron-builder-core#Target)</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 
| safeArtifactName | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern"></a>

#### `linuxPackager.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[TargetSpecificOptions](electron-builder-core#TargetSpecificOptions)</code> \| <code>undefined</code> \| <code>null</code> | 
| ext | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 
| defaultPattern | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandMacro"></a>

#### `linuxPackager.expandMacro(pattern, arch, extra)` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| pattern | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>undefined</code> \| <code>null</code> | 
| extra | <code>any</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName"></a>

#### `linuxPackager.generateName(ext, arch, deployment, classifier)` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| deployment | <code>boolean</code> | 
| classifier | <code>string</code> \| <code>null</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName2"></a>

#### `linuxPackager.generateName2(ext, classifier, deployment)` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> \| <code>null</code> | 
| classifier | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 
| deployment | <code>boolean</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getIconPath"></a>

#### `linuxPackager.getIconPath()` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir"></a>

#### `linuxPackager.getMacOsResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+pack"></a>

#### `linuxPackager.pack(outDir, arch, targets, postAsyncTasks)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 
| postAsyncTasks | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResource"></a>

#### `linuxPackager.getResource(custom, names)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| custom | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 
| names | <code>Array&lt;string&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir"></a>

#### `linuxPackager.getResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getTempFile"></a>

#### `linuxPackager.getTempFile(suffix)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| suffix | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir"></a>

#### `linuxPackager.computeAppOutDir(outDir, arch)` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword"></a>

#### `linuxPackager.getCscPassword()` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  
**Access**: protected  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword"></a>

#### `linuxPackager.doGetCscPassword()` ⇒ <code>any</code>
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  
**Access**: protected  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+doPack"></a>

#### `linuxPackager.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  
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
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 
| postAsyncTasks | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo"></a>

#### `linuxPackager.prepareAppInfo(appInfo)` ⇒ <code>[AppInfo](#AppInfo)</code>
**Kind**: instance method of <code>[LinuxPackager](#LinuxPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appInfo | <code>[AppInfo](#AppInfo)</code> | 

<a name="module_electron-builder/out/macPackager"></a>

## electron-builder/out/macPackager

* [electron-builder/out/macPackager](#module_electron-builder/out/macPackager)
    * [.MacPackager](#MacPackager) ⇐ <code>[PlatformPackager](#PlatformPackager)</code>
        * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/macPackager.MacPackager+createTargets)
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
**Kind**: class of <code>[electron-builder/out/macPackager](#module_electron-builder/out/macPackager)</code>  
**Extends**: <code>[PlatformPackager](#PlatformPackager)</code>  
**Properties**

| Name | Type |
| --- | --- |
| codeSigningInfo| <code>Promise&lt;[CodeSigningInfo](#CodeSigningInfo)&gt;</code> | 


* [.MacPackager](#MacPackager) ⇐ <code>[PlatformPackager](#PlatformPackager)</code>
    * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/macPackager.MacPackager+createTargets)
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
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  
**Overrides**: <code>[createTargets](#module_electron-builder/out/platformPackager.PlatformPackager+createTargets)</code>  

| Param | Type |
| --- | --- |
| targets | <code>Array&lt;string&gt;</code> | 
| mapper | <code>callback</code> | 
| cleanupTasks | <code>Array&lt;module:electron-builder/out/macPackager.__type&gt;</code> | 

<a name="module_electron-builder/out/macPackager.MacPackager+getIconPath"></a>

#### `macPackager.getIconPath()` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  
**Overrides**: <code>[getIconPath](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath)</code>  
<a name="module_electron-builder/out/macPackager.MacPackager+pack"></a>

#### `macPackager.pack(outDir, arch, targets, postAsyncTasks)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  
**Overrides**: <code>[pack](#module_electron-builder/out/platformPackager.PlatformPackager+pack)</code>  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 
| postAsyncTasks | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder/out/macPackager.MacPackager+doFlat"></a>

#### `macPackager.doFlat(appPath, outFile, identity, keychain)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appPath | <code>string</code> | 
| outFile | <code>string</code> | 
| identity | <code>string</code> | 
| keychain | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 

<a name="module_electron-builder/out/macPackager.MacPackager+doSign"></a>

#### `macPackager.doSign(opts)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| opts | <code>module:electron-osx-sign.SignOptions</code> | 

<a name="module_electron-builder/out/macPackager.MacPackager+prepareAppInfo"></a>

#### `macPackager.prepareAppInfo(appInfo)` ⇒ <code>[AppInfo](#AppInfo)</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  
**Overrides**: <code>[prepareAppInfo](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appInfo | <code>[AppInfo](#AppInfo)</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon"></a>

#### `macPackager.getDefaultIcon(ext)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated"></a>

#### `macPackager.dispatchArtifactCreated(file, target, arch, safeArtifactName)`
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| target | <code>[Target](electron-builder-core#Target)</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 
| safeArtifactName | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern"></a>

#### `macPackager.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)` ⇒ <code>string</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[TargetSpecificOptions](electron-builder-core#TargetSpecificOptions)</code> \| <code>undefined</code> \| <code>null</code> | 
| ext | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 
| defaultPattern | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandMacro"></a>

#### `macPackager.expandMacro(pattern, arch, extra)` ⇒ <code>string</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  

| Param | Type |
| --- | --- |
| pattern | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>undefined</code> \| <code>null</code> | 
| extra | <code>any</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName"></a>

#### `macPackager.generateName(ext, arch, deployment, classifier)` ⇒ <code>string</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| deployment | <code>boolean</code> | 
| classifier | <code>string</code> \| <code>null</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName2"></a>

#### `macPackager.generateName2(ext, classifier, deployment)` ⇒ <code>string</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> \| <code>null</code> | 
| classifier | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 
| deployment | <code>boolean</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir"></a>

#### `macPackager.getMacOsResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResource"></a>

#### `macPackager.getResource(custom, names)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  

| Param | Type |
| --- | --- |
| custom | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 
| names | <code>Array&lt;string&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir"></a>

#### `macPackager.getResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getTempFile"></a>

#### `macPackager.getTempFile(suffix)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  

| Param | Type |
| --- | --- |
| suffix | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir"></a>

#### `macPackager.computeAppOutDir(outDir, arch)` ⇒ <code>string</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword"></a>

#### `macPackager.getCscPassword()` ⇒ <code>string</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  
**Access**: protected  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword"></a>

#### `macPackager.doGetCscPassword()` ⇒ <code>any</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  
**Access**: protected  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+doPack"></a>

#### `macPackager.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  
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
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 
| postAsyncTasks | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+postInitApp"></a>

#### `macPackager.postInitApp(executableFile)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[MacPackager](#MacPackager)</code>  
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
**Kind**: interface of <code>[electron-builder/out/options/linuxOptions](#module_electron-builder/out/options/linuxOptions)</code>  
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
**Kind**: interface of <code>[electron-builder/out/options/linuxOptions](#module_electron-builder/out/options/linuxOptions)</code>  
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
**Kind**: interface of <code>[electron-builder/out/options/winOptions](#module_electron-builder/out/options/winOptions)</code>  
**Properties**

| Name | Type |
| --- | --- |
| unicode| <code>boolean</code> | 
| guid| <code>string</code> \| <code>null</code> | 
| warningsAsErrors| <code>boolean</code> | 

<a name="module_electron-builder/out/packager/dirPackager"></a>

## electron-builder/out/packager/dirPackager

* [electron-builder/out/packager/dirPackager](#module_electron-builder/out/packager/dirPackager)
    * [`.unpackElectron(packager, out, platform, arch, version)`](#module_electron-builder/out/packager/dirPackager.unpackElectron) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.unpackMuon(packager, out, platform, arch, version)`](#module_electron-builder/out/packager/dirPackager.unpackMuon) ⇒ <code>Promise&lt;void&gt;</code>

<a name="module_electron-builder/out/packager/dirPackager.unpackElectron"></a>

### `electron-builder/out/packager/dirPackager.unpackElectron(packager, out, platform, arch, version)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: method of <code>[electron-builder/out/packager/dirPackager](#module_electron-builder/out/packager/dirPackager)</code>  

| Param | Type |
| --- | --- |
| packager | <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 
| out | <code>string</code> | 
| platform | <code>string</code> | 
| arch | <code>string</code> | 
| version | <code>string</code> | 

<a name="module_electron-builder/out/packager/dirPackager.unpackMuon"></a>

### `electron-builder/out/packager/dirPackager.unpackMuon(packager, out, platform, arch, version)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: method of <code>[electron-builder/out/packager/dirPackager](#module_electron-builder/out/packager/dirPackager)</code>  

| Param | Type |
| --- | --- |
| packager | <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 
| out | <code>string</code> | 
| platform | <code>string</code> | 
| arch | <code>string</code> | 
| version | <code>string</code> | 

<a name="module_electron-builder/out/packager/mac"></a>

## electron-builder/out/packager/mac

* [electron-builder/out/packager/mac](#module_electron-builder/out/packager/mac)
    * [`.createApp(packager, appOutDir)`](#module_electron-builder/out/packager/mac.createApp) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.filterCFBundleIdentifier(identifier)`](#module_electron-builder/out/packager/mac.filterCFBundleIdentifier) ⇒ <code>string</code>

<a name="module_electron-builder/out/packager/mac.createApp"></a>

### `electron-builder/out/packager/mac.createApp(packager, appOutDir)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: method of <code>[electron-builder/out/packager/mac](#module_electron-builder/out/packager/mac)</code>  

| Param | Type |
| --- | --- |
| packager | <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/packager/mac.filterCFBundleIdentifier"></a>

### `electron-builder/out/packager/mac.filterCFBundleIdentifier(identifier)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-builder/out/packager/mac](#module_electron-builder/out/packager/mac)</code>  

| Param | Type |
| --- | --- |
| identifier | <code>string</code> | 

<a name="module_electron-builder/out/packager"></a>

## electron-builder/out/packager
<a name="module_electron-builder/out/packager.normalizePlatforms"></a>

### `electron-builder/out/packager.normalizePlatforms(rawPlatforms)` ⇒ <code>Array&lt;[Platform](electron-builder-core#Platform)&gt;</code>
**Kind**: method of <code>[electron-builder/out/packager](#module_electron-builder/out/packager)</code>  

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
**Kind**: class of <code>[electron-builder/out/platformPackager](#module_electron-builder/out/platformPackager)</code>  
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
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| targets | <code>Array&lt;string&gt;</code> | 
| mapper | <code>callback</code> | 
| cleanupTasks | <code>Array&lt;module:electron-builder/out/platformPackager.__type&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon"></a>

#### `platformPackager.getDefaultIcon(ext)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated"></a>

#### `platformPackager.dispatchArtifactCreated(file, target, arch, safeArtifactName)`
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| target | <code>[Target](electron-builder-core#Target)</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 
| safeArtifactName | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern"></a>

#### `platformPackager.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)` ⇒ <code>string</code>
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[TargetSpecificOptions](electron-builder-core#TargetSpecificOptions)</code> \| <code>undefined</code> \| <code>null</code> | 
| ext | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 
| defaultPattern | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandMacro"></a>

#### `platformPackager.expandMacro(pattern, arch, extra)` ⇒ <code>string</code>
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| pattern | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>undefined</code> \| <code>null</code> | 
| extra | <code>any</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName"></a>

#### `platformPackager.generateName(ext, arch, deployment, classifier)` ⇒ <code>string</code>
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| deployment | <code>boolean</code> | 
| classifier | <code>string</code> \| <code>null</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName2"></a>

#### `platformPackager.generateName2(ext, classifier, deployment)` ⇒ <code>string</code>
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> \| <code>null</code> | 
| classifier | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 
| deployment | <code>boolean</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getIconPath"></a>

#### `platformPackager.getIconPath()` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir"></a>

#### `platformPackager.getMacOsResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+pack"></a>

#### `platformPackager.pack(outDir, arch, targets, postAsyncTasks)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 
| postAsyncTasks | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResource"></a>

#### `platformPackager.getResource(custom, names)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| custom | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 
| names | <code>Array&lt;string&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir"></a>

#### `platformPackager.getResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getTempFile"></a>

#### `platformPackager.getTempFile(suffix)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| suffix | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir"></a>

#### `platformPackager.computeAppOutDir(outDir, arch)` ⇒ <code>string</code>
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword"></a>

#### `platformPackager.getCscPassword()` ⇒ <code>string</code>
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  
**Access**: protected  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword"></a>

#### `platformPackager.doGetCscPassword()` ⇒ <code>any</code>
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  
**Access**: protected  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+doPack"></a>

#### `platformPackager.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  
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
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 
| postAsyncTasks | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+postInitApp"></a>

#### `platformPackager.postInitApp(executableFile)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| executableFile | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo"></a>

#### `platformPackager.prepareAppInfo(appInfo)` ⇒ <code>[AppInfo](#AppInfo)</code>
**Kind**: instance method of <code>[PlatformPackager](#PlatformPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appInfo | <code>[AppInfo](#AppInfo)</code> | 

<a name="module_electron-builder/out/platformPackager.normalizeExt"></a>

### `electron-builder/out/platformPackager.normalizeExt(ext)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-builder/out/platformPackager](#module_electron-builder/out/platformPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> | 

<a name="module_electron-builder/out/publish/PublishManager"></a>

## electron-builder/out/publish/PublishManager

* [electron-builder/out/publish/PublishManager](#module_electron-builder/out/publish/PublishManager)
    * [.PublishManager](#PublishManager) ⇐ <code>[PublishContext](electron-publish#PublishContext)</code>
        * [`.awaitTasks()`](#module_electron-builder/out/publish/PublishManager.PublishManager+awaitTasks) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.cancelTasks()`](#module_electron-builder/out/publish/PublishManager.PublishManager+cancelTasks)
        * [`.getOrCreatePublisher(publishConfig, buildInfo)`](#module_electron-builder/out/publish/PublishManager.PublishManager+getOrCreatePublisher) ⇒ <code>null</code> \| <code>[Publisher](electron-publish#Publisher)</code>
    * [`.computeDownloadUrl(publishConfig, fileName, packager)`](#module_electron-builder/out/publish/PublishManager.computeDownloadUrl) ⇒ <code>string</code>
    * [`.createPublisher(context, version, publishConfig, options)`](#module_electron-builder/out/publish/PublishManager.createPublisher) ⇒ <code>null</code> \| <code>[Publisher](electron-publish#Publisher)</code>
    * [`.getPublishConfigs(packager, targetSpecificOptions, arch)`](#module_electron-builder/out/publish/PublishManager.getPublishConfigs) ⇒ <code>Promise&lt; \| Array&gt;</code>
    * [`.getPublishConfigsForUpdateInfo(packager, publishConfigs, arch)`](#module_electron-builder/out/publish/PublishManager.getPublishConfigsForUpdateInfo) ⇒ <code>Promise&lt; \| Array&gt;</code>

<a name="PublishManager"></a>

### PublishManager ⇐ <code>[PublishContext](electron-publish#PublishContext)</code>
**Kind**: class of <code>[electron-builder/out/publish/PublishManager](#module_electron-builder/out/publish/PublishManager)</code>  
**Extends**: <code>[PublishContext](electron-publish#PublishContext)</code>  
**Properties**

| Name | Type |
| --- | --- |
| publishTasks=| <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 
| progress = <code>(&lt;NodeJS.WritableStream&gt;process.stdout).isTTY ? new MultiProgress() : null</code>| <code>null</code> \| <code>[MultiProgress](electron-publish#MultiProgress)</code> | 


* [.PublishManager](#PublishManager) ⇐ <code>[PublishContext](electron-publish#PublishContext)</code>
    * [`.awaitTasks()`](#module_electron-builder/out/publish/PublishManager.PublishManager+awaitTasks) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.cancelTasks()`](#module_electron-builder/out/publish/PublishManager.PublishManager+cancelTasks)
    * [`.getOrCreatePublisher(publishConfig, buildInfo)`](#module_electron-builder/out/publish/PublishManager.PublishManager+getOrCreatePublisher) ⇒ <code>null</code> \| <code>[Publisher](electron-publish#Publisher)</code>

<a name="module_electron-builder/out/publish/PublishManager.PublishManager+awaitTasks"></a>

#### `publishManager.awaitTasks()` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of <code>[PublishManager](#PublishManager)</code>  
<a name="module_electron-builder/out/publish/PublishManager.PublishManager+cancelTasks"></a>

#### `publishManager.cancelTasks()`
**Kind**: instance method of <code>[PublishManager](#PublishManager)</code>  
<a name="module_electron-builder/out/publish/PublishManager.PublishManager+getOrCreatePublisher"></a>

#### `publishManager.getOrCreatePublisher(publishConfig, buildInfo)` ⇒ <code>null</code> \| <code>[Publisher](electron-publish#Publisher)</code>
**Kind**: instance method of <code>[PublishManager](#PublishManager)</code>  

| Param | Type |
| --- | --- |
| publishConfig | <code>[PublishConfiguration](Publishing-Artifacts#PublishConfiguration)</code> | 
| buildInfo | <code>[BuildInfo](Options#BuildInfo)</code> | 

<a name="module_electron-builder/out/publish/PublishManager.computeDownloadUrl"></a>

### `electron-builder/out/publish/PublishManager.computeDownloadUrl(publishConfig, fileName, packager)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-builder/out/publish/PublishManager](#module_electron-builder/out/publish/PublishManager)</code>  

| Param | Type |
| --- | --- |
| publishConfig | <code>[PublishConfiguration](Publishing-Artifacts#PublishConfiguration)</code> | 
| fileName | <code>string</code> \| <code>null</code> | 
| packager | <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 

<a name="module_electron-builder/out/publish/PublishManager.createPublisher"></a>

### `electron-builder/out/publish/PublishManager.createPublisher(context, version, publishConfig, options)` ⇒ <code>null</code> \| <code>[Publisher](electron-publish#Publisher)</code>
**Kind**: method of <code>[electron-builder/out/publish/PublishManager](#module_electron-builder/out/publish/PublishManager)</code>  

| Param | Type |
| --- | --- |
| context | <code>[PublishContext](electron-publish#PublishContext)</code> | 
| version | <code>string</code> | 
| publishConfig | <code>[PublishConfiguration](Publishing-Artifacts#PublishConfiguration)</code> | 
| options | <code>[PublishOptions](electron-publish#PublishOptions)</code> | 

<a name="module_electron-builder/out/publish/PublishManager.getPublishConfigs"></a>

### `electron-builder/out/publish/PublishManager.getPublishConfigs(packager, targetSpecificOptions, arch)` ⇒ <code>Promise&lt; \| Array&gt;</code>
**Kind**: method of <code>[electron-builder/out/publish/PublishManager](#module_electron-builder/out/publish/PublishManager)</code>  

| Param | Type |
| --- | --- |
| packager | <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 
| targetSpecificOptions | <code>[PlatformSpecificBuildOptions](electron-builder-core#PlatformSpecificBuildOptions)</code> \| <code>null</code> \| <code>undefined</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 

<a name="module_electron-builder/out/publish/PublishManager.getPublishConfigsForUpdateInfo"></a>

### `electron-builder/out/publish/PublishManager.getPublishConfigsForUpdateInfo(packager, publishConfigs, arch)` ⇒ <code>Promise&lt; \| Array&gt;</code>
**Kind**: method of <code>[electron-builder/out/publish/PublishManager](#module_electron-builder/out/publish/PublishManager)</code>  

| Param | Type |
| --- | --- |
| packager | <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 
| publishConfigs | <code>Array&lt;[PublishConfiguration](Publishing-Artifacts#PublishConfiguration)&gt;</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 

<a name="module_electron-builder/out/readInstalled"></a>

## electron-builder/out/readInstalled

* [electron-builder/out/readInstalled](#module_electron-builder/out/readInstalled)
    * [`.Dependency`](#Dependency)
    * [`.readInstalled(folder)`](#module_electron-builder/out/readInstalled.readInstalled) ⇒ <code>Promise&lt;Map&lt;string \| [Dependency](#Dependency)&gt;&gt;</code>

<a name="Dependency"></a>

### `Dependency`
**Kind**: interface of <code>[electron-builder/out/readInstalled](#module_electron-builder/out/readInstalled)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **name**| <code>string</code> | 
| **path**| <code>string</code> | 
| **extraneous**| <code>boolean</code> | 
| **optional**| <code>boolean</code> | 
| **dependencies**| <code>Object&lt;string, any&gt;</code> | 

<a name="module_electron-builder/out/readInstalled.readInstalled"></a>

### `electron-builder/out/readInstalled.readInstalled(folder)` ⇒ <code>Promise&lt;Map&lt;string \| [Dependency](#Dependency)&gt;&gt;</code>
**Kind**: method of <code>[electron-builder/out/readInstalled](#module_electron-builder/out/readInstalled)</code>  

| Param | Type |
| --- | --- |
| folder | <code>string</code> | 

<a name="module_electron-builder/out/repositoryInfo"></a>

## electron-builder/out/repositoryInfo

* [electron-builder/out/repositoryInfo](#module_electron-builder/out/repositoryInfo)
    * [`.RepositorySlug`](#RepositorySlug)
    * [`.getRepositoryInfo(projectDir, metadata, devMetadata)`](#module_electron-builder/out/repositoryInfo.getRepositoryInfo) ⇒ <code>Promise&lt; \| module:hosted-git-info.Info&gt;</code>

<a name="RepositorySlug"></a>

### `RepositorySlug`
**Kind**: interface of <code>[electron-builder/out/repositoryInfo](#module_electron-builder/out/repositoryInfo)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **user**| <code>string</code> | 
| **project**| <code>string</code> | 

<a name="module_electron-builder/out/repositoryInfo.getRepositoryInfo"></a>

### `electron-builder/out/repositoryInfo.getRepositoryInfo(projectDir, metadata, devMetadata)` ⇒ <code>Promise&lt; \| module:hosted-git-info.Info&gt;</code>
**Kind**: method of <code>[electron-builder/out/repositoryInfo](#module_electron-builder/out/repositoryInfo)</code>  

| Param | Type |
| --- | --- |
| projectDir | <code>string</code> | 
| metadata | <code>[Metadata](Options#Metadata)</code> | 
| devMetadata | <code>[Metadata](Options#Metadata)</code> | 

<a name="module_electron-builder/out/targets/appImage"></a>

## electron-builder/out/targets/appImage

* [electron-builder/out/targets/appImage](#module_electron-builder/out/targets/appImage)
    * [.AppImageTarget](#AppImageTarget) ⇐ <code>[Target](electron-builder-core#Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/appImage.AppImageTarget+build) ⇒ <code>Promise&lt;any&gt;</code>

<a name="AppImageTarget"></a>

### AppImageTarget ⇐ <code>[Target](electron-builder-core#Target)</code>
**Kind**: class of <code>[electron-builder/out/targets/appImage](#module_electron-builder/out/targets/appImage)</code>  
**Extends**: <code>[Target](electron-builder-core#Target)</code>  
**Properties**

| Name | Type |
| --- | --- |
| options = <code>Object.assign({}, this.packager.platformSpecificBuildOptions, (&lt;any&gt;this.packager.config)[this.name])</code>| <code>[LinuxBuildOptions](Options#LinuxBuildOptions)</code> | 

<a name="module_electron-builder/out/targets/appImage.AppImageTarget+build"></a>

#### `appImageTarget.build(appOutDir, arch)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[AppImageTarget](#AppImageTarget)</code>  

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
**Kind**: class of <code>[electron-builder/out/targets/appx](#module_electron-builder/out/targets/appx)</code>  
**Extends**: <code>[Target](electron-builder-core#Target)</code>  
**Properties**

| Name | Type |
| --- | --- |
| options = <code>Object.assign({}, this.packager.platformSpecificBuildOptions, this.packager.config.appx)</code>| <code>[AppXOptions](Options#AppXOptions)</code> | 

<a name="module_electron-builder/out/targets/appx.AppXTarget+build"></a>

#### `appXTarget.build(appOutDir, arch)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[AppXTarget](#AppXTarget)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/targets/archive"></a>

## electron-builder/out/targets/archive

* [electron-builder/out/targets/archive](#module_electron-builder/out/targets/archive)
    * [`.archive(compression, format, outFile, dirToArchive, withoutDir)`](#module_electron-builder/out/targets/archive.archive) ⇒ <code>Promise&lt;string&gt;</code>
    * [`.tar(compression, format, outFile, dirToArchive, isMacApp)`](#module_electron-builder/out/targets/archive.tar) ⇒ <code>Promise&lt;string&gt;</code>

<a name="module_electron-builder/out/targets/archive.archive"></a>

### `electron-builder/out/targets/archive.archive(compression, format, outFile, dirToArchive, withoutDir)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: method of <code>[electron-builder/out/targets/archive](#module_electron-builder/out/targets/archive)</code>  

| Param | Type |
| --- | --- |
| compression | <code>"store"</code> \| <code>"normal"</code> \| <code>"maximum"</code> \| <code>undefined</code> \| <code>null</code> | 
| format | <code>string</code> | 
| outFile | <code>string</code> | 
| dirToArchive | <code>string</code> | 
| withoutDir | <code>boolean</code> | 

<a name="module_electron-builder/out/targets/archive.tar"></a>

### `electron-builder/out/targets/archive.tar(compression, format, outFile, dirToArchive, isMacApp)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: method of <code>[electron-builder/out/targets/archive](#module_electron-builder/out/targets/archive)</code>  

| Param | Type |
| --- | --- |
| compression | <code>"store"</code> \| <code>"normal"</code> \| <code>"maximum"</code> \| <code>undefined</code> \| <code>null</code> | 
| format | <code>string</code> | 
| outFile | <code>string</code> | 
| dirToArchive | <code>string</code> | 
| isMacApp | <code>boolean</code> | 

<a name="module_electron-builder/out/targets/ArchiveTarget"></a>

## electron-builder/out/targets/ArchiveTarget

* [electron-builder/out/targets/ArchiveTarget](#module_electron-builder/out/targets/ArchiveTarget)
    * [.ArchiveTarget](#ArchiveTarget) ⇐ <code>[Target](electron-builder-core#Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/ArchiveTarget.ArchiveTarget+build) ⇒ <code>Promise&lt;any&gt;</code>

<a name="ArchiveTarget"></a>

### ArchiveTarget ⇐ <code>[Target](electron-builder-core#Target)</code>
**Kind**: class of <code>[electron-builder/out/targets/ArchiveTarget](#module_electron-builder/out/targets/ArchiveTarget)</code>  
**Extends**: <code>[Target](electron-builder-core#Target)</code>  
**Properties**

| Name | Type |
| --- | --- |
| options = <code>(&lt;any&gt;this.packager.config)[this.name]</code>| <code>any</code> | 

<a name="module_electron-builder/out/targets/ArchiveTarget.ArchiveTarget+build"></a>

#### `archiveTarget.build(appOutDir, arch)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[ArchiveTarget](#ArchiveTarget)</code>  

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
**Kind**: class of <code>[electron-builder/out/targets/dmg](#module_electron-builder/out/targets/dmg)</code>  
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
**Kind**: instance method of <code>[DmgTarget](#DmgTarget)</code>  

| Param | Type |
| --- | --- |
| appPath | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/targets/dmg.DmgTarget+computeDmgOptions"></a>

#### `dmgTarget.computeDmgOptions()` ⇒ <code>Promise&lt;[DmgOptions](Options#DmgOptions)&gt;</code>
**Kind**: instance method of <code>[DmgTarget](#DmgTarget)</code>  
<a name="module_electron-builder/out/targets/dmg.DmgTarget+computeVolumeName"></a>

#### `dmgTarget.computeVolumeName(custom)` ⇒ <code>string</code>
**Kind**: instance method of <code>[DmgTarget](#DmgTarget)</code>  

| Param | Type |
| --- | --- |
| custom | <code>string</code> \| <code>null</code> | 

<a name="module_electron-builder/out/targets/dmg.attachAndExecute"></a>

### `electron-builder/out/targets/dmg.attachAndExecute(dmgPath, readWrite, task)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: method of <code>[electron-builder/out/targets/dmg](#module_electron-builder/out/targets/dmg)</code>  

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
**Kind**: class of <code>[electron-builder/out/targets/fpm](#module_electron-builder/out/targets/fpm)</code>  
**Extends**: <code>[Target](electron-builder-core#Target)</code>  
**Properties**

| Name | Type |
| --- | --- |
| options = <code>Object.assign({}, this.packager.platformSpecificBuildOptions, (&lt;any&gt;this.packager.config)[this.name])</code>| <code>[LinuxTargetSpecificOptions](#LinuxTargetSpecificOptions)</code> | 

<a name="module_electron-builder/out/targets/fpm.FpmTarget+build"></a>

#### `fpmTarget.build(appOutDir, arch)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[FpmTarget](#FpmTarget)</code>  

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
**Kind**: class of <code>[electron-builder/out/targets/LinuxTargetHelper](#module_electron-builder/out/targets/LinuxTargetHelper)</code>  
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
**Kind**: instance method of <code>[LinuxTargetHelper](#LinuxTargetHelper)</code>  

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[LinuxTargetSpecificOptions](#LinuxTargetSpecificOptions)</code> | 
| exec | <code>string</code> | 
| destination | <code>string</code> \| <code>null</code> | 
| extra | <code>Object&lt;string, any&gt;</code> | 

<a name="module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper+getDescription"></a>

#### `linuxTargetHelper.getDescription(options)` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxTargetHelper](#LinuxTargetHelper)</code>  

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
**Kind**: class of <code>[electron-builder/out/targets/nsis](#module_electron-builder/out/targets/nsis)</code>  

* [.AppPackageHelper](#AppPackageHelper)
    * [`.finishBuild()`](#module_electron-builder/out/targets/nsis.AppPackageHelper+finishBuild) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.packArch(arch, target)`](#module_electron-builder/out/targets/nsis.AppPackageHelper+packArch) ⇒ <code>Promise&lt;string&gt;</code>

<a name="module_electron-builder/out/targets/nsis.AppPackageHelper+finishBuild"></a>

#### `appPackageHelper.finishBuild()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[AppPackageHelper](#AppPackageHelper)</code>  
<a name="module_electron-builder/out/targets/nsis.AppPackageHelper+packArch"></a>

#### `appPackageHelper.packArch(arch, target)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: instance method of <code>[AppPackageHelper](#AppPackageHelper)</code>  

| Param | Type |
| --- | --- |
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| target | <code>[NsisTarget](#NsisTarget)</code> | 

<a name="NsisTarget"></a>

### NsisTarget ⇐ <code>[Target](electron-builder-core#Target)</code>
**Kind**: class of <code>[electron-builder/out/targets/nsis](#module_electron-builder/out/targets/nsis)</code>  
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
**Kind**: instance method of <code>[NsisTarget](#NsisTarget)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/targets/nsis.NsisTarget+finishBuild"></a>

#### `nsisTarget.finishBuild()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[NsisTarget](#NsisTarget)</code>  
<a name="module_electron-builder/out/targets/nsis.NsisTarget+configureDefines"></a>

#### `nsisTarget.configureDefines(oneClick, defines)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of <code>[NsisTarget](#NsisTarget)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| oneClick | <code>boolean</code> | 
| defines | <code>any</code> | 

<a name="module_electron-builder/out/targets/nsis.NsisTarget+generateGitHubInstallerName"></a>

#### `nsisTarget.generateGitHubInstallerName()` ⇒ <code>string</code>
**Kind**: instance method of <code>[NsisTarget](#NsisTarget)</code>  
**Access**: protected  
<a name="module_electron-builder/out/targets/pkg"></a>

## electron-builder/out/targets/pkg

* [electron-builder/out/targets/pkg](#module_electron-builder/out/targets/pkg)
    * [.PkgTarget](#PkgTarget) ⇐ <code>[Target](electron-builder-core#Target)</code>
        * [`.build(appPath, arch)`](#module_electron-builder/out/targets/pkg.PkgTarget+build) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.prepareProductBuildArgs(identity, keychain)`](#module_electron-builder/out/targets/pkg.prepareProductBuildArgs) ⇒ <code>Array&lt;string&gt;</code>

<a name="PkgTarget"></a>

### PkgTarget ⇐ <code>[Target](electron-builder-core#Target)</code>
**Kind**: class of <code>[electron-builder/out/targets/pkg](#module_electron-builder/out/targets/pkg)</code>  
**Extends**: <code>[Target](electron-builder-core#Target)</code>  
**Properties**

| Name | Type |
| --- | --- |
| options = <code>this.packager.config.pkg || Object.create(null)</code>| <code>[PkgOptions](Options#PkgOptions)</code> | 

<a name="module_electron-builder/out/targets/pkg.PkgTarget+build"></a>

#### `pkgTarget.build(appPath, arch)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[PkgTarget](#PkgTarget)</code>  

| Param | Type |
| --- | --- |
| appPath | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/targets/pkg.prepareProductBuildArgs"></a>

### `electron-builder/out/targets/pkg.prepareProductBuildArgs(identity, keychain)` ⇒ <code>Array&lt;string&gt;</code>
**Kind**: method of <code>[electron-builder/out/targets/pkg](#module_electron-builder/out/targets/pkg)</code>  

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
**Kind**: class of <code>[electron-builder/out/targets/snap](#module_electron-builder/out/targets/snap)</code>  
**Extends**: <code>[Target](electron-builder-core#Target)</code>  
**Properties**

| Name | Type |
| --- | --- |
| options = <code>Object.assign({}, this.packager.platformSpecificBuildOptions, (&lt;any&gt;this.packager.config)[this.name])</code>| <code>[SnapOptions](Options#SnapOptions)</code> | 

<a name="module_electron-builder/out/targets/snap.SnapTarget+build"></a>

#### `snapTarget.build(appOutDir, arch)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[SnapTarget](#SnapTarget)</code>  

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
**Kind**: class of <code>[electron-builder/out/targets/targetFactory](#module_electron-builder/out/targets/targetFactory)</code>  
**Extends**: <code>[Target](electron-builder-core#Target)</code>  
**Properties**

| Name | Type |
| --- | --- |
| options| <code>null</code> | 

<a name="module_electron-builder/out/targets/targetFactory.NoOpTarget+build"></a>

#### `noOpTarget.build(appOutDir, arch)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[NoOpTarget](#NoOpTarget)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/targets/targetFactory.computeArchToTargetNamesMap"></a>

### `electron-builder/out/targets/targetFactory.computeArchToTargetNamesMap(raw, options, platform)` ⇒ <code>Map&lt;[Arch](electron-builder-core#Arch) \| Array&lt;string&gt;&gt;</code>
**Kind**: method of <code>[electron-builder/out/targets/targetFactory](#module_electron-builder/out/targets/targetFactory)</code>  

| Param | Type |
| --- | --- |
| raw | <code>Map&lt;[Arch](electron-builder-core#Arch) \| Array&lt;string&gt;&gt;</code> | 
| options | <code>[PlatformSpecificBuildOptions](electron-builder-core#PlatformSpecificBuildOptions)</code> | 
| platform | <code>[Platform](electron-builder-core#Platform)</code> | 

<a name="module_electron-builder/out/targets/targetFactory.createCommonTarget"></a>

### `electron-builder/out/targets/targetFactory.createCommonTarget(target, outDir, packager)` ⇒ <code>[Target](electron-builder-core#Target)</code>
**Kind**: method of <code>[electron-builder/out/targets/targetFactory](#module_electron-builder/out/targets/targetFactory)</code>  

| Param | Type |
| --- | --- |
| target | <code>string</code> | 
| outDir | <code>string</code> | 
| packager | <code>[PlatformPackager](#PlatformPackager)&lt;any&gt;</code> | 

<a name="module_electron-builder/out/targets/targetFactory.createTargets"></a>

### `electron-builder/out/targets/targetFactory.createTargets(nameToTarget, rawList, outDir, packager, cleanupTasks)` ⇒ <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code>
**Kind**: method of <code>[electron-builder/out/targets/targetFactory](#module_electron-builder/out/targets/targetFactory)</code>  

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
**Kind**: class of <code>[electron-builder/out/targets/WebInstallerTarget](#module_electron-builder/out/targets/WebInstallerTarget)</code>  
**Extends**: <code>[NsisTarget](#NsisTarget)</code>  

* [.WebInstallerTarget](#WebInstallerTarget) ⇐ <code>[NsisTarget](#NsisTarget)</code>
    * [`.configureDefines(oneClick, defines)`](#module_electron-builder/out/targets/WebInstallerTarget.WebInstallerTarget+configureDefines) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.generateGitHubInstallerName()`](#module_electron-builder/out/targets/WebInstallerTarget.WebInstallerTarget+generateGitHubInstallerName) ⇒ <code>string</code>
    * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/nsis.NsisTarget+build) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.finishBuild()`](#module_electron-builder/out/targets/nsis.NsisTarget+finishBuild) ⇒ <code>Promise&lt;any&gt;</code>

<a name="module_electron-builder/out/targets/WebInstallerTarget.WebInstallerTarget+configureDefines"></a>

#### `webInstallerTarget.configureDefines(oneClick, defines)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of <code>[WebInstallerTarget](#WebInstallerTarget)</code>  
**Overrides**: <code>[configureDefines](#module_electron-builder/out/targets/nsis.NsisTarget+configureDefines)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| oneClick | <code>boolean</code> | 
| defines | <code>any</code> | 

<a name="module_electron-builder/out/targets/WebInstallerTarget.WebInstallerTarget+generateGitHubInstallerName"></a>

#### `webInstallerTarget.generateGitHubInstallerName()` ⇒ <code>string</code>
**Kind**: instance method of <code>[WebInstallerTarget](#WebInstallerTarget)</code>  
**Overrides**: <code>[generateGitHubInstallerName](#module_electron-builder/out/targets/nsis.NsisTarget+generateGitHubInstallerName)</code>  
**Access**: protected  
<a name="module_electron-builder/out/targets/nsis.NsisTarget+build"></a>

#### `webInstallerTarget.build(appOutDir, arch)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of <code>[WebInstallerTarget](#WebInstallerTarget)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/targets/nsis.NsisTarget+finishBuild"></a>

#### `webInstallerTarget.finishBuild()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[WebInstallerTarget](#WebInstallerTarget)</code>  
<a name="module_electron-builder/out/util/filter"></a>

## electron-builder/out/util/filter

* [electron-builder/out/util/filter](#module_electron-builder/out/util/filter)
    * [`.createFilter(src, patterns, ignoreFiles, rawFilter, excludePatterns)`](#module_electron-builder/out/util/filter.createFilter) ⇒ <code>module:electron-builder-util/out/fs.__type</code>
    * [`.hasMagic(pattern)`](#module_electron-builder/out/util/filter.hasMagic) ⇒ <code>boolean</code>

<a name="module_electron-builder/out/util/filter.createFilter"></a>

### `electron-builder/out/util/filter.createFilter(src, patterns, ignoreFiles, rawFilter, excludePatterns)` ⇒ <code>module:electron-builder-util/out/fs.__type</code>
**Kind**: method of <code>[electron-builder/out/util/filter](#module_electron-builder/out/util/filter)</code>  

| Param | Type |
| --- | --- |
| src | <code>string</code> | 
| patterns | <code>Array&lt;minimatch:Minimatch&gt;</code> | 
| ignoreFiles | <code>Set&lt;string&gt;</code> | 
| rawFilter | <code>callback</code> | 
| excludePatterns | <code>Array&lt;minimatch:Minimatch&gt;</code> \| <code>null</code> | 

<a name="module_electron-builder/out/util/filter.hasMagic"></a>

### `electron-builder/out/util/filter.hasMagic(pattern)` ⇒ <code>boolean</code>
**Kind**: method of <code>[electron-builder/out/util/filter](#module_electron-builder/out/util/filter)</code>  

| Param | Type |
| --- | --- |
| pattern | <code>minimatch:Minimatch</code> | 

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
**Kind**: method of <code>[electron-builder/out/util/readPackageJson](#module_electron-builder/out/util/readPackageJson)</code>  

| Param | Type |
| --- | --- |
| configFile | <code>string</code> | 
| projectDir | <code>string</code> | 

<a name="module_electron-builder/out/util/readPackageJson.getElectronVersion"></a>

### `electron-builder/out/util/readPackageJson.getElectronVersion(config, projectDir, projectMetadata)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: method of <code>[electron-builder/out/util/readPackageJson](#module_electron-builder/out/util/readPackageJson)</code>  

| Param | Type |
| --- | --- |
| config | <code>[Config](Options#Config)</code> \| <code>null</code> \| <code>undefined</code> | 
| projectDir | <code>string</code> | 
| projectMetadata | <code>any</code> \| <code>null</code> | 

<a name="module_electron-builder/out/util/readPackageJson.loadConfig"></a>

### `electron-builder/out/util/readPackageJson.loadConfig(projectDir)` ⇒ <code>Promise&lt; \| [Config](Options#Config)&gt;</code>
**Kind**: method of <code>[electron-builder/out/util/readPackageJson](#module_electron-builder/out/util/readPackageJson)</code>  

| Param | Type |
| --- | --- |
| projectDir | <code>string</code> | 

<a name="module_electron-builder/out/util/readPackageJson.readPackageJson"></a>

### `electron-builder/out/util/readPackageJson.readPackageJson(file)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: method of <code>[electron-builder/out/util/readPackageJson](#module_electron-builder/out/util/readPackageJson)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 

<a name="module_electron-builder/out/util/readPackageJson.validateConfig"></a>

### `electron-builder/out/util/readPackageJson.validateConfig(config)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: method of <code>[electron-builder/out/util/readPackageJson](#module_electron-builder/out/util/readPackageJson)</code>  

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
**Kind**: interface of <code>[electron-builder/out/windowsCodeSign](#module_electron-builder/out/windowsCodeSign)</code>  
**Properties**

| Name | Type |
| --- | --- |
| file| <code>string</code> \| <code>null</code> | 
| password| <code>string</code> \| <code>null</code> | 
| subjectName| <code>string</code> \| <code>null</code> | 
| certificateSha1| <code>string</code> \| <code>null</code> | 

<a name="SignOptions"></a>

### `SignOptions`
**Kind**: interface of <code>[electron-builder/out/windowsCodeSign](#module_electron-builder/out/windowsCodeSign)</code>  
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
**Kind**: method of <code>[electron-builder/out/windowsCodeSign](#module_electron-builder/out/windowsCodeSign)</code>  
<a name="module_electron-builder/out/windowsCodeSign.getToolPath"></a>

### `electron-builder/out/windowsCodeSign.getToolPath()` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: method of <code>[electron-builder/out/windowsCodeSign](#module_electron-builder/out/windowsCodeSign)</code>  
<a name="module_electron-builder/out/windowsCodeSign.sign"></a>

### `electron-builder/out/windowsCodeSign.sign(options)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: method of <code>[electron-builder/out/windowsCodeSign](#module_electron-builder/out/windowsCodeSign)</code>  

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
**Kind**: class of <code>[electron-builder/out/winPackager](#module_electron-builder/out/winPackager)</code>  
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
        return downloadCertificate(cscLink, this.info.tempDirManager)
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
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  
**Overrides**: <code>[createTargets](#module_electron-builder/out/platformPackager.PlatformPackager+createTargets)</code>  

| Param | Type |
| --- | --- |
| targets | <code>Array&lt;string&gt;</code> | 
| mapper | <code>callback</code> | 
| cleanupTasks | <code>Array&lt;module:electron-builder/out/winPackager.__type&gt;</code> | 

<a name="module_electron-builder/out/winPackager.WinPackager+getIconPath"></a>

#### `winPackager.getIconPath()` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  
**Overrides**: <code>[getIconPath](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath)</code>  
<a name="module_electron-builder/out/winPackager.WinPackager+sign"></a>

#### `winPackager.sign(file, logMessagePrefix)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| logMessagePrefix | <code>string</code> | 

<a name="module_electron-builder/out/winPackager.WinPackager+signAndEditResources"></a>

#### `winPackager.signAndEditResources(file)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 

<a name="module_electron-builder/out/winPackager.WinPackager+doGetCscPassword"></a>

#### `winPackager.doGetCscPassword()` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  
**Overrides**: <code>[doGetCscPassword](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword)</code>  
**Access**: protected  
<a name="module_electron-builder/out/winPackager.WinPackager+doSign"></a>

#### `winPackager.doSign(options)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| options | <code>[SignOptions](#SignOptions)</code> | 

<a name="module_electron-builder/out/winPackager.WinPackager+postInitApp"></a>

#### `winPackager.postInitApp(appOutDir)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  
**Overrides**: <code>[postInitApp](#module_electron-builder/out/platformPackager.PlatformPackager+postInitApp)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon"></a>

#### `winPackager.getDefaultIcon(ext)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated"></a>

#### `winPackager.dispatchArtifactCreated(file, target, arch, safeArtifactName)`
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| target | <code>[Target](electron-builder-core#Target)</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 
| safeArtifactName | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern"></a>

#### `winPackager.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[TargetSpecificOptions](electron-builder-core#TargetSpecificOptions)</code> \| <code>undefined</code> \| <code>null</code> | 
| ext | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>null</code> | 
| defaultPattern | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandMacro"></a>

#### `winPackager.expandMacro(pattern, arch, extra)` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  

| Param | Type |
| --- | --- |
| pattern | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> \| <code>undefined</code> \| <code>null</code> | 
| extra | <code>any</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName"></a>

#### `winPackager.generateName(ext, arch, deployment, classifier)` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> \| <code>null</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| deployment | <code>boolean</code> | 
| classifier | <code>string</code> \| <code>null</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName2"></a>

#### `winPackager.generateName2(ext, classifier, deployment)` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> \| <code>null</code> | 
| classifier | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 
| deployment | <code>boolean</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir"></a>

#### `winPackager.getMacOsResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+pack"></a>

#### `winPackager.pack(outDir, arch, targets, postAsyncTasks)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 
| postAsyncTasks | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResource"></a>

#### `winPackager.getResource(custom, names)` ⇒ <code>Promise&lt; \| string&gt;</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  

| Param | Type |
| --- | --- |
| custom | <code>string</code> \| <code>undefined</code> \| <code>null</code> | 
| names | <code>Array&lt;string&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir"></a>

#### `winPackager.getResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getTempFile"></a>

#### `winPackager.getTempFile(suffix)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  

| Param | Type |
| --- | --- |
| suffix | <code>string</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir"></a>

#### `winPackager.computeAppOutDir(outDir, arch)` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword"></a>

#### `winPackager.getCscPassword()` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  
**Access**: protected  
<a name="module_electron-builder/out/platformPackager.PlatformPackager+doPack"></a>

#### `winPackager.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  
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
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>[Arch](electron-builder-core#Arch)</code> | 
| targets | <code>Array&lt;[Target](electron-builder-core#Target)&gt;</code> | 
| postAsyncTasks | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo"></a>

#### `winPackager.prepareAppInfo(appInfo)` ⇒ <code>[AppInfo](#AppInfo)</code>
**Kind**: instance method of <code>[WinPackager](#WinPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appInfo | <code>[AppInfo](#AppInfo)</code> | 

<a name="module_electron-builder/out/yarn"></a>

## electron-builder/out/yarn

* [electron-builder/out/yarn](#module_electron-builder/out/yarn)
    * [`.DesktopFrameworkInfo`](#DesktopFrameworkInfo)
    * [`.getGypEnv(frameworkInfo, platform, arch, buildFromSource)`](#module_electron-builder/out/yarn.getGypEnv) ⇒ <code>any</code>
    * [`.installOrRebuild(config, appDir, frameworkInfo, platform, arch, forceInstall)`](#module_electron-builder/out/yarn.installOrRebuild) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.rebuild(appDir, frameworkInfo, platform, arch, additionalArgs, buildFromSource)`](#module_electron-builder/out/yarn.rebuild) ⇒ <code>Promise&lt;void&gt;</code>

<a name="DesktopFrameworkInfo"></a>

### `DesktopFrameworkInfo`
**Kind**: interface of <code>[electron-builder/out/yarn](#module_electron-builder/out/yarn)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **version**| <code>string</code> | 
| **useCustomDist**| <code>boolean</code> | 

<a name="module_electron-builder/out/yarn.getGypEnv"></a>

### `electron-builder/out/yarn.getGypEnv(frameworkInfo, platform, arch, buildFromSource)` ⇒ <code>any</code>
**Kind**: method of <code>[electron-builder/out/yarn](#module_electron-builder/out/yarn)</code>  

| Param | Type |
| --- | --- |
| frameworkInfo | <code>[DesktopFrameworkInfo](#DesktopFrameworkInfo)</code> | 
| platform | <code>string</code> | 
| arch | <code>string</code> | 
| buildFromSource | <code>boolean</code> | 

<a name="module_electron-builder/out/yarn.installOrRebuild"></a>

### `electron-builder/out/yarn.installOrRebuild(config, appDir, frameworkInfo, platform, arch, forceInstall)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: method of <code>[electron-builder/out/yarn](#module_electron-builder/out/yarn)</code>  

| Param | Type |
| --- | --- |
| config | <code>[Config](Options#Config)</code> | 
| appDir | <code>string</code> | 
| frameworkInfo | <code>[DesktopFrameworkInfo](#DesktopFrameworkInfo)</code> | 
| platform | <code>string</code> | 
| arch | <code>string</code> | 
| forceInstall | <code>boolean</code> | 

<a name="module_electron-builder/out/yarn.rebuild"></a>

### `electron-builder/out/yarn.rebuild(appDir, frameworkInfo, platform, arch, additionalArgs, buildFromSource)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: method of <code>[electron-builder/out/yarn](#module_electron-builder/out/yarn)</code>  

| Param | Type |
| --- | --- |
| appDir | <code>string</code> | 
| frameworkInfo | <code>[DesktopFrameworkInfo](#DesktopFrameworkInfo)</code> | 
| platform | <code>string</code> | 
| arch | <code>string</code> | 
| additionalArgs | <code>Array&lt;string&gt;</code> | 
| buildFromSource | <code>boolean</code> | 

