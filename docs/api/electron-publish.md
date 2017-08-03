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
        * [`.toString()`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+toString) ⇒ <code>String</code>
        * [`.upload(file, arch, safeArtifactName)`](#module_electron-publish.HttpPublisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.uploadData(data, arch, fileName)`](#module_electron-publish.HttpPublisher+uploadData) ⇒ <code>Promise&lt;any&gt;</code>

<a name="BintrayPublisher"></a>
### BintrayPublisher ⇐ <code>[HttpPublisher](#HttpPublisher)</code>
**Kind**: class of [<code>electron-publish/out/BintrayPublisher</code>](#module_electron-publish/out/BintrayPublisher)  
**Extends**: <code>[HttpPublisher](#HttpPublisher)</code>  
**Properties**

| Name | Type |
| --- | --- |
| providerName = <code>Bintray</code>| <code>"Bintray"</code> | 


* [.BintrayPublisher](#BintrayPublisher) ⇐ <code>[HttpPublisher](#HttpPublisher)</code>
    * [`.deleteRelease()`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+deleteRelease) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.toString()`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+toString) ⇒ <code>String</code>
    * [`.upload(file, arch, safeArtifactName)`](#module_electron-publish.HttpPublisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.uploadData(data, arch, fileName)`](#module_electron-publish.HttpPublisher+uploadData) ⇒ <code>Promise&lt;any&gt;</code>

<a name="module_electron-publish/out/BintrayPublisher.BintrayPublisher+deleteRelease"></a>
#### `bintrayPublisher.deleteRelease()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>BintrayPublisher</code>](#BintrayPublisher)  
<a name="module_electron-publish/out/BintrayPublisher.BintrayPublisher+toString"></a>
#### `bintrayPublisher.toString()` ⇒ <code>String</code>
**Kind**: instance method of [<code>BintrayPublisher</code>](#BintrayPublisher)  
**Overrides**: [<code>toString</code>](#module_electron-publish.Publisher+toString)  
<a name="module_electron-publish.HttpPublisher+upload"></a>
#### `bintrayPublisher.upload(file, arch, safeArtifactName)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>BintrayPublisher</code>](#BintrayPublisher)  

| Param | Type |
| --- | --- |
| file | <code>String</code> | 
| arch | <code>module:electron-builder-util/out/arch.Arch</code> | 
| safeArtifactName | <code>String</code> | 

<a name="module_electron-publish.HttpPublisher+uploadData"></a>
#### `bintrayPublisher.uploadData(data, arch, fileName)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>BintrayPublisher</code>](#BintrayPublisher)  

| Param | Type |
| --- | --- |
| data | <code>Buffer</code> | 
| arch | <code>module:electron-builder-util/out/arch.Arch</code> | 
| fileName | <code>String</code> | 

<a name="module_electron-publish/out/gitHubPublisher"></a>
## electron-publish/out/gitHubPublisher

* [electron-publish/out/gitHubPublisher](#module_electron-publish/out/gitHubPublisher)
    * [`.Release`](#Release)
    * [.GitHubPublisher](#GitHubPublisher) ⇐ <code>[HttpPublisher](#HttpPublisher)</code>
        * [`.deleteRelease()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+deleteRelease) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getRelease()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+getRelease) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.toString()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+toString) ⇒ <code>String</code>
        * [`.upload(file, arch, safeArtifactName)`](#module_electron-publish.HttpPublisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.uploadData(data, arch, fileName)`](#module_electron-publish.HttpPublisher+uploadData) ⇒ <code>Promise&lt;any&gt;</code>

<a name="Release"></a>
### `Release`
**Kind**: interface of [<code>electron-publish/out/gitHubPublisher</code>](#module_electron-publish/out/gitHubPublisher)  
**Properties**

| Name | Type |
| --- | --- |
| **id**| <code>Number</code> | 
| **tag_name**| <code>String</code> | 
| **draft**| <code>Boolean</code> | 
| **prerelease**| <code>Boolean</code> | 
| **published_at**| <code>String</code> | 
| **upload_url**| <code>String</code> | 

<a name="GitHubPublisher"></a>
### GitHubPublisher ⇐ <code>[HttpPublisher](#HttpPublisher)</code>
**Kind**: class of [<code>electron-publish/out/gitHubPublisher</code>](#module_electron-publish/out/gitHubPublisher)  
**Extends**: <code>[HttpPublisher](#HttpPublisher)</code>  
**Properties**

| Name | Type |
| --- | --- |
| providerName = <code>GitHub</code>| <code>"GitHub"</code> | 


* [.GitHubPublisher](#GitHubPublisher) ⇐ <code>[HttpPublisher](#HttpPublisher)</code>
    * [`.deleteRelease()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+deleteRelease) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getRelease()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+getRelease) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.toString()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+toString) ⇒ <code>String</code>
    * [`.upload(file, arch, safeArtifactName)`](#module_electron-publish.HttpPublisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.uploadData(data, arch, fileName)`](#module_electron-publish.HttpPublisher+uploadData) ⇒ <code>Promise&lt;any&gt;</code>

<a name="module_electron-publish/out/gitHubPublisher.GitHubPublisher+deleteRelease"></a>
#### `gitHubPublisher.deleteRelease()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>GitHubPublisher</code>](#GitHubPublisher)  
<a name="module_electron-publish/out/gitHubPublisher.GitHubPublisher+getRelease"></a>
#### `gitHubPublisher.getRelease()` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>GitHubPublisher</code>](#GitHubPublisher)  
<a name="module_electron-publish/out/gitHubPublisher.GitHubPublisher+toString"></a>
#### `gitHubPublisher.toString()` ⇒ <code>String</code>
**Kind**: instance method of [<code>GitHubPublisher</code>](#GitHubPublisher)  
**Overrides**: [<code>toString</code>](#module_electron-publish.Publisher+toString)  
<a name="module_electron-publish.HttpPublisher+upload"></a>
#### `gitHubPublisher.upload(file, arch, safeArtifactName)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>GitHubPublisher</code>](#GitHubPublisher)  

| Param | Type |
| --- | --- |
| file | <code>String</code> | 
| arch | <code>module:electron-builder-util/out/arch.Arch</code> | 
| safeArtifactName | <code>String</code> | 

<a name="module_electron-publish.HttpPublisher+uploadData"></a>
#### `gitHubPublisher.uploadData(data, arch, fileName)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>GitHubPublisher</code>](#GitHubPublisher)  

| Param | Type |
| --- | --- |
| data | <code>Buffer</code> | 
| arch | <code>module:electron-builder-util/out/arch.Arch</code> | 
| fileName | <code>String</code> | 

<a name="module_electron-publish/out/multiProgress"></a>
## electron-publish/out/multiProgress

* [electron-publish/out/multiProgress](#module_electron-publish/out/multiProgress)
    * [.MultiProgress](#MultiProgress)
        * [`.createBar(format, options)`](#module_electron-publish/out/multiProgress.MultiProgress+createBar) ⇒ <code>[ProgressBar](#ProgressBar)</code>
        * [`.terminate()`](#module_electron-publish/out/multiProgress.MultiProgress+terminate)

<a name="MultiProgress"></a>
### MultiProgress
**Kind**: class of [<code>electron-publish/out/multiProgress</code>](#module_electron-publish/out/multiProgress)  

* [.MultiProgress](#MultiProgress)
    * [`.createBar(format, options)`](#module_electron-publish/out/multiProgress.MultiProgress+createBar) ⇒ <code>[ProgressBar](#ProgressBar)</code>
    * [`.terminate()`](#module_electron-publish/out/multiProgress.MultiProgress+terminate)

<a name="module_electron-publish/out/multiProgress.MultiProgress+createBar"></a>
#### `multiProgress.createBar(format, options)` ⇒ <code>[ProgressBar](#ProgressBar)</code>
**Kind**: instance method of [<code>MultiProgress</code>](#MultiProgress)  

| Param | Type |
| --- | --- |
| format | <code>String</code> | 
| options | <code>any</code> | 

<a name="module_electron-publish/out/multiProgress.MultiProgress+terminate"></a>
#### `multiProgress.terminate()`
**Kind**: instance method of [<code>MultiProgress</code>](#MultiProgress)  
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
**Kind**: class of [<code>electron-publish/out/progress</code>](#module_electron-publish/out/progress)  
**Properties**

| Name | Type |
| --- | --- |
| total| <code>Number</code> | 


* [.ProgressBar](#ProgressBar)
    * [`.interrupt(message)`](#module_electron-publish/out/progress.ProgressBar+interrupt)
    * [`.render()`](#module_electron-publish/out/progress.ProgressBar+render)
    * [`.terminate()`](#module_electron-publish/out/progress.ProgressBar+terminate)
    * [`.tick(delta)`](#module_electron-publish/out/progress.ProgressBar+tick)
    * [`.update(ratio)`](#module_electron-publish/out/progress.ProgressBar+update)

<a name="module_electron-publish/out/progress.ProgressBar+interrupt"></a>
#### `progressBar.interrupt(message)`
"interrupt" the progress bar and write a message above it.

**Kind**: instance method of [<code>ProgressBar</code>](#ProgressBar)  

| Param | Type |
| --- | --- |
| message | <code>String</code> | 

<a name="module_electron-publish/out/progress.ProgressBar+render"></a>
#### `progressBar.render()`
**Kind**: instance method of [<code>ProgressBar</code>](#ProgressBar)  
<a name="module_electron-publish/out/progress.ProgressBar+terminate"></a>
#### `progressBar.terminate()`
**Kind**: instance method of [<code>ProgressBar</code>](#ProgressBar)  
<a name="module_electron-publish/out/progress.ProgressBar+tick"></a>
#### `progressBar.tick(delta)`
"tick" the progress bar with optional `len` and optional `tokens`.

**Kind**: instance method of [<code>ProgressBar</code>](#ProgressBar)  

| Param | Type |
| --- | --- |
| delta | <code>Number</code> | 

<a name="module_electron-publish/out/progress.ProgressBar+update"></a>
#### `progressBar.update(ratio)`
"update" the progress bar to represent an exact percentage.
The ratio (between 0 and 1) specified will be multiplied by `total` and
floored, representing the closest available "tick." For example, if a
progress bar has a length of 3 and `update(0.5)` is called, the progress
will be set to 1.

A ratio of 0.5 will attempt to set the progress to halfway.

**Kind**: instance method of [<code>ProgressBar</code>](#ProgressBar)  

| Param | Type |
| --- | --- |
| ratio | <code>Number</code> | 

<a name="ProgressCallback"></a>
### ProgressCallback
**Kind**: class of [<code>electron-publish/out/progress</code>](#module_electron-publish/out/progress)  
<a name="module_electron-publish/out/progress.ProgressCallback+update"></a>
#### `progressCallback.update(transferred, total)`
**Kind**: instance method of [<code>ProgressCallback</code>](#ProgressCallback)  

| Param | Type |
| --- | --- |
| transferred | <code>Number</code> | 
| total | <code>Number</code> | 

<a name="module_electron-publish"></a>
## electron-publish

* [electron-publish](#module_electron-publish)
    * [`.PublishContext`](#PublishContext)
    * [`.PublishOptions`](#PublishOptions)
    * [.HttpPublisher](#HttpPublisher) ⇐ <code>[Publisher](#Publisher)</code>
        * [`.upload(file, arch, safeArtifactName)`](#module_electron-publish.HttpPublisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.uploadData(data, arch, fileName)`](#module_electron-publish.HttpPublisher+uploadData) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.toString()`](#module_electron-publish.Publisher+toString) ⇒ <code>String</code>
    * [.Publisher](#Publisher)
        * [`.toString()`](#module_electron-publish.Publisher+toString) ⇒ <code>String</code>
        * [`.upload(file, arch, safeArtifactName)`](#module_electron-publish.Publisher+upload) ⇒ <code>Promise&lt;any&gt;</code>

<a name="PublishContext"></a>
### `PublishContext`
**Kind**: interface of [<code>electron-publish</code>](#module_electron-publish)  
**Properties**

| Name | Type |
| --- | --- |
| **cancellationToken**| <code>[CancellationToken](electron-builder-http#CancellationToken)</code> | 
| progress| <code>[MultiProgress](#MultiProgress)</code> \| <code>null</code> | 

<a name="PublishOptions"></a>
### `PublishOptions`
**Kind**: interface of [<code>electron-publish</code>](#module_electron-publish)  
**Properties**

| Name | Type |
| --- | --- |
| publish| <code>"onTag"</code> \| <code>"onTagOrDraft"</code> \| <code>"always"</code> \| <code>"never"</code> \| <code>null</code> | 
| draft| <code>Boolean</code> | 
| prerelease| <code>Boolean</code> | 

<a name="HttpPublisher"></a>
### HttpPublisher ⇐ <code>[Publisher](#Publisher)</code>
**Kind**: class of [<code>electron-publish</code>](#module_electron-publish)  
**Extends**: <code>[Publisher](#Publisher)</code>  

* [.HttpPublisher](#HttpPublisher) ⇐ <code>[Publisher](#Publisher)</code>
    * [`.upload(file, arch, safeArtifactName)`](#module_electron-publish.HttpPublisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.uploadData(data, arch, fileName)`](#module_electron-publish.HttpPublisher+uploadData) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.toString()`](#module_electron-publish.Publisher+toString) ⇒ <code>String</code>

<a name="module_electron-publish.HttpPublisher+upload"></a>
#### `httpPublisher.upload(file, arch, safeArtifactName)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>HttpPublisher</code>](#HttpPublisher)  
**Overrides**: [<code>upload</code>](#module_electron-publish.Publisher+upload)  

| Param | Type |
| --- | --- |
| file | <code>String</code> | 
| arch | <code>module:electron-builder-util/out/arch.Arch</code> | 
| safeArtifactName | <code>String</code> | 

<a name="module_electron-publish.HttpPublisher+uploadData"></a>
#### `httpPublisher.uploadData(data, arch, fileName)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>HttpPublisher</code>](#HttpPublisher)  

| Param | Type |
| --- | --- |
| data | <code>Buffer</code> | 
| arch | <code>module:electron-builder-util/out/arch.Arch</code> | 
| fileName | <code>String</code> | 

<a name="module_electron-publish.Publisher+toString"></a>
#### `httpPublisher.toString()` ⇒ <code>String</code>
**Kind**: instance method of [<code>HttpPublisher</code>](#HttpPublisher)  
<a name="Publisher"></a>
### Publisher
**Kind**: class of [<code>electron-publish</code>](#module_electron-publish)  
**Properties**

| Name | Type |
| --- | --- |
| **providerName**| <code>String</code> | 


* [.Publisher](#Publisher)
    * [`.toString()`](#module_electron-publish.Publisher+toString) ⇒ <code>String</code>
    * [`.upload(file, arch, safeArtifactName)`](#module_electron-publish.Publisher+upload) ⇒ <code>Promise&lt;any&gt;</code>

<a name="module_electron-publish.Publisher+toString"></a>
#### `publisher.toString()` ⇒ <code>String</code>
**Kind**: instance method of [<code>Publisher</code>](#Publisher)  
<a name="module_electron-publish.Publisher+upload"></a>
#### `publisher.upload(file, arch, safeArtifactName)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>Publisher</code>](#Publisher)  

| Param | Type |
| --- | --- |
| file | <code>String</code> | 
| arch | <code>module:electron-builder-util/out/arch.Arch</code> | 
| safeArtifactName | <code>String</code> | 

