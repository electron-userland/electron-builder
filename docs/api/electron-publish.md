## Modules

<dl>
<dt><a href="#module_electron-publish/out/BintrayPublisher">electron-publish/out/BintrayPublisher</a></dt>
<dd></dd>
<dt><a href="#module_electron-publish/out/gitHubPublisher">electron-publish/out/gitHubPublisher</a></dt>
<dd></dd>
<dt><a href="#module_electron-publish/out/multiProgress">electron-publish/out/multiProgress</a></dt>
<dd></dd>
<dt><a href="#module_electron-publish/out/progress">electron-publish/out/progress</a></dt>
<dd></dd>
<dt><a href="#module_electron-publish">electron-publish</a></dt>
<dd></dd>
</dl>

<a name="module_electron-publish/out/BintrayPublisher"></a>

## electron-publish/out/BintrayPublisher

* [electron-publish/out/BintrayPublisher](#module_electron-publish/out/BintrayPublisher)
    * [.BintrayPublisher](#BintrayPublisher) ⇐ <code>[HttpPublisher](#HttpPublisher)</code>
        * [`.deleteRelease()`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+deleteRelease) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.toString()`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+toString) ⇒ <code>string</code>
        * [`.doUpload(fileName, dataLength, requestProcessor)`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+doUpload) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.upload(file, safeArtifactName)`](#module_electron-publish.HttpPublisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.uploadData(data, fileName)`](#module_electron-publish.HttpPublisher+uploadData) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.createProgressBar(fileName, fileStat)`](#module_electron-publish.Publisher+createProgressBar) ⇒ <code>null</code> \| <code>[ProgressBar](#ProgressBar)</code>
        * [`.createReadStreamAndProgressBar(file, fileStat, progressBar, reject)`](#module_electron-publish.Publisher+createReadStreamAndProgressBar) ⇒ <code>NodeJS:ReadableStream</code>

<a name="BintrayPublisher"></a>

### BintrayPublisher ⇐ <code>[HttpPublisher](#HttpPublisher)</code>
**Kind**: class of <code>[electron-publish/out/BintrayPublisher](#module_electron-publish/out/BintrayPublisher)</code>  
**Extends**: <code>[HttpPublisher](#HttpPublisher)</code>  
**Properties**

| Name | Type |
| --- | --- |
| providerName = <code>Bintray</code>| <code>"Bintray"</code> | 


* [.BintrayPublisher](#BintrayPublisher) ⇐ <code>[HttpPublisher](#HttpPublisher)</code>
    * [`.deleteRelease()`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+deleteRelease) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.toString()`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+toString) ⇒ <code>string</code>
    * [`.doUpload(fileName, dataLength, requestProcessor)`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+doUpload) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.upload(file, safeArtifactName)`](#module_electron-publish.HttpPublisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.uploadData(data, fileName)`](#module_electron-publish.HttpPublisher+uploadData) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.createProgressBar(fileName, fileStat)`](#module_electron-publish.Publisher+createProgressBar) ⇒ <code>null</code> \| <code>[ProgressBar](#ProgressBar)</code>
    * [`.createReadStreamAndProgressBar(file, fileStat, progressBar, reject)`](#module_electron-publish.Publisher+createReadStreamAndProgressBar) ⇒ <code>NodeJS:ReadableStream</code>

<a name="module_electron-publish/out/BintrayPublisher.BintrayPublisher+deleteRelease"></a>

#### `bintrayPublisher.deleteRelease()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[BintrayPublisher](#BintrayPublisher)</code>  
<a name="module_electron-publish/out/BintrayPublisher.BintrayPublisher+toString"></a>

#### `bintrayPublisher.toString()` ⇒ <code>string</code>
**Kind**: instance method of <code>[BintrayPublisher](#BintrayPublisher)</code>  
**Overrides**: <code>[toString](#module_electron-publish.Publisher+toString)</code>  
<a name="module_electron-publish/out/BintrayPublisher.BintrayPublisher+doUpload"></a>

#### `bintrayPublisher.doUpload(fileName, dataLength, requestProcessor)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[BintrayPublisher](#BintrayPublisher)</code>  
**Overrides**: <code>[doUpload](#module_electron-publish.HttpPublisher+doUpload)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| fileName | <code>string</code> | 
| dataLength | <code>number</code> | 
| requestProcessor | <code>callback</code> | 

<a name="module_electron-publish.HttpPublisher+upload"></a>

#### `bintrayPublisher.upload(file, safeArtifactName)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[BintrayPublisher](#BintrayPublisher)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| safeArtifactName | <code>string</code> | 

<a name="module_electron-publish.HttpPublisher+uploadData"></a>

#### `bintrayPublisher.uploadData(data, fileName)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[BintrayPublisher](#BintrayPublisher)</code>  

| Param | Type |
| --- | --- |
| data | <code>Buffer</code> | 
| fileName | <code>string</code> | 

<a name="module_electron-publish.Publisher+createProgressBar"></a>

#### `bintrayPublisher.createProgressBar(fileName, fileStat)` ⇒ <code>null</code> \| <code>[ProgressBar](#ProgressBar)</code>
**Kind**: instance method of <code>[BintrayPublisher](#BintrayPublisher)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| fileName | <code>string</code> | 
| fileStat | <code>module:fs.Stats</code> | 

<a name="module_electron-publish.Publisher+createReadStreamAndProgressBar"></a>

#### `bintrayPublisher.createReadStreamAndProgressBar(file, fileStat, progressBar, reject)` ⇒ <code>NodeJS:ReadableStream</code>
**Kind**: instance method of <code>[BintrayPublisher](#BintrayPublisher)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| fileStat | <code>module:fs.Stats</code> | 
| progressBar | <code>[ProgressBar](#ProgressBar)</code> \| <code>null</code> | 
| reject | <code>callback</code> | 

<a name="module_electron-publish/out/gitHubPublisher"></a>

## electron-publish/out/gitHubPublisher

* [electron-publish/out/gitHubPublisher](#module_electron-publish/out/gitHubPublisher)
    * [`.Release`](#Release)
    * [.GitHubPublisher](#GitHubPublisher) ⇐ <code>[HttpPublisher](#HttpPublisher)</code>
        * [`.deleteRelease()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+deleteRelease) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getRelease()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+getRelease) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.toString()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+toString) ⇒ <code>string</code>
        * [`.doUpload(fileName, dataLength, requestProcessor)`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+doUpload) ⇒ <code>Promise&lt;void&gt;</code>
        * [`.upload(file, safeArtifactName)`](#module_electron-publish.HttpPublisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.uploadData(data, fileName)`](#module_electron-publish.HttpPublisher+uploadData) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.createProgressBar(fileName, fileStat)`](#module_electron-publish.Publisher+createProgressBar) ⇒ <code>null</code> \| <code>[ProgressBar](#ProgressBar)</code>
        * [`.createReadStreamAndProgressBar(file, fileStat, progressBar, reject)`](#module_electron-publish.Publisher+createReadStreamAndProgressBar) ⇒ <code>NodeJS:ReadableStream</code>

<a name="Release"></a>

### `Release`
**Kind**: interface of <code>[electron-publish/out/gitHubPublisher](#module_electron-publish/out/gitHubPublisher)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **id**| <code>number</code> | 
| **tag_name**| <code>string</code> | 
| **draft**| <code>boolean</code> | 
| **prerelease**| <code>boolean</code> | 
| **published_at**| <code>string</code> | 
| **upload_url**| <code>string</code> | 

<a name="GitHubPublisher"></a>

### GitHubPublisher ⇐ <code>[HttpPublisher](#HttpPublisher)</code>
**Kind**: class of <code>[electron-publish/out/gitHubPublisher](#module_electron-publish/out/gitHubPublisher)</code>  
**Extends**: <code>[HttpPublisher](#HttpPublisher)</code>  
**Properties**

| Name | Type |
| --- | --- |
| providerName = <code>GitHub</code>| <code>"GitHub"</code> | 


* [.GitHubPublisher](#GitHubPublisher) ⇐ <code>[HttpPublisher](#HttpPublisher)</code>
    * [`.deleteRelease()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+deleteRelease) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getRelease()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+getRelease) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.toString()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+toString) ⇒ <code>string</code>
    * [`.doUpload(fileName, dataLength, requestProcessor)`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+doUpload) ⇒ <code>Promise&lt;void&gt;</code>
    * [`.upload(file, safeArtifactName)`](#module_electron-publish.HttpPublisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.uploadData(data, fileName)`](#module_electron-publish.HttpPublisher+uploadData) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.createProgressBar(fileName, fileStat)`](#module_electron-publish.Publisher+createProgressBar) ⇒ <code>null</code> \| <code>[ProgressBar](#ProgressBar)</code>
    * [`.createReadStreamAndProgressBar(file, fileStat, progressBar, reject)`](#module_electron-publish.Publisher+createReadStreamAndProgressBar) ⇒ <code>NodeJS:ReadableStream</code>

<a name="module_electron-publish/out/gitHubPublisher.GitHubPublisher+deleteRelease"></a>

#### `gitHubPublisher.deleteRelease()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[GitHubPublisher](#GitHubPublisher)</code>  
<a name="module_electron-publish/out/gitHubPublisher.GitHubPublisher+getRelease"></a>

#### `gitHubPublisher.getRelease()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[GitHubPublisher](#GitHubPublisher)</code>  
<a name="module_electron-publish/out/gitHubPublisher.GitHubPublisher+toString"></a>

#### `gitHubPublisher.toString()` ⇒ <code>string</code>
**Kind**: instance method of <code>[GitHubPublisher](#GitHubPublisher)</code>  
**Overrides**: <code>[toString](#module_electron-publish.Publisher+toString)</code>  
<a name="module_electron-publish/out/gitHubPublisher.GitHubPublisher+doUpload"></a>

#### `gitHubPublisher.doUpload(fileName, dataLength, requestProcessor)` ⇒ <code>Promise&lt;void&gt;</code>
**Kind**: instance method of <code>[GitHubPublisher](#GitHubPublisher)</code>  
**Overrides**: <code>[doUpload](#module_electron-publish.HttpPublisher+doUpload)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| fileName | <code>string</code> | 
| dataLength | <code>number</code> | 
| requestProcessor | <code>callback</code> | 

<a name="module_electron-publish.HttpPublisher+upload"></a>

#### `gitHubPublisher.upload(file, safeArtifactName)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[GitHubPublisher](#GitHubPublisher)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| safeArtifactName | <code>string</code> | 

<a name="module_electron-publish.HttpPublisher+uploadData"></a>

#### `gitHubPublisher.uploadData(data, fileName)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[GitHubPublisher](#GitHubPublisher)</code>  

| Param | Type |
| --- | --- |
| data | <code>Buffer</code> | 
| fileName | <code>string</code> | 

<a name="module_electron-publish.Publisher+createProgressBar"></a>

#### `gitHubPublisher.createProgressBar(fileName, fileStat)` ⇒ <code>null</code> \| <code>[ProgressBar](#ProgressBar)</code>
**Kind**: instance method of <code>[GitHubPublisher](#GitHubPublisher)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| fileName | <code>string</code> | 
| fileStat | <code>module:fs.Stats</code> | 

<a name="module_electron-publish.Publisher+createReadStreamAndProgressBar"></a>

#### `gitHubPublisher.createReadStreamAndProgressBar(file, fileStat, progressBar, reject)` ⇒ <code>NodeJS:ReadableStream</code>
**Kind**: instance method of <code>[GitHubPublisher](#GitHubPublisher)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| fileStat | <code>module:fs.Stats</code> | 
| progressBar | <code>[ProgressBar](#ProgressBar)</code> \| <code>null</code> | 
| reject | <code>callback</code> | 

<a name="module_electron-publish/out/multiProgress"></a>

## electron-publish/out/multiProgress

* [electron-publish/out/multiProgress](#module_electron-publish/out/multiProgress)
    * [.MultiProgress](#MultiProgress)
        * [`.createBar(format, options)`](#module_electron-publish/out/multiProgress.MultiProgress+createBar) ⇒ <code>[ProgressBar](#ProgressBar)</code>
        * [`.terminate()`](#module_electron-publish/out/multiProgress.MultiProgress+terminate)

<a name="MultiProgress"></a>

### MultiProgress
**Kind**: class of <code>[electron-publish/out/multiProgress](#module_electron-publish/out/multiProgress)</code>  

* [.MultiProgress](#MultiProgress)
    * [`.createBar(format, options)`](#module_electron-publish/out/multiProgress.MultiProgress+createBar) ⇒ <code>[ProgressBar](#ProgressBar)</code>
    * [`.terminate()`](#module_electron-publish/out/multiProgress.MultiProgress+terminate)

<a name="module_electron-publish/out/multiProgress.MultiProgress+createBar"></a>

#### `multiProgress.createBar(format, options)` ⇒ <code>[ProgressBar](#ProgressBar)</code>
**Kind**: instance method of <code>[MultiProgress](#MultiProgress)</code>  

| Param | Type |
| --- | --- |
| format | <code>string</code> | 
| options | <code>any</code> | 

<a name="module_electron-publish/out/multiProgress.MultiProgress+terminate"></a>

#### `multiProgress.terminate()`
**Kind**: instance method of <code>[MultiProgress](#MultiProgress)</code>  
<a name="module_electron-publish/out/progress"></a>

## electron-publish/out/progress

* [electron-publish/out/progress](#module_electron-publish/out/progress)
    * [.ProgressBar](#ProgressBar)
        * [`.interrupt(message)`](#module_electron-publish/out/progress.ProgressBar+interrupt)
        * [`.render()`](#module_electron-publish/out/progress.ProgressBar+render)
        * [`.terminate()`](#module_electron-publish/out/progress.ProgressBar+terminate)
        * [`.tick(delta)`](#module_electron-publish/out/progress.ProgressBar+tick)
        * [`.update(ratio)`](#module_electron-publish/out/progress.ProgressBar+update)
    * [.ProgressCallback](#ProgressCallback)
        * [`.update(transferred, total)`](#module_electron-publish/out/progress.ProgressCallback+update)

<a name="ProgressBar"></a>

### ProgressBar
**Kind**: class of <code>[electron-publish/out/progress](#module_electron-publish/out/progress)</code>  
**Properties**

| Name | Type |
| --- | --- |
| total| <code>number</code> | 


* [.ProgressBar](#ProgressBar)
    * [`.interrupt(message)`](#module_electron-publish/out/progress.ProgressBar+interrupt)
    * [`.render()`](#module_electron-publish/out/progress.ProgressBar+render)
    * [`.terminate()`](#module_electron-publish/out/progress.ProgressBar+terminate)
    * [`.tick(delta)`](#module_electron-publish/out/progress.ProgressBar+tick)
    * [`.update(ratio)`](#module_electron-publish/out/progress.ProgressBar+update)

<a name="module_electron-publish/out/progress.ProgressBar+interrupt"></a>

#### `progressBar.interrupt(message)`
"interrupt" the progress bar and write a message above it.

**Kind**: instance method of <code>[ProgressBar](#ProgressBar)</code>  

| Param | Type |
| --- | --- |
| message | <code>string</code> | 

<a name="module_electron-publish/out/progress.ProgressBar+render"></a>

#### `progressBar.render()`
**Kind**: instance method of <code>[ProgressBar](#ProgressBar)</code>  
<a name="module_electron-publish/out/progress.ProgressBar+terminate"></a>

#### `progressBar.terminate()`
**Kind**: instance method of <code>[ProgressBar](#ProgressBar)</code>  
<a name="module_electron-publish/out/progress.ProgressBar+tick"></a>

#### `progressBar.tick(delta)`
"tick" the progress bar with optional `len` and optional `tokens`.

**Kind**: instance method of <code>[ProgressBar](#ProgressBar)</code>  

| Param | Type |
| --- | --- |
| delta | <code>number</code> | 

<a name="module_electron-publish/out/progress.ProgressBar+update"></a>

#### `progressBar.update(ratio)`
"update" the progress bar to represent an exact percentage.
The ratio (between 0 and 1) specified will be multiplied by `total` and
floored, representing the closest available "tick." For example, if a
progress bar has a length of 3 and `update(0.5)` is called, the progress
will be set to 1.

A ratio of 0.5 will attempt to set the progress to halfway.

**Kind**: instance method of <code>[ProgressBar](#ProgressBar)</code>  

| Param | Type |
| --- | --- |
| ratio | <code>number</code> | 

<a name="ProgressCallback"></a>

### ProgressCallback
**Kind**: class of <code>[electron-publish/out/progress](#module_electron-publish/out/progress)</code>  
<a name="module_electron-publish/out/progress.ProgressCallback+update"></a>

#### `progressCallback.update(transferred, total)`
**Kind**: instance method of <code>[ProgressCallback](#ProgressCallback)</code>  

| Param | Type |
| --- | --- |
| transferred | <code>number</code> | 
| total | <code>number</code> | 

<a name="module_electron-publish"></a>

## electron-publish

* [electron-publish](#module_electron-publish)
    * [`.PublishContext`](#PublishContext)
    * [`.PublishOptions`](#PublishOptions)
    * [.HttpPublisher](#HttpPublisher) ⇐ <code>[Publisher](#Publisher)</code>
        * [`.upload(file, safeArtifactName)`](#module_electron-publish.HttpPublisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.uploadData(data, fileName)`](#module_electron-publish.HttpPublisher+uploadData) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.doUpload(fileName, dataLength, requestProcessor, file)`](#module_electron-publish.HttpPublisher+doUpload) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.toString()`](#module_electron-publish.Publisher+toString) ⇒ <code>string</code>
        * [`.createProgressBar(fileName, fileStat)`](#module_electron-publish.Publisher+createProgressBar) ⇒ <code>null</code> \| <code>[ProgressBar](#ProgressBar)</code>
        * [`.createReadStreamAndProgressBar(file, fileStat, progressBar, reject)`](#module_electron-publish.Publisher+createReadStreamAndProgressBar) ⇒ <code>NodeJS:ReadableStream</code>
    * [.Publisher](#Publisher)
        * [`.toString()`](#module_electron-publish.Publisher+toString) ⇒ <code>string</code>
        * [`.upload(file, safeArtifactName)`](#module_electron-publish.Publisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.createProgressBar(fileName, fileStat)`](#module_electron-publish.Publisher+createProgressBar) ⇒ <code>null</code> \| <code>[ProgressBar](#ProgressBar)</code>
        * [`.createReadStreamAndProgressBar(file, fileStat, progressBar, reject)`](#module_electron-publish.Publisher+createReadStreamAndProgressBar) ⇒ <code>NodeJS:ReadableStream</code>

<a name="PublishContext"></a>

### `PublishContext`
**Kind**: interface of <code>[electron-publish](#module_electron-publish)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **cancellationToken**| <code>[CancellationToken](electron-builder-http#CancellationToken)</code> | 
| progress| <code>[MultiProgress](#MultiProgress)</code> \| <code>null</code> | 

<a name="PublishOptions"></a>

### `PublishOptions`
**Kind**: interface of <code>[electron-publish](#module_electron-publish)</code>  
**Properties**

| Name | Type |
| --- | --- |
| publish| <code>"onTag"</code> \| <code>"onTagOrDraft"</code> \| <code>"always"</code> \| <code>"never"</code> \| <code>null</code> | 
| draft| <code>boolean</code> | 
| prerelease| <code>boolean</code> | 

<a name="HttpPublisher"></a>

### HttpPublisher ⇐ <code>[Publisher](#Publisher)</code>
**Kind**: class of <code>[electron-publish](#module_electron-publish)</code>  
**Extends**: <code>[Publisher](#Publisher)</code>  

* [.HttpPublisher](#HttpPublisher) ⇐ <code>[Publisher](#Publisher)</code>
    * [`.upload(file, safeArtifactName)`](#module_electron-publish.HttpPublisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.uploadData(data, fileName)`](#module_electron-publish.HttpPublisher+uploadData) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.doUpload(fileName, dataLength, requestProcessor, file)`](#module_electron-publish.HttpPublisher+doUpload) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.toString()`](#module_electron-publish.Publisher+toString) ⇒ <code>string</code>
    * [`.createProgressBar(fileName, fileStat)`](#module_electron-publish.Publisher+createProgressBar) ⇒ <code>null</code> \| <code>[ProgressBar](#ProgressBar)</code>
    * [`.createReadStreamAndProgressBar(file, fileStat, progressBar, reject)`](#module_electron-publish.Publisher+createReadStreamAndProgressBar) ⇒ <code>NodeJS:ReadableStream</code>

<a name="module_electron-publish.HttpPublisher+upload"></a>

#### `httpPublisher.upload(file, safeArtifactName)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[HttpPublisher](#HttpPublisher)</code>  
**Overrides**: <code>[upload](#module_electron-publish.Publisher+upload)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| safeArtifactName | <code>string</code> | 

<a name="module_electron-publish.HttpPublisher+uploadData"></a>

#### `httpPublisher.uploadData(data, fileName)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[HttpPublisher](#HttpPublisher)</code>  

| Param | Type |
| --- | --- |
| data | <code>Buffer</code> | 
| fileName | <code>string</code> | 

<a name="module_electron-publish.HttpPublisher+doUpload"></a>

#### `httpPublisher.doUpload(fileName, dataLength, requestProcessor, file)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[HttpPublisher](#HttpPublisher)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| fileName | <code>string</code> | 
| dataLength | <code>number</code> | 
| requestProcessor | <code>callback</code> | 
| file | <code>string</code> | 

<a name="module_electron-publish.Publisher+toString"></a>

#### `httpPublisher.toString()` ⇒ <code>string</code>
**Kind**: instance method of <code>[HttpPublisher](#HttpPublisher)</code>  
<a name="module_electron-publish.Publisher+createProgressBar"></a>

#### `httpPublisher.createProgressBar(fileName, fileStat)` ⇒ <code>null</code> \| <code>[ProgressBar](#ProgressBar)</code>
**Kind**: instance method of <code>[HttpPublisher](#HttpPublisher)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| fileName | <code>string</code> | 
| fileStat | <code>module:fs.Stats</code> | 

<a name="module_electron-publish.Publisher+createReadStreamAndProgressBar"></a>

#### `httpPublisher.createReadStreamAndProgressBar(file, fileStat, progressBar, reject)` ⇒ <code>NodeJS:ReadableStream</code>
**Kind**: instance method of <code>[HttpPublisher](#HttpPublisher)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| fileStat | <code>module:fs.Stats</code> | 
| progressBar | <code>[ProgressBar](#ProgressBar)</code> \| <code>null</code> | 
| reject | <code>callback</code> | 

<a name="Publisher"></a>

### Publisher
**Kind**: class of <code>[electron-publish](#module_electron-publish)</code>  

* [.Publisher](#Publisher)
    * [`.toString()`](#module_electron-publish.Publisher+toString) ⇒ <code>string</code>
    * [`.upload(file, safeArtifactName)`](#module_electron-publish.Publisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.createProgressBar(fileName, fileStat)`](#module_electron-publish.Publisher+createProgressBar) ⇒ <code>null</code> \| <code>[ProgressBar](#ProgressBar)</code>
    * [`.createReadStreamAndProgressBar(file, fileStat, progressBar, reject)`](#module_electron-publish.Publisher+createReadStreamAndProgressBar) ⇒ <code>NodeJS:ReadableStream</code>

<a name="module_electron-publish.Publisher+toString"></a>

#### `publisher.toString()` ⇒ <code>string</code>
**Kind**: instance method of <code>[Publisher](#Publisher)</code>  
<a name="module_electron-publish.Publisher+upload"></a>

#### `publisher.upload(file, safeArtifactName)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of <code>[Publisher](#Publisher)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| safeArtifactName | <code>string</code> | 

<a name="module_electron-publish.Publisher+createProgressBar"></a>

#### `publisher.createProgressBar(fileName, fileStat)` ⇒ <code>null</code> \| <code>[ProgressBar](#ProgressBar)</code>
**Kind**: instance method of <code>[Publisher](#Publisher)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| fileName | <code>string</code> | 
| fileStat | <code>module:fs.Stats</code> | 

<a name="module_electron-publish.Publisher+createReadStreamAndProgressBar"></a>

#### `publisher.createReadStreamAndProgressBar(file, fileStat, progressBar, reject)` ⇒ <code>NodeJS:ReadableStream</code>
**Kind**: instance method of <code>[Publisher](#Publisher)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| fileStat | <code>module:fs.Stats</code> | 
| progressBar | <code>[ProgressBar](#ProgressBar)</code> \| <code>null</code> | 
| reject | <code>callback</code> | 

