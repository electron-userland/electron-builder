Travis and AppVeyor support publishing artifacts. But it requires additional configuration for each CI (since AppVeyor can build only Windows and Travis only macOS / Linux).

`electron-builder` allows you to just add `GH_TOKEN` environment variable and that's all.

Currently, [GitHub Releases](https://help.github.com/articles/about-releases/), [Amazon S3](https://aws.amazon.com/s3/) and [Bintray](https://bintray.com) are supported.

To use Amazon S3 please install `electron-publisher-s3` dependency.

## CLI Flags

Excerpt from [CLI Usage](https://github.com/electron-userland/electron-builder#cli-usage) of `build` command:
```
Publishing:
  --publish, -p  [choices: "onTag", "onTagOrDraft", "always", "never"]
  --draft        Create a draft (unpublished) release        [boolean]
  --prerelease   Identify the release as a prerelease        [boolean]
```
CLI `--publish` option values:

| Value          |  Description
| -------------- | -----------
| `onTag`        | on tag push only
| `onTagOrDraft` | on tag push or if draft release exists
| `always`       | always publish
| `never`        | never publish

But please consider using automatic rules instead of explicitly specifying `publish`:

* If CI server detected, — `onTagOrDraft`.

  **NOTICE**: _This is the recommended workflow._

 1. [Draft a new release](https://help.github.com/articles/creating-releases/). Set the "Tag version" to the value of `version` in your application `package.json`, and prefix it with `v`. "Release title" can be anything you want.
   - For example, if your application `package.json` version is `1.0`, your draft's "Tag version" would be `v1.0`.
 2. Push some commits. Every CI build will update the artifacts attached to this draft.
 3. Once you are done, publish the release. GitHub will tag the latest commit for you.

 The benefit of this workflow is that it allows you to always have the latest artifacts, and the release can be published once it is ready.

* If CI server reports that tag was pushed, — `onTag`.

  Release will be drafted (if doesn't already exist) and artifacts published only if tag was pushed.

* If [npm script](https://docs.npmjs.com/misc/scripts) named `release`, — `always`.

 Add to `scripts` in the development `package.json`:
 ```json
 "release": "build"
 ```
 and if you run `npm run release`, a release will be drafted (if doesn't already exist) and artifacts published.

## GitHub Repository and Bintray Package

 Detected automatically using:
 * [repository](https://docs.npmjs.com/files/package.json#repository) in the application or development `package.json`,
 * if not set, env `TRAVIS_REPO_SLUG` or `APPVEYOR_ACCOUNT_NAME`/`APPVEYOR_PROJECT_NAME` or `CIRCLE_PROJECT_USERNAME`/`CIRCLE_PROJECT_REPONAME`,
 * if no env, from `.git/config` origin url.

## Publish Options

See [GithubOptions](#GithubOptions), [S3Options](#S3Options), [BintrayOptions](#BintrayOptions).

Can be specified in the [configuration options](https://github.com/electron-userland/electron-builder/wiki/Options#Config) or any platform- or target- specific options.

```json
"win": {
  "publish": ["github", "bintray"]
}
```

<!-- do not edit. start of generated block -->
## API

<dl>
<dt><a href="#module_electron-builder-http/out/publishOptions">electron-builder-http/out/publishOptions</a></dt>
<dd></dd>
<dt><a href="#module_electron-publish">electron-publish</a></dt>
<dd></dd>
</dl>

<a name="module_electron-builder-http/out/publishOptions"></a>

## electron-builder-http/out/publishOptions

* [electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)
    * [`.BintrayOptions`](#BintrayOptions) ⇐ <code>[PublishConfiguration](#PublishConfiguration)</code>
    * [`.GenericServerOptions`](#GenericServerOptions) ⇐ <code>[PublishConfiguration](#PublishConfiguration)</code>
    * [`.GithubOptions`](#GithubOptions) ⇐ <code>[PublishConfiguration](#PublishConfiguration)</code>
    * [`.PublishConfiguration`](#PublishConfiguration)
    * [`.S3Options`](#S3Options) ⇐ <code>[PublishConfiguration](#PublishConfiguration)</code>
    * [`.UpdateInfo`](#UpdateInfo) ⇐ <code>[VersionInfo](#VersionInfo)</code>
    * [`.VersionInfo`](#VersionInfo)
    * [`.githubUrl(options)`](#module_electron-builder-http/out/publishOptions.githubUrl) ⇒ <code>string</code>
    * [`.s3Url(options)`](#module_electron-builder-http/out/publishOptions.s3Url) ⇒ <code>string</code>

<a name="BintrayOptions"></a>

### `BintrayOptions` ⇐ <code>[PublishConfiguration](#PublishConfiguration)</code>
Bintray options.

**Kind**: interface of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  
**Extends**: <code>[PublishConfiguration](#PublishConfiguration)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| package| <code>string</code> \| <code>null</code> | <a name="BintrayOptions-package"></a>The Bintray package name. |
| repo = <code>&quot;generic&quot;</code>| <code>string</code> \| <code>null</code> | <a name="BintrayOptions-repo"></a>The Bintray repository name. |
| user| <code>string</code> \| <code>null</code> | <a name="BintrayOptions-user"></a>The Bintray user account. Used in cases where the owner is an organization. |

<a name="GenericServerOptions"></a>

### `GenericServerOptions` ⇐ <code>[PublishConfiguration](#PublishConfiguration)</code>
Generic (any HTTP(S) server) options.

**Kind**: interface of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  
**Extends**: <code>[PublishConfiguration](#PublishConfiguration)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| **url**| <code>string</code> | <a name="GenericServerOptions-url"></a>The base url. e.g. `https://bucket_name.s3.amazonaws.com`. You can use `${os}` (expanded to `mac`, `linux` or `win` according to target platform) and `${arch}` macros. |
| channel = <code>&quot;latest&quot;</code>| <code>string</code> \| <code>null</code> | <a name="GenericServerOptions-channel"></a>The channel. |

<a name="GithubOptions"></a>

### `GithubOptions` ⇐ <code>[PublishConfiguration](#PublishConfiguration)</code>
GitHub options.

**Kind**: interface of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  
**Extends**: <code>[PublishConfiguration](#PublishConfiguration)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| repo| <code>string</code> \| <code>null</code> | <a name="GithubOptions-repo"></a>The repository name. [Detected automatically](#github-repository-and-bintray-package). |
| vPrefixedTagName = <code>true</code>| <code>boolean</code> | <a name="GithubOptions-vPrefixedTagName"></a>Whether to use `v`-prefixed tag name. |
| host = <code>&quot;github.com&quot;</code>| <code>string</code> \| <code>null</code> | <a name="GithubOptions-host"></a>The host (including the port if need). |
| protocol = <code>https</code>| <code>"https"</code> \| <code>"http"</code> \| <code>null</code> | <a name="GithubOptions-protocol"></a>The protocol. GitHub Publisher supports only `https`. |
| token| <code>string</code> \| <code>null</code> | <a name="GithubOptions-token"></a>The access token to support auto-update from private github repositories. Never specify it in the configuration files. Only for [setFeedURL](module:electron-updater/out/AppUpdater.AppUpdater+setFeedURL). |

<a name="PublishConfiguration"></a>

### `PublishConfiguration`
Can be specified in the [config](https://github.com/electron-userland/electron-builder/wiki/Options#Config) or any platform- or target- specific options.

If `GH_TOKEN` is set — defaults to `[{provider: "github"}]`.

If `BT_TOKEN` is set and `GH_TOKEN` is not set — defaults to `[{provider: "bintray"}]`.

**Kind**: interface of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| **provider**| <code>"github"</code> \| <code>"bintray"</code> \| <code>"s3"</code> \| <code>"generic"</code> | <a name="PublishConfiguration-provider"></a>The provider. |
| owner| <code>string</code> \| <code>null</code> | <a name="PublishConfiguration-owner"></a>The owner. |
| token| <code>string</code> \| <code>null</code> | <a name="PublishConfiguration-token"></a> |

<a name="S3Options"></a>

### `S3Options` ⇐ <code>[PublishConfiguration](#PublishConfiguration)</code>
Amazon S3 options. `https` must be used, so, if you use direct Amazon S3 endpoints, format `https://s3.amazonaws.com/bucket_name` [must be used](http://stackoverflow.com/a/11203685/1910191). And do not forget to make files/directories public.

**Kind**: interface of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  
**Extends**: <code>[PublishConfiguration](#PublishConfiguration)</code>  
**See**: [Getting your credentials](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/getting-your-credentials.html).  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| **bucket**| <code>string</code> | <a name="S3Options-bucket"></a>The bucket name. |
| path = <code>&quot;/&quot;</code>| <code>string</code> \| <code>null</code> | <a name="S3Options-path"></a>The directory path. |
| region| <code>string</code> \| <code>null</code> | <a name="S3Options-region"></a>The region. Is determined and set automatically when publishing. |
| channel = <code>&quot;latest&quot;</code>| <code>string</code> \| <code>null</code> | <a name="S3Options-channel"></a>The channel. |
| acl = <code>public-read</code>| <code>"private"</code> \| <code>"public-read"</code> \| <code>null</code> | <a name="S3Options-acl"></a>The ACL. |
| storageClass = <code>STANDARD</code>| <code>"STANDARD"</code> \| <code>"REDUCED_REDUNDANCY"</code> \| <code>"STANDARD_IA"</code> \| <code>null</code> | <a name="S3Options-storageClass"></a>The type of storage to use for the object. |

<a name="UpdateInfo"></a>

### `UpdateInfo` ⇐ <code>[VersionInfo](#VersionInfo)</code>
**Kind**: interface of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  
**Extends**: <code>[VersionInfo](#VersionInfo)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| **path**| <code>string</code> | <a name="UpdateInfo-path"></a> |
| githubArtifactName| <code>string</code> \| <code>null</code> | <a name="UpdateInfo-githubArtifactName"></a> |
| **sha2**| <code>string</code> | <a name="UpdateInfo-sha2"></a> |
| releaseName| <code>string</code> \| <code>null</code> | <a name="UpdateInfo-releaseName"></a>The release name. |
| releaseNotes| <code>string</code> \| <code>null</code> | <a name="UpdateInfo-releaseNotes"></a>The release notes. |
| **releaseDate**| <code>string</code> | <a name="UpdateInfo-releaseDate"></a>The release date. |

<a name="VersionInfo"></a>

### `VersionInfo`
**Kind**: interface of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| **version**| <code>string</code> | <a name="VersionInfo-version"></a>The version. |

<a name="module_electron-builder-http/out/publishOptions.githubUrl"></a>

### `electron-builder-http/out/publishOptions.githubUrl(options)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  

| Param | Type |
| --- | --- |
| options | <code>[GithubOptions](#GithubOptions)</code> | 

<a name="module_electron-builder-http/out/publishOptions.s3Url"></a>

### `electron-builder-http/out/publishOptions.s3Url(options)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-builder-http/out/publishOptions](#module_electron-builder-http/out/publishOptions)</code>  

| Param | Type |
| --- | --- |
| options | <code>[S3Options](#S3Options)</code> | 

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
        * [`.createProgressBar(fileName, fileStat)`](#module_electron-publish.Publisher+createProgressBar) ⇒ <code>null</code> &#124; <code>module:progress-ex.default</code>
        * [`.createReadStreamAndProgressBar(file, fileStat, progressBar, reject)`](#module_electron-publish.Publisher+createReadStreamAndProgressBar) ⇒ <code>NodeJS:ReadableStream</code>
    * [.Publisher](#Publisher)
        * [`.toString()`](#module_electron-publish.Publisher+toString) ⇒ <code>string</code>
        * [`.upload(file, safeArtifactName)`](#module_electron-publish.Publisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.createProgressBar(fileName, fileStat)`](#module_electron-publish.Publisher+createProgressBar) ⇒ <code>null</code> &#124; <code>module:progress-ex.default</code>
        * [`.createReadStreamAndProgressBar(file, fileStat, progressBar, reject)`](#module_electron-publish.Publisher+createReadStreamAndProgressBar) ⇒ <code>NodeJS:ReadableStream</code>

<a name="PublishContext"></a>

### `PublishContext`
**Kind**: interface of <code>[electron-publish](#module_electron-publish)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **cancellationToken**| <code>[CancellationToken](Developer-API#CancellationToken)</code> | 
| **progress**| <code>[MultiProgress](Developer-API#MultiProgress)</code> \| <code>null</code> | 

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
    * [`.createProgressBar(fileName, fileStat)`](#module_electron-publish.Publisher+createProgressBar) ⇒ <code>null</code> &#124; <code>module:progress-ex.default</code>
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

#### `httpPublisher.createProgressBar(fileName, fileStat)` ⇒ <code>null</code> &#124; <code>module:progress-ex.default</code>
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
| progressBar | <code>module:progress-ex.default</code> &#124; <code>null</code> | 
| reject | <code>callback</code> | 

<a name="Publisher"></a>

### Publisher
**Kind**: class of <code>[electron-publish](#module_electron-publish)</code>  

* [.Publisher](#Publisher)
    * [`.toString()`](#module_electron-publish.Publisher+toString) ⇒ <code>string</code>
    * [`.upload(file, safeArtifactName)`](#module_electron-publish.Publisher+upload) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.createProgressBar(fileName, fileStat)`](#module_electron-publish.Publisher+createProgressBar) ⇒ <code>null</code> &#124; <code>module:progress-ex.default</code>
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

#### `publisher.createProgressBar(fileName, fileStat)` ⇒ <code>null</code> &#124; <code>module:progress-ex.default</code>
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
| progressBar | <code>module:progress-ex.default</code> &#124; <code>null</code> | 
| reject | <code>callback</code> | 


<!-- end of generated block -->