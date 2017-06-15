## Modules

<dl>
<dt><a href="#module_electron-builder-util/out/binDownload">electron-builder-util/out/binDownload</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder-util/out/deepAssign">electron-builder-util/out/deepAssign</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder-util/out/fs">electron-builder-util/out/fs</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder-util/out/log">electron-builder-util/out/log</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder-util/out/nodeHttpExecutor">electron-builder-util/out/nodeHttpExecutor</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder-util/out/promise">electron-builder-util/out/promise</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder-util/out/tmp">electron-builder-util/out/tmp</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder-util">electron-builder-util</a></dt>
<dd></dd>
</dl>

<a name="module_electron-builder-util/out/binDownload"></a>

## electron-builder-util/out/binDownload

* [electron-builder-util/out/binDownload](#module_electron-builder-util/out/binDownload)
    * [`.getBin(name, dirName, url, checksum)`](#module_electron-builder-util/out/binDownload.getBin) ⇒ <code>Promise&lt;String&gt;</code>
    * [`.getBinFromBintray(name, version, sha2)`](#module_electron-builder-util/out/binDownload.getBinFromBintray) ⇒ <code>Promise&lt;String&gt;</code>
    * [`.getBinFromGithub(name, version, checksum)`](#module_electron-builder-util/out/binDownload.getBinFromGithub) ⇒ <code>Promise&lt;String&gt;</code>

<a name="module_electron-builder-util/out/binDownload.getBin"></a>

### `electron-builder-util/out/binDownload.getBin(name, dirName, url, checksum)` ⇒ <code>Promise&lt;String&gt;</code>
**Kind**: method of [<code>electron-builder-util/out/binDownload</code>](#module_electron-builder-util/out/binDownload)  

| Param | Type |
| --- | --- |
| name | <code>String</code> | 
| dirName | <code>String</code> | 
| url | <code>String</code> | 
| checksum | <code>String</code> | 

<a name="module_electron-builder-util/out/binDownload.getBinFromBintray"></a>

### `electron-builder-util/out/binDownload.getBinFromBintray(name, version, sha2)` ⇒ <code>Promise&lt;String&gt;</code>
**Kind**: method of [<code>electron-builder-util/out/binDownload</code>](#module_electron-builder-util/out/binDownload)  

| Param | Type |
| --- | --- |
| name | <code>String</code> | 
| version | <code>String</code> | 
| sha2 | <code>String</code> | 

<a name="module_electron-builder-util/out/binDownload.getBinFromGithub"></a>

### `electron-builder-util/out/binDownload.getBinFromGithub(name, version, checksum)` ⇒ <code>Promise&lt;String&gt;</code>
**Kind**: method of [<code>electron-builder-util/out/binDownload</code>](#module_electron-builder-util/out/binDownload)  

| Param | Type |
| --- | --- |
| name | <code>String</code> | 
| version | <code>String</code> | 
| checksum | <code>String</code> | 

<a name="module_electron-builder-util/out/deepAssign"></a>

## electron-builder-util/out/deepAssign
<a name="module_electron-builder-util/out/deepAssign.deepAssign"></a>

### `electron-builder-util/out/deepAssign.deepAssign(target, objects)` ⇒ <code>module:electron-builder-util/out/deepAssign.T</code>
**Kind**: method of [<code>electron-builder-util/out/deepAssign</code>](#module_electron-builder-util/out/deepAssign)  

| Param | Type |
| --- | --- |
| target | <code>module:electron-builder-util/out/deepAssign.T</code> | 
| objects | <code>Array&lt;any&gt;</code> | 

<a name="module_electron-builder-util/out/fs"></a>

## electron-builder-util/out/fs

* [electron-builder-util/out/fs](#module_electron-builder-util/out/fs)
    * [.FileCopier](#FileCopier)
        * [`.copy(src, dest, stat)`](#module_electron-builder-util/out/fs.FileCopier+copy) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.copyDir(src, destination, filter, transformer, isUseHardLink)`](#module_electron-builder-util/out/fs.copyDir) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.copyFile(src, dest, isEnsureDir)`](#module_electron-builder-util/out/fs.copyFile) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.copyOrLinkFile(src, dest, stats, isUseHardLink)`](#module_electron-builder-util/out/fs.copyOrLinkFile) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.exists(file)`](#module_electron-builder-util/out/fs.exists) ⇒ <code>Promise&lt;Boolean&gt;</code>
    * [`.statOrNull(file)`](#module_electron-builder-util/out/fs.statOrNull) ⇒ <code>Promise&lt; \| module:fs.Stats&gt;</code>
    * [`.unlinkIfExists(file)`](#module_electron-builder-util/out/fs.unlinkIfExists) ⇒ <code>Promise&lt;String \| void&gt;</code>
    * [`.walk(initialDirPath, filter, consumer)`](#module_electron-builder-util/out/fs.walk) ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>

<a name="FileCopier"></a>

### FileCopier
**Kind**: class of [<code>electron-builder-util/out/fs</code>](#module_electron-builder-util/out/fs)  
**Properties**

| Name | Type |
| --- | --- |
| **isUseHardLink**| <code>Boolean</code> | 

<a name="module_electron-builder-util/out/fs.FileCopier+copy"></a>

#### `fileCopier.copy(src, dest, stat)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of [<code>FileCopier</code>](#FileCopier)  

| Param | Type |
| --- | --- |
| src | <code>String</code> | 
| dest | <code>String</code> | 
| stat | <code>module:fs.Stats</code> \| <code>undefined</code> | 

<a name="module_electron-builder-util/out/fs.copyDir"></a>

### `electron-builder-util/out/fs.copyDir(src, destination, filter, transformer, isUseHardLink)` ⇒ <code>Promise&lt;any&gt;</code>
Empty directories is never created.
Hard links is used if supported and allowed.

**Kind**: method of [<code>electron-builder-util/out/fs</code>](#module_electron-builder-util/out/fs)  

| Param | Type |
| --- | --- |
| src | <code>String</code> | 
| destination | <code>String</code> | 
| filter | <code>module:electron-builder-util/out/fs.__type</code> \| <code>null</code> | 
| transformer | <code>module:electron-builder-util/out/fs.__type</code> \| <code>null</code> | 
| isUseHardLink | <code>callback</code> | 

<a name="module_electron-builder-util/out/fs.copyFile"></a>

### `electron-builder-util/out/fs.copyFile(src, dest, isEnsureDir)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: method of [<code>electron-builder-util/out/fs</code>](#module_electron-builder-util/out/fs)  

| Param | Type |
| --- | --- |
| src | <code>String</code> | 
| dest | <code>String</code> | 
| isEnsureDir |  | 

<a name="module_electron-builder-util/out/fs.copyOrLinkFile"></a>

### `electron-builder-util/out/fs.copyOrLinkFile(src, dest, stats, isUseHardLink)` ⇒ <code>Promise&lt;any&gt;</code>
Hard links is used if supported and allowed.
File permission is fixed — allow execute for all if owner can, allow read for all if owner can.

ensureDir is not called, dest parent dir must exists

**Kind**: method of [<code>electron-builder-util/out/fs</code>](#module_electron-builder-util/out/fs)  

| Param | Type |
| --- | --- |
| src | <code>String</code> | 
| dest | <code>String</code> | 
| stats | <code>module:fs.Stats</code> \| <code>null</code> | 
| isUseHardLink |  | 

<a name="module_electron-builder-util/out/fs.exists"></a>

### `electron-builder-util/out/fs.exists(file)` ⇒ <code>Promise&lt;Boolean&gt;</code>
**Kind**: method of [<code>electron-builder-util/out/fs</code>](#module_electron-builder-util/out/fs)  

| Param | Type |
| --- | --- |
| file | <code>String</code> | 

<a name="module_electron-builder-util/out/fs.statOrNull"></a>

### `electron-builder-util/out/fs.statOrNull(file)` ⇒ <code>Promise&lt; \| module:fs.Stats&gt;</code>
**Kind**: method of [<code>electron-builder-util/out/fs</code>](#module_electron-builder-util/out/fs)  

| Param | Type |
| --- | --- |
| file | <code>String</code> | 

<a name="module_electron-builder-util/out/fs.unlinkIfExists"></a>

### `electron-builder-util/out/fs.unlinkIfExists(file)` ⇒ <code>Promise&lt;String \| void&gt;</code>
**Kind**: method of [<code>electron-builder-util/out/fs</code>](#module_electron-builder-util/out/fs)  

| Param | Type |
| --- | --- |
| file | <code>String</code> | 

<a name="module_electron-builder-util/out/fs.walk"></a>

### `electron-builder-util/out/fs.walk(initialDirPath, filter, consumer)` ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
**Kind**: method of [<code>electron-builder-util/out/fs</code>](#module_electron-builder-util/out/fs)  

| Param | Type |
| --- | --- |
| initialDirPath | <code>String</code> | 
| filter | <code>module:electron-builder-util/out/fs.__type</code> \| <code>null</code> | 
| consumer | <code>callback</code> | 

<a name="module_electron-builder-util/out/log"></a>

## electron-builder-util/out/log

* [electron-builder-util/out/log](#module_electron-builder-util/out/log)
    * [`.log(message)`](#module_electron-builder-util/out/log.log)
    * [`.setPrinter(value)`](#module_electron-builder-util/out/log.setPrinter)
    * [`.subTask(title, promise)`](#module_electron-builder-util/out/log.subTask) ⇒ <code>module:bluebird-lst.Bluebird&lt;any&gt;</code>
    * [`.task(title, promise)`](#module_electron-builder-util/out/log.task) ⇒ <code>module:bluebird-lst.Bluebird&lt;any&gt;</code>
    * [`.warn(message)`](#module_electron-builder-util/out/log.warn)

<a name="module_electron-builder-util/out/log.log"></a>

### `electron-builder-util/out/log.log(message)`
**Kind**: method of [<code>electron-builder-util/out/log</code>](#module_electron-builder-util/out/log)  

| Param | Type |
| --- | --- |
| message | <code>String</code> | 

<a name="module_electron-builder-util/out/log.setPrinter"></a>

### `electron-builder-util/out/log.setPrinter(value)`
**Kind**: method of [<code>electron-builder-util/out/log</code>](#module_electron-builder-util/out/log)  

| Param | Type |
| --- | --- |
| value | <code>module:electron-builder-util/out/log.__type</code> \| <code>null</code> | 

<a name="module_electron-builder-util/out/log.subTask"></a>

### `electron-builder-util/out/log.subTask(title, promise)` ⇒ <code>module:bluebird-lst.Bluebird&lt;any&gt;</code>
**Kind**: method of [<code>electron-builder-util/out/log</code>](#module_electron-builder-util/out/log)  

| Param | Type |
| --- | --- |
| title | <code>String</code> | 
| promise | <code>module:bluebird-lst.Bluebird&lt;any&gt;</code> \| <code>Promise&lt;any&gt;</code> | 

<a name="module_electron-builder-util/out/log.task"></a>

### `electron-builder-util/out/log.task(title, promise)` ⇒ <code>module:bluebird-lst.Bluebird&lt;any&gt;</code>
**Kind**: method of [<code>electron-builder-util/out/log</code>](#module_electron-builder-util/out/log)  

| Param | Type |
| --- | --- |
| title | <code>String</code> | 
| promise | <code>module:bluebird-lst.Bluebird&lt;any&gt;</code> \| <code>Promise&lt;any&gt;</code> | 

<a name="module_electron-builder-util/out/log.warn"></a>

### `electron-builder-util/out/log.warn(message)`
**Kind**: method of [<code>electron-builder-util/out/log</code>](#module_electron-builder-util/out/log)  

| Param | Type |
| --- | --- |
| message | <code>String</code> | 

<a name="module_electron-builder-util/out/nodeHttpExecutor"></a>

## electron-builder-util/out/nodeHttpExecutor

* [electron-builder-util/out/nodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor)
    * [.NodeHttpExecutor](#NodeHttpExecutor) ⇐ <code>[HttpExecutor](electron-builder-http#HttpExecutor)</code>
        * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+doApiRequest) ⇒ <code>Promise&lt;module:electron-builder-util/out/nodeHttpExecutor.T&gt;</code>
        * [`.download(url, destination, options)`](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+download) ⇒ <code>Promise&lt;String&gt;</code>
    * [`.httpExecutor`](#module_electron-builder-util/out/nodeHttpExecutor.httpExecutor) : <code>[NodeHttpExecutor](#NodeHttpExecutor)</code>

<a name="NodeHttpExecutor"></a>

### NodeHttpExecutor ⇐ <code>[HttpExecutor](electron-builder-http#HttpExecutor)</code>
**Kind**: class of [<code>electron-builder-util/out/nodeHttpExecutor</code>](#module_electron-builder-util/out/nodeHttpExecutor)  
**Extends**: <code>[HttpExecutor](electron-builder-http#HttpExecutor)</code>  

* [.NodeHttpExecutor](#NodeHttpExecutor) ⇐ <code>[HttpExecutor](electron-builder-http#HttpExecutor)</code>
    * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+doApiRequest) ⇒ <code>Promise&lt;module:electron-builder-util/out/nodeHttpExecutor.T&gt;</code>
    * [`.download(url, destination, options)`](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+download) ⇒ <code>Promise&lt;String&gt;</code>

<a name="module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+doApiRequest"></a>

#### `nodeHttpExecutor.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)` ⇒ <code>Promise&lt;module:electron-builder-util/out/nodeHttpExecutor.T&gt;</code>
**Kind**: instance method of [<code>NodeHttpExecutor</code>](#NodeHttpExecutor)  

| Param | Type |
| --- | --- |
| options | <code>module:https.RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](electron-builder-http#CancellationToken)</code> | 
| requestProcessor | <code>callback</code> | 
| redirectCount | <code>Number</code> | 

<a name="module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+download"></a>

#### `nodeHttpExecutor.download(url, destination, options)` ⇒ <code>Promise&lt;String&gt;</code>
**Kind**: instance method of [<code>NodeHttpExecutor</code>](#NodeHttpExecutor)  

| Param | Type |
| --- | --- |
| url | <code>String</code> | 
| destination | <code>String</code> | 
| options | <code>[DownloadOptions](electron-builder-http#DownloadOptions)</code> | 

<a name="module_electron-builder-util/out/nodeHttpExecutor.httpExecutor"></a>

### `electron-builder-util/out/nodeHttpExecutor.httpExecutor` : <code>[NodeHttpExecutor](#NodeHttpExecutor)</code>
**Kind**: constant of [<code>electron-builder-util/out/nodeHttpExecutor</code>](#module_electron-builder-util/out/nodeHttpExecutor)  
<a name="module_electron-builder-util/out/promise"></a>

## electron-builder-util/out/promise

* [electron-builder-util/out/promise](#module_electron-builder-util/out/promise)
    * [.NestedError](#NestedError) ⇐ <code>Error</code>
    * [`.all(promises)`](#module_electron-builder-util/out/promise.all) ⇒ <code>module:bluebird-lst.Bluebird&lt;any&gt;</code>
    * [`.asyncAll(tasks)`](#module_electron-builder-util/out/promise.asyncAll) ⇒ <code>module:bluebird-lst.Bluebird&lt;Array&lt;any&gt;&gt;</code>
    * [`.executeFinally(promise, task)`](#module_electron-builder-util/out/promise.executeFinally) ⇒ <code>Promise&lt;module:electron-builder-util/out/promise.T&gt;</code>
    * [`.printErrorAndExit(error)`](#module_electron-builder-util/out/promise.printErrorAndExit)
    * [`.throwError(errors)`](#module_electron-builder-util/out/promise.throwError)

<a name="NestedError"></a>

### NestedError ⇐ <code>Error</code>
**Kind**: class of [<code>electron-builder-util/out/promise</code>](#module_electron-builder-util/out/promise)  
**Extends**: <code>Error</code>  
<a name="module_electron-builder-util/out/promise.all"></a>

### `electron-builder-util/out/promise.all(promises)` ⇒ <code>module:bluebird-lst.Bluebird&lt;any&gt;</code>
**Kind**: method of [<code>electron-builder-util/out/promise</code>](#module_electron-builder-util/out/promise)  

| Param | Type |
| --- | --- |
| promises | <code>Array&lt;Promise&lt;any&gt;&gt;</code> | 

<a name="module_electron-builder-util/out/promise.asyncAll"></a>

### `electron-builder-util/out/promise.asyncAll(tasks)` ⇒ <code>module:bluebird-lst.Bluebird&lt;Array&lt;any&gt;&gt;</code>
**Kind**: method of [<code>electron-builder-util/out/promise</code>](#module_electron-builder-util/out/promise)  

| Param | Type |
| --- | --- |
| tasks | <code>Array&lt;module:electron-builder-util/out/promise.__type&gt;</code> | 

<a name="module_electron-builder-util/out/promise.executeFinally"></a>

### `electron-builder-util/out/promise.executeFinally(promise, task)` ⇒ <code>Promise&lt;module:electron-builder-util/out/promise.T&gt;</code>
**Kind**: method of [<code>electron-builder-util/out/promise</code>](#module_electron-builder-util/out/promise)  

| Param | Type |
| --- | --- |
| promise | <code>Promise&lt;module:electron-builder-util/out/promise.T&gt;</code> | 
| task | <code>callback</code> | 

<a name="module_electron-builder-util/out/promise.printErrorAndExit"></a>

### `electron-builder-util/out/promise.printErrorAndExit(error)`
**Kind**: method of [<code>electron-builder-util/out/promise</code>](#module_electron-builder-util/out/promise)  

| Param | Type |
| --- | --- |
| error | <code>Error</code> | 

<a name="module_electron-builder-util/out/promise.throwError"></a>

### `electron-builder-util/out/promise.throwError(errors)`
**Kind**: method of [<code>electron-builder-util/out/promise</code>](#module_electron-builder-util/out/promise)  

| Param | Type |
| --- | --- |
| errors | <code>Array&lt;Error&gt;</code> | 

<a name="module_electron-builder-util/out/tmp"></a>

## electron-builder-util/out/tmp

* [electron-builder-util/out/tmp](#module_electron-builder-util/out/tmp)
    * [.TmpDir](#TmpDir)
        * [`.cleanup()`](#module_electron-builder-util/out/tmp.TmpDir+cleanup) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getTempFile(suffix)`](#module_electron-builder-util/out/tmp.TmpDir+getTempFile) ⇒ <code>Promise&lt;String&gt;</code>

<a name="TmpDir"></a>

### TmpDir
**Kind**: class of [<code>electron-builder-util/out/tmp</code>](#module_electron-builder-util/out/tmp)  

* [.TmpDir](#TmpDir)
    * [`.cleanup()`](#module_electron-builder-util/out/tmp.TmpDir+cleanup) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getTempFile(suffix)`](#module_electron-builder-util/out/tmp.TmpDir+getTempFile) ⇒ <code>Promise&lt;String&gt;</code>

<a name="module_electron-builder-util/out/tmp.TmpDir+cleanup"></a>

#### `tmpDir.cleanup()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>TmpDir</code>](#TmpDir)  
<a name="module_electron-builder-util/out/tmp.TmpDir+getTempFile"></a>

#### `tmpDir.getTempFile(suffix)` ⇒ <code>Promise&lt;String&gt;</code>
**Kind**: instance method of [<code>TmpDir</code>](#TmpDir)  

| Param | Type |
| --- | --- |
| suffix | <code>String</code> | 

<a name="module_electron-builder-util"></a>

## electron-builder-util

* [electron-builder-util](#module_electron-builder-util)
    * [`.BaseExecOptions`](#BaseExecOptions)
    * [`.ExecOptions`](#ExecOptions) ⇐ <code>[BaseExecOptions](#BaseExecOptions)</code>
    * [.Lazy](#Lazy)
    * [`.addValue(map, key, value)`](#module_electron-builder-util.addValue)
    * [`.asArray(v)`](#module_electron-builder-util.asArray) ⇒ <code>Array&lt;module:electron-builder-util.T&gt;</code>
    * [`.computeDefaultAppDirectory(projectDir, userAppDir)`](#module_electron-builder-util.computeDefaultAppDirectory) ⇒ <code>Promise&lt;String&gt;</code>
    * [`.debug7zArgs(command)`](#module_electron-builder-util.debug7zArgs) ⇒ <code>Array&lt;String&gt;</code>
    * [`.doSpawn(command, args, options, pipeInput)`](#module_electron-builder-util.doSpawn) ⇒ <code>module:child_process.ChildProcess</code>
    * [`.exec(file, args, options)`](#module_electron-builder-util.exec) ⇒ <code>Promise&lt;String&gt;</code>
    * [`.execWine(file, args, options)`](#module_electron-builder-util.execWine) ⇒ <code>Promise&lt;String&gt;</code>
    * [`.getCacheDirectory()`](#module_electron-builder-util.getCacheDirectory) ⇒ <code>String</code>
    * [`.getPlatformIconFileName(value, isMac)`](#module_electron-builder-util.getPlatformIconFileName) ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
    * [`.getTempName(prefix)`](#module_electron-builder-util.getTempName) ⇒ <code>String</code>
    * [`.handleProcess(event, childProcess, command, resolve, reject)`](#module_electron-builder-util.handleProcess)
    * [`.isEmptyOrSpaces(s)`](#module_electron-builder-util.isEmptyOrSpaces) ⇒ <code>Boolean</code>
    * [`.isPullRequest()`](#module_electron-builder-util.isPullRequest) ⇒ <code>"undefined"</code> \| <code>"undefined"</code> \| <code>""</code>
    * [`.prepareArgs(args, exePath)`](#module_electron-builder-util.prepareArgs) ⇒ <code>Array&lt;String&gt;</code>
    * [`.removePassword(input)`](#module_electron-builder-util.removePassword) ⇒ <code>String</code>
    * [`.replaceDefault(inList, defaultList)`](#module_electron-builder-util.replaceDefault) ⇒ <code>Array&lt;String&gt;</code>
    * [`.safeStringifyJson(data, skippedNames)`](#module_electron-builder-util.safeStringifyJson) ⇒ <code>String</code>
    * [`.smarten(s)`](#module_electron-builder-util.smarten) ⇒ <code>String</code>
    * [`.spawn(command, args, options)`](#module_electron-builder-util.spawn) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.use(value, task)`](#module_electron-builder-util.use) ⇒ <code>null</code> \| <code>module:electron-builder-util.R</code>

<a name="BaseExecOptions"></a>

### `BaseExecOptions`
**Kind**: interface of [<code>electron-builder-util</code>](#module_electron-builder-util)  
**Properties**

| Name | Type |
| --- | --- |
| cwd| <code>String</code> | 
| env| <code>any</code> | 
| stdio| <code>any</code> | 

<a name="ExecOptions"></a>

### `ExecOptions` ⇐ <code>[BaseExecOptions](#BaseExecOptions)</code>
**Kind**: interface of [<code>electron-builder-util</code>](#module_electron-builder-util)  
**Extends**: <code>[BaseExecOptions](#BaseExecOptions)</code>  
**Properties**

| Name | Type |
| --- | --- |
| customFds| <code>any</code> | 
| encoding| <code>String</code> | 
| timeout| <code>Number</code> | 
| maxBuffer| <code>Number</code> | 
| killSignal| <code>String</code> | 

<a name="Lazy"></a>

### Lazy
**Kind**: class of [<code>electron-builder-util</code>](#module_electron-builder-util)  
**Properties**

| Name | Type |
| --- | --- |
| **value**| <code>Promise&lt;module:electron-builder-util.T&gt;</code> | 

<a name="module_electron-builder-util.addValue"></a>

### `electron-builder-util.addValue(map, key, value)`
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| map | <code>Map&lt;module:electron-builder-util.K \| Array&lt;module:electron-builder-util.T&gt;&gt;</code> | 
| key | <code>module:electron-builder-util.K</code> | 
| value | <code>module:electron-builder-util.T</code> | 

<a name="module_electron-builder-util.asArray"></a>

### `electron-builder-util.asArray(v)` ⇒ <code>Array&lt;module:electron-builder-util.T&gt;</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| v | <code>null</code> \| <code>undefined</code> \| <code>module:electron-builder-util.T</code> \| <code>Array&lt;module:electron-builder-util.T&gt;</code> | 

<a name="module_electron-builder-util.computeDefaultAppDirectory"></a>

### `electron-builder-util.computeDefaultAppDirectory(projectDir, userAppDir)` ⇒ <code>Promise&lt;String&gt;</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| projectDir | <code>String</code> | 
| userAppDir | <code>String</code> \| <code>null</code> \| <code>undefined</code> | 

<a name="module_electron-builder-util.debug7zArgs"></a>

### `electron-builder-util.debug7zArgs(command)` ⇒ <code>Array&lt;String&gt;</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| command | <code>"a"</code> \| <code>"x"</code> | 

<a name="module_electron-builder-util.doSpawn"></a>

### `electron-builder-util.doSpawn(command, args, options, pipeInput)` ⇒ <code>module:child_process.ChildProcess</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| command | <code>String</code> | 
| args | <code>Array&lt;String&gt;</code> | 
| options | <code>module:child_process.SpawnOptions</code> | 
| pipeInput | <code>Boolean</code> | 

<a name="module_electron-builder-util.exec"></a>

### `electron-builder-util.exec(file, args, options)` ⇒ <code>Promise&lt;String&gt;</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| file | <code>String</code> | 
| args | <code>Array&lt;String&gt;</code> \| <code>null</code> | 
| options | <code>[ExecOptions](#ExecOptions)</code> | 

<a name="module_electron-builder-util.execWine"></a>

### `electron-builder-util.execWine(file, args, options)` ⇒ <code>Promise&lt;String&gt;</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| file | <code>String</code> | 
| args | <code>Array&lt;String&gt;</code> | 
| options | <code>[ExecOptions](#ExecOptions)</code> | 

<a name="module_electron-builder-util.getCacheDirectory"></a>

### `electron-builder-util.getCacheDirectory()` ⇒ <code>String</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  
<a name="module_electron-builder-util.getPlatformIconFileName"></a>

### `electron-builder-util.getPlatformIconFileName(value, isMac)` ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| value | <code>String</code> \| <code>null</code> \| <code>undefined</code> | 
| isMac | <code>Boolean</code> | 

<a name="module_electron-builder-util.getTempName"></a>

### `electron-builder-util.getTempName(prefix)` ⇒ <code>String</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| prefix | <code>String</code> \| <code>null</code> \| <code>undefined</code> | 

<a name="module_electron-builder-util.handleProcess"></a>

### `electron-builder-util.handleProcess(event, childProcess, command, resolve, reject)`
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| event | <code>String</code> | 
| childProcess | <code>module:child_process.ChildProcess</code> | 
| command | <code>String</code> | 
| resolve | <code>module:electron-builder-util.__type</code> \| <code>null</code> | 
| reject | <code>callback</code> | 

<a name="module_electron-builder-util.isEmptyOrSpaces"></a>

### `electron-builder-util.isEmptyOrSpaces(s)` ⇒ <code>Boolean</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| s | <code>String</code> \| <code>null</code> \| <code>undefined</code> | 

<a name="module_electron-builder-util.isPullRequest"></a>

### `electron-builder-util.isPullRequest()` ⇒ <code>"undefined"</code> \| <code>"undefined"</code> \| <code>""</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  
<a name="module_electron-builder-util.prepareArgs"></a>

### `electron-builder-util.prepareArgs(args, exePath)` ⇒ <code>Array&lt;String&gt;</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| args | <code>Array&lt;String&gt;</code> | 
| exePath | <code>String</code> | 

<a name="module_electron-builder-util.removePassword"></a>

### `electron-builder-util.removePassword(input)` ⇒ <code>String</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| input | <code>String</code> | 

<a name="module_electron-builder-util.replaceDefault"></a>

### `electron-builder-util.replaceDefault(inList, defaultList)` ⇒ <code>Array&lt;String&gt;</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| inList | <code>Array&lt;String&gt;</code> \| <code>null</code> \| <code>undefined</code> | 
| defaultList | <code>Array&lt;String&gt;</code> | 

<a name="module_electron-builder-util.safeStringifyJson"></a>

### `electron-builder-util.safeStringifyJson(data, skippedNames)` ⇒ <code>String</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| data | <code>any</code> | 
| skippedNames | <code>Set&lt;String&gt;</code> | 

<a name="module_electron-builder-util.smarten"></a>

### `electron-builder-util.smarten(s)` ⇒ <code>String</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| s | <code>String</code> | 

<a name="module_electron-builder-util.spawn"></a>

### `electron-builder-util.spawn(command, args, options)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| command | <code>String</code> | 
| args | <code>Array&lt;String&gt;</code> \| <code>null</code> | 
| options | <code>module:child_process.SpawnOptions</code> | 

<a name="module_electron-builder-util.use"></a>

### `electron-builder-util.use(value, task)` ⇒ <code>null</code> \| <code>module:electron-builder-util.R</code>
**Kind**: method of [<code>electron-builder-util</code>](#module_electron-builder-util)  

| Param | Type |
| --- | --- |
| value | <code>module:electron-builder-util.T</code> \| <code>null</code> | 
| task | <code>callback</code> | 

