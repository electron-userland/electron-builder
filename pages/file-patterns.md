* `*` Matches 0 or more characters in a single path portion
* `?` Matches 1 character
* `[...]` Matches a range of characters, similar to a RegExp range.
  If the first character of the range is `!` or `^` then it matches
  any character not in the range.
* `!(pattern|pattern|pattern)` Matches anything that does not match
  any of the patterns provided.
* `?(pattern|pattern|pattern)` Matches zero or one occurrence of the
  patterns provided.
* `+(pattern|pattern|pattern)` Matches one or more occurrences of the
  patterns provided.
* `*(a|b|c)` Matches zero or more occurrences of the patterns provided
* `@(pattern|pat*|pat?erN)` Matches exactly one of the patterns
  provided
* `**` If a "globstar" is alone in a path portion, then it matches
  zero or more directories and subdirectories searching for matches.
  It does not crawl symlinked directories.

If directory matched, all contents are copied. So, you can just specify `foo` to copy `foo` directory.

!!! tip "Excluding directories"
    Remember that `!doNotCopyMe/**/*` would match the files *in* the `doNotCopyMe` directory, but not the directory itself, so the [empty directory](https://github.com/gulpjs/gulp/issues/165#issuecomment-32613179) would be created.
    Solution — use macro `${/*}`, e.g. `!doNotCopyMe${/*}`.

## Multiple Glob Patterns
 ```js
 [
   // match all files
   "**/*",

   // except for js files in the foo/ directory
   "!foo/*.js",

   // unless it's foo/bar.js
   "foo/bar.js",
 ]
 ```

## File Macros

You can use macros in the file patterns, artifact file name patterns and publish configuration url:

* `${arch}` — expanded to `ia32`, `x64`. If no `arch`, macro will be removed from your pattern with leading space, `-` and `_` (so, you don't need to worry and can reuse pattern).
* `${os}` — expanded to `mac`, `linux` or `win` according to target platform.
* `${platform}` — expanded to `darwin`, `linux` or `win32` according to Node.js `process.platform` property.
* `${name}` – `package.json` `name`.
* `${productName}` — [Sanitized](https://www.npmjs.com/package/sanitize-filename) product name.
* `${version}`
* `${channel}` — detected prerelease component from version (e.g. `beta`).
* `${env.ENV_NAME}` — any environment variable.
* Any property of [AppInfo](api/electron-builder.md#AppInfo) (e.g. `buildVersion`, `buildNumber`).
