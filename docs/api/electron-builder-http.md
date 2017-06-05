## Modules

<dl>
<dt><a href="#module_electron-builder-http/out/bintray">electron-builder-http/out/bintray</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder-http/out/CancellationToken">electron-builder-http/out/CancellationToken</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder-http/out/ProgressCallbackTransform">electron-builder-http/out/ProgressCallbackTransform</a></dt>
<dd></dd>
<dt><a href="#module_electron-builder-http">electron-builder-http</a></dt>
<dd></dd>
</dl>

<a name="module_electron-builder-http/out/bintray"></a>

## electron-builder-http/out/bintray

* [electron-builder-http/out/bintray](#module_electron-builder-http/out/bintray)
    * [`.File`](#File)
    * [`.Version`](#Version)
    * [.BintrayClient](#BintrayClient)
        * [`.createVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+createVersion) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.deleteVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+deleteVersion) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+getVersion) ⇒ <code>Promise&lt;[Version](#Version)&gt;</code>
        * [`.getVersionFiles(version)`](#module_electron-builder-http/out/bintray.BintrayClient+getVersionFiles) ⇒ <code>Promise&lt;Array&lt;[File](#File)&gt;&gt;</code>
    * [`.bintrayRequest(path, auth, data, cancellationToken, method)`](#module_electron-builder-http/out/bintray.bintrayRequest) ⇒ <code>Promise&lt;module:electron-builder-http/out/bintray.T&gt;</code>

<a name="File"></a>

### `File`
**Kind**: interface of [<code>electron-builder-http/out/bintray</code>](#module_electron-builder-http/out/bintray)  
**Properties**

| Name | Type |
| --- | --- |
| **name**| <code>string</code> | 
| **path**| <code>string</code> | 
| **sha1**| <code>string</code> | 
| **sha256**| <code>string</code> | 

<a name="Version"></a>

### `Version`
**Kind**: interface of [<code>electron-builder-http/out/bintray</code>](#module_electron-builder-http/out/bintray)  
**Properties**

| Name | Type |
| --- | --- |
| **name**| <code>string</code> | 
| **package**| <code>string</code> | 

<a name="BintrayClient"></a>

### BintrayClient
**Kind**: class of [<code>electron-builder-http/out/bintray</code>](#module_electron-builder-http/out/bintray)  
**Properties**

| Name | Type |
| --- | --- |
| auth| <code>string</code> \| <code>null</code> | 
| repo| <code>string</code> | 
| owner| <code>string</code> | 
| user| <code>string</code> | 
| packageName| <code>string</code> | 


* [.BintrayClient](#BintrayClient)
    * [`.createVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+createVersion) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.deleteVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+deleteVersion) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+getVersion) ⇒ <code>Promise&lt;[Version](#Version)&gt;</code>
    * [`.getVersionFiles(version)`](#module_electron-builder-http/out/bintray.BintrayClient+getVersionFiles) ⇒ <code>Promise&lt;Array&lt;[File](#File)&gt;&gt;</code>

<a name="module_electron-builder-http/out/bintray.BintrayClient+createVersion"></a>

#### `bintrayClient.createVersion(version)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>BintrayClient</code>](#BintrayClient)  

| Param | Type |
| --- | --- |
| version | <code>string</code> | 

<a name="module_electron-builder-http/out/bintray.BintrayClient+deleteVersion"></a>

#### `bintrayClient.deleteVersion(version)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: instance method of [<code>BintrayClient</code>](#BintrayClient)  

| Param | Type |
| --- | --- |
| version | <code>string</code> | 

<a name="module_electron-builder-http/out/bintray.BintrayClient+getVersion"></a>

#### `bintrayClient.getVersion(version)` ⇒ <code>Promise&lt;[Version](#Version)&gt;</code>
**Kind**: instance method of [<code>BintrayClient</code>](#BintrayClient)  

| Param | Type |
| --- | --- |
| version | <code>string</code> | 

<a name="module_electron-builder-http/out/bintray.BintrayClient+getVersionFiles"></a>

#### `bintrayClient.getVersionFiles(version)` ⇒ <code>Promise&lt;Array&lt;[File](#File)&gt;&gt;</code>
**Kind**: instance method of [<code>BintrayClient</code>](#BintrayClient)  

| Param | Type |
| --- | --- |
| version | <code>string</code> | 

<a name="module_electron-builder-http/out/bintray.bintrayRequest"></a>

### `electron-builder-http/out/bintray.bintrayRequest(path, auth, data, cancellationToken, method)` ⇒ <code>Promise&lt;module:electron-builder-http/out/bintray.T&gt;</code>
**Kind**: method of [<code>electron-builder-http/out/bintray</code>](#module_electron-builder-http/out/bintray)  

| Param | Type |
| --- | --- |
| path | <code>string</code> | 
| auth | <code>string</code> \| <code>null</code> | 
| data | <code>Object&lt;string, any&gt;</code> \| <code>null</code> | 
| cancellationToken | <code>[CancellationToken](#CancellationToken)</code> | 
| method | <code>"GET"</code> \| <code>"DELETE"</code> \| <code>"PUT"</code> | 

<a name="module_electron-builder-http/out/CancellationToken"></a>

## electron-builder-http/out/CancellationToken

* [electron-builder-http/out/CancellationToken](#module_electron-builder-http/out/CancellationToken)
    * [.CancellationError](#CancellationError) ⇐ <code>Error</code>
    * [.CancellationToken](#CancellationToken) ⇐ <code>internal:EventEmitter</code>
        * [`.cancel()`](#module_electron-builder-http/out/CancellationToken.CancellationToken+cancel)
        * [`.createPromise(callback)`](#module_electron-builder-http/out/CancellationToken.CancellationToken+createPromise) ⇒ <code>Promise&lt;module:electron-builder-http/out/CancellationToken.R&gt;</code>
        * [`.dispose()`](#module_electron-builder-http/out/CancellationToken.CancellationToken+dispose)

<a name="CancellationError"></a>

### CancellationError ⇐ <code>Error</code>
**Kind**: class of [<code>electron-builder-http/out/CancellationToken</code>](#module_electron-builder-http/out/CancellationToken)  
**Extends**: <code>Error</code>  
<a name="CancellationToken"></a>

### CancellationToken ⇐ <code>internal:EventEmitter</code>
**Kind**: class of [<code>electron-builder-http/out/CancellationToken</code>](#module_electron-builder-http/out/CancellationToken)  
**Extends**: <code>internal:EventEmitter</code>  

* [.CancellationToken](#CancellationToken) ⇐ <code>internal:EventEmitter</code>
    * [`.cancel()`](#module_electron-builder-http/out/CancellationToken.CancellationToken+cancel)
    * [`.createPromise(callback)`](#module_electron-builder-http/out/CancellationToken.CancellationToken+createPromise) ⇒ <code>Promise&lt;module:electron-builder-http/out/CancellationToken.R&gt;</code>
    * [`.dispose()`](#module_electron-builder-http/out/CancellationToken.CancellationToken+dispose)

<a name="module_electron-builder-http/out/CancellationToken.CancellationToken+cancel"></a>

#### `cancellationToken.cancel()`
**Kind**: instance method of [<code>CancellationToken</code>](#CancellationToken)  
<a name="module_electron-builder-http/out/CancellationToken.CancellationToken+createPromise"></a>

#### `cancellationToken.createPromise(callback)` ⇒ <code>Promise&lt;module:electron-builder-http/out/CancellationToken.R&gt;</code>
**Kind**: instance method of [<code>CancellationToken</code>](#CancellationToken)  

| Param | Type |
| --- | --- |
| callback | <code>callback</code> | 

<a name="module_electron-builder-http/out/CancellationToken.CancellationToken+dispose"></a>

#### `cancellationToken.dispose()`
**Kind**: instance method of [<code>CancellationToken</code>](#CancellationToken)  
<a name="module_electron-builder-http/out/ProgressCallbackTransform"></a>

## electron-builder-http/out/ProgressCallbackTransform

* [electron-builder-http/out/ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform)
    * [`.ProgressInfo`](#ProgressInfo)
    * [.ProgressCallbackTransform](#ProgressCallbackTransform) ⇐ <code>internal:Transform</code>
        * [`._flush(callback)`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_flush)
        * [`._transform(chunk, encoding, callback)`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_transform)

<a name="ProgressInfo"></a>

### `ProgressInfo`
**Kind**: interface of [<code>electron-builder-http/out/ProgressCallbackTransform</code>](#module_electron-builder-http/out/ProgressCallbackTransform)  
**Properties**

| Name | Type |
| --- | --- |
| **total**| <code>number</code> | 
| **delta**| <code>number</code> | 
| **transferred**| <code>number</code> | 
| **percent**| <code>number</code> | 
| **bytesPerSecond**| <code>number</code> | 

<a name="ProgressCallbackTransform"></a>

### ProgressCallbackTransform ⇐ <code>internal:Transform</code>
**Kind**: class of [<code>electron-builder-http/out/ProgressCallbackTransform</code>](#module_electron-builder-http/out/ProgressCallbackTransform)  
**Extends**: <code>internal:Transform</code>  

* [.ProgressCallbackTransform](#ProgressCallbackTransform) ⇐ <code>internal:Transform</code>
    * [`._flush(callback)`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_flush)
    * [`._transform(chunk, encoding, callback)`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_transform)

<a name="module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_flush"></a>

#### `progressCallbackTransform._flush(callback)`
**Kind**: instance method of [<code>ProgressCallbackTransform</code>](#ProgressCallbackTransform)  

| Param | Type |
| --- | --- |
| callback | <code>function</code> | 

<a name="module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_transform"></a>

#### `progressCallbackTransform._transform(chunk, encoding, callback)`
**Kind**: instance method of [<code>ProgressCallbackTransform</code>](#ProgressCallbackTransform)  

| Param | Type |
| --- | --- |
| chunk | <code>any</code> | 
| encoding | <code>string</code> | 
| callback | <code>function</code> | 

<a name="module_electron-builder-http"></a>

## electron-builder-http

* [electron-builder-http](#module_electron-builder-http)
    * [`.DownloadOptions`](#DownloadOptions)
        * [`.onProgress(progress)`](#module_electron-builder-http.DownloadOptions+onProgress)
    * [`.RequestHeaders`](#RequestHeaders)
    * [`.Response`](#Response) ⇐ <code>internal:EventEmitter</code>
        * [`.setEncoding(encoding)`](#module_electron-builder-http.Response+setEncoding)
    * [.DigestTransform](#DigestTransform) ⇐ <code>internal:Transform</code>
        * [`._flush(callback)`](#module_electron-builder-http.DigestTransform+_flush)
        * [`._transform(chunk, encoding, callback)`](#module_electron-builder-http.DigestTransform+_transform)
    * [.HttpError](#HttpError) ⇐ <code>Error</code>
    * [.HttpExecutor](#HttpExecutor)
        * [`.download(url, destination, options)`](#module_electron-builder-http.HttpExecutor+download) ⇒ <code>Promise&lt;string&gt;</code>
        * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.HttpExecutor+request) ⇒ <code>Promise&lt;module:electron-builder-http.T&gt;</code>
        * [`.addTimeOutHandler(request, callback)`](#module_electron-builder-http.HttpExecutor+addTimeOutHandler)
        * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-builder-http.HttpExecutor+doApiRequest) ⇒ <code>Promise&lt;module:electron-builder-http.T&gt;</code>
        * [`.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`](#module_electron-builder-http.HttpExecutor+doDownload)
        * [`.doRequest(options, callback)`](#module_electron-builder-http.HttpExecutor+doRequest) ⇒ <code>any</code>
        * [`.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`](#module_electron-builder-http.HttpExecutor+handleResponse)
    * [.HttpExecutorHolder](#HttpExecutorHolder)
    * [`.configureRequestOptions(options, token, method)`](#module_electron-builder-http.configureRequestOptions) ⇒ <code>module:http.RequestOptions</code>
    * [`.download(url, destination, options)`](#module_electron-builder-http.download) ⇒ <code>Promise&lt;string&gt;</code>
    * [`.dumpRequestOptions(options)`](#module_electron-builder-http.dumpRequestOptions) ⇒ <code>string</code>
    * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.request) ⇒ <code>Promise&lt;module:electron-builder-http.T&gt;</code>
    * [`.safeGetHeader(response, headerKey)`](#module_electron-builder-http.safeGetHeader) ⇒ <code>any</code>

<a name="DownloadOptions"></a>

### `DownloadOptions`
**Kind**: interface of [<code>electron-builder-http</code>](#module_electron-builder-http)  
**Properties**

| Name | Type |
| --- | --- |
| headers| <code>[RequestHeaders](#RequestHeaders)</code> \| <code>null</code> | 
| skipDirCreation| <code>boolean</code> | 
| sha2| <code>string</code> \| <code>null</code> | 
| sha512| <code>string</code> \| <code>null</code> | 
| **cancellationToken**| <code>[CancellationToken](#CancellationToken)</code> | 

<a name="module_electron-builder-http.DownloadOptions+onProgress"></a>

#### `downloadOptions.onProgress(progress)`
**Kind**: instance method of [<code>DownloadOptions</code>](#DownloadOptions)  

| Param | Type |
| --- | --- |
| progress | <code>[ProgressInfo](#ProgressInfo)</code> | 

<a name="RequestHeaders"></a>

### `RequestHeaders`
**Kind**: interface of [<code>electron-builder-http</code>](#module_electron-builder-http)  
<a name="Response"></a>

### `Response` ⇐ <code>internal:EventEmitter</code>
**Kind**: interface of [<code>electron-builder-http</code>](#module_electron-builder-http)  
**Extends**: <code>internal:EventEmitter</code>  
**Properties**

| Name | Type |
| --- | --- |
| statusCode| <code>number</code> | 
| statusMessage| <code>string</code> | 
| **headers**| <code>any</code> | 

<a name="module_electron-builder-http.Response+setEncoding"></a>

#### `response.setEncoding(encoding)`
**Kind**: instance method of [<code>Response</code>](#Response)  

| Param | Type |
| --- | --- |
| encoding | <code>string</code> | 

<a name="DigestTransform"></a>

### DigestTransform ⇐ <code>internal:Transform</code>
**Kind**: class of [<code>electron-builder-http</code>](#module_electron-builder-http)  
**Extends**: <code>internal:Transform</code>  

* [.DigestTransform](#DigestTransform) ⇐ <code>internal:Transform</code>
    * [`._flush(callback)`](#module_electron-builder-http.DigestTransform+_flush)
    * [`._transform(chunk, encoding, callback)`](#module_electron-builder-http.DigestTransform+_transform)

<a name="module_electron-builder-http.DigestTransform+_flush"></a>

#### `digestTransform._flush(callback)`
**Kind**: instance method of [<code>DigestTransform</code>](#DigestTransform)  

| Param | Type |
| --- | --- |
| callback | <code>function</code> | 

<a name="module_electron-builder-http.DigestTransform+_transform"></a>

#### `digestTransform._transform(chunk, encoding, callback)`
**Kind**: instance method of [<code>DigestTransform</code>](#DigestTransform)  

| Param | Type |
| --- | --- |
| chunk | <code>any</code> | 
| encoding | <code>string</code> | 
| callback | <code>function</code> | 

<a name="HttpError"></a>

### HttpError ⇐ <code>Error</code>
**Kind**: class of [<code>electron-builder-http</code>](#module_electron-builder-http)  
**Extends**: <code>Error</code>  
<a name="HttpExecutor"></a>

### HttpExecutor
**Kind**: class of [<code>electron-builder-http</code>](#module_electron-builder-http)  
**Properties**

| Name | Type |
| --- | --- |
| maxRedirects = <code>10</code>| <code>"10"</code> | 


* [.HttpExecutor](#HttpExecutor)
    * [`.download(url, destination, options)`](#module_electron-builder-http.HttpExecutor+download) ⇒ <code>Promise&lt;string&gt;</code>
    * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.HttpExecutor+request) ⇒ <code>Promise&lt;module:electron-builder-http.T&gt;</code>
    * [`.addTimeOutHandler(request, callback)`](#module_electron-builder-http.HttpExecutor+addTimeOutHandler)
    * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-builder-http.HttpExecutor+doApiRequest) ⇒ <code>Promise&lt;module:electron-builder-http.T&gt;</code>
    * [`.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`](#module_electron-builder-http.HttpExecutor+doDownload)
    * [`.doRequest(options, callback)`](#module_electron-builder-http.HttpExecutor+doRequest) ⇒ <code>any</code>
    * [`.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`](#module_electron-builder-http.HttpExecutor+handleResponse)

<a name="module_electron-builder-http.HttpExecutor+download"></a>

#### `httpExecutor.download(url, destination, options)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: instance method of [<code>HttpExecutor</code>](#HttpExecutor)  

| Param | Type |
| --- | --- |
| url | <code>string</code> | 
| destination | <code>string</code> | 
| options | <code>[DownloadOptions](#DownloadOptions)</code> | 

<a name="module_electron-builder-http.HttpExecutor+request"></a>

#### `httpExecutor.request(options, cancellationToken, data)` ⇒ <code>Promise&lt;module:electron-builder-http.T&gt;</code>
**Kind**: instance method of [<code>HttpExecutor</code>](#HttpExecutor)  

| Param | Type |
| --- | --- |
| options | <code>module:http.RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#CancellationToken)</code> | 
| data | <code>Object&lt;string, any&gt;</code> \| <code>null</code> | 

<a name="module_electron-builder-http.HttpExecutor+addTimeOutHandler"></a>

#### `httpExecutor.addTimeOutHandler(request, callback)`
**Kind**: instance method of [<code>HttpExecutor</code>](#HttpExecutor)  
**Access**: protected  

| Param | Type |
| --- | --- |
| request | <code>any</code> | 
| callback | <code>callback</code> | 

<a name="module_electron-builder-http.HttpExecutor+doApiRequest"></a>

#### `httpExecutor.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)` ⇒ <code>Promise&lt;module:electron-builder-http.T&gt;</code>
**Kind**: instance method of [<code>HttpExecutor</code>](#HttpExecutor)  
**Access**: protected  

| Param | Type |
| --- | --- |
| options | <code>any</code> | 
| cancellationToken | <code>[CancellationToken](#CancellationToken)</code> | 
| requestProcessor | <code>callback</code> | 
| redirectCount | <code>number</code> | 

<a name="module_electron-builder-http.HttpExecutor+doDownload"></a>

#### `httpExecutor.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`
**Kind**: instance method of [<code>HttpExecutor</code>](#HttpExecutor)  
**Access**: protected  

| Param | Type |
| --- | --- |
| requestOptions | <code>any</code> | 
| destination | <code>string</code> | 
| redirectCount | <code>number</code> | 
| options | <code>[DownloadOptions](#DownloadOptions)</code> | 
| callback | <code>callback</code> | 
| onCancel | <code>callback</code> | 

<a name="module_electron-builder-http.HttpExecutor+doRequest"></a>

#### `httpExecutor.doRequest(options, callback)` ⇒ <code>any</code>
**Kind**: instance method of [<code>HttpExecutor</code>](#HttpExecutor)  
**Access**: protected  

| Param | Type |
| --- | --- |
| options | <code>any</code> | 
| callback | <code>callback</code> | 

<a name="module_electron-builder-http.HttpExecutor+handleResponse"></a>

#### `httpExecutor.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`
**Kind**: instance method of [<code>HttpExecutor</code>](#HttpExecutor)  
**Access**: protected  

| Param | Type |
| --- | --- |
| response | <code>[Response](#Response)</code> | 
| options | <code>module:http.RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#CancellationToken)</code> | 
| resolve | <code>callback</code> | 
| reject | <code>callback</code> | 
| redirectCount | <code>number</code> | 
| requestProcessor | <code>callback</code> | 

<a name="HttpExecutorHolder"></a>

### HttpExecutorHolder
**Kind**: class of [<code>electron-builder-http</code>](#module_electron-builder-http)  
<a name="module_electron-builder-http.configureRequestOptions"></a>

### `electron-builder-http.configureRequestOptions(options, token, method)` ⇒ <code>module:http.RequestOptions</code>
**Kind**: method of [<code>electron-builder-http</code>](#module_electron-builder-http)  

| Param | Type |
| --- | --- |
| options | <code>module:http.RequestOptions</code> | 
| token | <code>string</code> \| <code>null</code> | 
| method | <code>"GET"</code> \| <code>"DELETE"</code> \| <code>"PUT"</code> | 

<a name="module_electron-builder-http.download"></a>

### `electron-builder-http.download(url, destination, options)` ⇒ <code>Promise&lt;string&gt;</code>
**Kind**: method of [<code>electron-builder-http</code>](#module_electron-builder-http)  

| Param | Type |
| --- | --- |
| url | <code>string</code> | 
| destination | <code>string</code> | 
| options | <code>[DownloadOptions](#DownloadOptions)</code> \| <code>null</code> | 

<a name="module_electron-builder-http.dumpRequestOptions"></a>

### `electron-builder-http.dumpRequestOptions(options)` ⇒ <code>string</code>
**Kind**: method of [<code>electron-builder-http</code>](#module_electron-builder-http)  

| Param | Type |
| --- | --- |
| options | <code>module:http.RequestOptions</code> | 

<a name="module_electron-builder-http.request"></a>

### `electron-builder-http.request(options, cancellationToken, data)` ⇒ <code>Promise&lt;module:electron-builder-http.T&gt;</code>
**Kind**: method of [<code>electron-builder-http</code>](#module_electron-builder-http)  

| Param | Type |
| --- | --- |
| options | <code>module:http.RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#CancellationToken)</code> | 
| data | <code>Object&lt;string, any&gt;</code> \| <code>null</code> | 

<a name="module_electron-builder-http.safeGetHeader"></a>

### `electron-builder-http.safeGetHeader(response, headerKey)` ⇒ <code>any</code>
**Kind**: method of [<code>electron-builder-http</code>](#module_electron-builder-http)  

| Param | Type |
| --- | --- |
| response | <code>any</code> | 
| headerKey | <code>string</code> | 

