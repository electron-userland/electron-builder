import { CompressionLevel, Publish, TargetConfiguration, TargetSpecificOptions } from "../core"
import { FileAssociation } from "./FileAssociation"

export interface FileSet {
  /**
   * The source path relative to and defaults to:
   *
   *  - the [app directory](configuration.md#directories) for `files`,
   *  - the project directory for `extraResources` and `extraFiles`.
   * If you don't use two-package.json structure and don't set custom app directory, app directory equals to project directory.
   */
  from?: string
  /**
   * The destination path relative to and defaults to:
   *
   *  - the asar archive root for `files`,
   *  - the app's content directory for `extraFiles`,
   *  - the app's resource directory for `extraResources`.
   */
  to?: string
  /**
   * The [glob patterns](./file-patterns.md). Defaults to "**\/*"
   */
  filter?: Array<string> | string
}

export interface AsarOptions {
  /**
   * Whether to automatically unpack executables files.
   * @default true
   */
  smartUnpack?: boolean

  ordering?: string | null
}

export interface FilesBuildOptions {
  /**
   * A [glob patterns](./file-patterns.md) relative to the [app directory](configuration.md#directories), which specifies which files to include when copying files to create the package.

Defaults to:
```json
[
  "**\/*",
  "!**\/node_modules/*\/{CHANGELOG.md,README.md,README,readme.md,readme}",
  "!**\/node_modules/*\/{test,__tests__,tests,powered-test,example,examples}",
  "!**\/node_modules/*.d.ts",
  "!**\/node_modules/.bin",
  "!**\/*.{iml,o,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,xproj}",
  "!.editorconfig",
  "!**\/._*",
  "!**\/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,.gitignore,.gitattributes}",
  "!**\/{__pycache__,thumbs.db,.flowconfig,.idea,.vs,.nyc_output}",
  "!**\/{appveyor.yml,.travis.yml,circle.yml}",
  "!**\/{npm-debug.log,yarn.lock,.yarn-integrity,.yarn-metadata.json}"
]
```

Development dependencies are never copied in any case. You don't need to ignore it explicitly. Hidden files are not ignored by default, but all files that should be ignored, are ignored by default.

Default pattern \`**\/*\` **is not added to your custom** if some of your patterns is not ignore (i.e. not starts with `!`). `package.json` and \`**\/node_modules/**\/*` (only production dependencies will be copied) is added to your custom in any case. All default ignores are added in any case — you don't need to repeat it if you configure own patterns.

May be specified in the platform options (e.g. in the [mac](mac.md)).

You may also specify custom source and destination directories by using `FileSet` objects instead of simple glob patterns.

```json
[
  {
    "from": "path/to/source",
    "to": "path/to/destination",
    "filter": ["**\/*", "!foo/*.js"]
  }
]
```

You can use [file macros](./file-patterns.md#file-macros) in the `from` and `to` fields as well. `from` and `to` can be files and you can use this to [rename](https://github.com/electron-userland/electron-builder/issues/1119) a file while packaging.
   */
  files?: Array<FileSet | string> | FileSet | string | null

  /**
   * A [glob patterns](./file-patterns.md) relative to the project directory, when specified, copy the file or directory with matching names directly into the app's resources directory (`Contents/Resources` for MacOS, `resources` for Linux and Windows).
   *
   * File patterns (and support for `from` and `to` fields) the same as for [files](#files).
   *
   */
  extraResources?: Array<FileSet | string> | FileSet | string | null

  /**
   * The same as [extraResources](#extraresources) but copy into the app's content directory (`Contents` for MacOS, root directory for Linux and Windows).
   */
  extraFiles?: Array<FileSet | string> | FileSet | string | null
}

export interface PlatformSpecificBuildOptions extends TargetSpecificOptions, FilesBuildOptions {
  /**
   * The application id. Used as [CFBundleIdentifier](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070) for MacOS and as
   * [Application User Model ID](https://msdn.microsoft.com/en-us/library/windows/desktop/dd378459(v=vs.85).aspx) for Windows (NSIS target only, Squirrel.Windows not supported). It is strongly recommended that an explicit ID is set.
   * @default com.electron.${name}
   */
  readonly appId?: string | null

  /**
   * The [artifact file name template](./configuration.md#artifact-file-name-template). Defaults to `${productName}-${version}.${ext}` (some target can have other defaults, see corresponding options).
   */
  readonly artifactName?: string | null

  /**
   * The executable name. Defaults to `productName`.
   */
  readonly executableName?: string | null

  /**
   * The compression level. If you want to rapidly test build, `store` can reduce build time significantly. `maximum` doesn't lead to noticeable size difference, but increase build time.
   * @default normal
   */
  readonly compression?: CompressionLevel | null

  /**
   * Whether to exclude all default ignored files(https://www.electron.build/contents#files) and options. Defaults to `false`.
   *
   * @default false
   */
  disableDefaultIgnoredFiles?: boolean | null

  /**
   * Whether to package the application's source code into an archive, using [Electron's archive format](http://electron.atom.io/docs/tutorial/application-packaging/).
   *
   * Node modules, that must be unpacked, will be detected automatically, you don't need to explicitly set [asarUnpack](#asarUnpack) - please file an issue if this doesn't work.
   * @default true
   */
  readonly asar?: AsarOptions | boolean | null

  /**
   * A [glob patterns](./file-patterns.md) relative to the [app directory](#directories), which specifies which files to unpack when creating the [asar](http://electron.atom.io/docs/tutorial/application-packaging/) archive.
   */
  readonly asarUnpack?: Array<string> | string | null

  /*  - @private */
  readonly icon?: string | null

  /**
   * The file associations.
   */
  readonly fileAssociations?: Array<FileAssociation> | FileAssociation
  /**
   * The URL protocol schemes.
   */
  readonly protocols?: Array<Protocol> | Protocol

  /**
   * The electron locales to keep. By default, all Electron locales used as-is.
   */
  readonly electronLanguages?: Array<string> | string

  /**
   * Whether to fail if app will be not code signed.
   */
  readonly forceCodeSigning?: boolean

  /**
   * The [electron-updater compatibility](./auto-update.md#compatibility) semver range.
   */
  readonly electronUpdaterCompatibility?: string | null

  /**
   * Publisher configuration. See [Auto Update](./publish.md) for more information.
   */
  publish?: Publish

  /**
   * Whether to infer update channel from application version pre-release components. e.g. if version `0.12.1-alpha.1`, channel will be set to `alpha`. Otherwise to `latest`.
   * This does *not* apply to github publishing, which will [never auto-detect the update channel](https://github.com/electron-userland/electron-builder/issues/8589).
   * @default true
   */
  readonly detectUpdateChannel?: boolean

  /**
   * Please see [Building and Releasing using Channels](https://github.com/electron-userland/electron-builder/issues/1182#issuecomment-324947139).
   * @default false
   */
  readonly generateUpdatesFilesForAllChannels?: boolean

  /**
   * The release info. Intended for command line usage:
   *
   * ```
   * -c.releaseInfo.releaseNotes="new features"
   * ```
   */
  readonly releaseInfo?: ReleaseInfo

  readonly target?: Array<string | TargetConfiguration> | string | TargetConfiguration | null

  /*  - @private */
  cscLink?: string | null

  /*  - @private */
  cscKeyPassword?: string | null

  readonly defaultArch?: string
}

export interface ReleaseInfo {
  /**
   * The release name.
   */
  releaseName?: string | null

  /**
   * The release notes.
   */
  releaseNotes?: string | null

  /**
   * The path to release notes file. Defaults to `release-notes-${platform}.md` (where `platform` it is current platform — `mac`, `linux` or `windows`) or `release-notes.md` in the [build resources](./contents.md#extraresources).
   */
  releaseNotesFile?: string | null

  /**
   * The release date.
   */
  releaseDate?: string

  /**
   * Vendor specific information.
   */
  vendor?: { [key: string]: any } | null
}

/**
 * URL Protocol Schemes. Protocols to associate the app with. macOS only.
 *
 * Please note — on macOS [you need to register an `open-url` event handler](http://electron.atom.io/docs/api/app/#event-open-url-macos).
 */
export interface Protocol {
  /**
   * The name. e.g. `IRC server URL`.
   */
  readonly name: string

  /**
   * The schemes. e.g. `["irc", "ircs"]`.
   */
  readonly schemes: Array<string>

  /**
   * *macOS-only* The app’s role with respect to the type.
   * @default Editor
   */
  readonly role?: "Editor" | "Viewer" | "Shell" | "None"
}
