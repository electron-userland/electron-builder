See [publish configuration](configuration/publish.md) for information on how to configure your local or CI environment for automated deployments.

!!! info "Code signing is required on macOS"
    macOS application must be [signed](code-signing.md) in order for auto updating to work.

## Auto-updatable Targets

* macOS: DMG.
* Linux: AppImage.
* Windows: NSIS.

All these targets are default, custom configuration is not required. (Though it is possible to [pass in additional configuration, e.g. request headers](#custom-options-instantiating-updater-directly).)

!!! info "Squirrel.Windows is not supported"
    Simplified auto-update is supported on Windows if you use the default NSIS target, but is not supported for Squirrel.Windows.
    You can [easily migrate to NSIS](https://github.com/electron-userland/electron-builder/issues/837#issuecomment-355698368).

## Differences between electron-updater and built-in autoUpdater

* Dedicated release server is not required.
* Code signature validation not only on macOS, but also on Windows.
* All required metadata files and artifacts are produced and published automatically.
* Download progress and [staged rollouts](#staged-rollouts) supported on all platforms.
* Different providers supported out of the box ([GitHub Releases](https://help.github.com/articles/about-releases/), [Amazon S3](https://aws.amazon.com/s3/), [DigitalOcean Spaces](https://www.digitalocean.com/community/tutorials/an-introduction-to-digitalocean-spaces), [Keygen](https://keygen.sh/docs/api/#auto-updates-electron) and generic HTTP(s) server).
* You need only 2 lines of code to make it work.

## Quick Setup Guide

1. Install [electron-updater](https://yarn.pm/electron-updater) as an app dependency.

2. [Configure publish](configuration/publish.md).

3. Use `autoUpdater` from `electron-updater` instead of `electron`:

    ```js tab="JavaScript"
    const { autoUpdater } = require("electron-updater")
    ```

    ```js tab="ES2015"
    import { autoUpdater } from "electron-updater"
    ```

4. Call `autoUpdater.checkForUpdatesAndNotify()`. Or, if you need custom behaviour, implement `electron-updater` events, check examples below.

!!! note
    1. Do not call [setFeedURL](#appupdatersetfeedurloptions). electron-builder automatically creates `app-update.yml` file for you on build in the `resources` (this file is internal, you don't need to be aware of it).
    2. `zip` target for macOS is **required** for Squirrel.Mac, otherwise `latest-mac.yml` cannot be created, which causes `autoUpdater` error. Default [target](configuration/mac.md#MacOptions-target) for macOS is `dmg`+`zip`, so there is no need to explicitly specify target.

## Examples

!!! example "Example in TypeScript using system notifications"
    ```typescript
    import { autoUpdater } from "electron-updater"

    export default class AppUpdater {
      constructor() {
        const log = require("electron-log")
        log.transports.file.level = "debug"
        autoUpdater.logger = log
        autoUpdater.checkForUpdatesAndNotify()
      }
    }
    ```

* A [complete example](https://github.com/iffy/electron-updater-example) showing how to use.
* An [encapsulated manual update via menu](https://github.com/electron-userland/electron-builder/blob/docs/encapsulated%20manual%20update%20via%20menu.js).

### Custom Options instantiating updater Directly

If you want to more control over the updater configuration (e.g. request header for authorization purposes), you can instantiate the updater directly.

```typescript
import { NsisUpdater } from "electron-updater"
// Or MacUpdater, AppImageUpdater

export default class AppUpdater {
    constructor() {
        const options = {
            requestHeaders: {
                // Any request headers to include here
            },
            provider: 'generic',
            url: 'https://example.com/auto-updates'
        }

        const autoUpdater = new NsisUpdater(options)
        autoUpdater.addAuthHeader(`Bearer ${token}`)
        autoUpdater.checkForUpdatesAndNotify()
    }
}
```

## Debugging

You don't need to listen all events to understand what's wrong. Just set `logger`.
[electron-log](https://github.com/megahertz/electron-log) is recommended (it is an additional dependency that you can install if needed).

```js
autoUpdater.logger = require("electron-log")
autoUpdater.logger.transports.file.level = "info"
```

Note that in order to develop/test UI/UX of updating without packaging the application you need to have a file named `dev-app-update.yml` in the root of your project, which matches your `publish` setting from electron-builder config (but in [yaml](https://www.json2yaml.com) format). But it is not recommended, better to test auto-update for installed application (especially on Windows). [Minio](https://github.com/electron-userland/electron-builder/issues/3053#issuecomment-401001573) is recommended as a local server for testing updates.

## Compatibility

Generated metadata files format changes from time to time, but compatibility preserved up to version 1. If you start a new project, recommended to set `electronUpdaterCompatibility` to current latest format version (`>= 2.16`).

Option `electronUpdaterCompatibility` set the electron-updater compatibility semver range. Can be specified per platform.

e.g. `>= 2.16`, `>=1.0.0`. Defaults to `>=2.15`

* `1.0.0` latest-mac.json
* `2.15.0` path
* `2.16.0` files

## Staged Rollouts

Staged rollouts allow you to distribute the latest version of your app to a subset of users that you can increase over time, similar to rollouts on platforms like Google Play.

Staged rollouts are controlled by manually editing your `latest.yml` / `latest-mac.yml` (channel update info file).

```yml
version: 1.1.0
path: TestApp Setup 1.1.0.exe
sha512: Dj51I0q8aPQ3ioaz9LMqGYujAYRbDNblAQbodDRXAMxmY6hsHqEl3F6SvhfJj5oPhcqdX1ldsgEvfMNXGUXBIw==
stagingPercentage: 10
```

Update will be shipped to 10% of userbase.

If you want to pull a staged release because it hasn't gone well, you **must** increment the version number higher than your broken release.
Because some of your users will be on the broken 1.0.1, releasing a new 1.0.1 would result in them staying on a broken version.

## File Generated and Uploaded in Addition

`latest.yml` (or `latest-mac.yml` for macOS, or `latest-linux.yml` for Linux) will be generated and uploaded for all providers except `bintray` (because not required, `bintray` doesn't use `latest.yml`).

## Private GitHub Update Repo

You can use a private repository for updates with electron-updater by setting the `GH_TOKEN` environment variable (on user machine) and `private` option.
If `GH_TOKEN` is set, electron-updater will use the GitHub API for updates allowing private repositories to work.


!!! warning
    Private GitHub provider only for [very special](https://github.com/electron-userland/electron-builder/issues/1393#issuecomment-288191885) cases — not intended and not suitable for all users.

!!! note
    The GitHub API currently has a rate limit of 5000 requests per user per hour. An update check uses up to 3 requests per check.

## Events

The `autoUpdater` object emits the following events:

#### Event: `error`

* `error` Error

Emitted when there is an error while updating.

#### Event: `checking-for-update`

Emitted when checking if an update has started.

#### Event: `update-available`

* `info` [UpdateInfo](#UpdateInfo) (for generic and github providers) | [VersionInfo](#VersionInfo) (for Bintray provider)

Emitted when there is an available update. The update is downloaded automatically if `autoDownload` is `true`.

#### Event: `update-not-available`

Emitted when there is no available update.

* `info` [UpdateInfo](#UpdateInfo) (for generic and github providers) | [VersionInfo](#VersionInfo) (for Bintray provider)

#### Event: `download-progress`
* `progress` ProgressInfo
  * `bytesPerSecond`
  * `percent`
  * `total`
  * `transferred`

Emitted on progress.

#### Event: `update-downloaded`

* `info` [UpdateInfo](#UpdateInfo) — for generic and github providers. [VersionInfo](#VersionInfo) for Bintray provider.

<!-- do not edit. start of generated block -->
## API

<dl>
<dt><a href="#module_builder-util-runtime">builder-util-runtime</a></dt>
<dd></dd>
<dt><a href="#module_electron-updater">electron-updater</a></dt>
<dd></dd>
</dl>

<a name="module_builder-util-runtime"></a>
## builder-util-runtime

* [builder-util-runtime](#module_builder-util-runtime)
    * [`.BaseS3Options`](#BaseS3Options) ⇐ <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>
    * [`.BintrayOptions`](#BintrayOptions) ⇐ <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>
    * [`.BlockMap`](#BlockMap)
    * [`.BlockMapDataHolder`](#BlockMapDataHolder)
    * [`.CustomPublishOptions`](#CustomPublishOptions) ⇐ <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>
    * [`.DownloadOptions`](#DownloadOptions)
    * [`.GenericServerOptions`](#GenericServerOptions) ⇐ <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>
    * [`.GithubOptions`](#GithubOptions) ⇐ <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>
    * [`.KeygenOptions`](#KeygenOptions) ⇐ <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>
    * [`.PackageFileInfo`](#PackageFileInfo) ⇐ <code>[BlockMapDataHolder](#BlockMapDataHolder)</code>
    * [`.ProgressInfo`](#ProgressInfo)
    * [`.PublishConfiguration`](#PublishConfiguration)
    * [`.ReleaseNoteInfo`](#ReleaseNoteInfo)
    * [`.RequestHeaders`](#RequestHeaders) ⇐ <code>[key: string]: string</code>
    * [`.S3Options`](#S3Options) ⇐ <code>[BaseS3Options](electron-builder#BaseS3Options)</code>
    * [`.SnapStoreOptions`](#SnapStoreOptions) ⇐ <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>
    * [`.SpacesOptions`](#SpacesOptions) ⇐ <code>[BaseS3Options](electron-builder#BaseS3Options)</code>
    * [`.UpdateFileInfo`](#UpdateFileInfo) ⇐ <code>[BlockMapDataHolder](#BlockMapDataHolder)</code>
    * [`.UpdateInfo`](#UpdateInfo)
    * [`.WindowsUpdateInfo`](#WindowsUpdateInfo) ⇐ <code>[UpdateInfo](#UpdateInfo)</code>
    * [.CancellationError](#CancellationError) ⇐ <code>Error</code>
    * [.CancellationToken](#CancellationToken) ⇐ <code>module:events.EventEmitter</code>
        * [`.cancel()`](#module_builder-util-runtime.CancellationToken+cancel)
        * [`.createPromise(callback)`](#module_builder-util-runtime.CancellationToken+createPromise) ⇒ <code>Promise&lt;module:builder-util-runtime/out/CancellationToken.R&gt;</code>
        * [`.dispose()`](#module_builder-util-runtime.CancellationToken+dispose)
    * [.DigestTransform](#DigestTransform) ⇐ <code>internal:Transform</code>
        * [`._flush(callback)`](#module_builder-util-runtime.DigestTransform+_flush)
        * [`._transform(chunk, encoding, callback)`](#module_builder-util-runtime.DigestTransform+_transform)
        * [`.validate()`](#module_builder-util-runtime.DigestTransform+validate) ⇒ <code>null</code>
    * [.HttpError](#HttpError) ⇐ <code>Error</code>
        * [`.isServerError()`](#module_builder-util-runtime.HttpError+isServerError) ⇒ <code>Boolean</code>
    * [.HttpExecutor](#HttpExecutor)
        * [`.addErrorAndTimeoutHandlers(request, reject)`](#module_builder-util-runtime.HttpExecutor+addErrorAndTimeoutHandlers)
        * [`.createRequest(options, callback)`](#module_builder-util-runtime.HttpExecutor+createRequest) ⇒ <code>module:builder-util-runtime/out/httpExecutor.T</code>
        * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_builder-util-runtime.HttpExecutor+doApiRequest) ⇒ <code>Promise&lt;String&gt;</code>
        * [`.downloadToBuffer(url, options)`](#module_builder-util-runtime.HttpExecutor+downloadToBuffer) ⇒ <code>Promise&lt;module:global.Buffer&gt;</code>
        * [`.prepareRedirectUrlOptions(redirectUrl, options)`](#module_builder-util-runtime.HttpExecutor+prepareRedirectUrlOptions) ⇒ <code>module:http.RequestOptions</code>
        * [`.request(options, cancellationToken, data)`](#module_builder-util-runtime.HttpExecutor+request) ⇒ <code>Promise&lt; \| String&gt;</code>
        * [`.retryOnServerError(task, maxRetries)`](#module_builder-util-runtime.HttpExecutor+retryOnServerError) ⇒ <code>Promise&lt;any&gt;</code>
    * [.ProgressCallbackTransform](#ProgressCallbackTransform) ⇐ <code>internal:Transform</code>
        * [`._flush(callback)`](#module_builder-util-runtime.ProgressCallbackTransform+_flush)
        * [`._transform(chunk, encoding, callback)`](#module_builder-util-runtime.ProgressCallbackTransform+_transform)
    * [.UUID](#UUID)
        * [`.check(uuid, offset)`](#module_builder-util-runtime.UUID+check) ⇒ <code>"undefined"</code> \| <code>module:builder-util-runtime/out/uuid.__object</code> \| <code>module:builder-util-runtime/out/uuid.__object</code>
        * [`.inspect()`](#module_builder-util-runtime.UUID+inspect) ⇒ <code>String</code>
        * [`.parse(input)`](#module_builder-util-runtime.UUID+parse) ⇒ <code>module:global.Buffer</code>
        * [`.toString()`](#module_builder-util-runtime.UUID+toString) ⇒ <code>String</code>
        * [`.v5(name, namespace)`](#module_builder-util-runtime.UUID+v5) ⇒ <code>any</code>
    * [.XElement](#XElement)
        * [`.attribute(name)`](#module_builder-util-runtime.XElement+attribute) ⇒ <code>String</code>
        * [`.element(name, ignoreCase, errorIfMissed)`](#module_builder-util-runtime.XElement+element) ⇒ <code>[XElement](#XElement)</code>
        * [`.elementOrNull(name, ignoreCase)`](#module_builder-util-runtime.XElement+elementOrNull) ⇒ <code>null</code> \| <code>[XElement](#XElement)</code>
        * [`.getElements(name, ignoreCase)`](#module_builder-util-runtime.XElement+getElements) ⇒ <code>Array&lt;[XElement](#XElement)&gt;</code>
        * [`.elementValueOrEmpty(name, ignoreCase)`](#module_builder-util-runtime.XElement+elementValueOrEmpty) ⇒ <code>String</code>
        * [`.removeAttribute(name)`](#module_builder-util-runtime.XElement+removeAttribute)
    * [`.asArray(v)`](#module_builder-util-runtime.asArray) ⇒ <code>Array&lt;module:builder-util-runtime.T&gt;</code>
    * [`.configureRequestOptions(options, token, method)`](#module_builder-util-runtime.configureRequestOptions) ⇒ <code>module:http.RequestOptions</code>
    * [`.configureRequestOptionsFromUrl(url, options)`](#module_builder-util-runtime.configureRequestOptionsFromUrl) ⇒ <code>module:http.RequestOptions</code>
    * [`.configureRequestUrl(url, options)`](#module_builder-util-runtime.configureRequestUrl)
    * [`.createHttpError(response, description)`](#module_builder-util-runtime.createHttpError) ⇒ <code>[HttpError](#HttpError)</code>
    * [`.getS3LikeProviderBaseUrl(configuration)`](#module_builder-util-runtime.getS3LikeProviderBaseUrl) ⇒ <code>String</code>
    * [`.newError(message, code)`](#module_builder-util-runtime.newError) ⇒ <code>Error</code>
    * [`.parseDn(seq)`](#module_builder-util-runtime.parseDn) ⇒ <code>Map&lt;String \| String&gt;</code>
    * [`.parseJson(result)`](#module_builder-util-runtime.parseJson) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.parseXml(data)`](#module_builder-util-runtime.parseXml) ⇒ <code>[XElement](#XElement)</code>
    * [`.safeGetHeader(response, headerKey)`](#module_builder-util-runtime.safeGetHeader) ⇒ <code>any</code>
    * [`.safeStringifyJson(data, skippedNames)`](#module_builder-util-runtime.safeStringifyJson) ⇒ <code>String</code>

<a name="BaseS3Options"></a>
### `BaseS3Options` ⇐ <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>
**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>  
**Properties**
* <code id="BaseS3Options-channel">channel</code> = `latest` String | "undefined" - The update channel.
* <code id="BaseS3Options-path">path</code> = `/` String | "undefined" - The directory path.
* <code id="BaseS3Options-acl">acl</code> = `public-read` "private" | "public-read" | "undefined" - The ACL. Set to `null` to not [add](https://github.com/electron-userland/electron-builder/issues/1822).
* **<code id="BaseS3Options-provider">provider</code>** "github" | "bintray" | "s3" | "spaces" | "generic" | "custom" | "snapStore" | "keygen" - The provider.
* <code id="BaseS3Options-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
  
  Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.
* <code id="BaseS3Options-requestHeaders">requestHeaders</code> [key: string]: string - Any custom request headers

<a name="BintrayOptions"></a>
### `BintrayOptions` ⇐ <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>
[Bintray](https://bintray.com/) options. Requires an API key. An API key can be obtained from the user [profile](https://bintray.com/profile/edit) page ("Edit Your Profile" -> API Key).
Define `BT_TOKEN` environment variable.

**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>  
**Properties**
* **<code id="BintrayOptions-provider">provider</code>** "bintray" - The provider. Must be `bintray`.
* <code id="BintrayOptions-package">package</code> String | "undefined" - The Bintray package name.
* <code id="BintrayOptions-repo">repo</code> = `generic` String | "undefined" - The Bintray repository name.
* <code id="BintrayOptions-owner">owner</code> String | "undefined" - The owner.
* <code id="BintrayOptions-component">component</code> String | "undefined" - The Bintray component (Debian only).
* <code id="BintrayOptions-distribution">distribution</code> = `stable` String | "undefined" - The Bintray distribution (Debian only).
* <code id="BintrayOptions-user">user</code> String | "undefined" - The Bintray user account. Used in cases where the owner is an organization.
* <code id="BintrayOptions-token">token</code> String | "undefined"
* <code id="BintrayOptions-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
  
  Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.
* <code id="BintrayOptions-requestHeaders">requestHeaders</code> [key: string]: string - Any custom request headers

<a name="BlockMap"></a>
### `BlockMap`
**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Properties**
* **<code id="BlockMap-version">version</code>** "1" | "2"
* **<code id="BlockMap-files">files</code>** Array&lt;module:builder-util-runtime/out/blockMapApi.BlockMapFile&gt;

<a name="BlockMapDataHolder"></a>
### `BlockMapDataHolder`
**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Properties**
* <code id="BlockMapDataHolder-size">size</code> Number - The file size. Used to verify downloaded size (save one HTTP request to get length). Also used when block map data is embedded into the file (appimage, windows web installer package).
* <code id="BlockMapDataHolder-blockMapSize">blockMapSize</code> Number - The block map file size. Used when block map data is embedded into the file (appimage, windows web installer package). This information can be obtained from the file itself, but it requires additional HTTP request, so, to reduce request count, block map size is specified in the update metadata too.
* **<code id="BlockMapDataHolder-sha512">sha512</code>** String - The file checksum.
* <code id="BlockMapDataHolder-isAdminRightsRequired">isAdminRightsRequired</code> Boolean

<a name="CustomPublishOptions"></a>
### `CustomPublishOptions` ⇐ <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>
**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>  
**Properties**
* **<code id="CustomPublishOptions-provider">provider</code>** "custom" - The provider. Must be `custom`.
* <code id="CustomPublishOptions-updateProvider">updateProvider</code> module:builder-util-runtime/out/publishOptions.__type - The Provider to provide UpdateInfo regarding available updates.  Required to use custom providers with electron-updater.
* <code id="CustomPublishOptions-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
  
  Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.
* <code id="CustomPublishOptions-requestHeaders">requestHeaders</code> [key: string]: string - Any custom request headers

<a name="DownloadOptions"></a>
### `DownloadOptions`
**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Properties**
* <code id="DownloadOptions-headers">headers</code> [key: string]: string | "undefined"
* <code id="DownloadOptions-sha2">sha2</code> String | "undefined"
* <code id="DownloadOptions-sha512">sha512</code> String | "undefined"
* **<code id="DownloadOptions-cancellationToken">cancellationToken</code>** [CancellationToken](#CancellationToken)
* <code id="DownloadOptions-onProgress">onProgress</code> callback

<a name="GenericServerOptions"></a>
### `GenericServerOptions` ⇐ <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>
Generic (any HTTP(S) server) options.
In all publish options [File Macros](/file-patterns#file-macros) are supported.

**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>  
**Properties**
* **<code id="GenericServerOptions-provider">provider</code>** "generic" - The provider. Must be `generic`.
* **<code id="GenericServerOptions-url">url</code>** String - The base url. e.g. `https://bucket_name.s3.amazonaws.com`.
* <code id="GenericServerOptions-channel">channel</code> = `latest` String | "undefined" - The channel.
* <code id="GenericServerOptions-useMultipleRangeRequest">useMultipleRangeRequest</code> Boolean - Whether to use multiple range requests for differential update. Defaults to `true` if `url` doesn't contain `s3.amazonaws.com`.
* <code id="GenericServerOptions-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
  
  Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.
* <code id="GenericServerOptions-requestHeaders">requestHeaders</code> [key: string]: string - Any custom request headers

<a name="GithubOptions"></a>
### `GithubOptions` ⇐ <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>
[GitHub](https://help.github.com/articles/about-releases/) options.

GitHub [personal access token](https://help.github.com/articles/creating-an-access-token-for-command-line-use/) is required. You can generate by going to [https://github.com/settings/tokens/new](https://github.com/settings/tokens/new). The access token should have the repo scope/permission.
Define `GH_TOKEN` environment variable.

**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>  
**Properties**
* **<code id="GithubOptions-provider">provider</code>** "github" - The provider. Must be `github`.
* <code id="GithubOptions-repo">repo</code> String | "undefined" - The repository name. [Detected automatically](#github-repository-and-bintray-package).
* <code id="GithubOptions-owner">owner</code> String | "undefined" - The owner.
* <code id="GithubOptions-vPrefixedTagName">vPrefixedTagName</code> = `true` Boolean - Whether to use `v`-prefixed tag name.
* <code id="GithubOptions-host">host</code> = `github.com` String | "undefined" - The host (including the port if need).
* <code id="GithubOptions-protocol">protocol</code> = `https` "https" | "http" | "undefined" - The protocol. GitHub Publisher supports only `https`.
* <code id="GithubOptions-token">token</code> String | "undefined" - The access token to support auto-update from private github repositories. Never specify it in the configuration files. Only for [setFeedURL](/auto-update#appupdatersetfeedurloptions).
* <code id="GithubOptions-private">private</code> Boolean | "undefined" - Whether to use private github auto-update provider if `GH_TOKEN` environment variable is defined. See [Private GitHub Update Repo](/auto-update#private-github-update-repo).
* <code id="GithubOptions-releaseType">releaseType</code> = `draft` "draft" | "prerelease" | "release" | "undefined" - The type of release. By default `draft` release will be created.
  
  Also you can set release type using environment variable. If `EP_DRAFT`is set to `true` — `draft`, if `EP_PRE_RELEASE`is set to `true` — `prerelease`.
* <code id="GithubOptions-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
  
  Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.
* <code id="GithubOptions-requestHeaders">requestHeaders</code> [key: string]: string - Any custom request headers

<a name="KeygenOptions"></a>
### `KeygenOptions` ⇐ <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>
Keygen options.
https://keygen.sh/
Define `KEYGEN_TOKEN` environment variable.

**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>  
**Properties**
* **<code id="KeygenOptions-provider">provider</code>** "keygen" - The provider. Must be `keygen`.
* **<code id="KeygenOptions-account">account</code>** String - Keygen account's UUID
* **<code id="KeygenOptions-product">product</code>** String - Keygen product's UUID
* <code id="KeygenOptions-channel">channel</code> = `stable` "stable" | "rc" | "beta" | "alpha" | "dev" | "undefined" - The channel.
* <code id="KeygenOptions-platform">platform</code> String | "undefined" - The target Platform. Is set programmatically explicitly during publishing.
* <code id="KeygenOptions-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
  
  Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.
* <code id="KeygenOptions-requestHeaders">requestHeaders</code> [key: string]: string - Any custom request headers

<a name="PackageFileInfo"></a>
### `PackageFileInfo` ⇐ <code>[BlockMapDataHolder](#BlockMapDataHolder)</code>
**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>[BlockMapDataHolder](#BlockMapDataHolder)</code>  
**Properties**
* **<code id="PackageFileInfo-path">path</code>** String

<a name="ProgressInfo"></a>
### `ProgressInfo`
**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Properties**
* **<code id="ProgressInfo-total">total</code>** Number
* **<code id="ProgressInfo-delta">delta</code>** Number
* **<code id="ProgressInfo-transferred">transferred</code>** Number
* **<code id="ProgressInfo-percent">percent</code>** Number
* **<code id="ProgressInfo-bytesPerSecond">bytesPerSecond</code>** Number

<a name="PublishConfiguration"></a>
### `PublishConfiguration`
**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Properties**
* **<code id="PublishConfiguration-provider">provider</code>** "github" | "bintray" | "s3" | "spaces" | "generic" | "custom" | "snapStore" | "keygen" - The provider.
* <code id="PublishConfiguration-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
  
  Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.
* <code id="PublishConfiguration-requestHeaders">requestHeaders</code> [key: string]: string - Any custom request headers

<a name="ReleaseNoteInfo"></a>
### `ReleaseNoteInfo`
**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Properties**
* **<code id="ReleaseNoteInfo-version">version</code>** String - The version.
* **<code id="ReleaseNoteInfo-note">note</code>** String | "undefined" - The note.

<a name="RequestHeaders"></a>
### `RequestHeaders` ⇐ <code>[key: string]: string</code>
**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>[key: string]: string</code>  
<a name="S3Options"></a>
### `S3Options` ⇐ <code>[BaseS3Options](electron-builder#BaseS3Options)</code>
**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>[BaseS3Options](electron-builder#BaseS3Options)</code>  
**Properties**
* **<code id="S3Options-provider">provider</code>** "s3" - The provider. Must be `s3`.
* **<code id="S3Options-bucket">bucket</code>** String - The bucket name.
* <code id="S3Options-region">region</code> String | "undefined" - The region. Is determined and set automatically when publishing.
* <code id="S3Options-acl">acl</code> = `public-read` "private" | "public-read" | "undefined" - The ACL. Set to `null` to not [add](https://github.com/electron-userland/electron-builder/issues/1822).
  
  Please see [required permissions for the S3 provider](https://github.com/electron-userland/electron-builder/issues/1618#issuecomment-314679128).
* <code id="S3Options-storageClass">storageClass</code> = `STANDARD` "STANDARD" | "REDUCED_REDUNDANCY" | "STANDARD_IA" | "undefined" - The type of storage to use for the object.
* <code id="S3Options-encryption">encryption</code> "AES256" | "aws:kms" | "undefined" - Server-side encryption algorithm to use for the object.
* <code id="S3Options-endpoint">endpoint</code> String | "undefined" - The endpoint URI to send requests to. The default endpoint is built from the configured region. The endpoint should be a string like `https://{service}.{region}.amazonaws.com`.

<a name="SnapStoreOptions"></a>
### `SnapStoreOptions` ⇐ <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>
[Snap Store](https://snapcraft.io/) options.

**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>  
**Properties**
* **<code id="SnapStoreOptions-provider">provider</code>** "snapStore" - The provider. Must be `snapStore`.
* **<code id="SnapStoreOptions-repo">repo</code>** String - snapcraft repo name
* <code id="SnapStoreOptions-channels">channels</code> = `["edge"]` String | Array&lt;String&gt; | "undefined" - The list of channels the snap would be released.
* <code id="SnapStoreOptions-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
  
  Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.
* <code id="SnapStoreOptions-requestHeaders">requestHeaders</code> [key: string]: string - Any custom request headers

<a name="SpacesOptions"></a>
### `SpacesOptions` ⇐ <code>[BaseS3Options](electron-builder#BaseS3Options)</code>
[DigitalOcean Spaces](https://www.digitalocean.com/community/tutorials/an-introduction-to-digitalocean-spaces) options.
Access key is required, define `DO_KEY_ID` and `DO_SECRET_KEY` environment variables.

**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>[BaseS3Options](electron-builder#BaseS3Options)</code>  
**Properties**
* **<code id="SpacesOptions-provider">provider</code>** "spaces" - The provider. Must be `spaces`.
* **<code id="SpacesOptions-name">name</code>** String - The space name.
* **<code id="SpacesOptions-region">region</code>** String - The region (e.g. `nyc3`).

<a name="UpdateFileInfo"></a>
### `UpdateFileInfo` ⇐ <code>[BlockMapDataHolder](#BlockMapDataHolder)</code>
**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>[BlockMapDataHolder](#BlockMapDataHolder)</code>  
**Properties**
* **<code id="UpdateFileInfo-url">url</code>** String

<a name="UpdateInfo"></a>
### `UpdateInfo`
**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Properties**
* **<code id="UpdateInfo-version">version</code>** String - The version.
* **<code id="UpdateInfo-files">files</code>** Array&lt;[UpdateFileInfo](#UpdateFileInfo)&gt;
* **<code id="UpdateInfo-path">path</code>** String - Deprecated: {tag.description}
* **<code id="UpdateInfo-sha512">sha512</code>** String - Deprecated: {tag.description}
* <code id="UpdateInfo-releaseName">releaseName</code> String | "undefined" - The release name.
* <code id="UpdateInfo-releaseNotes">releaseNotes</code> String | Array&lt;[ReleaseNoteInfo](#ReleaseNoteInfo)&gt; | "undefined" - The release notes. List if `updater.fullChangelog` is set to `true`, `string` otherwise.
* **<code id="UpdateInfo-releaseDate">releaseDate</code>** String - The release date.
* <code id="UpdateInfo-stagingPercentage">stagingPercentage</code> Number - The [staged rollout](/auto-update#staged-rollouts) percentage, 0-100.

<a name="WindowsUpdateInfo"></a>
### `WindowsUpdateInfo` ⇐ <code>[UpdateInfo](#UpdateInfo)</code>
**Kind**: interface of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>[UpdateInfo](#UpdateInfo)</code>  
**Properties**
* <code id="WindowsUpdateInfo-packages">packages</code> Object&lt;String, any&gt; | "undefined"

<a name="CancellationError"></a>
### CancellationError ⇐ <code>Error</code>
**Kind**: class of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>Error</code>  
<a name="CancellationToken"></a>
### CancellationToken ⇐ <code>module:events.EventEmitter</code>
**Kind**: class of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>module:events.EventEmitter</code>  
**Properties**
* **<code id="CancellationToken-cancelled">cancelled</code>** Boolean

**Methods**
* [.CancellationToken](#CancellationToken) ⇐ <code>module:events.EventEmitter</code>
    * [`.cancel()`](#module_builder-util-runtime.CancellationToken+cancel)
    * [`.createPromise(callback)`](#module_builder-util-runtime.CancellationToken+createPromise) ⇒ <code>Promise&lt;module:builder-util-runtime/out/CancellationToken.R&gt;</code>
    * [`.dispose()`](#module_builder-util-runtime.CancellationToken+dispose)

<a name="module_builder-util-runtime.CancellationToken+cancel"></a>
#### `cancellationToken.cancel()`
<a name="module_builder-util-runtime.CancellationToken+createPromise"></a>
#### `cancellationToken.createPromise(callback)` ⇒ <code>Promise&lt;module:builder-util-runtime/out/CancellationToken.R&gt;</code>

- callback <code>callback</code>

<a name="module_builder-util-runtime.CancellationToken+dispose"></a>
#### `cancellationToken.dispose()`
<a name="DigestTransform"></a>
### DigestTransform ⇐ <code>internal:Transform</code>
**Kind**: class of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>internal:Transform</code>  
**Properties**
* <code id="DigestTransform-actual">actual</code> String
* <code id="DigestTransform-isValidateOnEnd">isValidateOnEnd</code> = `true` Boolean

**Methods**
* [.DigestTransform](#DigestTransform) ⇐ <code>internal:Transform</code>
    * [`._flush(callback)`](#module_builder-util-runtime.DigestTransform+_flush)
    * [`._transform(chunk, encoding, callback)`](#module_builder-util-runtime.DigestTransform+_transform)
    * [`.validate()`](#module_builder-util-runtime.DigestTransform+validate) ⇒ <code>null</code>

<a name="module_builder-util-runtime.DigestTransform+_flush"></a>
#### `digestTransform._flush(callback)`

- callback <code>any</code>

<a name="module_builder-util-runtime.DigestTransform+_transform"></a>
#### `digestTransform._transform(chunk, encoding, callback)`

- chunk <code>module:global.Buffer</code>
- encoding <code>String</code>
- callback <code>any</code>

<a name="module_builder-util-runtime.DigestTransform+validate"></a>
#### `digestTransform.validate()` ⇒ <code>null</code>
<a name="HttpError"></a>
### HttpError ⇐ <code>Error</code>
**Kind**: class of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>Error</code>  
<a name="module_builder-util-runtime.HttpError+isServerError"></a>
#### `httpError.isServerError()` ⇒ <code>Boolean</code>
<a name="HttpExecutor"></a>
### HttpExecutor
**Kind**: class of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>

* [.HttpExecutor](#HttpExecutor)
    * [`.addErrorAndTimeoutHandlers(request, reject)`](#module_builder-util-runtime.HttpExecutor+addErrorAndTimeoutHandlers)
    * [`.createRequest(options, callback)`](#module_builder-util-runtime.HttpExecutor+createRequest) ⇒ <code>module:builder-util-runtime/out/httpExecutor.T</code>
    * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_builder-util-runtime.HttpExecutor+doApiRequest) ⇒ <code>Promise&lt;String&gt;</code>
    * [`.downloadToBuffer(url, options)`](#module_builder-util-runtime.HttpExecutor+downloadToBuffer) ⇒ <code>Promise&lt;module:global.Buffer&gt;</code>
    * [`.prepareRedirectUrlOptions(redirectUrl, options)`](#module_builder-util-runtime.HttpExecutor+prepareRedirectUrlOptions) ⇒ <code>module:http.RequestOptions</code>
    * [`.request(options, cancellationToken, data)`](#module_builder-util-runtime.HttpExecutor+request) ⇒ <code>Promise&lt; \| String&gt;</code>
    * [`.retryOnServerError(task, maxRetries)`](#module_builder-util-runtime.HttpExecutor+retryOnServerError) ⇒ <code>Promise&lt;any&gt;</code>

<a name="module_builder-util-runtime.HttpExecutor+addErrorAndTimeoutHandlers"></a>
#### `httpExecutor.addErrorAndTimeoutHandlers(request, reject)`

- request <code>any</code>
- reject <code>callback</code>

<a name="module_builder-util-runtime.HttpExecutor+createRequest"></a>
#### `httpExecutor.createRequest(options, callback)` ⇒ <code>module:builder-util-runtime/out/httpExecutor.T</code>

- options <code>any</code>
- callback <code>callback</code>

<a name="module_builder-util-runtime.HttpExecutor+doApiRequest"></a>
#### `httpExecutor.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)` ⇒ <code>Promise&lt;String&gt;</code>

- options <code>module:http.RequestOptions</code>
- cancellationToken <code>[CancellationToken](#CancellationToken)</code>
- requestProcessor <code>callback</code>
- redirectCount

<a name="module_builder-util-runtime.HttpExecutor+downloadToBuffer"></a>
#### `httpExecutor.downloadToBuffer(url, options)` ⇒ <code>Promise&lt;module:global.Buffer&gt;</code>

- url <code>module:url.URL</code>
- options <code>[DownloadOptions](electron-builder#DownloadOptions)</code>

<a name="module_builder-util-runtime.HttpExecutor+prepareRedirectUrlOptions"></a>
#### `httpExecutor.prepareRedirectUrlOptions(redirectUrl, options)` ⇒ <code>module:http.RequestOptions</code>

- redirectUrl <code>String</code>
- options <code>module:http.RequestOptions</code>

<a name="module_builder-util-runtime.HttpExecutor+request"></a>
#### `httpExecutor.request(options, cancellationToken, data)` ⇒ <code>Promise&lt; \| String&gt;</code>

- options <code>module:http.RequestOptions</code>
- cancellationToken <code>[CancellationToken](#CancellationToken)</code>
- data <code>Object&lt;String, any&gt;</code> | <code>"undefined"</code>

<a name="module_builder-util-runtime.HttpExecutor+retryOnServerError"></a>
#### `httpExecutor.retryOnServerError(task, maxRetries)` ⇒ <code>Promise&lt;any&gt;</code>

- task <code>callback</code>
- maxRetries

<a name="ProgressCallbackTransform"></a>
### ProgressCallbackTransform ⇐ <code>internal:Transform</code>
**Kind**: class of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Extends**: <code>internal:Transform</code>  

* [.ProgressCallbackTransform](#ProgressCallbackTransform) ⇐ <code>internal:Transform</code>
    * [`._flush(callback)`](#module_builder-util-runtime.ProgressCallbackTransform+_flush)
    * [`._transform(chunk, encoding, callback)`](#module_builder-util-runtime.ProgressCallbackTransform+_transform)

<a name="module_builder-util-runtime.ProgressCallbackTransform+_flush"></a>
#### `progressCallbackTransform._flush(callback)`

- callback <code>any</code>

<a name="module_builder-util-runtime.ProgressCallbackTransform+_transform"></a>
#### `progressCallbackTransform._transform(chunk, encoding, callback)`

- chunk <code>any</code>
- encoding <code>String</code>
- callback <code>any</code>

<a name="UUID"></a>
### UUID
**Kind**: class of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Properties**
* <code id="UUID-OID">OID</code> = `UUID.parse("6ba7b812-9dad-11d1-80b4-00c04fd430c8")` module:global.Buffer

**Methods**
* [.UUID](#UUID)
    * [`.check(uuid, offset)`](#module_builder-util-runtime.UUID+check) ⇒ <code>"undefined"</code> \| <code>module:builder-util-runtime/out/uuid.__object</code> \| <code>module:builder-util-runtime/out/uuid.__object</code>
    * [`.inspect()`](#module_builder-util-runtime.UUID+inspect) ⇒ <code>String</code>
    * [`.parse(input)`](#module_builder-util-runtime.UUID+parse) ⇒ <code>module:global.Buffer</code>
    * [`.toString()`](#module_builder-util-runtime.UUID+toString) ⇒ <code>String</code>
    * [`.v5(name, namespace)`](#module_builder-util-runtime.UUID+v5) ⇒ <code>any</code>

<a name="module_builder-util-runtime.UUID+check"></a>
#### `uuiD.check(uuid, offset)` ⇒ <code>"undefined"</code> \| <code>module:builder-util-runtime/out/uuid.__object</code> \| <code>module:builder-util-runtime/out/uuid.__object</code>

- uuid <code>module:global.Buffer</code> | <code>String</code>
- offset

<a name="module_builder-util-runtime.UUID+inspect"></a>
#### `uuiD.inspect()` ⇒ <code>String</code>
<a name="module_builder-util-runtime.UUID+parse"></a>
#### `uuiD.parse(input)` ⇒ <code>module:global.Buffer</code>

- input <code>String</code>

<a name="module_builder-util-runtime.UUID+toString"></a>
#### `uuiD.toString()` ⇒ <code>String</code>
<a name="module_builder-util-runtime.UUID+v5"></a>
#### `uuiD.v5(name, namespace)` ⇒ <code>any</code>

- name <code>String</code> | <code>module:global.Buffer</code>
- namespace <code>module:global.Buffer</code>

<a name="XElement"></a>
### XElement
**Kind**: class of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>
**Properties**
* <code id="XElement-value=">value=</code> String
* **<code id="XElement-attributes">attributes</code>** Object&lt;String, any&gt; | "undefined"
* <code id="XElement-isCData">isCData</code> = `false` Boolean
* **<code id="XElement-elements">elements</code>** Array&lt;[XElement](#XElement)&gt; | "undefined"

**Methods**
* [.XElement](#XElement)
    * [`.attribute(name)`](#module_builder-util-runtime.XElement+attribute) ⇒ <code>String</code>
    * [`.element(name, ignoreCase, errorIfMissed)`](#module_builder-util-runtime.XElement+element) ⇒ <code>[XElement](#XElement)</code>
    * [`.elementOrNull(name, ignoreCase)`](#module_builder-util-runtime.XElement+elementOrNull) ⇒ <code>null</code> \| <code>[XElement](#XElement)</code>
    * [`.getElements(name, ignoreCase)`](#module_builder-util-runtime.XElement+getElements) ⇒ <code>Array&lt;[XElement](#XElement)&gt;</code>
    * [`.elementValueOrEmpty(name, ignoreCase)`](#module_builder-util-runtime.XElement+elementValueOrEmpty) ⇒ <code>String</code>
    * [`.removeAttribute(name)`](#module_builder-util-runtime.XElement+removeAttribute)

<a name="module_builder-util-runtime.XElement+attribute"></a>
#### `xElement.attribute(name)` ⇒ <code>String</code>

- name <code>String</code>

<a name="module_builder-util-runtime.XElement+element"></a>
#### `xElement.element(name, ignoreCase, errorIfMissed)` ⇒ <code>[XElement](#XElement)</code>

- name <code>String</code>
- ignoreCase
- errorIfMissed <code>String</code> | <code>"undefined"</code>

<a name="module_builder-util-runtime.XElement+elementOrNull"></a>
#### `xElement.elementOrNull(name, ignoreCase)` ⇒ <code>null</code> \| <code>[XElement](#XElement)</code>

- name <code>String</code>
- ignoreCase

<a name="module_builder-util-runtime.XElement+getElements"></a>
#### `xElement.getElements(name, ignoreCase)` ⇒ <code>Array&lt;[XElement](#XElement)&gt;</code>

- name <code>String</code>
- ignoreCase

<a name="module_builder-util-runtime.XElement+elementValueOrEmpty"></a>
#### `xElement.elementValueOrEmpty(name, ignoreCase)` ⇒ <code>String</code>

- name <code>String</code>
- ignoreCase

<a name="module_builder-util-runtime.XElement+removeAttribute"></a>
#### `xElement.removeAttribute(name)`

- name <code>String</code>

<a name="module_builder-util-runtime.asArray"></a>
### `builder-util-runtime.asArray(v)` ⇒ <code>Array&lt;module:builder-util-runtime.T&gt;</code>
**Kind**: method of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>

- v <code>"undefined"</code> | <code>undefined</code> | <code>module:builder-util-runtime.T</code> | <code>Array&lt;module:builder-util-runtime.T&gt;</code>

<a name="module_builder-util-runtime.configureRequestOptions"></a>
### `builder-util-runtime.configureRequestOptions(options, token, method)` ⇒ <code>module:http.RequestOptions</code>
**Kind**: method of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>

- options <code>module:http.RequestOptions</code>
- token <code>String</code> | <code>"undefined"</code>
- method <code>"GET"</code> | <code>"DELETE"</code> | <code>"PUT"</code>

<a name="module_builder-util-runtime.configureRequestOptionsFromUrl"></a>
### `builder-util-runtime.configureRequestOptionsFromUrl(url, options)` ⇒ <code>module:http.RequestOptions</code>
**Kind**: method of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>

- url <code>String</code>
- options <code>module:http.RequestOptions</code>

<a name="module_builder-util-runtime.configureRequestUrl"></a>
### `builder-util-runtime.configureRequestUrl(url, options)`
**Kind**: method of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>

- url <code>module:url.URL</code>
- options <code>module:http.RequestOptions</code>

<a name="module_builder-util-runtime.createHttpError"></a>
### `builder-util-runtime.createHttpError(response, description)` ⇒ <code>[HttpError](#HttpError)</code>
**Kind**: method of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>

- response <code>module:http.IncomingMessage</code>
- description <code>any</code> | <code>"undefined"</code>

<a name="module_builder-util-runtime.getS3LikeProviderBaseUrl"></a>
### `builder-util-runtime.getS3LikeProviderBaseUrl(configuration)` ⇒ <code>String</code>
**Kind**: method of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>

- configuration <code>[PublishConfiguration](electron-builder#PublishConfiguration)</code>

<a name="module_builder-util-runtime.newError"></a>
### `builder-util-runtime.newError(message, code)` ⇒ <code>Error</code>
**Kind**: method of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>

- message <code>String</code>
- code <code>String</code>

<a name="module_builder-util-runtime.parseDn"></a>
### `builder-util-runtime.parseDn(seq)` ⇒ <code>Map&lt;String \| String&gt;</code>
**Kind**: method of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>

- seq <code>String</code>

<a name="module_builder-util-runtime.parseJson"></a>
### `builder-util-runtime.parseJson(result)` ⇒ <code>Promise&lt;any&gt;</code>
**Kind**: method of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>

- result <code>Promise&lt; | String&gt;</code>

<a name="module_builder-util-runtime.parseXml"></a>
### `builder-util-runtime.parseXml(data)` ⇒ <code>[XElement](#XElement)</code>
**Kind**: method of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>

- data <code>String</code>

<a name="module_builder-util-runtime.safeGetHeader"></a>
### `builder-util-runtime.safeGetHeader(response, headerKey)` ⇒ <code>any</code>
**Kind**: method of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>

- response <code>any</code>
- headerKey <code>String</code>

<a name="module_builder-util-runtime.safeStringifyJson"></a>
### `builder-util-runtime.safeStringifyJson(data, skippedNames)` ⇒ <code>String</code>
**Kind**: method of [<code>builder-util-runtime</code>](#module_builder-util-runtime)<br/>

- data <code>any</code>
- skippedNames <code>Set&lt;String&gt;</code>

<a name="module_electron-updater"></a>
## electron-updater

* [electron-updater](#module_electron-updater)
    * [`.Logger`](#Logger)
        * [`.debug(message)`](#module_electron-updater.Logger+debug)
        * [`.error(message)`](#module_electron-updater.Logger+error)
        * [`.info(message)`](#module_electron-updater.Logger+info)
        * [`.warn(message)`](#module_electron-updater.Logger+warn)
    * [`.ResolvedUpdateFileInfo`](#ResolvedUpdateFileInfo)
    * [`.UpdateCheckResult`](#UpdateCheckResult)
    * [`.UpdateDownloadedEvent`](#UpdateDownloadedEvent) ⇐ <code>module:builder-util-runtime.UpdateInfo</code>
    * [.AppImageUpdater](#AppImageUpdater) ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>
        * [`.isUpdaterActive()`](#module_electron-updater.AppImageUpdater+isUpdaterActive) ⇒ <code>Boolean</code>
    * [.AppUpdater](#AppUpdater) ⇐ <code>module:events.EventEmitter</code>
        * [`.addAuthHeader(token)`](#module_electron-updater.AppUpdater+addAuthHeader)
        * [`.checkForUpdates()`](#module_electron-updater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
        * [`.checkForUpdatesAndNotify(downloadNotification)`](#module_electron-updater.AppUpdater+checkForUpdatesAndNotify) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
        * [`.downloadUpdate(cancellationToken)`](#module_electron-updater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getFeedURL()`](#module_electron-updater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
        * [`.setFeedURL(options)`](#module_electron-updater.AppUpdater+setFeedURL)
        * [`.isUpdaterActive()`](#module_electron-updater.AppUpdater+isUpdaterActive) ⇒ <code>Boolean</code>
        * [`.quitAndInstall(isSilent, isForceRunAfter)`](#module_electron-updater.AppUpdater+quitAndInstall)
    * [.MacUpdater](#MacUpdater) ⇐ <code>[AppUpdater](#AppUpdater)</code>
        * [`.quitAndInstall()`](#module_electron-updater.MacUpdater+quitAndInstall)
        * [`.addAuthHeader(token)`](#module_electron-updater.AppUpdater+addAuthHeader)
        * [`.checkForUpdates()`](#module_electron-updater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
        * [`.checkForUpdatesAndNotify(downloadNotification)`](#module_electron-updater.AppUpdater+checkForUpdatesAndNotify) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
        * [`.downloadUpdate(cancellationToken)`](#module_electron-updater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
        * [`.getFeedURL()`](#module_electron-updater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
        * [`.setFeedURL(options)`](#module_electron-updater.AppUpdater+setFeedURL)
        * [`.isUpdaterActive()`](#module_electron-updater.AppUpdater+isUpdaterActive) ⇒ <code>Boolean</code>
    * [.NsisUpdater](#NsisUpdater) ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>
    * [.Provider](#Provider)
        * [`.getLatestVersion()`](#module_electron-updater.Provider+getLatestVersion) ⇒ <code>Promise&lt;module:electron-updater/out/providers/Provider.T&gt;</code>
        * [`.setRequestHeaders(value)`](#module_electron-updater.Provider+setRequestHeaders)
        * [`.resolveFiles(updateInfo)`](#module_electron-updater.Provider+resolveFiles) ⇒ <code>Array&lt;[ResolvedUpdateFileInfo](#ResolvedUpdateFileInfo)&gt;</code>
    * [.UpdaterSignal](#UpdaterSignal)
        * [`.login(handler)`](#module_electron-updater.UpdaterSignal+login)
        * [`.progress(handler)`](#module_electron-updater.UpdaterSignal+progress)
        * [`.updateCancelled(handler)`](#module_electron-updater.UpdaterSignal+updateCancelled)
        * [`.updateDownloaded(handler)`](#module_electron-updater.UpdaterSignal+updateDownloaded)
    * [`.autoUpdater`](#module_electron-updater.autoUpdater) : <code>[AppUpdater](#AppUpdater)</code>
    * [`.DOWNLOAD_PROGRESS`](#module_electron-updater.DOWNLOAD_PROGRESS) : <code>"login"</code> \| <code>"checking-for-update"</code> \| <code>"update-available"</code> \| <code>"update-not-available"</code> \| <code>"update-cancelled"</code> \| <code>"download-progress"</code> \| <code>"update-downloaded"</code> \| <code>"error"</code>
    * [`.UPDATE_DOWNLOADED`](#module_electron-updater.UPDATE_DOWNLOADED) : <code>"login"</code> \| <code>"checking-for-update"</code> \| <code>"update-available"</code> \| <code>"update-not-available"</code> \| <code>"update-cancelled"</code> \| <code>"download-progress"</code> \| <code>"update-downloaded"</code> \| <code>"error"</code>

<a name="Logger"></a>
### `Logger`
**Kind**: interface of [<code>electron-updater</code>](#module_electron-updater)<br/>

* [`.Logger`](#Logger)
    * [`.debug(message)`](#module_electron-updater.Logger+debug)
    * [`.error(message)`](#module_electron-updater.Logger+error)
    * [`.info(message)`](#module_electron-updater.Logger+info)
    * [`.warn(message)`](#module_electron-updater.Logger+warn)

<a name="module_electron-updater.Logger+debug"></a>
#### `logger.debug(message)`

- message <code>String</code>

<a name="module_electron-updater.Logger+error"></a>
#### `logger.error(message)`

- message <code>any</code>

<a name="module_electron-updater.Logger+info"></a>
#### `logger.info(message)`

- message <code>any</code>

<a name="module_electron-updater.Logger+warn"></a>
#### `logger.warn(message)`

- message <code>any</code>

<a name="ResolvedUpdateFileInfo"></a>
### `ResolvedUpdateFileInfo`
**Kind**: interface of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Properties**
* **<code id="ResolvedUpdateFileInfo-url">url</code>** module:url.URL
* **<code id="ResolvedUpdateFileInfo-info">info</code>** module:builder-util-runtime.UpdateFileInfo
* <code id="ResolvedUpdateFileInfo-packageInfo">packageInfo</code> module:builder-util-runtime.PackageFileInfo

<a name="UpdateCheckResult"></a>
### `UpdateCheckResult`
**Kind**: interface of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Properties**
* **<code id="UpdateCheckResult-updateInfo">updateInfo</code>** module:builder-util-runtime.UpdateInfo
* <code id="UpdateCheckResult-downloadPromise">downloadPromise</code> Promise&lt;Array&lt;String&gt;&gt; | "undefined"
* <code id="UpdateCheckResult-cancellationToken">cancellationToken</code> CancellationToken
* **<code id="UpdateCheckResult-versionInfo">versionInfo</code>** module:builder-util-runtime.UpdateInfo - Deprecated: {tag.description}

<a name="UpdateDownloadedEvent"></a>
### `UpdateDownloadedEvent` ⇐ <code>module:builder-util-runtime.UpdateInfo</code>
**Kind**: interface of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>module:builder-util-runtime.UpdateInfo</code>  
**Properties**
* **<code id="UpdateDownloadedEvent-downloadedFile">downloadedFile</code>** String

<a name="AppImageUpdater"></a>
### AppImageUpdater ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>  
<a name="module_electron-updater.AppImageUpdater+isUpdaterActive"></a>
#### `appImageUpdater.isUpdaterActive()` ⇒ <code>Boolean</code>
<a name="AppUpdater"></a>
### AppUpdater ⇐ <code>module:events.EventEmitter</code>
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>module:events.EventEmitter</code>  
**Properties**
* <code id="AppUpdater-autoDownload">autoDownload</code> = `true` Boolean - Whether to automatically download an update when it is found.
* <code id="AppUpdater-autoInstallOnAppQuit">autoInstallOnAppQuit</code> = `true` Boolean - Whether to automatically install a downloaded update on app quit (if `quitAndInstall` was not called before).
* <code id="AppUpdater-allowPrerelease">allowPrerelease</code> = `false` Boolean - *GitHub provider only.* Whether to allow update to pre-release versions. Defaults to `true` if application version contains prerelease components (e.g. `0.12.1-alpha.1`, here `alpha` is a prerelease component), otherwise `false`.
  
  If `true`, downgrade will be allowed (`allowDowngrade` will be set to `true`).
* <code id="AppUpdater-fullChangelog">fullChangelog</code> = `false` Boolean - *GitHub provider only.* Get all release notes (from current version to latest), not just the latest.
* <code id="AppUpdater-allowDowngrade">allowDowngrade</code> = `false` Boolean - Whether to allow version downgrade (when a user from the beta channel wants to go back to the stable channel).
  
  Taken in account only if channel differs (pre-release version component in terms of semantic versioning).
* <code id="AppUpdater-currentVersion">currentVersion</code> SemVer - The current application version.
* **<code id="AppUpdater-channel">channel</code>** String | "undefined" - Get the update channel. Not applicable for GitHub. Doesn't return `channel` from the update configuration, only if was previously set.
* **<code id="AppUpdater-requestHeaders">requestHeaders</code>** [key: string]: string | "undefined" - The request headers.
* **<code id="AppUpdater-netSession">netSession</code>** Electron:Session
* **<code id="AppUpdater-logger">logger</code>** [Logger](#Logger) | "undefined" - The logger. You can pass [electron-log](https://github.com/megahertz/electron-log), [winston](https://github.com/winstonjs/winston) or another logger with the following interface: `{ info(), warn(), error() }`. Set it to `null` if you would like to disable a logging feature.
* <code id="AppUpdater-signals">signals</code> = `new UpdaterSignal(this)` [UpdaterSignal](#UpdaterSignal)
* <code id="AppUpdater-configOnDisk">configOnDisk</code> = `new Lazy<any>(() => this.loadUpdateConfig())` Lazy&lt;any&gt;
* <code id="AppUpdater-httpExecutor">httpExecutor</code> module:electron-updater/out/electronHttpExecutor.ElectronHttpExecutor
* **<code id="AppUpdater-isAddNoCacheQuery">isAddNoCacheQuery</code>** Boolean

**Methods**
* [.AppUpdater](#AppUpdater) ⇐ <code>module:events.EventEmitter</code>
    * [`.addAuthHeader(token)`](#module_electron-updater.AppUpdater+addAuthHeader)
    * [`.checkForUpdates()`](#module_electron-updater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.checkForUpdatesAndNotify(downloadNotification)`](#module_electron-updater.AppUpdater+checkForUpdatesAndNotify) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.downloadUpdate(cancellationToken)`](#module_electron-updater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getFeedURL()`](#module_electron-updater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
    * [`.setFeedURL(options)`](#module_electron-updater.AppUpdater+setFeedURL)
    * [`.isUpdaterActive()`](#module_electron-updater.AppUpdater+isUpdaterActive) ⇒ <code>Boolean</code>
    * [`.quitAndInstall(isSilent, isForceRunAfter)`](#module_electron-updater.AppUpdater+quitAndInstall)

<a name="module_electron-updater.AppUpdater+addAuthHeader"></a>
#### `appUpdater.addAuthHeader(token)`
Shortcut for explicitly adding auth tokens to request headers


- token <code>String</code>

<a name="module_electron-updater.AppUpdater+checkForUpdates"></a>
#### `appUpdater.checkForUpdates()` ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
Asks the server whether there is an update.

<a name="module_electron-updater.AppUpdater+checkForUpdatesAndNotify"></a>
#### `appUpdater.checkForUpdatesAndNotify(downloadNotification)` ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>

- downloadNotification <code>module:electron-updater/out/AppUpdater.DownloadNotification</code>

<a name="module_electron-updater.AppUpdater+downloadUpdate"></a>
#### `appUpdater.downloadUpdate(cancellationToken)` ⇒ <code>Promise&lt;any&gt;</code>
Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.

**Returns**: <code>Promise&lt;any&gt;</code> - Path to downloaded file.  

- cancellationToken <code>CancellationToken</code>

<a name="module_electron-updater.AppUpdater+getFeedURL"></a>
#### `appUpdater.getFeedURL()` ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
<a name="module_electron-updater.AppUpdater+setFeedURL"></a>
#### `appUpdater.setFeedURL(options)`
Configure update provider. If value is `string`, [GenericServerOptions](/configuration/publish#genericserveroptions) will be set with value as `url`.


- options <code>[PublishConfiguration](/configuration/publish#publishconfiguration)</code> | <code>String</code> | <code>[GithubOptions](/configuration/publish#githuboptions)</code> | <code>[S3Options](/configuration/publish#s3options)</code> | <code>[SpacesOptions](/configuration/publish#spacesoptions)</code> | <code>[GenericServerOptions](/configuration/publish#genericserveroptions)</code> | <code>[BintrayOptions](/configuration/publish#bintrayoptions)</code> | <code>module:builder-util-runtime/out/publishOptions.CustomPublishOptions</code> | <code>module:builder-util-runtime/out/publishOptions.KeygenOptions</code> | <code>[SnapStoreOptions](/configuration/publish#snapstoreoptions)</code> | <code>String</code> - If you want to override configuration in the `app-update.yml`.

<a name="module_electron-updater.AppUpdater+isUpdaterActive"></a>
#### `appUpdater.isUpdaterActive()` ⇒ <code>Boolean</code>
<a name="module_electron-updater.AppUpdater+quitAndInstall"></a>
#### `appUpdater.quitAndInstall(isSilent, isForceRunAfter)`
Restarts the app and installs the update after it has been downloaded.
It should only be called after `update-downloaded` has been emitted.

**Note:** `autoUpdater.quitAndInstall()` will close all application windows first and only emit `before-quit` event on `app` after that.
This is different from the normal quit event sequence.


- isSilent <code>Boolean</code> - *windows-only* Runs the installer in silent mode. Defaults to `false`.
- isForceRunAfter <code>Boolean</code> - Run the app after finish even on silent install. Not applicable for macOS. Ignored if `isSilent` is set to `false`.

<a name="MacUpdater"></a>
### MacUpdater ⇐ <code>[AppUpdater](#AppUpdater)</code>
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>[AppUpdater](#AppUpdater)</code>  

* [.MacUpdater](#MacUpdater) ⇐ <code>[AppUpdater](#AppUpdater)</code>
    * [`.quitAndInstall()`](#module_electron-updater.MacUpdater+quitAndInstall)
    * [`.addAuthHeader(token)`](#module_electron-updater.AppUpdater+addAuthHeader)
    * [`.checkForUpdates()`](#module_electron-updater.AppUpdater+checkForUpdates) ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.checkForUpdatesAndNotify(downloadNotification)`](#module_electron-updater.AppUpdater+checkForUpdatesAndNotify) ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>
    * [`.downloadUpdate(cancellationToken)`](#module_electron-updater.AppUpdater+downloadUpdate) ⇒ <code>Promise&lt;any&gt;</code>
    * [`.getFeedURL()`](#module_electron-updater.AppUpdater+getFeedURL) ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
    * [`.setFeedURL(options)`](#module_electron-updater.AppUpdater+setFeedURL)
    * [`.isUpdaterActive()`](#module_electron-updater.AppUpdater+isUpdaterActive) ⇒ <code>Boolean</code>

<a name="module_electron-updater.MacUpdater+quitAndInstall"></a>
#### `macUpdater.quitAndInstall()`
**Overrides**: [<code>quitAndInstall</code>](#module_electron-updater.AppUpdater+quitAndInstall)  
<a name="module_electron-updater.AppUpdater+addAuthHeader"></a>
#### `macUpdater.addAuthHeader(token)`
Shortcut for explicitly adding auth tokens to request headers


- token <code>String</code>

<a name="module_electron-updater.AppUpdater+checkForUpdates"></a>
#### `macUpdater.checkForUpdates()` ⇒ <code>Promise&lt;[UpdateCheckResult](#UpdateCheckResult)&gt;</code>
Asks the server whether there is an update.

<a name="module_electron-updater.AppUpdater+checkForUpdatesAndNotify"></a>
#### `macUpdater.checkForUpdatesAndNotify(downloadNotification)` ⇒ <code>Promise&lt; \| [UpdateCheckResult](#UpdateCheckResult)&gt;</code>

- downloadNotification <code>module:electron-updater/out/AppUpdater.DownloadNotification</code>

<a name="module_electron-updater.AppUpdater+downloadUpdate"></a>
#### `macUpdater.downloadUpdate(cancellationToken)` ⇒ <code>Promise&lt;any&gt;</code>
Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.

**Returns**: <code>Promise&lt;any&gt;</code> - Path to downloaded file.  

- cancellationToken <code>CancellationToken</code>

<a name="module_electron-updater.AppUpdater+getFeedURL"></a>
#### `macUpdater.getFeedURL()` ⇒ <code>undefined</code> \| <code>null</code> \| <code>String</code>
<a name="module_electron-updater.AppUpdater+setFeedURL"></a>
#### `macUpdater.setFeedURL(options)`
Configure update provider. If value is `string`, [GenericServerOptions](/configuration/publish#genericserveroptions) will be set with value as `url`.


- options <code>[PublishConfiguration](/configuration/publish#publishconfiguration)</code> | <code>String</code> | <code>[GithubOptions](/configuration/publish#githuboptions)</code> | <code>[S3Options](/configuration/publish#s3options)</code> | <code>[SpacesOptions](/configuration/publish#spacesoptions)</code> | <code>[GenericServerOptions](/configuration/publish#genericserveroptions)</code> | <code>[BintrayOptions](/configuration/publish#bintrayoptions)</code> | <code>module:builder-util-runtime/out/publishOptions.CustomPublishOptions</code> | <code>module:builder-util-runtime/out/publishOptions.KeygenOptions</code> | <code>[SnapStoreOptions](/configuration/publish#snapstoreoptions)</code> | <code>String</code> - If you want to override configuration in the `app-update.yml`.

<a name="module_electron-updater.AppUpdater+isUpdaterActive"></a>
#### `macUpdater.isUpdaterActive()` ⇒ <code>Boolean</code>
<a name="NsisUpdater"></a>
### NsisUpdater ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Extends**: <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>  
<a name="Provider"></a>
### Provider
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>
**Properties**
* **<code id="Provider-isUseMultipleRangeRequest">isUseMultipleRangeRequest</code>** Boolean
* **<code id="Provider-fileExtraDownloadHeaders">fileExtraDownloadHeaders</code>** [key: string]: string | "undefined"

**Methods**
* [.Provider](#Provider)
    * [`.getLatestVersion()`](#module_electron-updater.Provider+getLatestVersion) ⇒ <code>Promise&lt;module:electron-updater/out/providers/Provider.T&gt;</code>
    * [`.setRequestHeaders(value)`](#module_electron-updater.Provider+setRequestHeaders)
    * [`.resolveFiles(updateInfo)`](#module_electron-updater.Provider+resolveFiles) ⇒ <code>Array&lt;[ResolvedUpdateFileInfo](#ResolvedUpdateFileInfo)&gt;</code>

<a name="module_electron-updater.Provider+getLatestVersion"></a>
#### `provider.getLatestVersion()` ⇒ <code>Promise&lt;module:electron-updater/out/providers/Provider.T&gt;</code>
<a name="module_electron-updater.Provider+setRequestHeaders"></a>
#### `provider.setRequestHeaders(value)`

- value <code>[key: string]: string</code> | <code>"undefined"</code>

<a name="module_electron-updater.Provider+resolveFiles"></a>
#### `provider.resolveFiles(updateInfo)` ⇒ <code>Array&lt;[ResolvedUpdateFileInfo](#ResolvedUpdateFileInfo)&gt;</code>

- updateInfo <code>module:electron-updater/out/providers/Provider.T</code>

<a name="UpdaterSignal"></a>
### UpdaterSignal
**Kind**: class of [<code>electron-updater</code>](#module_electron-updater)<br/>

* [.UpdaterSignal](#UpdaterSignal)
    * [`.login(handler)`](#module_electron-updater.UpdaterSignal+login)
    * [`.progress(handler)`](#module_electron-updater.UpdaterSignal+progress)
    * [`.updateCancelled(handler)`](#module_electron-updater.UpdaterSignal+updateCancelled)
    * [`.updateDownloaded(handler)`](#module_electron-updater.UpdaterSignal+updateDownloaded)

<a name="module_electron-updater.UpdaterSignal+login"></a>
#### `updaterSignal.login(handler)`
Emitted when an authenticating proxy is [asking for user credentials](https://github.com/electron/electron/blob/master/docs/api/client-request.md#event-login).


- handler <code>module:electron-updater.__type</code>

<a name="module_electron-updater.UpdaterSignal+progress"></a>
#### `updaterSignal.progress(handler)`

- handler <code>callback</code>

<a name="module_electron-updater.UpdaterSignal+updateCancelled"></a>
#### `updaterSignal.updateCancelled(handler)`

- handler <code>callback</code>

<a name="module_electron-updater.UpdaterSignal+updateDownloaded"></a>
#### `updaterSignal.updateDownloaded(handler)`

- handler <code>callback</code>

<a name="module_electron-updater.autoUpdater"></a>
### `electron-updater.autoUpdater` : <code>[AppUpdater](#AppUpdater)</code>
**Kind**: constant of [<code>electron-updater</code>](#module_electron-updater)<br/>
<a name="module_electron-updater.DOWNLOAD_PROGRESS"></a>
### `electron-updater.DOWNLOAD_PROGRESS` : <code>"login"</code> \| <code>"checking-for-update"</code> \| <code>"update-available"</code> \| <code>"update-not-available"</code> \| <code>"update-cancelled"</code> \| <code>"download-progress"</code> \| <code>"update-downloaded"</code> \| <code>"error"</code>
**Kind**: constant of [<code>electron-updater</code>](#module_electron-updater)<br/>
<a name="module_electron-updater.UPDATE_DOWNLOADED"></a>
### `electron-updater.UPDATE_DOWNLOADED` : <code>"login"</code> \| <code>"checking-for-update"</code> \| <code>"update-available"</code> \| <code>"update-not-available"</code> \| <code>"update-cancelled"</code> \| <code>"download-progress"</code> \| <code>"update-downloaded"</code> \| <code>"error"</code>
**Kind**: constant of [<code>electron-updater</code>](#module_electron-updater)<br/>

<!-- end of generated block -->
