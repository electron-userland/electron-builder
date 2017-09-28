The [publish](/configuration/configuration.md#Configuration-publish) key contains set of options instructing electron-builder on how it should publish artifacts and build update info files for [auto update](/auto-update.md).

`String | Object | Array<Object | String>` where `Object` it is [BintrayOptions](#bintrayoptions), [GenericServerOptions](#genericserveroptions), [GitHub](#githuboptions) or [S3Options](#s3options). Order is important — first item will be used as a default auto-update server. Can be specified in the [top-level configuration](/configuration/configuration#configuration) or any platform- ([mac](/configuration/mac.md), [linux](/configuration/linux.md), [win](/configuration/win.md)) or target- (e.g. [nsis](/configuration/nsis.md)) specific configuration.

If `GH_TOKEN` is defined — defaults to `[{provider: "github"}]`.

If `BT_TOKEN` is defined and `GH_TOKEN` is not — defaults to `[{provider: "bintray"}]`.

You can publish to multiple providers. For example, to publish Windows artifacts to both GitHub and Bintray (order is important — first item will be used as a default auto-update server, so, in this example app will use github as auto-update provider):
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
[Bintray](https://bintray.com/) options. Requires an API key. An API key can be obtained from the user [profile](https://bintray.com/profile/edit) page ("Edit Your Profile" -> API Key).
Define `BT_TOKEN` environment variable.

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
* <code id="GithubOptions-private">private</code> Boolean - Whether to use private github auto-update provider if `GH_TOKEN` environment variable is defined. See [Private GitHub Update Repo](/auto-update.md#private-github-update-repo).

<!-- end of generated block -->

## S3Options
[Amazon S3](https://aws.amazon.com/s3/) options.

To use Amazon S3 please add `electron-publisher-s3` dependency to `devDependencies` (`yarn add electron-publisher-s3 --dev`).

AWS credentials are required, please see [getting your credentials](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/getting-your-credentials.html).
Define `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` [environment variables](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-environment.html).
Or in the [~/.aws/credentials](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html).

Example configuration:
```json
"publish": {
  "provider": "s3",
  "bucket": "bucket-name"
}
```

{% include "/generated/s3-options.md" %}

{% include "/generated/spaces-options.md" %}