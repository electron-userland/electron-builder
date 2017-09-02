The [publish](/configuration/configuration.md#Configuration-publish) key contains set of options instructing electron-builder on how it should publish artifacts and build update info files for [auto update](/auto-update.md).

`String | Object | Array<Object | String>` where `Object` it is [BintrayOptions](#bintrayoptions), [GenericServerOptions](#genericserveroptions), [GitHub](#githuboptions) or [S3Options](#s3options). Order is important — first item will be used as a default auto-update server. Can be specified in the [top-level configuration](/configuration/configuration#configuration) or any platform- ([mac](/configuration/configuration.md#Configuration-mac), [linux](/configuration/configuration.md#Configuration-linux), [win](/configuration/configuration.md#Configuration-win)) or target- (e.g. [nsis](/configuration/configuration.md#Configuration-nsis)) specific configuration.

If `GH_TOKEN` is set — defaults to `[{provider: "github"}]`.

If `BT_TOKEN` is set and `GH_TOKEN` is not set — defaults to `[{provider: "bintray"}]`.
   
For example, to configure publishing to [Amazon S3](https://aws.amazon.com/s3/):
```json
"publish": {
  "provider": "s3",
  "bucket": "bucket-name"
}
```

Or publish Windows artifacts to both GitHub and Bintray (order is important — first item will be used as a default auto-update server and [update metadata files](/auto-update.md#file-generated-and-uploaded-in-addition) will be generated for GitHub):
```json
"win": {
  "publish": ["github", "bintray"]
}
```

See also [Publishing Artifacts](/publishing-artifacts.md) guide.

## GitHub Repository and Bintray Package

Detected automatically using:
* [repository](https://docs.npmjs.com/files/package.json#repository) in the application or development `package.json`,
* if not set, env 
  * `TRAVIS_REPO_SLUG` 
  * or `APPVEYOR_ACCOUNT_NAME`/`APPVEYOR_PROJECT_NAME` 
  * or `CIRCLE_PROJECT_USERNAME`/`CIRCLE_PROJECT_REPONAME`,
* if no env, from `.git/config` origin url.
 
<!-- do not edit. start of generated block -->
## BintrayOptions
[Bintray](https://bintray.com/) options.

* **<code id="BintrayOptions-provider">provider</code>** "bintray" - The provider. Must be `bintray`.
* <code id="BintrayOptions-package">package</code> String - The Bintray package name.
* <code id="BintrayOptions-repo">repo</code> = `generic` String - The Bintray repository name.
* <code id="BintrayOptions-owner">owner</code> String - The owner.
* <code id="BintrayOptions-component">component</code> String - The Bintray component (Debian only).
* <code id="BintrayOptions-distribution">distribution</code> = `stable` String - The Bintray distribution (Debian only).
* <code id="BintrayOptions-user">user</code> String - The Bintray user account. Used in cases where the owner is an organization.
* <code id="BintrayOptions-token">token</code> String

## GenericServerOptions
Generic (any HTTP(S) server) options.

* **<code id="GenericServerOptions-provider">provider</code>** "generic" - The provider. Must be `generic`.
* **<code id="GenericServerOptions-url">url</code>** String - The base url. e.g. `https://bucket_name.s3.amazonaws.com`. You can use `${os}` (expanded to `mac`, `linux` or `win` according to target platform) and `${arch}` macros.
* <code id="GenericServerOptions-channel">channel</code> = `latest` String - The channel.

## GithubOptions
[GitHub](https://help.github.com/articles/about-releases/) options.

GitHub [personal access token](https://help.github.com/articles/creating-an-access-token-for-command-line-use/) is required. You can generate by going to [https://github.com/settings/tokens/new](https://github.com/settings/tokens/new). The access token should have the repo scope/permission.
Define `GH_TOKEN` environment variable.

* **<code id="GithubOptions-provider">provider</code>** "github" - The provider. Must be `github`.
* <code id="GithubOptions-repo">repo</code> String - The repository name. [Detected automatically](#github-repository-and-bintray-package).
* <code id="GithubOptions-owner">owner</code> String - The owner.
* <code id="GithubOptions-vPrefixedTagName">vPrefixedTagName</code> = `true` Boolean - Whether to use `v`-prefixed tag name.
* <code id="GithubOptions-host">host</code> = `github.com` String - The host (including the port if need).
* <code id="GithubOptions-protocol">protocol</code> = `https` "https" | "http" - The protocol. GitHub Publisher supports only `https`.
* <code id="GithubOptions-token">token</code> String - The access token to support auto-update from private github repositories. Never specify it in the configuration files. Only for [setFeedURL](/auto-update.md#appupdatersetfeedurloptions).
* <code id="GithubOptions-private">private</code> Boolean - Whether to use private github auto-update provider if `GH_TOKEN` environment variable is set. See [Private GitHub Update Repo](/auto-update.md#private-github-update-repo).

## S3Options
[Amazon S3](https://aws.amazon.com/s3/) options. `https` must be used, so, if you use direct Amazon S3 endpoints, format `https://s3.amazonaws.com/bucket_name` [must be used](http://stackoverflow.com/a/11203685/1910191). And do not forget to make files/directories public.

AWS credentials are required, please see [getting your credentials](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/getting-your-credentials.html).
Define `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` [environment variables](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-environment.html).
Or in the [~/.aws/credentials](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html).

* **<code id="S3Options-provider">provider</code>** "s3" - The provider. Must be `s3`.
* **<code id="S3Options-bucket">bucket</code>** String - The bucket name.
* <code id="S3Options-path">path</code> = `/` String - The directory path.
* <code id="S3Options-region">region</code> String - The region. Is determined and set automatically when publishing.
* <code id="S3Options-channel">channel</code> = `latest` String - The channel.
* <code id="S3Options-acl">acl</code> = `public-read` "private" | "public-read" - The ACL. Set to `null` to not [add](https://github.com/electron-userland/electron-builder/issues/1822).
  
  Please see [required permissions for the S3 provider](https://github.com/electron-userland/electron-builder/issues/1618#issuecomment-314679128).
* <code id="S3Options-storageClass">storageClass</code> = `STANDARD` "STANDARD" | "REDUCED_REDUNDANCY" | "STANDARD_IA" - The type of storage to use for the object.

<!-- end of generated block -->