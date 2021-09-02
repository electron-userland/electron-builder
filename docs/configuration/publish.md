The [publish](configuration.md#Configuration-publish) key contains a set of options instructing electron-builder on how it should publish artifacts and build update info files for [auto update](../auto-update.md).

`String | Object | Array<Object | String>` where `Object` it is [Bintray](#bintrayoptions), [Generic Server](#genericserveroptions), [GitHub](#githuboptions), [S3](#s3options), [Spaces](#spacesoptions) or [Snap Store](#snapstoreoptions) options. Order is important — first item will be used as a default auto-update server. Can be specified in the [top-level configuration](configuration.md#configuration) or any platform- ([mac](mac.md), [linux](linux.md), [win](win.md)) or target- (e.g. [nsis](nsis.md)) specific configuration.

Travis and AppVeyor support publishing artifacts. But it requires additional configuration for each CI and you need to configure what to publish.
`electron-builder` makes publishing dead simple.

If `GH_TOKEN` or `GITHUB_TOKEN` is defined — defaults to `[{provider: "github"}]`.

If `BT_TOKEN` is defined and `GH_TOKEN` or `GITHUB_TOKEN` is not — defaults to `[{provider: "bintray"}]`.

!!! info "Snap store"
    `snap` target by default publishes to snap store (the app store for Linux). To force publishing to another providers, explicitly specify publish configuration for `snap`. 

You can publish to multiple providers. For example, to publish Windows artifacts to both GitHub and Bintray (order is important — first item will be used as a default auto-update server, so, in this example app will use github as auto-update provider):

```json tab="package.json"
{
  "build": {
    "win": {
      "publish": ["github", "bintray"]
    }
  }
}
```

```yaml tab="electron-builder.yaml"
win:
  publish:
    - github
    - bintray
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
 
 ```json tab="package.json"
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

## GitHub Repository and Bintray Package

Detected automatically using:

* [repository](https://docs.npmjs.com/files/package.json#repository) in the application or development `package.json`,
* if not set, env 
    * `TRAVIS_REPO_SLUG` 
    * or `APPVEYOR_REPO_NAME` 
    * or `CIRCLE_PROJECT_USERNAME`/`CIRCLE_PROJECT_REPONAME`,
* if no env, from `.git/config` origin url.
 
<!-- do not edit. start of generated block -->
## BintrayOptions
[Bintray](https://bintray.com/) options. Requires an API key. An API key can be obtained from the user [profile](https://bintray.com/profile/edit) page ("Edit Your Profile" -> API Key).
Define `BT_TOKEN` environment variable.

<ul>
<li>**<code id="BintrayOptions-provider">provider</code>** "bintray" - The provider. Must be `bintray`.</li>
<li><code id="BintrayOptions-package">package</code> String | "undefined" - The Bintray package name.</li>
<li><code id="BintrayOptions-repo">repo</code> = `generic` String | "undefined" - The Bintray repository name.</li>
<li><code id="BintrayOptions-owner">owner</code> String | "undefined" - The owner.</li>
<li><code id="BintrayOptions-component">component</code> String | "undefined" - The Bintray component (Debian only).</li>
<li><code id="BintrayOptions-distribution">distribution</code> = `stable` String | "undefined" - The Bintray distribution (Debian only).</li>
<li><code id="BintrayOptions-user">user</code> String | "undefined" - The Bintray user account. Used in cases where the owner is an organization.</li>
<li><code id="BintrayOptions-token">token</code> String | "undefined"</li>
</ul>

Inherited from `PublishConfiguration`:

<ul>
<li><code id="BintrayOptions-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
    
    Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.
</li>
<li><code id="BintrayOptions-requestHeaders">requestHeaders</code> module:http.OutgoingHttpHeaders - Any custom request headers</li>
</ul>

## GenericServerOptions
Generic (any HTTP(S) server) options.
In all publish options [File Macros](/file-patterns#file-macros) are supported.

<ul>
<li>**<code id="GenericServerOptions-provider">provider</code>** "generic" - The provider. Must be `generic`.</li>
<li>**<code id="GenericServerOptions-url">url</code>** String - The base url. e.g. `https://bucket_name.s3.amazonaws.com`.</li>
<li><code id="GenericServerOptions-channel">channel</code> = `latest` String | "undefined" - The channel.</li>
<li><code id="GenericServerOptions-useMultipleRangeRequest">useMultipleRangeRequest</code> Boolean - Whether to use multiple range requests for differential update. Defaults to `true` if `url` doesn't contain `s3.amazonaws.com`.</li>
</ul>

Inherited from `PublishConfiguration`:

<ul>
<li><code id="GenericServerOptions-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
    
    Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.
</li>
<li><code id="GenericServerOptions-requestHeaders">requestHeaders</code> module:http.OutgoingHttpHeaders - Any custom request headers</li>
</ul>

## GithubOptions
[GitHub](https://help.github.com/articles/about-releases/) options.

GitHub [personal access token](https://help.github.com/articles/creating-an-access-token-for-command-line-use/) is required. You can generate by going to [https://github.com/settings/tokens/new](https://github.com/settings/tokens/new). The access token should have the repo scope/permission.
Define `GH_TOKEN` environment variable.

<ul>
<li>**<code id="GithubOptions-provider">provider</code>** "github" - The provider. Must be `github`.</li>
<li><code id="GithubOptions-repo">repo</code> String | "undefined" - The repository name. [Detected automatically](#github-repository-and-bintray-package).</li>
<li><code id="GithubOptions-owner">owner</code> String | "undefined" - The owner.</li>
<li><code id="GithubOptions-vPrefixedTagName">vPrefixedTagName</code> = `true` Boolean - Whether to use `v`-prefixed tag name.</li>
<li><code id="GithubOptions-host">host</code> = `github.com` String | "undefined" - The host (including the port if need).</li>
<li><code id="GithubOptions-protocol">protocol</code> = `https` "https" | "http" | "undefined" - The protocol. GitHub Publisher supports only `https`.</li>
<li><code id="GithubOptions-token">token</code> String | "undefined" - The access token to support auto-update from private github repositories. Never specify it in the configuration files. Only for [setFeedURL](/auto-update#appupdatersetfeedurloptions).</li>
<li><code id="GithubOptions-private">private</code> Boolean | "undefined" - Whether to use private github auto-update provider if `GH_TOKEN` environment variable is defined. See [Private GitHub Update Repo](/auto-update#private-github-update-repo).</li>
<li><code id="GithubOptions-releaseType">releaseType</code> = `draft` "draft" | "prerelease" | "release" | "undefined" - The type of release. By default `draft` release will be created.
    
    Also you can set release type using environment variable. If `EP_DRAFT`is set to `true` — `draft`, if `EP_PRE_RELEASE`is set to `true` — `prerelease`.
</li>
</ul>

Inherited from `PublishConfiguration`:

<ul>
<li><code id="GithubOptions-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
    
    Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.
</li>
<li><code id="GithubOptions-requestHeaders">requestHeaders</code> module:http.OutgoingHttpHeaders - Any custom request headers</li>
</ul>


<!-- end of generated block -->

## S3Options
[Amazon S3](https://aws.amazon.com/s3/) options.

AWS credentials are required, please see [getting your credentials](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/getting-your-credentials.html).
Define `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` [environment variables](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-environment.html).
Or in the [~/.aws/credentials](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html).

Example configuration:

```json tab="package.json"
{
  "build":
    "publish": {
      "provider": "s3",
      "bucket": "bucket-name"
    }
  }
}
```

{!generated/s3-options.md!}

{!generated/spaces-options.md!}

{!generated/snap-store-options.md!}
