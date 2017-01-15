Travis and AppVeyor support publishing artifacts. But it requires additional configuration. For each CI (since AppVeyor can build only Windows and Travis only macOS / Linux).

`electron-builder` allows you to just add `GH_TOKEN` environment variable and that's all.

Currently, [GitHub Releases](https://help.github.com/articles/about-releases/) and [Bintray](https://bintray.com) are supported.

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

[publish](#PublishConfiguration) can be specified in the [configuration options](https://github.com/electron-userland/electron-builder/wiki/Options#Config) or any platform- or target- specific options.

```json
"win": {
  "publish": ["github", "bintray"]
}
```

<!-- do not edit. start of generated block -->
* [publish](#PublishConfiguration)
* [publish Bintray](#BintrayOptions)
* [publish Generic (any https server)](#GenericServerOptions)
* [publish GitHub](#GithubOptions)

<a name="PublishConfiguration"></a>
### `publish`

Can be specified in the [build](https://github.com/electron-userland/electron-builder/wiki/Options#build) or any platform- or target- specific options.

If `GH_TOKEN` is set — defaults to `[{provider: "github"}]`.
If `BT_TOKEN` is set and `GH_TOKEN` is not set — defaults to `[{provider: "bintray"}]`.

Array of option objects. Order is important — first item will be used as a default auto-update server on Windows (NSIS).

Amazon S3 — `https` must be used, so, if you use direct Amazon S3 endpoints, format `https://s3.amazonaws.com/bucket_name` [must be used](http://stackoverflow.com/a/11203685/1910191). And do not forget to make files/directories public.

| Name | Description
| --- | ---
| **provider** | <a name="PublishConfiguration-provider"></a>The provider, one of `github`, `bintray`, `generic`.
| owner | <a name="PublishConfiguration-owner"></a>The owner.

<a name="BintrayOptions"></a>
### `publish` Bintray
| Name | Description
| --- | ---
| package | <a name="BintrayOptions-package"></a>The Bintray package name.
| repo | <a name="BintrayOptions-repo"></a>The Bintray repository name. Defaults to `generic`.
| user | <a name="BintrayOptions-user"></a>The Bintray user account. Used in cases where the owner is an organization.

<a name="GenericServerOptions"></a>
### `publish` Generic (any https server)
| Name | Description
| --- | ---
| **url** | <a name="GenericServerOptions-url"></a>The base url. e.g. `https://s3.amazonaws.com/bucket_name`
| channel | <a name="GenericServerOptions-channel"></a>The channel. Defaults to `latest`.

<a name="GithubOptions"></a>
### `publish` GitHub
| Name | Description
| --- | ---
| repo | <a name="GithubOptions-repo"></a>The repository name. [Detected automatically](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts#github-repository).
| vPrefixedTagName | <a name="GithubOptions-vPrefixedTagName"></a>Whether to use `v`-prefixed tag name. Defaults to `true`.

<!-- end of generated block -->