---
title: "File Patterns"
---

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

:::tip[Excluding directories]
Remember that `!doNotCopyMe/**/*` would match the files *in* the `doNotCopyMe` directory, but not the directory itself, so the [empty directory](https://github.com/gulpjs/gulp/issues/165#issuecomment-32613179) would be created.
Solution — use macro `${/*}`, e.g. `!doNotCopyMe${/*}`.
:::

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

## Default Ignored Files

electron-builder excludes a set of files from the packaged app by default (development files, and certain extensions/names such as Wavefront `.obj` 3D models). In **v27** the `disableDefaultIgnoredFiles` option was removed. To keep a file that is excluded by default, add an explicit `fileOptions.files` glob that **names it concretely** — an explicit include now overrides the matching default exclusion:

```json5
{
  "build": {
    "fileOptions": {
      "files": [
        "**/*",
        "**/*.obj"  // opt a default-excluded extension back in
      ]
    }
  }
}
```

Broad patterns such as `**/*` still honor the defaults. A pattern that names an excluded extension includes only the files it matches: `**/*.obj` includes every `.obj` file outside `node_modules` and the build resources and output directories, `models/teapot.obj` only that file. The same goes for `.pdb` files, which v26 excluded whatever `files` said unless `includePdb` was `true`: a pattern such as `native/*.pdb` or `**/*.{node,pdb}` now includes the `.pdb` files it matches, also in a configuration that extends this one (`migrate-schema` reports such patterns). To keep them out, remove the pattern or add a negation such as `!native/*.pdb` after it. A directory whose name ends with an excluded extension (e.g. `data.obj/`) stays excluded with everything in it, even when a `files` pattern names a file inside it. A pattern with a default-excluded name as a path segment (e.g. `**/.github/**`) opts that name back in. See [v27 Breaking Changes → `disableDefaultIgnoredFiles`](./migration/v27-config-changes.md#disabledefaultignoredfiles).

The excluded **extensions** are set with `fileOptions.excludedExts`, which applies to the app files and the copied `node_modules`. `"default"` stands for the built-in list (which includes `obj` and `pdb`), any other entry adds an extension, and an entry starting with `!` removes one: `["default", "!pdb"]` is every default except `pdb`. A list without `"default"` replaces the defaults, so a list of removals only, such as `["!pdb"]`, would exclude no extension at all and is rejected. `[]` excludes no extension. A later list replaces an earlier one: a platform's list (e.g. `win.fileOptions.excludedExts`) replaces the root one, `mas` / `masDev` replace `mac`'s, and an `extends` child's replaces its parent's:

```json5
{
  "build": {
    "fileOptions": {
      "excludedExts": ["default", "!pdb", "map"]  // the defaults except .pdb, plus .map
    }
  }
}
```

A single entry may be written as a string (`"excludedExts": "default"` is `["default"]`), which is how to set it on the command line: `-c.fileOptions.excludedExts=default`. For several entries, repeat the flag, e.g. `-c.fileOptions.excludedExts=default -c.fileOptions.excludedExts=!pdb` for `["default", "!pdb"]` (in an interactive bash or zsh, write the second one as `'-c.fileOptions.excludedExts=!pdb'`, single-quoted, so that `!pdb` is not expanded). An invalid list (an entry that is not a file extension, `"!default"`, or removals only) fails the build when the configuration is validated, at the root and in every platform section, before anything is packed.

:::warning[Shipping symbol files]
`.pdb` files contain symbol names and the source paths of the build machine. Keep them (`["default", "!pdb"]`) only in internal builds or builds for a symbol server, or upload them to a symbol server instead of shipping them.
:::

See [v27 Breaking Changes → `includePdb` → `fileOptions.excludedExts`](./migration/v27-config-changes.md#includepdb-fileoptionsexcludedexts).

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
* Any property of [AppInfo](./api/index.md) (e.g. `buildVersion`, `buildNumber`).
