Travis and AppVeyor support publishing artifacts. But it requires additional configuration for each CI (since AppVeyor can build only Windows and Travis only macOS / Linux).

`electron-builder` allows you to just define some environment variables (and set one or two options) and that's all (see [publish configuration](/configuration/publish.md)).

Currently, [GitHub Releases](https://help.github.com/articles/about-releases/), [Amazon S3](https://aws.amazon.com/s3/), [DigitalOcean Spaces](https://www.digitalocean.com/community/tutorials/an-introduction-to-digitalocean-spaces) and [Bintray](https://bintray.com) are supported.

## CLI Flags

Excerpt from [CLI Usage](https://github.com/electron-userland/electron-builder#cli-usage) of `build` command:
```
Publishing:
  --publish, -p  [choices: "onTag", "onTagOrDraft", "always", "never"]
  --draft        Whether to create a draft (unpublished) release or release. 
                 Defaults to `true`.                         [boolean]
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

* If CI server reports that tag was pushed, — `onTag`.

  Release will be drafted (if doesn't already exist) and artifacts published only if tag was pushed.

* If [npm script](https://docs.npmjs.com/misc/scripts) named `release`, — `always`.

 Add to `scripts` in the development `package.json`:
 ```json
 "release": "build"
 ```
 and if you run `yarn release`, a release will be drafted (if doesn't already exist) and artifacts published.
 
## Recommended GitHub Releases Workflow

1. [Draft a new release](https://help.github.com/articles/creating-releases/). Set the "Tag version" to the value of `version` in your application `package.json`, and prefix it with `v`. "Release title" can be anything you want.
  
   For example, if your application `package.json` version is `1.0`, your draft's "Tag version" would be `v1.0`.
2. Push some commits. Every CI build will update the artifacts attached to this draft.
3. Once you are done, publish the release. GitHub will tag the latest commit for you.

The benefit of this workflow is that it allows you to always have the latest artifacts, and the release can be published once it is ready.

## Continuous Deployment Workflow on Amazon S3 and other non-GitHub

This example workflow is modelled on how releases are handled in maven (it is an example of one of many possible workflows, you are not forced to follow it).

1. Setup your CI to publish on each commit. E.g. `"dist": "electron-builder --publish always"` in your `package.json`.
2. Set your version in your application `package.json` to `1.9.0-snapshot` (or `1.9.0-master` or whatever you want your development channel to be named). This will publish a file named `snapshot.yml` and a build named `something-snapshot.exe` (and corresponding for mac) to S3.
3. When you are ready to deploy, simply change you package version to `1.9.0` and push. This will then produce a `latest.yml` and `something.exe` on s3. Usually you'll git-tag this version as well (just to keep track of it).
4. Change the version back to a snapshot version right after, i.e. `1.10.0-snapshot`, and commit it.