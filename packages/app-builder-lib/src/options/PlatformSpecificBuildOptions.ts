import { CompressionLevel, Publish, TargetConfiguration, TargetSpecificOptions } from "../core.js"
import { FileAssociation } from "./FileAssociation.js"

export interface FileSet {
  /**
   * The source path relative to and defaults to:
   *
   *  - the [app directory](https://www.electron.build/configuration#directories) for `files`,
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
   * The [glob patterns](https://www.electron.build/file-patterns). Defaults to "**\/*"
   */
  filter?: Array<string> | string
}

export interface AsarOptions {
  /**
   * Whether to automatically unpack executables files.
   * @default true
   */
  smartUnpack?: boolean

  /**
   * Path to a file containing the order in which files should be packed into the asar archive.
   * Each line of the file is a relative path from the app directory. Files listed first are
   * packed first, which can improve app startup time by front-loading frequently accessed modules.
   * See the [asar documentation](https://github.com/electron/asar) for details.
   *
   * Lines use the same syntax `@electron/asar` accepts: the path may carry a leading `/` or a
   * `<count>:` prefix (as written by a load counter), and blank lines are ignored. There is no comment
   * syntax, and `\` separators are accepted. Directory entries are moved to the front in their original
   * relative order (they hold no data), listed files follow in the order of the file, and every other
   * file keeps its original order after them. Lines naming a directory are ignored, and listed files
   * that are not in the archive are skipped.
   *
   * The path is resolved like other build resources: relative to the [build resources directory](#directories)
   * first, then to the project directory. A missing file fails the build. Packing files ahead of the default
   * dependencies-first layout can increase differential update download size.
   */
  ordering?: string | null

  /**
   * A [glob patterns](https://www.electron.build/file-patterns) relative to the [app directory](#directories),
   * which specifies which files to unpack when creating the asar archive.
   */
  unpack?: Array<string> | string | null

  /**
   * Align the start of every packed file's content inside `app.asar` to a multiple of this many bytes
   * (zero padding between files). Off when unset or `0`.
   *
   * Meant for differential updates with `nsis.differentialPackage: "store-asar"`: the asar header stores
   * every file's absolute content offset, so without alignment a change that grows a file by a single byte
   * shifts the offset of every later file and most of the header has to be re-downloaded. With alignment
   * a file can grow within its slot and no other offset moves. Measured on a 32 MB asar with 3,000 files:
   * `512` cut a small length-changing edit from 414 KB to 139 KB of differential download for 2.2 % more
   * asar size. Padding does not help when a file is added or removed (a new header entry shifts all later
   * offsets) or when growth crosses the slot. File order, sizes and per-file integrity are unchanged;
   * Electron and `@electron/asar` read files by offset + size and ignore the gaps.
   *
   * Must be a positive integer; values above 64 KiB log a warning because every file is padded up to the
   * boundary. The alignment is applied when electron-builder packs `app.asar`, so it is lost when the
   * archive is rebuilt afterwards: macOS universal builds with `mac.universal.mergeASARs` (the default)
   * repack the merged asar, and `--prepackaged` skips packing entirely.
   * @default 0
   */
  contentAlignment?: number | null

  /**
   * Whether to skip the ASAR package integrity sanity check.
   *
   * Set to `true` only when using a custom Electron fork that implements its own encrypted or
   * non-standard ASAR integrity validation that is not compatible with electron-builder's default
   * check. Standard builds should leave this `false`.
   *
   * @default false
   */
  disableSanityCheck?: boolean

  /**
   * Whether to skip computing the ASAR integrity hash.
   *
   * Normally electron-builder computes and embeds a SHA-256 hash of `app.asar` so that Electron
   * can verify it at startup (when the `enableEmbeddedAsarIntegrityValidation` fuse is enabled). Set to
   * `true` only for custom Electron forks with encrypted ASAR support where the header is not
   * readable by standard tools. It also skips the macOS ASAR integrity digest (`mac.asarIntegrityDigest`).
   *
   * @default false
   */
  disableIntegrity?: boolean
}

/**
 * Which files are copied into the packaged app, which file extensions are excluded from it, and which symlinks among them may lead outside it,
 * set under `fileOptions` at the configuration root or per platform (e.g. `mac.fileOptions`). A platform's file lists are added to the root
 * ones; a platform's `excludedExts` and `allowExternalLinks` replace the root ones.
 * See [file options](https://www.electron.build/docs/migration/v27-breaking-changes#file-options-fileoptions).
 */
export interface FilesBuildOptions {
  /**
   * A [glob patterns](https://www.electron.build/file-patterns) relative to the [app directory](https://www.electron.build/configuration#directories), which specifies which files to include when copying files to create the package.

Defaults to:
```json
[
  "**\/*",
  "!**\/node_modules/*\/{CHANGELOG.md,README.md,README,readme.md,readme}",
  "!**\/node_modules/*\/{test,__tests__,tests,powered-test,example,examples}",
  "!**\/node_modules/*.d.ts",
  "!**\/node_modules/.bin",
  "!**\/*.{iml,o,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,slnx,xproj}",
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

May be specified in the platform options as well (e.g. `mac.fileOptions.files`, see [mac](https://www.electron.build/mac)).

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

You can use [file macros](https://www.electron.build/file-patterns#file-macros) in the `from` and `to` fields as well. `from` and `to` can be files and you can use this to [rename](https://github.com/electron-userland/electron-builder/issues/1119) a file while packaging.
   */
  files?: Array<FileSet | string> | FileSet | string | null

  /**
   * A [glob patterns](https://www.electron.build/file-patterns) relative to the project directory, when specified, copy the file or directory with matching names directly into the app's resources directory (`Contents/Resources` for MacOS, `resources` for Linux and Windows).
   *
   * File patterns (and support for `from` and `to` fields) the same as for [files](#files).
   *
   */
  extraResources?: Array<FileSet | string> | FileSet | string | null

  /**
   * The same as [extraResources](#extraresources) but copy into the app's content directory (`Contents` for MacOS, root directory for Linux and Windows).
   */
  extraFiles?: Array<FileSet | string> | FileSet | string | null

  /**
   * File extensions (without the leading dot) excluded from the packaged app files and the copied `node_modules`.
   *
   * - `"default"` expands to the built-in list of excluded extensions (see the table below).
   * - Any other entry adds that extension, e.g. `"map"`.
   * - An entry starting with `!` removes that extension from the others listed, e.g. `["default", "!pdb"]` to keep `.pdb` (Program Database)
   *   symbol files for Windows crash-dump analysis. `.pdb` files contain symbol names and the source paths of the build machine:
   *   keep them only in internal builds or builds for a symbol server, or upload them to a symbol server instead of shipping them.
   *   A list of removals only, such as `["!pdb"]`, is rejected because it would exclude no extension at all: write `["default", "!pdb"]`. A `"!ext"` in a list that does not otherwise list that extension (e.g. `["map", "!pdb"]`) has no effect and logs a warning.
   *
   * The built-in list (`"default"`):
   *
   * | Extension | Typically used for |
   * | --- | --- |
   * | `.iml` | IntelliJ IDEA / WebStorm module file |
   * | `.hprof` | Java heap dump |
   * | `.orig` | Original copy of a file, left behind by merge tools and `patch` |
   * | `.pyc` | Compiled Python bytecode |
   * | `.pyo` | Optimized compiled Python bytecode (Python 2) |
   * | `.rbc` | Compiled Ruby bytecode (Rubinius) |
   * | `.swp` | Vim swap file |
   * | `.csproj` | C# (MSBuild) project file |
   * | `.sln` | Visual Studio solution file |
   * | `.slnx` | Visual Studio XML solution file |
   * | `.suo` | Visual Studio solution user options |
   * | `.xproj` | .NET Core project file (Visual Studio 2015) |
   * | `.cc` | C++ source file, e.g. of a native module |
   * | `.d.ts` | TypeScript declaration file |
   * | `.mk` | Makefile fragment generated by node-gyp |
   * | `.a` | Static library archive from a native build |
   * | `.o` | Object file from a native build |
   * | `.obj` | Object file from an MSVC native build; also used for Wavefront 3D models, which a `files` pattern can re-include |
   * | `.forge-meta` | Metadata `@electron/rebuild` writes next to a rebuilt native module |
   * | `.pdb` | Program Database: Windows debug symbols, with symbol names and the build machine's source paths |
   *
   * The list replaces the defaults: list `"default"` to extend them rather than replace them. `null` (or omitting it) is `["default"]`,
   * and an empty array `[]` excludes no extension.
   *
   * An invalid list (an entry that is not a file extension, `"!default"`, or removals only) fails the build when the configuration is validated, at the root and in every platform section, before anything is packed.
   *
   * ```json
   * { "fileOptions": { "excludedExts": ["default", "!pdb", "map"] } }
   * ```
   *
   * Set it under `fileOptions`, at the configuration root or per platform. Unlike the other lists, a later list replaces an earlier one rather
   * than being merged with it. For the root and for each platform section, the last layer that sets the list wins: the `extends` parents in
   * order, then the configuration file, then the programmatic or `-c` configuration. For the `mas` and `mas-dev` targets, a `mas` list then
   * replaces the `mac` one, and a `masDev` list (for `mas-dev`) replaces both. A platform's list then replaces the root one, whichever layer
   * set either. A `null` value keeps the earlier list.
   *
   * A `files` pattern that names an excluded extension includes only the app files it matches: `**\/*.obj` every `.obj` file outside
   * `node_modules` and the build resources and output directories, `models/teapot.obj` only that file.
   *
   * A single entry may be given as a string, e.g. on the command line: `-c.fileOptions.excludedExts=default`. For several entries, repeat the flag:
   * `-c.fileOptions.excludedExts=default -c.fileOptions.excludedExts=!pdb` (in an interactive bash or zsh, write the second one as `'-c.fileOptions.excludedExts=!pdb'`, single-quoted, so that `!pdb` is not expanded).
   * @default ["default"]
   */
  excludedExts?: Array<string> | string | null

  /**
   * Whether symlinks among the packaged files may lead outside the app, the workspace and the package-manager store.
   *
   * Only the build configuration is trusted, not the files it packages: by default (`false`) electron-builder refuses
   * - a file of the app (`app.asar` or `asar: false`) that is a symlink, or is reached through one, whose real path is outside the workspace
   *   root, the project and app directories and the package-manager store (`npm link`, a `file:../lib` dependency outside the repository,
   *   a symlink into the home or temp directory),
   * - a copied symlink that resolves outside the app: one in `extraResources` / `extraFiles` (other than into the workspace or the store),
   *   one kept by an `asar: false` copy, and any symlink leaving the app in a target that stores what symlinks point to (Windows `zip` / `7z`,
   *   the NSIS app package, AppX/MSIX, Squirrel.Windows).
   *
   * Without these checks, a symlink planted in a dependency or a copied directory could package files from elsewhere on the build machine (SSH keys,
   * credentials) into the artifact, which is why this is off by default.
   *
   * - `true` allows any such symlink.
   * - A list of paths, relative to the project directory or absolute, allows a symlink only when the real path of what it points to is
   *   inside the real path of one of them (e.g. `["../shared-lib"]`). A listed path that does not exist fails the build.
   *
   * An allowed symlink is packaged: what it points to is copied (or stored by the archive), and a copied symlink is kept
   * as it is. A warning is logged once when this allows a symlink.
   *
   * Set it under `fileOptions`, at the configuration root or per platform; a platform's value (`false` included) replaces the root one
   * rather than being added to it:
   * ```json
   * { "fileOptions": { "allowExternalLinks": ["../shared-lib"] }, "linux": { "fileOptions": { "allowExternalLinks": true } } }
   * ```
   *
   * This does not allow writing through a symlink: a copy or a file written by electron-builder whose destination leads outside the
   * output directory through a symlink is always refused, and a symlink at such a file name is replaced, never followed.
   * See [Symbolic links](https://www.electron.build/docs/contents#symbolic-links).
   * @default false
   */
  allowExternalLinks?: boolean | Array<string> | null
}

export interface PlatformSpecificBuildOptions extends TargetSpecificOptions {
  /**
   * Which files to copy into the packaged app (`files`, the app sources, `extraResources` and `extraFiles`), which file extensions to exclude
   * from it (`excludedExts`), and whether symlinks among them may lead outside the app and the workspace (`allowExternalLinks`).
   * Set at the configuration root, per platform (e.g. `mac.fileOptions`), or both: a platform's file lists are added to the root ones,
   * and a platform's `excludedExts` and `allowExternalLinks` replace the root ones.
   *
   * ```json
   * {
   *   "fileOptions": {
   *     "files": ["dist/**\/*", "package.json"],
   *     "extraResources": [{ "from": "assets/bin", "to": "bin" }]
   *   }
   * }
   * ```
   *
   * `files`, `extraResources` and `extraFiles` set directly on the configuration or a platform section are moved here
   * when the configuration is loaded, with a warning. Run `electron-builder migrate-schema` to update the configuration.
   */
  fileOptions?: FilesBuildOptions | null

  /**
   * The application id. Used as [CFBundleIdentifier](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070) for MacOS and as
   * [Application User Model ID](https://msdn.microsoft.com/en-us/library/windows/desktop/dd378459(v=vs.85).aspx) for Windows (NSIS target only, Squirrel.Windows not supported). It is strongly recommended that an explicit ID is set.
   * @default com.electron.${name}
   */
  readonly appId?: string | null

  /**
   * The [artifact file name template](https://www.electron.build/configuration#artifact-file-name-template). Defaults to `${productName}-${version}.${ext}` (some target can have other defaults, see corresponding options).
   */
  readonly artifactName?: string | null

  /**
   * The executable name. Defaults to `productName`
   * Note: Except for Linux, where this would constitute a breaking change in previous behavior and lead to both invalid executable names and Desktop files. Ref comments in: https://github.com/electron-userland/electron-builder/pull/9068
   */
  readonly executableName?: string | null

  /**
   * The compression level. If you want to rapidly test build, `store` can reduce build time significantly. `maximum` doesn't lead to noticeable size difference, but increase build time.
   * @default normal
   */
  readonly compression?: CompressionLevel | null

  /**
   * Whether to package the application's source code into an archive, using [Electron's archive format](https://www.electronjs.org/docs/latest/tutorial/asar-archives).
   *
   * Node modules that must be unpacked will be detected automatically. Use {@link AsarOptions.unpack} to specify additional files to unpack.
   * @default true
   */
  readonly asar?: AsarOptions | boolean | null

  /** @private */
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
   * @default false
   */
  readonly forceCodeSigning?: boolean

  /**
   * The [electron-updater compatibility](https://www.electron.build/docs/features/auto-update#compatibility) semver range.
   */
  readonly electronUpdaterCompatibility?: string | null

  /**
   * Publisher configuration. See [Auto Update](https://www.electron.build/publish) for more information.
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
   * Ed25519 signing of the auto-update manifest (`latest*.yml`). Each manifest is signed and its public key is
   * embedded into `app-update.yml`, so electron-updater verifies the signature before downloading an update.
   *
   * **Signing is required.** Publishing a build that emits auto-update metadata fails unless a signing key
   * resolves. Generate one once with `electron-builder create-update-key`, then supply it via
   * `ELECTRON_BUILDER_UPDATE_SIGN_KEY` (the PEM file, base64-encoded) / `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` (its path),
   * preferred in CI, or via `signingKey` / `signingKeyFile` below. Leaving this option unset — or `null` — keeps signing required and
   * resolves the key from the environment; `null` is not an opt-out.
   *
   * Set to `false`, the only opt-out, to ship **unsigned** manifests. Every build that produces a manifest then
   * logs a warning. `false` also short-circuits the environment variables, so a leftover
   * `ELECTRON_BUILDER_UPDATE_SIGN_KEY` in CI cannot re-enable signing by accident.
   *
   * The requirement is only enforced when a publish policy is in effect (`--publish`); a build without one
   * warns instead, so local builds and pipelines that sign the manifest in a later step of their own are
   * unaffected. It is also waived when every publish provider has `publishAutoUpdate: false`, since no manifest is
   * emitted then, and for a build whose targets write no update info (e.g. only snap, flatpak, MSI/MSIX, portable,
   * mas/pkg or plain archives). A publishing build checks for the key at build start, before anything is packed
   * or uploaded.
   *
   * See [Signed Update Manifests](https://www.electron.build/features/signed-update-manifests).
   */
  readonly updateManifest?: UpdateManifestSigningOptions | false | null

  /**
   * The release info. Intended for command line usage:
   *
   * ```
   * -c.releaseInfo.releaseNotes="new features"
   * ```
   */
  readonly releaseInfo?: ReleaseInfo

  /**
   * The build target(s) for this platform. Can be a target name string, a {@link TargetConfiguration}
   * object, or an array of either. Available targets depend on the platform — see platform-specific
   * options (e.g. {@link MacConfiguration.target}, {@link WindowsConfiguration.target},
   * {@link LinuxConfiguration.target}).
   */
  readonly target?: Array<string | TargetConfiguration> | string | TargetConfiguration | null

  /** @private */
  cscLink?: string | null

  /** @private */
  cscKeyPassword?: string | null

  /**
   * The default architecture to build for when no `--arch` flag is specified.
   * Defaults to the current machine's architecture.
   */
  readonly defaultArch?: string
}

export interface UpdateManifestSigningOptions {
  /**
   * Ed25519 private key(s) in PEM (PKCS#8) format used to sign the update manifest. A single PEM string may
   * contain several concatenated keys, or pass an array with one key each; the manifest is signed by every key
   * (dual-signing for [key rotation](https://www.electron.build/features/key-rotation)) and the first key also
   * fills the legacy single `signature` field.
   * Secret — prefer the `ELECTRON_BUILDER_UPDATE_SIGN_KEY` environment variable (the PEM file, base64-encoded) in CI over committing this to config.
   */
  readonly signingKey?: string | Array<string> | null

  /**
   * Path(s) to file(s) containing the Ed25519 private key (PEM, PKCS#8). Alternative to `signingKey`.
   * An array signs with every listed key, in order. Relative paths are resolved against the project directory.
   */
  readonly signingKeyFile?: string | Array<string> | null

  /**
   * The Ed25519 public key(s) (PEM or base64 SPKI) embedded into `app-update.yml` as the updater's trust list.
   * The updater accepts a manifest when any listed key validates one of its signatures. Optional — when
   * omitted the public key of every configured signing key is derived and embedded. Set it explicitly to trust
   * additional keys ahead of a rotation (for example `[current, next]`).
   *
   * A `publicKey` on its own does not satisfy the signing requirement — electron-builder still has no key to
   * sign with. An external signer (HSM/KMS) that signs `latest*.yml` in a later step therefore either builds
   * without a publish policy, where the requirement only warns and the unsigned manifest is written locally, or
   * keeps publishing with `publishAutoUpdate: false` on every publish provider - electron-builder then uploads the
   * artifacts and embeds this key, but writes no `latest*.yml`, so the external step has to produce it too.
   *
   * When set, it must contain at least one of the signing keys: a publishing build signed only by keys outside this
   * list fails, since its installs would reject manifests signed with them. See `allowSigningKeyOutsideTrustList`.
   */
  readonly publicKey?: string | Array<string> | null

  /**
   * Allows a publishing build to sign its manifests only with keys that are not in `publicKey` - a deliberate
   * cutover release that is verified by installs with the old key, but hands them over to the keys listed in
   * `publicKey`. Every later release must then be signed by a listed key. Without it such a build fails; a build
   * without a publish policy only warns. Has no effect when `publicKey` is not set.
   * @default false
   */
  readonly allowSigningKeyOutsideTrustList?: boolean | null
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
   * The path to release notes file. Defaults to `release-notes-${platform}.md` (where `platform` it is current platform — `mac`, `linux` or `windows`) or `release-notes.md` in the [build resources](https://www.electron.build/contents#extraresources).
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
