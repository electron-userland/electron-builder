## Modules

* [electron-updater/out/AppUpdater](#module_electron-updater/out/AppUpdater)
    * [`.Logger`](#module_electron-updater/out/AppUpdater.Logger)
        * [`.error(message)`](#module_electron-updater/out/AppUpdater.Logger+error)
        * [`.info(message)`](#module_electron-updater/out/AppUpdater.Logger+info)
        * [`.warn(message)`](#module_electron-updater/out/AppUpdater.Logger+warn)
    * [.AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater) ⇐ <code>internal:EventEmitter</code>
        * [`.checkForUpdates()`](#module_electron-updater/out/AppUpdater.AppUpdater+checkForUpdates) ⇒ <code>Promise</code>
        * [`.downloadUpdate(cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+downloadUpdate) ⇒ <code>Promise</code>
        * [`.getFeedURL()`](#module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL) ⇒
        * [`.setFeedURL(options)`](#module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL)
        * [`.loadUpdateConfig()`](#module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig) ⇒ <code>Promise</code>
        * [`.quitAndInstall()`](#module_electron-updater/out/AppUpdater.AppUpdater+quitAndInstall)
        * [`.dispatchError(e)`](#module_electron-updater/out/AppUpdater.AppUpdater+dispatchError)
        * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+doDownloadUpdate) ⇒ <code>Promise</code>
        * [`.onUpdateAvailable(versionInfo, fileInfo)`](#module_electron-updater/out/AppUpdater.AppUpdater+onUpdateAvailable)
* [electron-updater/out/BintrayProvider](#module_electron-updater/out/BintrayProvider)
    * [.BintrayProvider](#module_electron-updater/out/BintrayProvider.BintrayProvider) ⇐ <code>[Provider](#module_electron-updater/out/api.Provider)</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getLatestVersion) ⇒ <code>Promise</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getUpdateFile) ⇒ <code>Promise</code>
        * [`.setRequestHeaders(value)`](#module_electron-updater/out/api.Provider+setRequestHeaders)
* [electron-updater/out/GenericProvider](#module_electron-updater/out/GenericProvider)
    * [.GenericProvider](#module_electron-updater/out/GenericProvider.GenericProvider) ⇐ <code>[Provider](#module_electron-updater/out/api.Provider)</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/GenericProvider.GenericProvider+getLatestVersion) ⇒ <code>Promise</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GenericProvider.GenericProvider+getUpdateFile) ⇒ <code>Promise</code>
        * [`.setRequestHeaders(value)`](#module_electron-updater/out/api.Provider+setRequestHeaders)
    * [`.validateUpdateInfo(info)`](#module_electron-updater/out/GenericProvider.validateUpdateInfo)
* [electron-updater/out/GitHubProvider](#module_electron-updater/out/GitHubProvider)
    * [.GitHubProvider](#module_electron-updater/out/GitHubProvider.GitHubProvider) ⇐ <code>[Provider](#module_electron-updater/out/api.Provider)</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getLatestVersion) ⇒ <code>Promise</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getUpdateFile) ⇒ <code>Promise</code>
        * [`.setRequestHeaders(value)`](#module_electron-updater/out/api.Provider+setRequestHeaders)
* [electron-updater/out/MacUpdater](#module_electron-updater/out/MacUpdater)
    * [.MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater) ⇐ <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>
        * [`.quitAndInstall()`](#module_electron-updater/out/MacUpdater.MacUpdater+quitAndInstall)
        * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/MacUpdater.MacUpdater+doDownloadUpdate) ⇒ <code>module:bluebird-lst.Bluebird</code>
        * [`.onUpdateAvailable(versionInfo, fileInfo)`](#module_electron-updater/out/MacUpdater.MacUpdater+onUpdateAvailable)
        * [`.checkForUpdates()`](#module_electron-updater/out/AppUpdater.AppUpdater+checkForUpdates) ⇒ <code>Promise</code>
        * [`.downloadUpdate(cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+downloadUpdate) ⇒ <code>Promise</code>
        * [`.getFeedURL()`](#module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL) ⇒
        * [`.setFeedURL(options)`](#module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL)
        * [`.loadUpdateConfig()`](#module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig) ⇒ <code>Promise</code>
        * [`.dispatchError(e)`](#module_electron-updater/out/AppUpdater.AppUpdater+dispatchError)
* [electron-updater/out/NsisUpdater](#module_electron-updater/out/NsisUpdater)
    * [.NsisUpdater](#module_electron-updater/out/NsisUpdater.NsisUpdater) ⇐ <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>
        * [`.quitAndInstall()`](#module_electron-updater/out/NsisUpdater.NsisUpdater+quitAndInstall)
        * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/NsisUpdater.NsisUpdater+doDownloadUpdate) ⇒ <code>Promise</code>
        * [`.checkForUpdates()`](#module_electron-updater/out/AppUpdater.AppUpdater+checkForUpdates) ⇒ <code>Promise</code>
        * [`.downloadUpdate(cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+downloadUpdate) ⇒ <code>Promise</code>
        * [`.getFeedURL()`](#module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL) ⇒
        * [`.setFeedURL(options)`](#module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL)
        * [`.loadUpdateConfig()`](#module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig) ⇒ <code>Promise</code>
        * [`.dispatchError(e)`](#module_electron-updater/out/AppUpdater.AppUpdater+dispatchError)
        * [`.onUpdateAvailable(versionInfo, fileInfo)`](#module_electron-updater/out/AppUpdater.AppUpdater+onUpdateAvailable)
* [electron-updater/out/api](#module_electron-updater/out/api)
    * [`.FileInfo`](#module_electron-updater/out/api.FileInfo)
    * [`.UpdateCheckResult`](#module_electron-updater/out/api.UpdateCheckResult)
    * [.Provider](#module_electron-updater/out/api.Provider)
        * [`.getLatestVersion()`](#module_electron-updater/out/api.Provider+getLatestVersion) ⇒ <code>Promise</code>
        * [`.setRequestHeaders(value)`](#module_electron-updater/out/api.Provider+setRequestHeaders)
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/api.Provider+getUpdateFile) ⇒ <code>Promise</code>
    * [.UpdaterSignal](#module_electron-updater/out/api.UpdaterSignal)
        * [`.progress(handler)`](#module_electron-updater/out/api.UpdaterSignal+progress)
        * [`.updateCancelled(handler)`](#module_electron-updater/out/api.UpdaterSignal+updateCancelled)
        * [`.updateDownloaded(handler)`](#module_electron-updater/out/api.UpdaterSignal+updateDownloaded)
    * [`.getDefaultChannelName()`](#module_electron-updater/out/api.getDefaultChannelName) ⇒ <code>string</code>
    * [`.getCustomChannelName(channel)`](#module_electron-updater/out/api.getCustomChannelName) ⇒ <code>string</code>
    * [`.getCurrentPlatform()`](#module_electron-updater/out/api.getCurrentPlatform) ⇒
    * [`.getChannelFilename(channel)`](#module_electron-updater/out/api.getChannelFilename) ⇒ <code>string</code>
* [electron-updater/out/electronHttpExecutor](#module_electron-updater/out/electronHttpExecutor)
    * [.ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor) ⇐ <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>
        * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doApiRequest) ⇒ <code>Promise</code>
        * [`.download(url, destination, options)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+download) ⇒ <code>Promise</code>
        * [`.doRequest(options, callback)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doRequest) ⇒
        * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.HttpExecutor+request) ⇒ <code>Promise</code>
        * [`.addTimeOutHandler(request, callback)`](#module_electron-builder-http.HttpExecutor+addTimeOutHandler)
        * [`.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`](#module_electron-builder-http.HttpExecutor+doDownload)
        * [`.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`](#module_electron-builder-http.HttpExecutor+handleResponse)
* [electron-updater](#module_electron-updater)
    * [`.autoUpdater`](#module_electron-updater.autoUpdater) : <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>
* [electron-builder-http/out/CancellationToken](#module_electron-builder-http/out/CancellationToken)
    * [.CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken) ⇐ <code>internal:EventEmitter</code>
        * [`.cancel()`](#module_electron-builder-http/out/CancellationToken.CancellationToken+cancel)
        * [`.createPromise(callback)`](#module_electron-builder-http/out/CancellationToken.CancellationToken+createPromise) ⇒ <code>Promise</code>
        * [`.dispose()`](#module_electron-builder-http/out/CancellationToken.CancellationToken+dispose)
    * [.CancellationError](#module_electron-builder-http/out/CancellationToken.CancellationError) ⇐ <code>Error</code>
* [electron-builder-http/out/ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform)
    * [`.ProgressInfo`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressInfo)
    * [.ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform) ⇐ <code>internal:Transform</code>
        * [`._flush(callback)`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_flush)
        * [`._transform(chunk, encoding, callback)`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_transform)
* [electron-builder-http/out/bintray](#module_electron-builder-http/out/bintray)
    * [`.Version`](#module_electron-builder-http/out/bintray.Version)
    * [`.File`](#module_electron-builder-http/out/bintray.File)
    * [.BintrayClient](#module_electron-builder-http/out/bintray.BintrayClient)
        * [`.createVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+createVersion) ⇒ <code>Promise</code>
        * [`.deleteVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+deleteVersion) ⇒ <code>Promise</code>
        * [`.getVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+getVersion) ⇒ <code>Promise</code>
        * [`.getVersionFiles(version)`](#module_electron-builder-http/out/bintray.BintrayClient+getVersionFiles) ⇒ <code>Promise</code>
    * [`.bintrayRequest(path, auth, data, cancellationToken, method)`](#module_electron-builder-http/out/bintray.bintrayRequest) ⇒ <code>Promise</code>
* [electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)
    * [`.PublishConfiguration`](#module_electron-builder-http/out/publishOptions.PublishConfiguration)
    * [`.GenericServerOptions`](#module_electron-builder-http/out/publishOptions.GenericServerOptions) ⇐ <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code>
    * [`.S3Options`](#module_electron-builder-http/out/publishOptions.S3Options) ⇐ <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code>
    * [`.VersionInfo`](#module_electron-builder-http/out/publishOptions.VersionInfo)
    * [`.UpdateInfo`](#module_electron-builder-http/out/publishOptions.UpdateInfo) ⇐ <code>[VersionInfo](#module_electron-builder-http/out/publishOptions.VersionInfo)</code>
    * [`.GithubOptions`](#module_electron-builder-http/out/publishOptions.GithubOptions) ⇐ <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code>
    * [`.BintrayOptions`](#module_electron-builder-http/out/publishOptions.BintrayOptions) ⇐ <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code>
    * [`.s3Url(options)`](#module_electron-builder-http/out/publishOptions.s3Url) ⇒ <code>string</code>
    * [`.githubUrl(options)`](#module_electron-builder-http/out/publishOptions.githubUrl) ⇒ <code>string</code>
* [electron-builder-http](#module_electron-builder-http)
    * [`.RequestHeaders`](#module_electron-builder-http.RequestHeaders)
    * [`.Response`](#module_electron-builder-http.Response) ⇐ <code>internal:EventEmitter</code>
        * [`.setEncoding(encoding)`](#module_electron-builder-http.Response+setEncoding)
    * [`.DownloadOptions`](#module_electron-builder-http.DownloadOptions)
        * [`.onProgress(progress)`](#module_electron-builder-http.DownloadOptions+onProgress)
    * [.HttpExecutorHolder](#module_electron-builder-http.HttpExecutorHolder)
    * [.HttpError](#module_electron-builder-http.HttpError) ⇐ <code>Error</code>
    * [.HttpExecutor](#module_electron-builder-http.HttpExecutor)
        * [`.download(url, destination, options)`](#module_electron-builder-http.HttpExecutor+download) ⇒ <code>Promise</code>
        * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.HttpExecutor+request) ⇒ <code>Promise</code>
        * [`.addTimeOutHandler(request, callback)`](#module_electron-builder-http.HttpExecutor+addTimeOutHandler)
        * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-builder-http.HttpExecutor+doApiRequest) ⇒ <code>Promise</code>
        * [`.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`](#module_electron-builder-http.HttpExecutor+doDownload)
        * [`.doRequest(options, callback)`](#module_electron-builder-http.HttpExecutor+doRequest) ⇒
        * [`.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`](#module_electron-builder-http.HttpExecutor+handleResponse)
    * [`.download(url, destination, options)`](#module_electron-builder-http.download) ⇒ <code>Promise</code>
    * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.request) ⇒ <code>Promise</code>
    * [`.configureRequestOptions(options, token, method)`](#module_electron-builder-http.configureRequestOptions) ⇒ <code>module:http.RequestOptions</code>
    * [`.dumpRequestOptions(options)`](#module_electron-builder-http.dumpRequestOptions) ⇒ <code>string</code>

<a name="module_electron-updater/out/AppUpdater"></a>

## electron-updater/out/AppUpdater

* [electron-updater/out/AppUpdater](#module_electron-updater/out/AppUpdater)
    * [`.Logger`](#module_electron-updater/out/AppUpdater.Logger)
        * [`.error(message)`](#module_electron-updater/out/AppUpdater.Logger+error)
        * [`.info(message)`](#module_electron-updater/out/AppUpdater.Logger+info)
        * [`.warn(message)`](#module_electron-updater/out/AppUpdater.Logger+warn)
    * [.AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater) ⇐ <code>internal:EventEmitter</code>
        * [`.checkForUpdates()`](#module_electron-updater/out/AppUpdater.AppUpdater+checkForUpdates) ⇒ <code>Promise</code>
        * [`.downloadUpdate(cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+downloadUpdate) ⇒ <code>Promise</code>
        * [`.getFeedURL()`](#module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL) ⇒
        * [`.setFeedURL(options)`](#module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL)
        * [`.loadUpdateConfig()`](#module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig) ⇒ <code>Promise</code>
        * [`.quitAndInstall()`](#module_electron-updater/out/AppUpdater.AppUpdater+quitAndInstall)
        * [`.dispatchError(e)`](#module_electron-updater/out/AppUpdater.AppUpdater+dispatchError)
        * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+doDownloadUpdate) ⇒ <code>Promise</code>
        * [`.onUpdateAvailable(versionInfo, fileInfo)`](#module_electron-updater/out/AppUpdater.AppUpdater+onUpdateAvailable)


-

<a name="module_electron-updater/out/AppUpdater.Logger"></a>

### `electron-updater/out/AppUpdater.Logger`
**Kind**: interface of <code>[electron-updater/out/AppUpdater](#module_electron-updater/out/AppUpdater)</code>  

* [`.Logger`](#module_electron-updater/out/AppUpdater.Logger)
    * [`.error(message)`](#module_electron-updater/out/AppUpdater.Logger+error)
    * [`.info(message)`](#module_electron-updater/out/AppUpdater.Logger+info)
    * [`.warn(message)`](#module_electron-updater/out/AppUpdater.Logger+warn)


-

<a name="module_electron-updater/out/AppUpdater.Logger+error"></a>

#### `logger.error(message)`
**Kind**: instance method of <code>[Logger](#module_electron-updater/out/AppUpdater.Logger)</code>  

| Param |
| --- |
| message | 


-

<a name="module_electron-updater/out/AppUpdater.Logger+info"></a>

#### `logger.info(message)`
**Kind**: instance method of <code>[Logger](#module_electron-updater/out/AppUpdater.Logger)</code>  

| Param |
| --- |
| message | 


-

<a name="module_electron-updater/out/AppUpdater.Logger+warn"></a>

#### `logger.warn(message)`
**Kind**: instance method of <code>[Logger](#module_electron-updater/out/AppUpdater.Logger)</code>  

| Param |
| --- |
| message | 


-

<a name="module_electron-updater/out/AppUpdater.AppUpdater"></a>

### electron-updater/out/AppUpdater.AppUpdater ⇐ <code>internal:EventEmitter</code>
**Kind**: class of <code>[electron-updater/out/AppUpdater](#module_electron-updater/out/AppUpdater)</code>  
**Extends**: <code>internal:EventEmitter</code>  

* [.AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater) ⇐ <code>internal:EventEmitter</code>
    * [`.checkForUpdates()`](#module_electron-updater/out/AppUpdater.AppUpdater+checkForUpdates) ⇒ <code>Promise</code>
    * [`.downloadUpdate(cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+downloadUpdate) ⇒ <code>Promise</code>
    * [`.getFeedURL()`](#module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL) ⇒
    * [`.setFeedURL(options)`](#module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL)
    * [`.loadUpdateConfig()`](#module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig) ⇒ <code>Promise</code>
    * [`.quitAndInstall()`](#module_electron-updater/out/AppUpdater.AppUpdater+quitAndInstall)
    * [`.dispatchError(e)`](#module_electron-updater/out/AppUpdater.AppUpdater+dispatchError)
    * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+doDownloadUpdate) ⇒ <code>Promise</code>
    * [`.onUpdateAvailable(versionInfo, fileInfo)`](#module_electron-updater/out/AppUpdater.AppUpdater+onUpdateAvailable)


-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+checkForUpdates"></a>

#### `appUpdater.checkForUpdates()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>  

-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+downloadUpdate"></a>

#### `appUpdater.downloadUpdate(cancellationToken)` ⇒ <code>Promise</code>
Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.

**Kind**: instance method of <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>  
**Returns**: <code>Promise</code> - Path to downloaded file.  

| Param | Type |
| --- | --- |
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 


-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL"></a>

#### `appUpdater.getFeedURL()` ⇒
**Kind**: instance method of <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>  

-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL"></a>

#### `appUpdater.setFeedURL(options)`
Configure update provider. If value is `string`, [GenericServerOptions](#module_electron-builder-http/out/publishOptions.GenericServerOptions) will be set with value as `url`.

**Kind**: instance method of <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>  

| Param | Type | Description |
| --- | --- | --- |
| options | <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code> &#124; <code>[GenericServerOptions](#module_electron-builder-http/out/publishOptions.GenericServerOptions)</code> &#124; <code>[S3Options](#module_electron-builder-http/out/publishOptions.S3Options)</code> &#124; <code>[BintrayOptions](#module_electron-builder-http/out/publishOptions.BintrayOptions)</code> &#124; <code>[GithubOptions](#module_electron-builder-http/out/publishOptions.GithubOptions)</code> &#124; <code>string</code> | If you want to override configuration in the `app-update.yml`. |


-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig"></a>

#### `appUpdater.loadUpdateConfig()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>  

-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+quitAndInstall"></a>

#### `appUpdater.quitAndInstall()`
**Kind**: instance method of <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>  

-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+dispatchError"></a>

#### `appUpdater.dispatchError(e)`
**Kind**: instance method of <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| e | <code>Error</code> | 


-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+doDownloadUpdate"></a>

#### `appUpdater.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| versionInfo | <code>[VersionInfo](#module_electron-builder-http/out/publishOptions.VersionInfo)</code> | 
| fileInfo | <code>[FileInfo](#module_electron-updater/out/api.FileInfo)</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 


-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+onUpdateAvailable"></a>

#### `appUpdater.onUpdateAvailable(versionInfo, fileInfo)`
**Kind**: instance method of <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| versionInfo | <code>[VersionInfo](#module_electron-builder-http/out/publishOptions.VersionInfo)</code> | 
| fileInfo | <code>[FileInfo](#module_electron-updater/out/api.FileInfo)</code> | 


-

<a name="module_electron-updater/out/BintrayProvider"></a>

## electron-updater/out/BintrayProvider

* [electron-updater/out/BintrayProvider](#module_electron-updater/out/BintrayProvider)
    * [.BintrayProvider](#module_electron-updater/out/BintrayProvider.BintrayProvider) ⇐ <code>[Provider](#module_electron-updater/out/api.Provider)</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getLatestVersion) ⇒ <code>Promise</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getUpdateFile) ⇒ <code>Promise</code>
        * [`.setRequestHeaders(value)`](#module_electron-updater/out/api.Provider+setRequestHeaders)


-

<a name="module_electron-updater/out/BintrayProvider.BintrayProvider"></a>

### electron-updater/out/BintrayProvider.BintrayProvider ⇐ <code>[Provider](#module_electron-updater/out/api.Provider)</code>
**Kind**: class of <code>[electron-updater/out/BintrayProvider](#module_electron-updater/out/BintrayProvider)</code>  
**Extends**: <code>[Provider](#module_electron-updater/out/api.Provider)</code>  

* [.BintrayProvider](#module_electron-updater/out/BintrayProvider.BintrayProvider) ⇐ <code>[Provider](#module_electron-updater/out/api.Provider)</code>
    * [`.getLatestVersion()`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getLatestVersion) ⇒ <code>Promise</code>
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getUpdateFile) ⇒ <code>Promise</code>
    * [`.setRequestHeaders(value)`](#module_electron-updater/out/api.Provider+setRequestHeaders)


-

<a name="module_electron-updater/out/BintrayProvider.BintrayProvider+getLatestVersion"></a>

#### `bintrayProvider.getLatestVersion()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[BintrayProvider](#module_electron-updater/out/BintrayProvider.BintrayProvider)</code>  
**Overrides**: <code>[getLatestVersion](#module_electron-updater/out/api.Provider+getLatestVersion)</code>  

-

<a name="module_electron-updater/out/BintrayProvider.BintrayProvider+getUpdateFile"></a>

#### `bintrayProvider.getUpdateFile(versionInfo)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[BintrayProvider](#module_electron-updater/out/BintrayProvider.BintrayProvider)</code>  
**Overrides**: <code>[getUpdateFile](#module_electron-updater/out/api.Provider+getUpdateFile)</code>  

| Param | Type |
| --- | --- |
| versionInfo | <code>[VersionInfo](#module_electron-builder-http/out/publishOptions.VersionInfo)</code> | 


-

<a name="module_electron-updater/out/api.Provider+setRequestHeaders"></a>

#### `bintrayProvider.setRequestHeaders(value)`
**Kind**: instance method of <code>[BintrayProvider](#module_electron-updater/out/BintrayProvider.BintrayProvider)</code>  

| Param | Type |
| --- | --- |
| value | <code>[RequestHeaders](#module_electron-builder-http.RequestHeaders)</code> &#124; <code>null</code> | 


-

<a name="module_electron-updater/out/GenericProvider"></a>

## electron-updater/out/GenericProvider

* [electron-updater/out/GenericProvider](#module_electron-updater/out/GenericProvider)
    * [.GenericProvider](#module_electron-updater/out/GenericProvider.GenericProvider) ⇐ <code>[Provider](#module_electron-updater/out/api.Provider)</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/GenericProvider.GenericProvider+getLatestVersion) ⇒ <code>Promise</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GenericProvider.GenericProvider+getUpdateFile) ⇒ <code>Promise</code>
        * [`.setRequestHeaders(value)`](#module_electron-updater/out/api.Provider+setRequestHeaders)
    * [`.validateUpdateInfo(info)`](#module_electron-updater/out/GenericProvider.validateUpdateInfo)


-

<a name="module_electron-updater/out/GenericProvider.GenericProvider"></a>

### electron-updater/out/GenericProvider.GenericProvider ⇐ <code>[Provider](#module_electron-updater/out/api.Provider)</code>
**Kind**: class of <code>[electron-updater/out/GenericProvider](#module_electron-updater/out/GenericProvider)</code>  
**Extends**: <code>[Provider](#module_electron-updater/out/api.Provider)</code>  

* [.GenericProvider](#module_electron-updater/out/GenericProvider.GenericProvider) ⇐ <code>[Provider](#module_electron-updater/out/api.Provider)</code>
    * [`.getLatestVersion()`](#module_electron-updater/out/GenericProvider.GenericProvider+getLatestVersion) ⇒ <code>Promise</code>
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GenericProvider.GenericProvider+getUpdateFile) ⇒ <code>Promise</code>
    * [`.setRequestHeaders(value)`](#module_electron-updater/out/api.Provider+setRequestHeaders)


-

<a name="module_electron-updater/out/GenericProvider.GenericProvider+getLatestVersion"></a>

#### `genericProvider.getLatestVersion()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[GenericProvider](#module_electron-updater/out/GenericProvider.GenericProvider)</code>  
**Overrides**: <code>[getLatestVersion](#module_electron-updater/out/api.Provider+getLatestVersion)</code>  

-

<a name="module_electron-updater/out/GenericProvider.GenericProvider+getUpdateFile"></a>

#### `genericProvider.getUpdateFile(versionInfo)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[GenericProvider](#module_electron-updater/out/GenericProvider.GenericProvider)</code>  
**Overrides**: <code>[getUpdateFile](#module_electron-updater/out/api.Provider+getUpdateFile)</code>  

| Param | Type |
| --- | --- |
| versionInfo | <code>[UpdateInfo](#module_electron-builder-http/out/publishOptions.UpdateInfo)</code> | 


-

<a name="module_electron-updater/out/api.Provider+setRequestHeaders"></a>

#### `genericProvider.setRequestHeaders(value)`
**Kind**: instance method of <code>[GenericProvider](#module_electron-updater/out/GenericProvider.GenericProvider)</code>  

| Param | Type |
| --- | --- |
| value | <code>[RequestHeaders](#module_electron-builder-http.RequestHeaders)</code> &#124; <code>null</code> | 


-

<a name="module_electron-updater/out/GenericProvider.validateUpdateInfo"></a>

### `electron-updater/out/GenericProvider.validateUpdateInfo(info)`
**Kind**: method of <code>[electron-updater/out/GenericProvider](#module_electron-updater/out/GenericProvider)</code>  

| Param | Type |
| --- | --- |
| info | <code>[UpdateInfo](#module_electron-builder-http/out/publishOptions.UpdateInfo)</code> | 


-

<a name="module_electron-updater/out/GitHubProvider"></a>

## electron-updater/out/GitHubProvider

* [electron-updater/out/GitHubProvider](#module_electron-updater/out/GitHubProvider)
    * [.GitHubProvider](#module_electron-updater/out/GitHubProvider.GitHubProvider) ⇐ <code>[Provider](#module_electron-updater/out/api.Provider)</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getLatestVersion) ⇒ <code>Promise</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getUpdateFile) ⇒ <code>Promise</code>
        * [`.setRequestHeaders(value)`](#module_electron-updater/out/api.Provider+setRequestHeaders)


-

<a name="module_electron-updater/out/GitHubProvider.GitHubProvider"></a>

### electron-updater/out/GitHubProvider.GitHubProvider ⇐ <code>[Provider](#module_electron-updater/out/api.Provider)</code>
**Kind**: class of <code>[electron-updater/out/GitHubProvider](#module_electron-updater/out/GitHubProvider)</code>  
**Extends**: <code>[Provider](#module_electron-updater/out/api.Provider)</code>  

* [.GitHubProvider](#module_electron-updater/out/GitHubProvider.GitHubProvider) ⇐ <code>[Provider](#module_electron-updater/out/api.Provider)</code>
    * [`.getLatestVersion()`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getLatestVersion) ⇒ <code>Promise</code>
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getUpdateFile) ⇒ <code>Promise</code>
    * [`.setRequestHeaders(value)`](#module_electron-updater/out/api.Provider+setRequestHeaders)


-

<a name="module_electron-updater/out/GitHubProvider.GitHubProvider+getLatestVersion"></a>

#### `gitHubProvider.getLatestVersion()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[GitHubProvider](#module_electron-updater/out/GitHubProvider.GitHubProvider)</code>  
**Overrides**: <code>[getLatestVersion](#module_electron-updater/out/api.Provider+getLatestVersion)</code>  

-

<a name="module_electron-updater/out/GitHubProvider.GitHubProvider+getUpdateFile"></a>

#### `gitHubProvider.getUpdateFile(versionInfo)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[GitHubProvider](#module_electron-updater/out/GitHubProvider.GitHubProvider)</code>  
**Overrides**: <code>[getUpdateFile](#module_electron-updater/out/api.Provider+getUpdateFile)</code>  

| Param | Type |
| --- | --- |
| versionInfo | <code>[UpdateInfo](#module_electron-builder-http/out/publishOptions.UpdateInfo)</code> | 


-

<a name="module_electron-updater/out/api.Provider+setRequestHeaders"></a>

#### `gitHubProvider.setRequestHeaders(value)`
**Kind**: instance method of <code>[GitHubProvider](#module_electron-updater/out/GitHubProvider.GitHubProvider)</code>  

| Param | Type |
| --- | --- |
| value | <code>[RequestHeaders](#module_electron-builder-http.RequestHeaders)</code> &#124; <code>null</code> | 


-

<a name="module_electron-updater/out/MacUpdater"></a>

## electron-updater/out/MacUpdater

* [electron-updater/out/MacUpdater](#module_electron-updater/out/MacUpdater)
    * [.MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater) ⇐ <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>
        * [`.quitAndInstall()`](#module_electron-updater/out/MacUpdater.MacUpdater+quitAndInstall)
        * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/MacUpdater.MacUpdater+doDownloadUpdate) ⇒ <code>module:bluebird-lst.Bluebird</code>
        * [`.onUpdateAvailable(versionInfo, fileInfo)`](#module_electron-updater/out/MacUpdater.MacUpdater+onUpdateAvailable)
        * [`.checkForUpdates()`](#module_electron-updater/out/AppUpdater.AppUpdater+checkForUpdates) ⇒ <code>Promise</code>
        * [`.downloadUpdate(cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+downloadUpdate) ⇒ <code>Promise</code>
        * [`.getFeedURL()`](#module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL) ⇒
        * [`.setFeedURL(options)`](#module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL)
        * [`.loadUpdateConfig()`](#module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig) ⇒ <code>Promise</code>
        * [`.dispatchError(e)`](#module_electron-updater/out/AppUpdater.AppUpdater+dispatchError)


-

<a name="module_electron-updater/out/MacUpdater.MacUpdater"></a>

### electron-updater/out/MacUpdater.MacUpdater ⇐ <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>
**Kind**: class of <code>[electron-updater/out/MacUpdater](#module_electron-updater/out/MacUpdater)</code>  
**Extends**: <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>  

* [.MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater) ⇐ <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>
    * [`.quitAndInstall()`](#module_electron-updater/out/MacUpdater.MacUpdater+quitAndInstall)
    * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/MacUpdater.MacUpdater+doDownloadUpdate) ⇒ <code>module:bluebird-lst.Bluebird</code>
    * [`.onUpdateAvailable(versionInfo, fileInfo)`](#module_electron-updater/out/MacUpdater.MacUpdater+onUpdateAvailable)
    * [`.checkForUpdates()`](#module_electron-updater/out/AppUpdater.AppUpdater+checkForUpdates) ⇒ <code>Promise</code>
    * [`.downloadUpdate(cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+downloadUpdate) ⇒ <code>Promise</code>
    * [`.getFeedURL()`](#module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL) ⇒
    * [`.setFeedURL(options)`](#module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL)
    * [`.loadUpdateConfig()`](#module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig) ⇒ <code>Promise</code>
    * [`.dispatchError(e)`](#module_electron-updater/out/AppUpdater.AppUpdater+dispatchError)


-

<a name="module_electron-updater/out/MacUpdater.MacUpdater+quitAndInstall"></a>

#### `macUpdater.quitAndInstall()`
**Kind**: instance method of <code>[MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater)</code>  
**Overrides**: <code>[quitAndInstall](#module_electron-updater/out/AppUpdater.AppUpdater+quitAndInstall)</code>  

-

<a name="module_electron-updater/out/MacUpdater.MacUpdater+doDownloadUpdate"></a>

#### `macUpdater.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)` ⇒ <code>module:bluebird-lst.Bluebird</code>
**Kind**: instance method of <code>[MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater)</code>  
**Overrides**: <code>[doDownloadUpdate](#module_electron-updater/out/AppUpdater.AppUpdater+doDownloadUpdate)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| versionInfo | <code>[VersionInfo](#module_electron-builder-http/out/publishOptions.VersionInfo)</code> | 
| fileInfo | <code>[FileInfo](#module_electron-updater/out/api.FileInfo)</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 


-

<a name="module_electron-updater/out/MacUpdater.MacUpdater+onUpdateAvailable"></a>

#### `macUpdater.onUpdateAvailable(versionInfo, fileInfo)`
**Kind**: instance method of <code>[MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater)</code>  
**Overrides**: <code>[onUpdateAvailable](#module_electron-updater/out/AppUpdater.AppUpdater+onUpdateAvailable)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| versionInfo | <code>[VersionInfo](#module_electron-builder-http/out/publishOptions.VersionInfo)</code> | 
| fileInfo | <code>[FileInfo](#module_electron-updater/out/api.FileInfo)</code> | 


-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+checkForUpdates"></a>

#### `macUpdater.checkForUpdates()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater)</code>  

-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+downloadUpdate"></a>

#### `macUpdater.downloadUpdate(cancellationToken)` ⇒ <code>Promise</code>
Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.

**Kind**: instance method of <code>[MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater)</code>  
**Returns**: <code>Promise</code> - Path to downloaded file.  

| Param | Type |
| --- | --- |
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 


-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL"></a>

#### `macUpdater.getFeedURL()` ⇒
**Kind**: instance method of <code>[MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater)</code>  

-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL"></a>

#### `macUpdater.setFeedURL(options)`
Configure update provider. If value is `string`, [GenericServerOptions](#module_electron-builder-http/out/publishOptions.GenericServerOptions) will be set with value as `url`.

**Kind**: instance method of <code>[MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater)</code>  

| Param | Type | Description |
| --- | --- | --- |
| options | <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code> &#124; <code>[GenericServerOptions](#module_electron-builder-http/out/publishOptions.GenericServerOptions)</code> &#124; <code>[S3Options](#module_electron-builder-http/out/publishOptions.S3Options)</code> &#124; <code>[BintrayOptions](#module_electron-builder-http/out/publishOptions.BintrayOptions)</code> &#124; <code>[GithubOptions](#module_electron-builder-http/out/publishOptions.GithubOptions)</code> &#124; <code>string</code> | If you want to override configuration in the `app-update.yml`. |


-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig"></a>

#### `macUpdater.loadUpdateConfig()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater)</code>  

-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+dispatchError"></a>

#### `macUpdater.dispatchError(e)`
**Kind**: instance method of <code>[MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| e | <code>Error</code> | 


-

<a name="module_electron-updater/out/NsisUpdater"></a>

## electron-updater/out/NsisUpdater

* [electron-updater/out/NsisUpdater](#module_electron-updater/out/NsisUpdater)
    * [.NsisUpdater](#module_electron-updater/out/NsisUpdater.NsisUpdater) ⇐ <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>
        * [`.quitAndInstall()`](#module_electron-updater/out/NsisUpdater.NsisUpdater+quitAndInstall)
        * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/NsisUpdater.NsisUpdater+doDownloadUpdate) ⇒ <code>Promise</code>
        * [`.checkForUpdates()`](#module_electron-updater/out/AppUpdater.AppUpdater+checkForUpdates) ⇒ <code>Promise</code>
        * [`.downloadUpdate(cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+downloadUpdate) ⇒ <code>Promise</code>
        * [`.getFeedURL()`](#module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL) ⇒
        * [`.setFeedURL(options)`](#module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL)
        * [`.loadUpdateConfig()`](#module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig) ⇒ <code>Promise</code>
        * [`.dispatchError(e)`](#module_electron-updater/out/AppUpdater.AppUpdater+dispatchError)
        * [`.onUpdateAvailable(versionInfo, fileInfo)`](#module_electron-updater/out/AppUpdater.AppUpdater+onUpdateAvailable)


-

<a name="module_electron-updater/out/NsisUpdater.NsisUpdater"></a>

### electron-updater/out/NsisUpdater.NsisUpdater ⇐ <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>
**Kind**: class of <code>[electron-updater/out/NsisUpdater](#module_electron-updater/out/NsisUpdater)</code>  
**Extends**: <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>  

* [.NsisUpdater](#module_electron-updater/out/NsisUpdater.NsisUpdater) ⇐ <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>
    * [`.quitAndInstall()`](#module_electron-updater/out/NsisUpdater.NsisUpdater+quitAndInstall)
    * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/NsisUpdater.NsisUpdater+doDownloadUpdate) ⇒ <code>Promise</code>
    * [`.checkForUpdates()`](#module_electron-updater/out/AppUpdater.AppUpdater+checkForUpdates) ⇒ <code>Promise</code>
    * [`.downloadUpdate(cancellationToken)`](#module_electron-updater/out/AppUpdater.AppUpdater+downloadUpdate) ⇒ <code>Promise</code>
    * [`.getFeedURL()`](#module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL) ⇒
    * [`.setFeedURL(options)`](#module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL)
    * [`.loadUpdateConfig()`](#module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig) ⇒ <code>Promise</code>
    * [`.dispatchError(e)`](#module_electron-updater/out/AppUpdater.AppUpdater+dispatchError)
    * [`.onUpdateAvailable(versionInfo, fileInfo)`](#module_electron-updater/out/AppUpdater.AppUpdater+onUpdateAvailable)


-

<a name="module_electron-updater/out/NsisUpdater.NsisUpdater+quitAndInstall"></a>

#### `nsisUpdater.quitAndInstall()`
**Kind**: instance method of <code>[NsisUpdater](#module_electron-updater/out/NsisUpdater.NsisUpdater)</code>  
**Overrides**: <code>[quitAndInstall](#module_electron-updater/out/AppUpdater.AppUpdater+quitAndInstall)</code>  

-

<a name="module_electron-updater/out/NsisUpdater.NsisUpdater+doDownloadUpdate"></a>

#### `nsisUpdater.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)` ⇒ <code>Promise</code>
Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.

**Kind**: instance method of <code>[NsisUpdater](#module_electron-updater/out/NsisUpdater.NsisUpdater)</code>  
**Overrides**: <code>[doDownloadUpdate](#module_electron-updater/out/AppUpdater.AppUpdater+doDownloadUpdate)</code>  
**Returns**: <code>Promise</code> - Path to downloaded file.  
**Access**: protected  

| Param | Type |
| --- | --- |
| versionInfo | <code>[VersionInfo](#module_electron-builder-http/out/publishOptions.VersionInfo)</code> | 
| fileInfo | <code>[FileInfo](#module_electron-updater/out/api.FileInfo)</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 


-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+checkForUpdates"></a>

#### `nsisUpdater.checkForUpdates()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[NsisUpdater](#module_electron-updater/out/NsisUpdater.NsisUpdater)</code>  

-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+downloadUpdate"></a>

#### `nsisUpdater.downloadUpdate(cancellationToken)` ⇒ <code>Promise</code>
Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.

**Kind**: instance method of <code>[NsisUpdater](#module_electron-updater/out/NsisUpdater.NsisUpdater)</code>  
**Returns**: <code>Promise</code> - Path to downloaded file.  

| Param | Type |
| --- | --- |
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 


-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+getFeedURL"></a>

#### `nsisUpdater.getFeedURL()` ⇒
**Kind**: instance method of <code>[NsisUpdater](#module_electron-updater/out/NsisUpdater.NsisUpdater)</code>  

-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+setFeedURL"></a>

#### `nsisUpdater.setFeedURL(options)`
Configure update provider. If value is `string`, [GenericServerOptions](#module_electron-builder-http/out/publishOptions.GenericServerOptions) will be set with value as `url`.

**Kind**: instance method of <code>[NsisUpdater](#module_electron-updater/out/NsisUpdater.NsisUpdater)</code>  

| Param | Type | Description |
| --- | --- | --- |
| options | <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code> &#124; <code>[GenericServerOptions](#module_electron-builder-http/out/publishOptions.GenericServerOptions)</code> &#124; <code>[S3Options](#module_electron-builder-http/out/publishOptions.S3Options)</code> &#124; <code>[BintrayOptions](#module_electron-builder-http/out/publishOptions.BintrayOptions)</code> &#124; <code>[GithubOptions](#module_electron-builder-http/out/publishOptions.GithubOptions)</code> &#124; <code>string</code> | If you want to override configuration in the `app-update.yml`. |


-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+loadUpdateConfig"></a>

#### `nsisUpdater.loadUpdateConfig()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[NsisUpdater](#module_electron-updater/out/NsisUpdater.NsisUpdater)</code>  

-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+dispatchError"></a>

#### `nsisUpdater.dispatchError(e)`
**Kind**: instance method of <code>[NsisUpdater](#module_electron-updater/out/NsisUpdater.NsisUpdater)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| e | <code>Error</code> | 


-

<a name="module_electron-updater/out/AppUpdater.AppUpdater+onUpdateAvailable"></a>

#### `nsisUpdater.onUpdateAvailable(versionInfo, fileInfo)`
**Kind**: instance method of <code>[NsisUpdater](#module_electron-updater/out/NsisUpdater.NsisUpdater)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| versionInfo | <code>[VersionInfo](#module_electron-builder-http/out/publishOptions.VersionInfo)</code> | 
| fileInfo | <code>[FileInfo](#module_electron-updater/out/api.FileInfo)</code> | 


-

<a name="module_electron-updater/out/api"></a>

## electron-updater/out/api

* [electron-updater/out/api](#module_electron-updater/out/api)
    * [`.FileInfo`](#module_electron-updater/out/api.FileInfo)
    * [`.UpdateCheckResult`](#module_electron-updater/out/api.UpdateCheckResult)
    * [.Provider](#module_electron-updater/out/api.Provider)
        * [`.getLatestVersion()`](#module_electron-updater/out/api.Provider+getLatestVersion) ⇒ <code>Promise</code>
        * [`.setRequestHeaders(value)`](#module_electron-updater/out/api.Provider+setRequestHeaders)
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/api.Provider+getUpdateFile) ⇒ <code>Promise</code>
    * [.UpdaterSignal](#module_electron-updater/out/api.UpdaterSignal)
        * [`.progress(handler)`](#module_electron-updater/out/api.UpdaterSignal+progress)
        * [`.updateCancelled(handler)`](#module_electron-updater/out/api.UpdaterSignal+updateCancelled)
        * [`.updateDownloaded(handler)`](#module_electron-updater/out/api.UpdaterSignal+updateDownloaded)
    * [`.getDefaultChannelName()`](#module_electron-updater/out/api.getDefaultChannelName) ⇒ <code>string</code>
    * [`.getCustomChannelName(channel)`](#module_electron-updater/out/api.getCustomChannelName) ⇒ <code>string</code>
    * [`.getCurrentPlatform()`](#module_electron-updater/out/api.getCurrentPlatform) ⇒
    * [`.getChannelFilename(channel)`](#module_electron-updater/out/api.getChannelFilename) ⇒ <code>string</code>


-

<a name="module_electron-updater/out/api.FileInfo"></a>

### `electron-updater/out/api.FileInfo`
**Kind**: interface of <code>[electron-updater/out/api](#module_electron-updater/out/api)</code>  
**Properties**

| Name | Type |
| --- | --- |
| name | <code>string</code> | 
| url | <code>string</code> | 
| sha2 | <code>string</code> | 


-

<a name="module_electron-updater/out/api.UpdateCheckResult"></a>

### `electron-updater/out/api.UpdateCheckResult`
**Kind**: interface of <code>[electron-updater/out/api](#module_electron-updater/out/api)</code>  
**Properties**

| Name | Type |
| --- | --- |
| versionInfo | <code>[VersionInfo](#module_electron-builder-http/out/publishOptions.VersionInfo)</code> | 
| fileInfo | <code>[FileInfo](#module_electron-updater/out/api.FileInfo)</code> | 
| downloadPromise | <code>Promise</code> &#124; <code>null</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 


-

<a name="module_electron-updater/out/api.Provider"></a>

### electron-updater/out/api.Provider
**Kind**: class of <code>[electron-updater/out/api](#module_electron-updater/out/api)</code>  

* [.Provider](#module_electron-updater/out/api.Provider)
    * [`.getLatestVersion()`](#module_electron-updater/out/api.Provider+getLatestVersion) ⇒ <code>Promise</code>
    * [`.setRequestHeaders(value)`](#module_electron-updater/out/api.Provider+setRequestHeaders)
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/api.Provider+getUpdateFile) ⇒ <code>Promise</code>


-

<a name="module_electron-updater/out/api.Provider+getLatestVersion"></a>

#### `provider.getLatestVersion()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[Provider](#module_electron-updater/out/api.Provider)</code>  

-

<a name="module_electron-updater/out/api.Provider+setRequestHeaders"></a>

#### `provider.setRequestHeaders(value)`
**Kind**: instance method of <code>[Provider](#module_electron-updater/out/api.Provider)</code>  

| Param | Type |
| --- | --- |
| value | <code>[RequestHeaders](#module_electron-builder-http.RequestHeaders)</code> &#124; <code>null</code> | 


-

<a name="module_electron-updater/out/api.Provider+getUpdateFile"></a>

#### `provider.getUpdateFile(versionInfo)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[Provider](#module_electron-updater/out/api.Provider)</code>  

| Param | Type |
| --- | --- |
| versionInfo | <code>module:electron-updater/out/api.T</code> | 


-

<a name="module_electron-updater/out/api.UpdaterSignal"></a>

### electron-updater/out/api.UpdaterSignal
**Kind**: class of <code>[electron-updater/out/api](#module_electron-updater/out/api)</code>  

* [.UpdaterSignal](#module_electron-updater/out/api.UpdaterSignal)
    * [`.progress(handler)`](#module_electron-updater/out/api.UpdaterSignal+progress)
    * [`.updateCancelled(handler)`](#module_electron-updater/out/api.UpdaterSignal+updateCancelled)
    * [`.updateDownloaded(handler)`](#module_electron-updater/out/api.UpdaterSignal+updateDownloaded)


-

<a name="module_electron-updater/out/api.UpdaterSignal+progress"></a>

#### `updaterSignal.progress(handler)`
**Kind**: instance method of <code>[UpdaterSignal](#module_electron-updater/out/api.UpdaterSignal)</code>  

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 


-

<a name="module_electron-updater/out/api.UpdaterSignal+updateCancelled"></a>

#### `updaterSignal.updateCancelled(handler)`
**Kind**: instance method of <code>[UpdaterSignal](#module_electron-updater/out/api.UpdaterSignal)</code>  

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 


-

<a name="module_electron-updater/out/api.UpdaterSignal+updateDownloaded"></a>

#### `updaterSignal.updateDownloaded(handler)`
**Kind**: instance method of <code>[UpdaterSignal](#module_electron-updater/out/api.UpdaterSignal)</code>  

| Param | Type |
| --- | --- |
| handler | <code>callback</code> | 


-

<a name="module_electron-updater/out/api.getDefaultChannelName"></a>

### `electron-updater/out/api.getDefaultChannelName()` ⇒ <code>string</code>
**Kind**: method of <code>[electron-updater/out/api](#module_electron-updater/out/api)</code>  

-

<a name="module_electron-updater/out/api.getCustomChannelName"></a>

### `electron-updater/out/api.getCustomChannelName(channel)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-updater/out/api](#module_electron-updater/out/api)</code>  

| Param | Type |
| --- | --- |
| channel | <code>string</code> | 


-

<a name="module_electron-updater/out/api.getCurrentPlatform"></a>

### `electron-updater/out/api.getCurrentPlatform()` ⇒
**Kind**: method of <code>[electron-updater/out/api](#module_electron-updater/out/api)</code>  

-

<a name="module_electron-updater/out/api.getChannelFilename"></a>

### `electron-updater/out/api.getChannelFilename(channel)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-updater/out/api](#module_electron-updater/out/api)</code>  

| Param | Type |
| --- | --- |
| channel | <code>string</code> | 


-

<a name="module_electron-updater/out/electronHttpExecutor"></a>

## electron-updater/out/electronHttpExecutor

* [electron-updater/out/electronHttpExecutor](#module_electron-updater/out/electronHttpExecutor)
    * [.ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor) ⇐ <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>
        * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doApiRequest) ⇒ <code>Promise</code>
        * [`.download(url, destination, options)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+download) ⇒ <code>Promise</code>
        * [`.doRequest(options, callback)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doRequest) ⇒
        * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.HttpExecutor+request) ⇒ <code>Promise</code>
        * [`.addTimeOutHandler(request, callback)`](#module_electron-builder-http.HttpExecutor+addTimeOutHandler)
        * [`.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`](#module_electron-builder-http.HttpExecutor+doDownload)
        * [`.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`](#module_electron-builder-http.HttpExecutor+handleResponse)


-

<a name="module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor"></a>

### electron-updater/out/electronHttpExecutor.ElectronHttpExecutor ⇐ <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>
**Kind**: class of <code>[electron-updater/out/electronHttpExecutor](#module_electron-updater/out/electronHttpExecutor)</code>  
**Extends**: <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>  

* [.ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor) ⇐ <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>
    * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doApiRequest) ⇒ <code>Promise</code>
    * [`.download(url, destination, options)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+download) ⇒ <code>Promise</code>
    * [`.doRequest(options, callback)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doRequest) ⇒
    * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.HttpExecutor+request) ⇒ <code>Promise</code>
    * [`.addTimeOutHandler(request, callback)`](#module_electron-builder-http.HttpExecutor+addTimeOutHandler)
    * [`.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`](#module_electron-builder-http.HttpExecutor+doDownload)
    * [`.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`](#module_electron-builder-http.HttpExecutor+handleResponse)


-

<a name="module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doApiRequest"></a>

#### `electronHttpExecutor.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor)</code>  
**Overrides**: <code>[doApiRequest](#module_electron-builder-http.HttpExecutor+doApiRequest)</code>  

| Param | Type |
| --- | --- |
| options | <code>Electron:RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| requestProcessor | <code>callback</code> | 
| redirectCount | <code>number</code> | 


-

<a name="module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+download"></a>

#### `electronHttpExecutor.download(url, destination, options)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor)</code>  
**Overrides**: <code>[download](#module_electron-builder-http.HttpExecutor+download)</code>  

| Param | Type |
| --- | --- |
| url | <code>string</code> | 
| destination | <code>string</code> | 
| options | <code>[DownloadOptions](#module_electron-builder-http.DownloadOptions)</code> | 


-

<a name="module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doRequest"></a>

#### `electronHttpExecutor.doRequest(options, callback)` ⇒
**Kind**: instance method of <code>[ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor)</code>  
**Overrides**: <code>[doRequest](#module_electron-builder-http.HttpExecutor+doRequest)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| options |  | 
| callback | <code>callback</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+request"></a>

#### `electronHttpExecutor.request(options, cancellationToken, data)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor)</code>  

| Param | Type |
| --- | --- |
| options | <code>module:http.RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| data | <code>module:electron-builder-http.__type</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+addTimeOutHandler"></a>

#### `electronHttpExecutor.addTimeOutHandler(request, callback)`
**Kind**: instance method of <code>[ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| request |  | 
| callback | <code>callback</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+doDownload"></a>

#### `electronHttpExecutor.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`
**Kind**: instance method of <code>[ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| requestOptions |  | 
| destination | <code>string</code> | 
| redirectCount | <code>number</code> | 
| options | <code>[DownloadOptions](#module_electron-builder-http.DownloadOptions)</code> | 
| callback | <code>callback</code> | 
| onCancel | <code>callback</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+handleResponse"></a>

#### `electronHttpExecutor.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`
**Kind**: instance method of <code>[ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| response | <code>[Response](#module_electron-builder-http.Response)</code> | 
| options | <code>module:http.RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| resolve | <code>callback</code> | 
| reject | <code>callback</code> | 
| redirectCount | <code>number</code> | 
| requestProcessor | <code>callback</code> | 


-

<a name="module_electron-updater"></a>

## electron-updater

-

<a name="module_electron-updater.autoUpdater"></a>

### `electron-updater.autoUpdater` : <code>[AppUpdater](#module_electron-updater/out/AppUpdater.AppUpdater)</code>
**Kind**: constant of <code>[electron-updater](#module_electron-updater)</code>  

-

<a name="module_electron-builder-http/out/CancellationToken"></a>

## electron-builder-http/out/CancellationToken

* [electron-builder-http/out/CancellationToken](#module_electron-builder-http/out/CancellationToken)
    * [.CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken) ⇐ <code>internal:EventEmitter</code>
        * [`.cancel()`](#module_electron-builder-http/out/CancellationToken.CancellationToken+cancel)
        * [`.createPromise(callback)`](#module_electron-builder-http/out/CancellationToken.CancellationToken+createPromise) ⇒ <code>Promise</code>
        * [`.dispose()`](#module_electron-builder-http/out/CancellationToken.CancellationToken+dispose)
    * [.CancellationError](#module_electron-builder-http/out/CancellationToken.CancellationError) ⇐ <code>Error</code>


-

<a name="module_electron-builder-http/out/CancellationToken.CancellationToken"></a>

### electron-builder-http/out/CancellationToken.CancellationToken ⇐ <code>internal:EventEmitter</code>
**Kind**: class of <code>[electron-builder-http/out/CancellationToken](#module_electron-builder-http/out/CancellationToken)</code>  
**Extends**: <code>internal:EventEmitter</code>  

* [.CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken) ⇐ <code>internal:EventEmitter</code>
    * [`.cancel()`](#module_electron-builder-http/out/CancellationToken.CancellationToken+cancel)
    * [`.createPromise(callback)`](#module_electron-builder-http/out/CancellationToken.CancellationToken+createPromise) ⇒ <code>Promise</code>
    * [`.dispose()`](#module_electron-builder-http/out/CancellationToken.CancellationToken+dispose)


-

<a name="module_electron-builder-http/out/CancellationToken.CancellationToken+cancel"></a>

#### `cancellationToken.cancel()`
**Kind**: instance method of <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code>  

-

<a name="module_electron-builder-http/out/CancellationToken.CancellationToken+createPromise"></a>

#### `cancellationToken.createPromise(callback)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code>  

| Param | Type |
| --- | --- |
| callback | <code>callback</code> | 


-

<a name="module_electron-builder-http/out/CancellationToken.CancellationToken+dispose"></a>

#### `cancellationToken.dispose()`
**Kind**: instance method of <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code>  

-

<a name="module_electron-builder-http/out/CancellationToken.CancellationError"></a>

### electron-builder-http/out/CancellationToken.CancellationError ⇐ <code>Error</code>
**Kind**: class of <code>[electron-builder-http/out/CancellationToken](#module_electron-builder-http/out/CancellationToken)</code>  
**Extends**: <code>Error</code>  

-

<a name="module_electron-builder-http/out/ProgressCallbackTransform"></a>

## electron-builder-http/out/ProgressCallbackTransform

* [electron-builder-http/out/ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform)
    * [`.ProgressInfo`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressInfo)
    * [.ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform) ⇐ <code>internal:Transform</code>
        * [`._flush(callback)`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_flush)
        * [`._transform(chunk, encoding, callback)`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_transform)


-

<a name="module_electron-builder-http/out/ProgressCallbackTransform.ProgressInfo"></a>

### `electron-builder-http/out/ProgressCallbackTransform.ProgressInfo`
**Kind**: interface of <code>[electron-builder-http/out/ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform)</code>  
**Properties**

| Name | Type |
| --- | --- |
| total | <code>number</code> | 
| delta | <code>number</code> | 
| transferred | <code>number</code> | 
| percent | <code>number</code> | 
| bytesPerSecond | <code>number</code> | 


-

<a name="module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform"></a>

### electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform ⇐ <code>internal:Transform</code>
**Kind**: class of <code>[electron-builder-http/out/ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform)</code>  
**Extends**: <code>internal:Transform</code>  

* [.ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform) ⇐ <code>internal:Transform</code>
    * [`._flush(callback)`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_flush)
    * [`._transform(chunk, encoding, callback)`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_transform)


-

<a name="module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_flush"></a>

#### `progressCallbackTransform._flush(callback)`
**Kind**: instance method of <code>[ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform)</code>  

| Param | Type |
| --- | --- |
| callback | <code>function</code> | 


-

<a name="module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_transform"></a>

#### `progressCallbackTransform._transform(chunk, encoding, callback)`
**Kind**: instance method of <code>[ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform)</code>  

| Param | Type |
| --- | --- |
| chunk |  | 
| encoding | <code>string</code> | 
| callback | <code>function</code> | 


-

<a name="module_electron-builder-http/out/bintray"></a>

## electron-builder-http/out/bintray

* [electron-builder-http/out/bintray](#module_electron-builder-http/out/bintray)
    * [`.Version`](#module_electron-builder-http/out/bintray.Version)
    * [`.File`](#module_electron-builder-http/out/bintray.File)
    * [.BintrayClient](#module_electron-builder-http/out/bintray.BintrayClient)
        * [`.createVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+createVersion) ⇒ <code>Promise</code>
        * [`.deleteVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+deleteVersion) ⇒ <code>Promise</code>
        * [`.getVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+getVersion) ⇒ <code>Promise</code>
        * [`.getVersionFiles(version)`](#module_electron-builder-http/out/bintray.BintrayClient+getVersionFiles) ⇒ <code>Promise</code>
    * [`.bintrayRequest(path, auth, data, cancellationToken, method)`](#module_electron-builder-http/out/bintray.bintrayRequest) ⇒ <code>Promise</code>


-

<a name="module_electron-builder-http/out/bintray.Version"></a>

### `electron-builder-http/out/bintray.Version`
**Kind**: interface of <code>[electron-builder-http/out/bintray](#module_electron-builder-http/out/bintray)</code>  
**Properties**

| Name | Type |
| --- | --- |
| name | <code>string</code> | 
| package | <code>string</code> | 


-

<a name="module_electron-builder-http/out/bintray.File"></a>

### `electron-builder-http/out/bintray.File`
**Kind**: interface of <code>[electron-builder-http/out/bintray](#module_electron-builder-http/out/bintray)</code>  
**Properties**

| Name | Type |
| --- | --- |
| name | <code>string</code> | 
| path | <code>string</code> | 
| sha1 | <code>string</code> | 
| sha256 | <code>string</code> | 


-

<a name="module_electron-builder-http/out/bintray.BintrayClient"></a>

### electron-builder-http/out/bintray.BintrayClient
**Kind**: class of <code>[electron-builder-http/out/bintray](#module_electron-builder-http/out/bintray)</code>  

* [.BintrayClient](#module_electron-builder-http/out/bintray.BintrayClient)
    * [`.createVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+createVersion) ⇒ <code>Promise</code>
    * [`.deleteVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+deleteVersion) ⇒ <code>Promise</code>
    * [`.getVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+getVersion) ⇒ <code>Promise</code>
    * [`.getVersionFiles(version)`](#module_electron-builder-http/out/bintray.BintrayClient+getVersionFiles) ⇒ <code>Promise</code>


-

<a name="module_electron-builder-http/out/bintray.BintrayClient+createVersion"></a>

#### `bintrayClient.createVersion(version)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[BintrayClient](#module_electron-builder-http/out/bintray.BintrayClient)</code>  

| Param | Type |
| --- | --- |
| version | <code>string</code> | 


-

<a name="module_electron-builder-http/out/bintray.BintrayClient+deleteVersion"></a>

#### `bintrayClient.deleteVersion(version)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[BintrayClient](#module_electron-builder-http/out/bintray.BintrayClient)</code>  

| Param | Type |
| --- | --- |
| version | <code>string</code> | 


-

<a name="module_electron-builder-http/out/bintray.BintrayClient+getVersion"></a>

#### `bintrayClient.getVersion(version)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[BintrayClient](#module_electron-builder-http/out/bintray.BintrayClient)</code>  

| Param | Type |
| --- | --- |
| version | <code>string</code> | 


-

<a name="module_electron-builder-http/out/bintray.BintrayClient+getVersionFiles"></a>

#### `bintrayClient.getVersionFiles(version)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[BintrayClient](#module_electron-builder-http/out/bintray.BintrayClient)</code>  

| Param | Type |
| --- | --- |
| version | <code>string</code> | 


-

<a name="module_electron-builder-http/out/bintray.bintrayRequest"></a>

### `electron-builder-http/out/bintray.bintrayRequest(path, auth, data, cancellationToken, method)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder-http/out/bintray](#module_electron-builder-http/out/bintray)</code>  

| Param | Type |
| --- | --- |
| path | <code>string</code> | 
| auth | <code>string</code> &#124; <code>null</code> | 
| data | <code>module:electron-builder-http/out/bintray.__type</code> &#124; <code>null</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| method | <code>&quot;GET&quot;</code> &#124; <code>&quot;DELETE&quot;</code> &#124; <code>&quot;PUT&quot;</code> | 


-

<a name="module_electron-builder-http/out/publishOptions"></a>

## electron-builder-http/out/publishOptions

* [electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)
    * [`.PublishConfiguration`](#module_electron-builder-http/out/publishOptions.PublishConfiguration)
    * [`.GenericServerOptions`](#module_electron-builder-http/out/publishOptions.GenericServerOptions) ⇐ <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code>
    * [`.S3Options`](#module_electron-builder-http/out/publishOptions.S3Options) ⇐ <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code>
    * [`.VersionInfo`](#module_electron-builder-http/out/publishOptions.VersionInfo)
    * [`.UpdateInfo`](#module_electron-builder-http/out/publishOptions.UpdateInfo) ⇐ <code>[VersionInfo](#module_electron-builder-http/out/publishOptions.VersionInfo)</code>
    * [`.GithubOptions`](#module_electron-builder-http/out/publishOptions.GithubOptions) ⇐ <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code>
    * [`.BintrayOptions`](#module_electron-builder-http/out/publishOptions.BintrayOptions) ⇐ <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code>
    * [`.s3Url(options)`](#module_electron-builder-http/out/publishOptions.s3Url) ⇒ <code>string</code>
    * [`.githubUrl(options)`](#module_electron-builder-http/out/publishOptions.githubUrl) ⇒ <code>string</code>


-

<a name="module_electron-builder-http/out/publishOptions.PublishConfiguration"></a>

### `electron-builder-http/out/publishOptions.PublishConfiguration`
Can be specified in the [config](https://github.com/electron-userland/electron-builder/wiki/Options#configuration-options) or any platform- or target- specific options.

If `GH_TOKEN` is set — defaults to `[{provider: "github"}]`.

If `BT_TOKEN` is set and `GH_TOKEN` is not set — defaults to `[{provider: "bintray"}]`.

**Kind**: interface of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| provider | <code>github</code> &#124; <code>bintray</code> &#124; <code>s3</code> &#124; <code>generic</code> | The provider. |
| owner | <code>string</code> &#124; <code>null</code> | The owner. |
| token | <code>string</code> &#124; <code>null</code> |  |


-

<a name="module_electron-builder-http/out/publishOptions.GenericServerOptions"></a>

### `electron-builder-http/out/publishOptions.GenericServerOptions` ⇐ <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code>
Generic (any HTTP(S) server) options.

**Kind**: interface of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  
**Extends**: <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code>  
**Properties**

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| url | <code>string</code> |  | The base url. e.g. `https://bucket_name.s3.amazonaws.com`. You can use `${os}` (expanded to `mac`, `linux` or `win` according to target platform) and `${arch}` macros. |
| channel | <code>string</code> &#124; <code>null</code> | <code>&quot;latest&quot;</code> | The channel. |


-

<a name="module_electron-builder-http/out/publishOptions.S3Options"></a>

### `electron-builder-http/out/publishOptions.S3Options` ⇐ <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code>
Amazon S3 options. `https` must be used, so, if you use direct Amazon S3 endpoints, format `https://s3.amazonaws.com/bucket_name` [must be used](http://stackoverflow.com/a/11203685/1910191). And do not forget to make files/directories public.

**Kind**: interface of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  
**Extends**: <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code>  
**See**: [Getting your credentials](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/getting-your-credentials.html).  
**Properties**

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| bucket | <code>string</code> |  | The bucket name. |
| path | <code>string</code> &#124; <code>null</code> | <code>&quot;/&quot;</code> | The directory path. |
| channel | <code>string</code> &#124; <code>null</code> | <code>&quot;latest&quot;</code> | The channel. |
| acl | <code>&quot;private&quot;</code> &#124; <code>&quot;public-read&quot;</code> &#124; <code>null</code> | <code>public-read</code> | The ACL. |
| storageClass | <code>&quot;STANDARD&quot;</code> &#124; <code>&quot;REDUCED_REDUNDANCY&quot;</code> &#124; <code>&quot;STANDARD_IA&quot;</code> &#124; <code>null</code> | <code>STANDARD</code> | The type of storage to use for the object. |


-

<a name="module_electron-builder-http/out/publishOptions.VersionInfo"></a>

### `electron-builder-http/out/publishOptions.VersionInfo`
**Kind**: interface of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  
**Properties**

| Name | Type |
| --- | --- |
| version | <code>string</code> | 


-

<a name="module_electron-builder-http/out/publishOptions.UpdateInfo"></a>

### `electron-builder-http/out/publishOptions.UpdateInfo` ⇐ <code>[VersionInfo](#module_electron-builder-http/out/publishOptions.VersionInfo)</code>
**Kind**: interface of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  
**Extends**: <code>[VersionInfo](#module_electron-builder-http/out/publishOptions.VersionInfo)</code>  
**Properties**

| Name | Type |
| --- | --- |
| path | <code>string</code> | 
| githubArtifactName | <code>string</code> &#124; <code>null</code> | 
| sha2 | <code>string</code> | 
| releaseName | <code>string</code> &#124; <code>null</code> | 
| releaseNotes | <code>string</code> &#124; <code>null</code> | 
| releaseDate | <code>string</code> | 


-

<a name="module_electron-builder-http/out/publishOptions.GithubOptions"></a>

### `electron-builder-http/out/publishOptions.GithubOptions` ⇐ <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code>
GitHub options.

**Kind**: interface of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  
**Extends**: <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code>  
**Properties**

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| repo | <code>string</code> &#124; <code>null</code> |  | The repository name. [Detected automatically](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts#github-repository). |
| vPrefixedTagName | <code>boolean</code> | <code>true</code> | Whether to use `v`-prefixed tag name. |
| host | <code>string</code> &#124; <code>null</code> | <code>&quot;github.com&quot;</code> | The host (including the port if need). |
| protocol | <code>&quot;https&quot;</code> &#124; <code>&quot;http&quot;</code> &#124; <code>null</code> | <code>https</code> | The protocol. GitHub Publisher supports only `https`. |


-

<a name="module_electron-builder-http/out/publishOptions.BintrayOptions"></a>

### `electron-builder-http/out/publishOptions.BintrayOptions` ⇐ <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code>
### `publish` Bintray

**Kind**: interface of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  
**Extends**: <code>[PublishConfiguration](#module_electron-builder-http/out/publishOptions.PublishConfiguration)</code>  
**Properties**

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| package | <code>string</code> &#124; <code>null</code> |  | The Bintray package name. |
| repo | <code>string</code> &#124; <code>null</code> | <code>&quot;generic&quot;</code> | The Bintray repository name. |
| user | <code>string</code> &#124; <code>null</code> |  | The Bintray user account. Used in cases where the owner is an organization. |


-

<a name="module_electron-builder-http/out/publishOptions.s3Url"></a>

### `electron-builder-http/out/publishOptions.s3Url(options)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  

| Param | Type |
| --- | --- |
| options | <code>[S3Options](#module_electron-builder-http/out/publishOptions.S3Options)</code> | 


-

<a name="module_electron-builder-http/out/publishOptions.githubUrl"></a>

### `electron-builder-http/out/publishOptions.githubUrl(options)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  

| Param | Type |
| --- | --- |
| options | <code>[GithubOptions](#module_electron-builder-http/out/publishOptions.GithubOptions)</code> | 


-

<a name="module_electron-builder-http"></a>

## electron-builder-http

* [electron-builder-http](#module_electron-builder-http)
    * [`.RequestHeaders`](#module_electron-builder-http.RequestHeaders)
    * [`.Response`](#module_electron-builder-http.Response) ⇐ <code>internal:EventEmitter</code>
        * [`.setEncoding(encoding)`](#module_electron-builder-http.Response+setEncoding)
    * [`.DownloadOptions`](#module_electron-builder-http.DownloadOptions)
        * [`.onProgress(progress)`](#module_electron-builder-http.DownloadOptions+onProgress)
    * [.HttpExecutorHolder](#module_electron-builder-http.HttpExecutorHolder)
    * [.HttpError](#module_electron-builder-http.HttpError) ⇐ <code>Error</code>
    * [.HttpExecutor](#module_electron-builder-http.HttpExecutor)
        * [`.download(url, destination, options)`](#module_electron-builder-http.HttpExecutor+download) ⇒ <code>Promise</code>
        * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.HttpExecutor+request) ⇒ <code>Promise</code>
        * [`.addTimeOutHandler(request, callback)`](#module_electron-builder-http.HttpExecutor+addTimeOutHandler)
        * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-builder-http.HttpExecutor+doApiRequest) ⇒ <code>Promise</code>
        * [`.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`](#module_electron-builder-http.HttpExecutor+doDownload)
        * [`.doRequest(options, callback)`](#module_electron-builder-http.HttpExecutor+doRequest) ⇒
        * [`.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`](#module_electron-builder-http.HttpExecutor+handleResponse)
    * [`.download(url, destination, options)`](#module_electron-builder-http.download) ⇒ <code>Promise</code>
    * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.request) ⇒ <code>Promise</code>
    * [`.configureRequestOptions(options, token, method)`](#module_electron-builder-http.configureRequestOptions) ⇒ <code>module:http.RequestOptions</code>
    * [`.dumpRequestOptions(options)`](#module_electron-builder-http.dumpRequestOptions) ⇒ <code>string</code>


-

<a name="module_electron-builder-http.RequestHeaders"></a>

### `electron-builder-http.RequestHeaders`
**Kind**: interface of <code>[electron-builder-http](#module_electron-builder-http)</code>  

-

<a name="module_electron-builder-http.Response"></a>

### `electron-builder-http.Response` ⇐ <code>internal:EventEmitter</code>
**Kind**: interface of <code>[electron-builder-http](#module_electron-builder-http)</code>  
**Extends**: <code>internal:EventEmitter</code>  
**Properties**

| Name | Type |
| --- | --- |
| statusCode | <code>number</code> | 
| statusMessage | <code>string</code> | 
| headers |  | 


-

<a name="module_electron-builder-http.Response+setEncoding"></a>

#### `response.setEncoding(encoding)`
**Kind**: instance method of <code>[Response](#module_electron-builder-http.Response)</code>  

| Param | Type |
| --- | --- |
| encoding | <code>string</code> | 


-

<a name="module_electron-builder-http.DownloadOptions"></a>

### `electron-builder-http.DownloadOptions`
**Kind**: interface of <code>[electron-builder-http](#module_electron-builder-http)</code>  
**Properties**

| Name | Type |
| --- | --- |
| headers | <code>[RequestHeaders](#module_electron-builder-http.RequestHeaders)</code> &#124; <code>null</code> | 
| skipDirCreation | <code>boolean</code> | 
| sha2 | <code>string</code> &#124; <code>null</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 


-

<a name="module_electron-builder-http.DownloadOptions+onProgress"></a>

#### `downloadOptions.onProgress(progress)`
**Kind**: instance method of <code>[DownloadOptions](#module_electron-builder-http.DownloadOptions)</code>  

| Param | Type |
| --- | --- |
| progress | <code>[ProgressInfo](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressInfo)</code> | 


-

<a name="module_electron-builder-http.HttpExecutorHolder"></a>

### electron-builder-http.HttpExecutorHolder
**Kind**: class of <code>[electron-builder-http](#module_electron-builder-http)</code>  

-

<a name="module_electron-builder-http.HttpError"></a>

### electron-builder-http.HttpError ⇐ <code>Error</code>
**Kind**: class of <code>[electron-builder-http](#module_electron-builder-http)</code>  
**Extends**: <code>Error</code>  

-

<a name="module_electron-builder-http.HttpExecutor"></a>

### electron-builder-http.HttpExecutor
**Kind**: class of <code>[electron-builder-http](#module_electron-builder-http)</code>  

* [.HttpExecutor](#module_electron-builder-http.HttpExecutor)
    * [`.download(url, destination, options)`](#module_electron-builder-http.HttpExecutor+download) ⇒ <code>Promise</code>
    * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.HttpExecutor+request) ⇒ <code>Promise</code>
    * [`.addTimeOutHandler(request, callback)`](#module_electron-builder-http.HttpExecutor+addTimeOutHandler)
    * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-builder-http.HttpExecutor+doApiRequest) ⇒ <code>Promise</code>
    * [`.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`](#module_electron-builder-http.HttpExecutor+doDownload)
    * [`.doRequest(options, callback)`](#module_electron-builder-http.HttpExecutor+doRequest) ⇒
    * [`.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`](#module_electron-builder-http.HttpExecutor+handleResponse)


-

<a name="module_electron-builder-http.HttpExecutor+download"></a>

#### `httpExecutor.download(url, destination, options)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>  

| Param | Type |
| --- | --- |
| url | <code>string</code> | 
| destination | <code>string</code> | 
| options | <code>[DownloadOptions](#module_electron-builder-http.DownloadOptions)</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+request"></a>

#### `httpExecutor.request(options, cancellationToken, data)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>  

| Param | Type |
| --- | --- |
| options | <code>module:http.RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| data | <code>module:electron-builder-http.__type</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+addTimeOutHandler"></a>

#### `httpExecutor.addTimeOutHandler(request, callback)`
**Kind**: instance method of <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| request |  | 
| callback | <code>callback</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+doApiRequest"></a>

#### `httpExecutor.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| options | <code>module:electron-builder-http.REQUEST_OPTS</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| requestProcessor | <code>callback</code> | 
| redirectCount | <code>number</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+doDownload"></a>

#### `httpExecutor.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`
**Kind**: instance method of <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| requestOptions |  | 
| destination | <code>string</code> | 
| redirectCount | <code>number</code> | 
| options | <code>[DownloadOptions](#module_electron-builder-http.DownloadOptions)</code> | 
| callback | <code>callback</code> | 
| onCancel | <code>callback</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+doRequest"></a>

#### `httpExecutor.doRequest(options, callback)` ⇒
**Kind**: instance method of <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| options |  | 
| callback | <code>callback</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+handleResponse"></a>

#### `httpExecutor.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`
**Kind**: instance method of <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| response | <code>[Response](#module_electron-builder-http.Response)</code> | 
| options | <code>module:http.RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| resolve | <code>callback</code> | 
| reject | <code>callback</code> | 
| redirectCount | <code>number</code> | 
| requestProcessor | <code>callback</code> | 


-

<a name="module_electron-builder-http.download"></a>

### `electron-builder-http.download(url, destination, options)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder-http](#module_electron-builder-http)</code>  

| Param | Type |
| --- | --- |
| url | <code>string</code> | 
| destination | <code>string</code> | 
| options | <code>[DownloadOptions](#module_electron-builder-http.DownloadOptions)</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder-http.request"></a>

### `electron-builder-http.request(options, cancellationToken, data)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder-http](#module_electron-builder-http)</code>  

| Param | Type |
| --- | --- |
| options | <code>module:http.RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| data | <code>module:electron-builder-http.__type</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder-http.configureRequestOptions"></a>

### `electron-builder-http.configureRequestOptions(options, token, method)` ⇒ <code>module:http.RequestOptions</code>
**Kind**: method of <code>[electron-builder-http](#module_electron-builder-http)</code>  

| Param | Type |
| --- | --- |
| options | <code>module:http.RequestOptions</code> | 
| token | <code>string</code> &#124; <code>null</code> | 
| method | <code>&quot;GET&quot;</code> &#124; <code>&quot;DELETE&quot;</code> &#124; <code>&quot;PUT&quot;</code> | 


-

<a name="module_electron-builder-http.dumpRequestOptions"></a>

### `electron-builder-http.dumpRequestOptions(options)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-builder-http](#module_electron-builder-http)</code>  

| Param | Type |
| --- | --- |
| options | <code>module:http.RequestOptions</code> | 


-

