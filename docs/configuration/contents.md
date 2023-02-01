## files

`Array<String | FileSet> | String | FileSet`

A [glob patterns](../file-patterns.md) relative to the [app directory](configuration.md#MetadataDirectories-app), which specifies which files to include when copying files to create the package.

Defaults to:
```json
[
  "**/*",
  "!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}",
  "!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}",
  "!**/node_modules/*.d.ts",
  "!**/node_modules/.bin",
  "!**/*.{iml,o,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,xproj}",
  "!.editorconfig",
  "!**/._*",
  "!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,.gitignore,.gitattributes}",
  "!**/{__pycache__,thumbs.db,.flowconfig,.idea,.vs,.nyc_output}",
  "!**/{appveyor.yml,.travis.yml,circle.yml}",
  "!**/{npm-debug.log,yarn.lock,.yarn-integrity,.yarn-metadata.json}"
]
```

Development dependencies are never copied in any case. You don't need to ignore it explicitly. Hidden files are not ignored by default, but all files that should be ignored, are ignored by default.


Default pattern `**/*` **is not added to your custom** if some of your patterns is not ignore (i.e. not starts with `!`). `package.json` and `**/node_modules/**/*` (only production dependencies will be copied) is added to your custom in any case. All default ignores are added in any case — you don't need to repeat it if you configure own patterns.

May be specified in the platform options (e.g. in the [mac](mac.md)).

You may also specify custom source and destination directories by using `FileSet` objects instead of simple glob patterns.

```json
[
  {
    "from": "path/to/source",
    "to": "path/to/destination",
    "filter": ["**/*", "!foo/*.js"]
  }
]
```

You can use [file macros](../file-patterns.md#file-macros) in the `from` and `to` fields as well. `from` and `to` can be files and you can use this to [rename](https://github.com/electron-userland/electron-builder/issues/1119) a file while packaging.

### `FileSet.from`

`String`

The source path relative to and defaults to:

* the [app directory](configuration.md#MetadataDirectories-app) for `files`,
* the project directory for `extraResources` and `extraFiles`.

If you don't use two-package.json structure and don't set custom app directory, app directory equals to project directory.

### `FileSet.to`

`String`

The destination path relative to and defaults to: 
* the asar archive root for `files`,
* the app's content directory for `extraFiles`,
* the app's resource directory for `extraResources`.

### `FileSet.filter`

`Array<String> | String`

The [glob patterns](../file-patterns.md). Defaults to `*/**`.

## extraResources

`Array<String | FileSet> | String | FileSet`

A [glob patterns](../file-patterns.md) relative to the project directory, when specified, copy the file or directory with matching names directly into the app's resources directory (`Contents/Resources` for MacOS, `resources` for Linux and Windows).

File patterns (and support for `from` and `to` fields) the same as for [files](#files).

## extraFiles

`Array<String | FileSet> | String | FileSet`

The same as [extraResources](#extraresources) but copy into the app's content directory (`Contents` for MacOS, root directory for Linux and Windows).