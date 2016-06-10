Travis and AppVeyor support publishing artifacts. But it requires additional configuration. For each CI (since AppVeyor can build only Windows and Travis only OS X / Linux).

`electron-builder` allows you to just add `GH_TOKEN` environment variable and that's all (see Generating a token).

Currently, only GitHub Releases is supported.

`publish` option values:

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

## Generating a token

In order to publish artifacts to your repository, you need to create a token. Go to your GitHub Settings > [Personal access tokens](https://github.com/settings/tokens).

Generate a new token with at least `public_repo` permission. Copy that token and save it for later use when you need to publish your artifacts. It should look like this: `4bca68e34f8461a44d2b8996f3bc14306bd46c88`.

If you need to release your files using a CI server, you will need to export your token encrypted so nobody else can see it.

## Exporting GH_TOKEN on Travis CI

First of all, you need to install Travis CLI. If you don't have it, do it by running `gem install travis`.

Then, navigate to your project directory and run:
```sh
travis encrypt GH_TOKEN="<YOUR TOKEN HERE>" --add
```

This will insert your token information in your project `.travis.yml` and then you're good to go.

## Exporting GH_TOKEN on AppVeyor

Access your profile in AppVeyor and go to Tools > [Encrypt data](https://ci.appveyor.com/tools/encrypt).

Insert your token and it will return with the encrypted data. Something like this:

```
environment:
  my_variable:
    secure: DSv9AFhGJc9cG9diOsKnrw==
```

Copy that into your `appveyor.yml`, replace `my_variable` for `GH_TOKEN` and you're done.
