The [publish](./configuration.md#publish) key contains a set of options instructing electron-builder on how it should publish artifacts and build update info files for [auto update](./features/auto-update.md).

`String | Object | Array<Object | String>` where `Object` it is [Keygen](#keygen), [Generic Server](#byo-generic-create-your-own), [GitHub](#github), [S3](#s3), [Spaces](#spaces), [R2](#r2) or [Snap Store](#snap-store) options. Order is important — first item will be used as a default auto-update server. Can be specified in the [top-level configuration](./configuration.md) or any platform- ([mac](mac.md), [linux](linux.md), [win](win.md)) or target- (e.g. [nsis](nsis.md)) specific configuration.

Note that when using a generic server, you have to upload the built application and metadata files yourself.

Travis and AppVeyor support publishing artifacts. But it requires additional configuration for each CI and you need to configure what to publish.
`electron-builder` makes publishing dead simple.

!!! important "Publishing Must Be Explicitly Requested"
    Publishing is not performed automatically. You must explicitly request publishing using the `--publish` CLI flag (e.g., `--publish always`, `--publish onTag`, `--publish onTagOrDraft`) or by setting the `publish` option in your configuration.

If `GH_TOKEN` or `GITHUB_TOKEN` is defined — defaults to `[{provider: "github"}]`.

If `KEYGEN_TOKEN` is defined and `GH_TOKEN` or `GITHUB_TOKEN` is not — defaults to `[{provider: "keygen"}]`.

If `GITHUB_RELEASE_TOKEN` is defined, it will be used instead of (`GH_TOKEN` or `GITHUB_TOKEN`) to publish your release.
- e.g. mac: ``` export GITHUB_RELEASE_TOKEN=<my token> ```
- the `GITHUB_TOKEN` will still be used when your app checks for updates, etc.
- you could make your `GITHUB_TOKEN` "Read-only" when creating a fine-grained personal access token, and "Read and write" for the `GITHUB_RELEASE_TOKEN`.
- "Contents" fine-grained permission was sufficient. (at time of writing - Apr 2024)

:::warning[Implicit publishing was removed in v27]
In v26 and earlier, electron-builder auto-detected when to publish based on CI environment conditions (npm lifecycle event, a git tag in CI, etc.). **As of v27 this implicit behavior is removed** — publishing never happens unless you request it. This closes a hole where unfinished work or secrets could be published unintentionally.

Explicitly specify your publish intent with the `--publish` CLI flag (e.g. `--publish always`, `--publish onTag`, `--publish onTagOrDraft`, `--publish never`) or set the `publish` option in your configuration. See [v27 Breaking Changes → implicit `--publish` removed](./migration/v27-breaking-changes.md#implicit---publish-removed).
:::

:::info[Snap store]
`snap` target by default publishes to the Snap Store (the app store for Linux). To force publishing to another provider, explicitly specify publish configuration for `snap`.
:::

You can publish to multiple providers. For example, to publish Windows artifacts to both GitHub and Bitbucket (order is important — first item will be used as a default auto-update server, so in this example the app will use GitHub as the auto-update provider):

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

A [custom](https://github.com/electron-userland/electron-builder/issues/3261) publish provider can be used if needed.

:::tip[Macros]
In all publish options [File Macros](./file-patterns.md#file-macros) are supported.
:::

## How to Publish

Excerpt from [CLI Usage](./cli.md) of `electron-builder` command:
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

* If CI server reports that a tag was pushed, — `onTag`.

  A release will be drafted (if one doesn't already exist) and artifacts published only if a tag was pushed.

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

This example workflow is modeled on how releases are handled in Maven (it is an example of one of many possible workflows, you are not forced to follow it).

1. Setup your CI to publish on each commit. E.g. `"dist": "electron-builder --publish always"` in your `package.json`.
2. Set your version in your application `package.json` to `1.9.0-snapshot` (or `1.9.0-master` or whatever you want your development channel to be named). This will publish a file named `snapshot.yml` and a build named `something-snapshot.exe` (and corresponding for mac) to S3.
3. When you are ready to deploy, simply change your package version to `1.9.0` and push. This will then produce a `latest.yml` and `something.exe` on s3. Usually you'll git-tag this version as well (just to keep track of it).
4. Change the version back to a snapshot version right after, i.e. `1.10.0-snapshot`, and commit it.

## GitHub Repository {#github-repository-and-bintray-package}

Detected automatically using:

* [repository](https://docs.npmjs.com/files/package.json#repository) in the application or development `package.json`,
* if not set, env
    * `TRAVIS_REPO_SLUG`
    * or `APPVEYOR_REPO_NAME`
    * or `CIRCLE_PROJECT_USERNAME`/`CIRCLE_PROJECT_REPONAME`,
* if no env, from `.git/config` origin url.

# Publishers

## Bitbucket
  {!./builder-util-runtime.Interface.BitbucketOptions.md!}

## Github
  {!./builder-util-runtime.Interface.GithubOptions.md!}

## GitLab
  {!./builder-util-runtime.Interface.GitlabOptions.md!}

## Keygen
  {!./builder-util-runtime.Interface.KeygenOptions.md!}

## S3
  {!./builder-util-runtime.Interface.S3Options.md!}

## Snap Store
  {!./builder-util-runtime.Interface.SnapStoreOptions.md!}

## Spaces
  {!./builder-util-runtime.Interface.SpacesOptions.md!}

## R2

To publish to [Cloudflare R2](https://developers.cloudflare.com/r2/):

1. Create an [R2 API token](https://developers.cloudflare.com/r2/api/s3/tokens/) with at least **Object Read & Write** permission on your bucket.
2. Expose its credentials to electron-builder via the `CF_R2_ACCESS_KEY_ID` and `CF_R2_SECRET_ACCESS_KEY` environment variables.
3. Enable [public access](https://developers.cloudflare.com/r2/buckets/public-buckets/) for the bucket via an `r2.dev` subdomain or a custom domain — R2's S3 API endpoint cannot serve unauthenticated downloads, so `electron-updater` cannot download updates from it.
4. Set `publicUrl` to that public base URL.

Auto-updating from R2 requires an `electron-updater` version that supports the `r2` provider: electron-updater >= 7.0.0 (the release line containing this feature).

Note: files are uploaded with a single PUT request, and R2 limits single-PUT uploads to ~5 GiB per object.

  {!./builder-util-runtime.Interface.R2Options.md!}

## BYO Generic (create-your-own)
(And maybe submit it upstream in a PR!)
  {!./builder-util-runtime.Interface.GenericServerOptions.md!}
