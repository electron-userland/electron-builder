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
    - github
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
<h2 id="genericserveroptions">GenericServerOptions</h2>
<p>Generic (any HTTP(S) server) options.
In all publish options <a href="/file-patterns#file-macros">File Macros</a> are supported.</p>
<ul>
<li><strong><code id="GenericServerOptions-provider">provider</code></strong> “generic” - The provider. Must be <code>generic</code>.</li>
<li><strong><code id="GenericServerOptions-url">url</code></strong> String - The base url. e.g. <code>https://bucket_name.s3.amazonaws.com</code>.</li>
<li><code id="GenericServerOptions-channel">channel</code> = <code>latest</code> String | “undefined” - The channel.</li>
<li><code id="GenericServerOptions-useMultipleRangeRequest">useMultipleRangeRequest</code> Boolean - Whether to use multiple range requests for differential update. Defaults to <code>true</code> if <code>url</code> doesn’t contain <code>s3.amazonaws.com</code>.</li>
</ul>
<p>Inherited from <code>PublishConfiguration</code>:</p>
<ul>
<li>
<p><code id="GenericServerOptions-publishAutoUpdate">publishAutoUpdate</code> = <code>true</code> Boolean - Whether to publish auto update info files.</p>
<p>Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.</p>
</li>
<li>
<p><code id="GenericServerOptions-requestHeaders">requestHeaders</code> module:http.OutgoingHttpHeaders - Any custom request headers</p>
</li>
</ul>
<h2 id="githuboptions">GithubOptions</h2>
<p><a href="https://help.github.com/articles/about-releases/">GitHub</a> options.</p>
<p>GitHub <a href="https://help.github.com/articles/creating-an-access-token-for-command-line-use/">personal access token</a> is required. You can generate by going to <a href="https://github.com/settings/tokens/new">https://github.com/settings/tokens/new</a>. The access token should have the repo scope/permission.
Define <code>GH_TOKEN</code> environment variable.</p>
<ul>
<li>
<p><strong><code id="GithubOptions-provider">provider</code></strong> “github” - The provider. Must be <code>github</code>.</p>
</li>
<li>
<p><code id="GithubOptions-repo">repo</code> String | “undefined” - The repository name. <a href="#github-repository-and-bintray-package">Detected automatically</a>.</p>
</li>
<li>
<p><code id="GithubOptions-owner">owner</code> String | “undefined” - The owner.</p>
</li>
<li>
<p><code id="GithubOptions-vPrefixedTagName">vPrefixedTagName</code> = <code>true</code> Boolean - Whether to use <code>v</code>-prefixed tag name.</p>
</li>
<li>
<p><code id="GithubOptions-host">host</code> = <code>github.com</code> String | “undefined” - The host (including the port if need).</p>
</li>
<li>
<p><code id="GithubOptions-protocol">protocol</code> = <code>https</code> “https” | “http” | “undefined” - The protocol. GitHub Publisher supports only <code>https</code>.</p>
</li>
<li>
<p><code id="GithubOptions-token">token</code> String | “undefined” - The access token to support auto-update from private github repositories. Never specify it in the configuration files. Only for <a href="/auto-update#appupdatersetfeedurloptions">setFeedURL</a>.</p>
</li>
<li>
<p><code id="GithubOptions-private">private</code> Boolean | “undefined” - Whether to use private github auto-update provider if <code>GH_TOKEN</code> environment variable is defined. See <a href="/auto-update#private-github-update-repo">Private GitHub Update Repo</a>.</p>
</li>
<li>
<p><code id="GithubOptions-channel">channel</code> = <code>latest</code> String | “undefined” - The channel.</p>
</li>
<li>
<p><code id="GithubOptions-releaseType">releaseType</code> = <code>draft</code> “draft” | “prerelease” | “release” | “undefined” - The type of release. By default <code>draft</code> release will be created.</p>
<p>Also you can set release type using environment variable. If <code>EP_DRAFT</code>is set to <code>true</code> — <code>draft</code>, if <code>EP_PRE_RELEASE</code>is set to <code>true</code> — <code>prerelease</code>.</p>
</li>
</ul>
<p>Inherited from <code>PublishConfiguration</code>:</p>
<ul>
<li>
<p><code id="GithubOptions-publishAutoUpdate">publishAutoUpdate</code> = <code>true</code> Boolean - Whether to publish auto update info files.</p>
<p>Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.</p>
</li>
<li>
<p><code id="GithubOptions-requestHeaders">requestHeaders</code> module:http.OutgoingHttpHeaders - Any custom request headers</p>
</li>
</ul>
<h2 id="snapstoreoptions">SnapStoreOptions</h2>
<p><a href="https://snapcraft.io/">Snap Store</a> options.</p>
<ul>
<li><strong><code id="SnapStoreOptions-provider">provider</code></strong> “snapStore” - The provider. Must be <code>snapStore</code>.</li>
<li><code id="SnapStoreOptions-repo">repo</code> String - snapcraft repo name</li>
<li><code id="SnapStoreOptions-channels">channels</code> = <code>[&quot;edge&quot;]</code> String | Array&lt;String&gt; | “undefined” - The list of channels the snap would be released.</li>
</ul>
<p>Inherited from <code>PublishConfiguration</code>:</p>
<ul>
<li>
<p><code id="SnapStoreOptions-publishAutoUpdate">publishAutoUpdate</code> = <code>true</code> Boolean - Whether to publish auto update info files.</p>
<p>Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.</p>
</li>
<li>
<p><code id="SnapStoreOptions-requestHeaders">requestHeaders</code> module:http.OutgoingHttpHeaders - Any custom request headers</p>
</li>
</ul>
<h2 id="spacesoptions">SpacesOptions</h2>
<p><a href="https://www.digitalocean.com/community/tutorials/an-introduction-to-digitalocean-spaces">DigitalOcean Spaces</a> options.
Access key is required, define <code>DO_KEY_ID</code> and <code>DO_SECRET_KEY</code> environment variables.</p>
<ul>
<li><strong><code id="SpacesOptions-provider">provider</code></strong> “spaces” - The provider. Must be <code>spaces</code>.</li>
<li><strong><code id="SpacesOptions-name">name</code></strong> String - The space name.</li>
<li><strong><code id="SpacesOptions-region">region</code></strong> String - The region (e.g. <code>nyc3</code>).</li>
<li><code id="SpacesOptions-channel">channel</code> = <code>latest</code> String | “undefined” - The update channel.</li>
<li><code id="SpacesOptions-path">path</code> = <code>/</code> String | “undefined” - The directory path.</li>
<li><code id="SpacesOptions-acl">acl</code> = <code>public-read</code> “private” | “public-read” | “undefined” - The ACL. Set to <code>null</code> to not <a href="https://github.com/electron-userland/electron-builder/issues/1822">add</a>.</li>
</ul>
<h2 id="keygenoptions">KeygenOptions</h2>
<p>Keygen options.
<a href="https://keygen.sh/">https://keygen.sh/</a>
Define <code>KEYGEN_TOKEN</code> environment variable.</p>
<ul>
<li><strong><code id="KeygenOptions-provider">provider</code></strong> “keygen” - The provider. Must be <code>keygen</code>.</li>
<li><strong><code id="KeygenOptions-account">account</code></strong> String - Keygen account’s UUID</li>
<li><strong><code id="KeygenOptions-product">product</code></strong> String - Keygen product’s UUID</li>
<li><code id="KeygenOptions-channel">channel</code> = <code>stable</code> “stable” | “rc” | “beta” | “alpha” | “dev” | “undefined” - The channel.</li>
<li><code id="KeygenOptions-platform">platform</code> String | “undefined” - The target Platform. Is set programmatically explicitly during publishing.</li>
</ul>
<p>Inherited from <code>PublishConfiguration</code>:</p>
<ul>
<li>
<p><code id="KeygenOptions-publishAutoUpdate">publishAutoUpdate</code> = <code>true</code> Boolean - Whether to publish auto update info files.</p>
<p>Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.</p>
</li>
<li>
<p><code id="KeygenOptions-requestHeaders">requestHeaders</code> module:http.OutgoingHttpHeaders - Any custom request headers</p>
</li>
</ul>
<h2 id="bitbucketoptions">BitbucketOptions</h2>
<p>Bitbucket options.
<a href="https://bitbucket.org/">https://bitbucket.org/</a>
Define <code>BITBUCKET_TOKEN</code> environment variable.</p>
<p>For converting an app password to a usable token, you can utilize this</p>
<pre><code class="hljs language-typescript"><span class="hljs-function"><span class="hljs-title">convertAppPassword</span>(<span class="hljs-params">owner: <span class="hljs-built_in">string</span>, token: <span class="hljs-built_in">string</span></span>)</span> {
<span class="hljs-keyword">const</span> base64encodedData = Buffer.from(<span class="hljs-string">`<span class="hljs-subst">${owner}</span>:<span class="hljs-subst">${token.trim()}</span>`</span>).toString(<span class="hljs-string">&quot;base64&quot;</span>)
<span class="hljs-keyword">return</span> <span class="hljs-string">`Basic <span class="hljs-subst">${base64encodedData}</span>`</span>
}
</code></pre>
<ul>
<li><strong><code id="BitbucketOptions-provider">provider</code></strong> “bitbucket” - The provider. Must be <code>bitbucket</code>.</li>
<li><strong><code id="BitbucketOptions-owner">owner</code></strong> String - Repository owner</li>
<li><code id="BitbucketOptions-token">token</code> String | “undefined” - The access token to support auto-update from private bitbucket repositories.</li>
<li><code id="BitbucketOptions-username">username</code> String | “undefined” - The user name to support auto-update from private bitbucket repositories.</li>
<li><strong><code id="BitbucketOptions-slug">slug</code></strong> String - Repository slug/name</li>
<li><code id="BitbucketOptions-channel">channel</code> = <code>latest</code> String | “undefined” - The channel.</li>
</ul>
<p>Inherited from <code>PublishConfiguration</code>:</p>
<ul>
<li>
<p><code id="BitbucketOptions-publishAutoUpdate">publishAutoUpdate</code> = <code>true</code> Boolean - Whether to publish auto update info files.</p>
<p>Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.</p>
</li>
<li>
<p><code id="BitbucketOptions-requestHeaders">requestHeaders</code> module:http.OutgoingHttpHeaders - Any custom request headers</p>
</li>
</ul>
<h2 id="s3options">S3Options</h2>
<p><a href="https://aws.amazon.com/s3/">Amazon S3</a> options.
AWS credentials are required, please see <a href="http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/getting-your-credentials.html">getting your credentials</a>.
Define <code>AWS_ACCESS_KEY_ID</code> and <code>AWS_SECRET_ACCESS_KEY</code> <a href="http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-environment.html">environment variables</a>.
Or in the <a href="http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html">~/.aws/credentials</a>.</p>
<p>Example configuration:</p>
<pre><code class="hljs language-json">{
<span class="hljs-attr">&quot;build&quot;</span>:
<span class="hljs-string">&quot;publish&quot;</span>: {
<span class="hljs-attr">&quot;provider&quot;</span>: <span class="hljs-string">&quot;s3&quot;</span>,
<span class="hljs-attr">&quot;bucket&quot;</span>: <span class="hljs-string">&quot;bucket-name&quot;</span>
}
}
}
</code></pre>
<ul>
<li>
<p><strong><code id="S3Options-provider">provider</code></strong> “s3” - The provider. Must be <code>s3</code>.</p>
</li>
<li>
<p><strong><code id="S3Options-bucket">bucket</code></strong> String - The bucket name.</p>
</li>
<li>
<p><code id="S3Options-region">region</code> String | “undefined” - The region. Is determined and set automatically when publishing.</p>
</li>
<li>
<p><code id="S3Options-acl">acl</code> = <code>public-read</code> “private” | “public-read” | “undefined” - The ACL. Set to <code>null</code> to not <a href="https://github.com/electron-userland/electron-builder/issues/1822">add</a>.</p>
<p>Please see <a href="https://github.com/electron-userland/electron-builder/issues/1618#issuecomment-314679128">required permissions for the S3 provider</a>.</p>
</li>
<li>
<p><code id="S3Options-storageClass">storageClass</code> = <code>STANDARD</code> “STANDARD” | “REDUCED_REDUNDANCY” | “STANDARD_IA” | “undefined” - The type of storage to use for the object.</p>
</li>
<li>
<p><code id="S3Options-encryption">encryption</code> “AES256” | “aws:kms” | “undefined” - Server-side encryption algorithm to use for the object.</p>
</li>
<li>
<p><code id="S3Options-endpoint">endpoint</code> String | “undefined” - The endpoint URI to send requests to. The default endpoint is built from the configured region. The endpoint should be a string like <code>https://{service}.{region}.amazonaws.com</code>.</p>
</li>
<li>
<p><code id="S3Options-channel">channel</code> = <code>latest</code> String | “undefined” - The update channel.</p>
</li>
<li>
<p><code id="S3Options-path">path</code> = <code>/</code> String | “undefined” - The directory path.</p>
</li>
</ul>

<!-- end of generated block -->
