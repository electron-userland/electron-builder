# Publishing artifacts

Travis and AppVeyor support publishing artifacts. But it requires additional configuration. For each CI (since AppVeyor can build only Windows and Travis only OS X / Linux).

`electron-builder` allows you to just add `GH_TOKEN` environment variable and that's all.

Currently, only GitHub Releases is supported.

`publish` option values:

| Value          |  Description
| -------------- | -----------
| `onTag`        | on tag push only
| `onTagOrDraft` | on tag push or if draft release exists
| `always`       | always publish
| `never`        | never publish

But please consider to use automatic rules and don't specify `publish` explicitly:

* If CI server detected, — `onTagOrDraft`.

 What does it means? [Draft a new release](https://help.github.com/articles/creating-releases/) (version (`v1.0`) must be equals to version (`1.0`) in the application `package.json`) and each CI build will update artifacts. It allows you to get latest artifacts in any time and publish release once it is ready.

* If CI server reports that tag was pushed, — `onTag`.

 Release will be drafted (if doesn't exists) and artifacts published only and only if tag was pushed.

* If [npm script](https://docs.npmjs.com/misc/scripts) named `release`, — `always`.

 Add to `scripts` in the development `package.json`:
 ```json
"release": "build"
```
 and if you run `npm run release`, release will be drafted (if doesn't exists) and artifacts published.