The [publish](configuration.md#Configuration-publish) key contains a set of options instructing electron-builder on how it should publish artifacts and build update info files for [auto update](../auto-update.md).

`String | Object | Array<Object | String>` where `Object` it is [Keygen](#keygenoptions), [Generic Server](#genericserveroptions), [GitHub](#githuboptions), [S3](#s3options), [Spaces](#spacesoptions) or [Snap Store](#snapstoreoptions) options. Order is important — first item will be used as a default auto-update server. Can be specified in the [top-level configuration](configuration.md#configuration) or any platform- ([mac](mac.md), [linux](linux.md), [win](win.md)) or target- (e.g. [nsis](nsis.md)) specific configuration.

Travis and AppVeyor support publishing artifacts. But it requires additional configuration for each CI and you need to configure what to publish.
`electron-builder` makes publishing dead simple.

If `GH_TOKEN` or `GITHUB_TOKEN` is defined — defaults to `[{provider: "github"}]`.

If `KEYGEN_TOKEN` is defined and `GH_TOKEN` or `GITHUB_TOKEN` is not — defaults to `[{provider: "keygen"}]`.

!!! info "Snap store"
    `snap` target by default publishes to snap store (the app store for Linux). To force publishing to another providers, explicitly specify publish configuration for `snap`. 

You can publish to multiple providers. For example, to publish Windows artifacts to both GitHub and Bitbucket (order is important — first item will be used as a default auto-update server, so, in this example app will use github as auto-update provider):

```json
{
  "build": {
    "win": {
      "publish": ["github", "bitbucket"]
    }
  }
}
```

```yaml
win:
  publish:
      # an object provider for github with additional options
    - provider: github
      protocol: https
      # a string provider for bitbucket that will use default options
    - bitbucket
```

You can also configure publishing using CLI arguments, for example, to force publishing snap not to Snap Store, but to GitHub: `-c.snap.publish=github`

[Custom](https://github.com/electron-userland/electron-builder/issues/3261) publish provider can be used if need.

!!! tip "Macros"
    In all publish options [File Macros](../file-patterns.md#file-macros) are supported.

## How to Publish

Excerpt from [CLI Usage](../cli.md) of `electron-builder` command:
```
Publishing:
  --publish, -p  [choices: "onTag", "onTagOrDraft", "always", "never"]
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

* If CI server reports that tag was pushed, — `onTag`.

  Release will be drafted (if doesn't already exist) and artifacts published only if tag was pushed.

* If [npm script](https://docs.npmjs.com/misc/scripts) named `release`, — `always`.

 Add to `scripts` in the development `package.json`:
 
 ```json
 "release": "electron-builder"
 ```

 and if you run `yarn release`, a release will be drafted (if doesn't already exist) and artifacts published.
 
### Recommended GitHub Releases Workflow

1. [Draft a new release](https://help.github.com/articles/creating-releases/). Set the "Tag version" to the value of `version` in your application `package.json`, and prefix it with `v`. "Release title" can be anything you want.
 
    For example, if your application `package.json` version is `1.0`, your draft's "Tag version" would be `v1.0`.
  
2. Push some commits. Every CI build will update the artifacts attached to this draft.
3. Once you are done, publish the release. GitHub will tag the latest commit for you.

The benefit of this workflow is that it allows you to always have the latest artifacts, and the release can be published once it is ready.

### Continuous Deployment Workflow on Amazon S3 and other non-GitHub

This example workflow is modelled on how releases are handled in maven (it is an example of one of many possible workflows, you are not forced to follow it).

1. Setup your CI to publish on each commit. E.g. `"dist": "electron-builder --publish always"` in your `package.json`.
2. Set your version in your application `package.json` to `1.9.0-snapshot` (or `1.9.0-master` or whatever you want your development channel to be named). This will publish a file named `snapshot.yml` and a build named `something-snapshot.exe` (and corresponding for mac) to S3.
3. When you are ready to deploy, simply change you package version to `1.9.0` and push. This will then produce a `latest.yml` and `something.exe` on s3. Usually you'll git-tag this version as well (just to keep track of it).
4. Change the version back to a snapshot version right after, i.e. `1.10.0-snapshot`, and commit it.

## GitHub Repository

Detected automatically using:

* [repository](https://docs.npmjs.com/files/package.json#repository) in the application or development `package.json`,
* if not set, env 
    * `TRAVIS_REPO_SLUG` 
    * or `APPVEYOR_REPO_NAME` 
    * or `CIRCLE_PROJECT_USERNAME`/`CIRCLE_PROJECT_REPONAME`,
* if no env, from `.git/config` origin url.
 
## Publishers
**Options Available:**
- GenericServerOptions
- GithubOptions
- SnapStoreOptions
- SpacesOptions
- KeygenOptions
- BitbucketOptions
- S3Options

<!-- do not edit. start of generated block -->
## GenericServerOptions
Generic (any HTTP(S) server) options.
In all publish options [File Macros](/file-patterns#file-macros) are supported.

* **<code id="GenericServerOptions-provider">provider</code>** "generic" - The provider. Must be `generic`.
* **<code id="GenericServerOptions-url">url</code>** String - The base url. e.g. `https://bucket_name.s3.amazonaws.com`.
* <code id="GenericServerOptions-channel">channel</code> = `latest` String | "undefined" - The channel.
* <code id="GenericServerOptions-useMultipleRangeRequest">useMultipleRangeRequest</code> Boolean - Whether to use multiple range requests for differential update. Defaults to `true` if `url` doesn't contain `s3.amazonaws.com`.

Inherited from `PublishConfiguration`:

* <code id="GenericServerOptions-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
    
    Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.

* <code id="GenericServerOptions-requestHeaders">requestHeaders</code> module:http.OutgoingHttpHeaders - Any custom request headers
* <code id="GenericServerOptions-timeout">timeout</code> = `120000` Number | "undefined" - Request timeout in milliseconds. (Default is 2 minutes; O is ignored)

## GithubOptions
[GitHub](https://help.github.com/articles/about-releases/) options.

GitHub [personal access token](https://help.github.com/articles/creating-an-access-token-for-command-line-use/) is required. You can generate by going to [https://github.com/settings/tokens/new](https://github.com/settings/tokens/new). The access token should have the repo scope/permission.
Define `GH_TOKEN` environment variable.

* **<code id="GithubOptions-provider">provider</code>** "github" - The provider. Must be `github`.
* <code id="GithubOptions-repo">repo</code> String | "undefined" - The repository name. [Detected automatically](#github-repository-and-bintray-package).
* <code id="GithubOptions-owner">owner</code> String | "undefined" - The owner.
* <code id="GithubOptions-vPrefixedTagName">vPrefixedTagName</code> = `true` Boolean - Whether to use `v`-prefixed tag name.
* <code id="GithubOptions-host">host</code> = `github.com` String | "undefined" - The host (including the port if need).
* <code id="GithubOptions-protocol">protocol</code> = `https` "https" | "http" | "undefined" - The protocol. GitHub Publisher supports only `https`.
* <code id="GithubOptions-token">token</code> String | "undefined" - The access token to support auto-update from private github repositories. Never specify it in the configuration files. Only for [setFeedURL](/auto-update#appupdatersetfeedurloptions).
* <code id="GithubOptions-private">private</code> Boolean | "undefined" - Whether to use private github auto-update provider if `GH_TOKEN` environment variable is defined. See [Private GitHub Update Repo](/auto-update#private-github-update-repo).
* <code id="GithubOptions-channel">channel</code> = `latest` String | "undefined" - The channel.
* <code id="GithubOptions-releaseType">releaseType</code> = `draft` "draft" | "prerelease" | "release" | "undefined" - The type of release. By default `draft` release will be created.
    
    Also you can set release type using environment variable. If `EP_DRAFT`is set to `true` — `draft`, if `EP_PRE_RELEASE`is set to `true` — `prerelease`.


Inherited from `PublishConfiguration`:

* <code id="GithubOptions-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
    
    Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.

* <code id="GithubOptions-requestHeaders">requestHeaders</code> module:http.OutgoingHttpHeaders - Any custom request headers
* <code id="GithubOptions-timeout">timeout</code> = `120000` Number | "undefined" - Request timeout in milliseconds. (Default is 2 minutes; O is ignored)

## SnapStoreOptions
[Snap Store](https://snapcraft.io/) options. To publish directly to Snapcraft, see <a href="https://snapcraft.io/docs/snapcraft-authentication">Snapcraft authentication options</a> for local or CI/CD authentication options.

* **<code id="SnapStoreOptions-provider">provider</code>** "snapStore" - The provider. Must be `snapStore`.
* <code id="SnapStoreOptions-repo">repo</code> String - snapcraft repo name
* <code id="SnapStoreOptions-channels">channels</code> = `["edge"]` String | Array&lt;String&gt; | "undefined" - The list of channels the snap would be released.

Inherited from `PublishConfiguration`:

* <code id="SnapStoreOptions-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
    
    Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.

* <code id="SnapStoreOptions-requestHeaders">requestHeaders</code> module:http.OutgoingHttpHeaders - Any custom request headers
* <code id="SnapStoreOptions-timeout">timeout</code> = `120000` Number | "undefined" - Request timeout in milliseconds. (Default is 2 minutes; O is ignored)

## SpacesOptions
[DigitalOcean Spaces](https://www.digitalocean.com/community/tutorials/an-introduction-to-digitalocean-spaces) options.
Access key is required, define `DO_KEY_ID` and `DO_SECRET_KEY` environment variables.

* **<code id="SpacesOptions-provider">provider</code>** "spaces" - The provider. Must be `spaces`.
* **<code id="SpacesOptions-name">name</code>** String - The space name.
* **<code id="SpacesOptions-region">region</code>** String - The region (e.g. `nyc3`).
* <code id="SpacesOptions-channel">channel</code> = `latest` String | "undefined" - The update channel.
* <code id="SpacesOptions-path">path</code> = `/` String | "undefined" - The directory path.
* <code id="SpacesOptions-acl">acl</code> = `public-read` "private" | "public-read" | "undefined" - The ACL. Set to `null` to not [add](https://github.com/electron-userland/electron-builder/issues/1822).

## KeygenOptions
Keygen options.
https://keygen.sh/
Define `KEYGEN_TOKEN` environment variable.

* **<code id="KeygenOptions-provider">provider</code>** "keygen" - The provider. Must be `keygen`.
* **<code id="KeygenOptions-account">account</code>** String - Keygen account's UUID
* **<code id="KeygenOptions-product">product</code>** String - Keygen product's UUID
* <code id="KeygenOptions-channel">channel</code> = `stable` "stable" | "rc" | "beta" | "alpha" | "dev" | "undefined" - The channel.
* <code id="KeygenOptions-platform">platform</code> String | "undefined" - The target Platform. Is set programmatically explicitly during publishing.

Inherited from `PublishConfiguration`:

* <code id="KeygenOptions-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
    
    Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.

* <code id="KeygenOptions-requestHeaders">requestHeaders</code> module:http.OutgoingHttpHeaders - Any custom request headers
* <code id="KeygenOptions-timeout">timeout</code> = `120000` Number | "undefined" - Request timeout in milliseconds. (Default is 2 minutes; O is ignored)

## BitbucketOptions
Bitbucket options.
https://bitbucket.org/
Define `BITBUCKET_TOKEN` environment variable.

For converting an app password to a usable token, you can utilize this
```typescript
convertAppPassword(owner: string, appPassword: string) {
const base64encodedData = Buffer.from(`${owner}:${appPassword.trim()}`).toString("base64")
return `Basic ${base64encodedData}`
}
```

* **<code id="BitbucketOptions-provider">provider</code>** "bitbucket" - The provider. Must be `bitbucket`.
* **<code id="BitbucketOptions-owner">owner</code>** String - Repository owner
* <code id="BitbucketOptions-token">token</code> String | "undefined" - The app password (account>settings>app-passwords) to support auto-update from private bitbucket repositories.
* <code id="BitbucketOptions-username">username</code> String | "undefined" - The user name to support auto-update from private bitbucket repositories.
* **<code id="BitbucketOptions-slug">slug</code>** String - Repository slug/name
* <code id="BitbucketOptions-channel">channel</code> = `latest` String | "undefined" - The channel.

Inherited from `PublishConfiguration`:

* <code id="BitbucketOptions-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
    
    Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.

* <code id="BitbucketOptions-requestHeaders">requestHeaders</code> module:http.OutgoingHttpHeaders - Any custom request headers
* <code id="BitbucketOptions-timeout">timeout</code> = `120000` Number | "undefined" - Request timeout in milliseconds. (Default is 2 minutes; O is ignored)

## S3Options
[Amazon S3](https://aws.amazon.com/s3/) options.
AWS credentials are required, please see [getting your credentials](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/getting-your-credentials.html).
Define `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` [environment variables](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-environment.html).
Or in the [~/.aws/credentials](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html).

Example configuration:

```json
{
"build":
"publish": {
"provider": "s3",
"bucket": "bucket-name"
}
}
}
```

* **<code id="S3Options-provider">provider</code>** "s3" - The provider. Must be `s3`.
* **<code id="S3Options-bucket">bucket</code>** String - The bucket name.
* <code id="S3Options-region">region</code> String | "undefined" - The region. Is determined and set automatically when publishing.
* <code id="S3Options-acl">acl</code> = `public-read` "private" | "public-read" | "undefined" - The ACL. Set to `null` to not [add](https://github.com/electron-userland/electron-builder/issues/1822).
    
    Please see [required permissions for the S3 provider](https://github.com/electron-userland/electron-builder/issues/1618#issuecomment-314679128).

* <code id="S3Options-storageClass">storageClass</code> = `STANDARD` "STANDARD" | "REDUCED_REDUNDANCY" | "STANDARD_IA" | "undefined" - The type of storage to use for the object.
* <code id="S3Options-encryption">encryption</code> "AES256" | "aws:kms" | "undefined" - Server-side encryption algorithm to use for the object.
* <code id="S3Options-endpoint">endpoint</code> String | "undefined" - The endpoint URI to send requests to. The default endpoint is built from the configured region. The endpoint should be a string like `https://{service}.{region}.amazonaws.com`.
* <code id="S3Options-accelerate">accelerate</code> Boolean - If set to true, this will enable the s3 accelerated endpoint These endpoints have a particular format of:  ${bucketname}.s3-accelerate.amazonaws.com
* <code id="S3Options-channel">channel</code> = `latest` String | "undefined" - The update channel.
* <code id="S3Options-path">path</code> = `/` String | "undefined" - The directory path.

## CustomPublishOptions
undefined

* **<code id="CustomPublishOptions-provider">provider</code>** "custom" - The provider. Must be `custom`.
* <code id="CustomPublishOptions-updateProvider">updateProvider</code> module:builder-util-runtime/out/publishOptions.__type - The Provider to provide UpdateInfo regarding available updates.  Required to use custom providers with electron-updater.

Inherited from `PublishConfiguration`:

* <code id="CustomPublishOptions-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
    
    Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.

* <code id="CustomPublishOptions-requestHeaders">requestHeaders</code> module:http.OutgoingHttpHeaders - Any custom request headers
* <code id="CustomPublishOptions-timeout">timeout</code> = `120000` Number | "undefined" - Request timeout in milliseconds. (Default is 2 minutes; O is ignored)


<!-- end of generated block -->
