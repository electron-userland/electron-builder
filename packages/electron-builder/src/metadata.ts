import { AsarIntegrityOptions } from "asar-integrity"
import { Arch, BeforeBuildContext, CompressionLevel, Target, TargetConfig, TargetSpecificOptions } from "electron-builder-core"
import { Publish } from "electron-builder-http/out/publishOptions"
import { DebOptions, LinuxBuildOptions, LinuxTargetSpecificOptions, SnapOptions } from "./options/linuxOptions"
import { DmgOptions, MacOptions, MasBuildOptions, PkgOptions } from "./options/macOptions"
import { AppXOptions, NsisOptions, NsisWebOptions, PortableOptions, SquirrelWindowsOptions, WinBuildOptions } from "./options/winOptions"
import { PlatformPackager } from "./platformPackager"

/**
 * Some standard fields should be defined in the `package.json`.
 */
export interface Metadata {
  /**
   * The application name.
   * @required
   */
  readonly name?: string

  /**
   * The application description.
   */
  readonly description?: string

  /**
   * The url to the project [homepage](https://docs.npmjs.com/files/package.json#homepage) (NuGet Package `projectUrl` (optional) or Linux Package URL (required)).
   *
   * If not specified and your project repository is public on GitHub, it will be `https://github.com/${user}/${project}` by default.
   */
  readonly homepage?: string | null

  /**
   * *linux-only.* The [license](https://docs.npmjs.com/files/package.json#license) name.
   */
  readonly license?: string | null

  readonly author?: AuthorMetadata

  /**
   * The [repository](https://docs.npmjs.com/files/package.json#repository).
   */
  readonly repository?: string | RepositoryInfo | null

  readonly build?: Config

  /** @private */
  readonly dependencies?: { [key: string]: string }
  /** @private */
  readonly version?: string
  /** @private */
  readonly productName?: string | null
  /** @private */
  readonly main?: string | null
}

export interface AuthorMetadata {
  readonly name: string
  readonly email?: string
}

export interface RepositoryInfo {
  readonly url: string
}

/**
 * Configuration Options
 */
export interface Config extends PlatformSpecificBuildOptions {
  /**
   * The application id. Used as [CFBundleIdentifier](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070) for MacOS and as
   * [Application User Model ID](https://msdn.microsoft.com/en-us/library/windows/desktop/dd378459(v=vs.85).aspx) for Windows (NSIS target only, Squirrel.Windows not supported). It is strongly recommended that an explicit ID be set.
   * @default com.electron.${name}
   */
  readonly appId?: string | null

  /**
   * The human-readable copyright line for the app.
   * @default Copyright © year ${author}
   */
  readonly copyright?: string | null
  
  /**
   * As [name](#Metadata-name), but allows you to specify a product name for your executable which contains spaces and other special characters not allowed in the [name property](https://docs.npmjs.com/files/package.json#name}).
   */
  readonly productName?: string | null

  /**
   * A [glob patterns](#file-patterns) relative to the [app directory](#MetadataDirectories-app), which specifies which files to include when copying files to create the package.
   */
  readonly files?: Array<string> | string | null

  /**
   * A [glob patterns](#file-patterns) relative to the project directory, when specified, copy the file or directory with matching names directly into the app's resources directory (`Contents/Resources` for MacOS, `resources` for Linux/Windows).
   *
   * Glob rules the same as for [files](#multiple-glob-patterns).
   *
   * You may also specify custom source and destination directories by using JSON objects instead of simple glob patterns.
   * Note this only works for [extraFiles](#Config-extraFiles) and [extraResources](#Config-extraResources).
   *
   *```json<br>
   * [<br>
   *   {<br>
   *     "from": "path/to/source",<br>
   *     "to": "path/to/destination",<br>
   *     "filter": ["**\/*", "!foo/*.js"]<br>
   *   }<br>
   * ]<br>
   * ```
   *
   * `from` and `to` can be files and you can use this to [rename](https://github.com/electron-userland/electron-builder/issues/1119) a file while packaging.
   *
   * You can use [file macros](#file-macros) in the `from` and `to` fields as well.
   */
  readonly extraResources?: Array<FilePattern | string> | FilePattern | string | null

  /**
   * The same as [extraResources](#Config-extraResources) but copy into the app's content directory (`Contents` for MacOS, root directory for Linux/Windows).
   */
  readonly extraFiles?: Array<FilePattern | string> | FilePattern | string | null

  /**
   * Whether to package the application's source code into an archive, using [Electron's archive format](http://electron.atom.io/docs/tutorial/application-packaging/).
   * 
   * Node modules, that must be unpacked, will be detected automatically, you don't need to explicitly set [asarUnpack](#Config-asarUnpack) - please file issue if this doesn't work.
   * @default true
  */
  readonly asar?: boolean | AsarOptions | null

  /**
   * A [glob patterns](#file-patterns) relative to the [app directory](#MetadataDirectories-app), which specifies which files to unpack when creating the [asar](http://electron.atom.io/docs/tutorial/application-packaging/) archive.
   */
  readonly asarUnpack?: Array<string> | string | null

  /**
   * File associations.
   */
  readonly fileAssociations?: Array<FileAssociation> | FileAssociation

  /**
   * URL protocol schemes.
   */
  readonly protocols?: Array<Protocol> | Protocol
  
  /**
   * The compression level. If you want to rapidly test build, `store` can reduce build time significantly.
   * @default normal
   */
  readonly compression?: CompressionLevel | null

  /**
   * *programmatic API only* The function to be run after pack (but before pack into distributable format and sign). Promise must be returned.
   */
  readonly afterPack?: (context: AfterPackContext) => Promise<any> | null

  /**
   * *programmatic API only* The function to be run before dependencies are installed or rebuilt. Works when `npmRebuild` is set to `true`. Promise must be returned. Resolving to `false` will skip dependencies install or rebuild.
   */
  readonly beforeBuild?: (context: BeforeBuildContext) => Promise<any> | null

  /**
   * Whether to [rebuild](https://docs.npmjs.com/cli/rebuild) native dependencies (`npm rebuild`) before starting to package the app.
   * @default true
   */
  readonly npmRebuild?: boolean

  /**
   * Whether to omit using [--build-from-source](https://github.com/mapbox/node-pre-gyp#options) flag when installing app native deps.
   * @default false
   */
  readonly npmSkipBuildFromSource?: boolean

  /**
   * Additional command line arguments to use when installing app native deps.
   */
  readonly npmArgs?: Array<string> | string | null

  /**
   * Whether to execute `node-gyp rebuild` before starting to package the app.
   * @default false
   */
  readonly nodeGypRebuild?: boolean

  /**
   * The path to custom Electron build (e.g. `~/electron/out/R`). Only macOS supported, file issue if need for Linux or Windows.
   */
  readonly electronDist?: string

  /**
   * The [electron-download](https://github.com/electron-userland/electron-download#usage) options.
   */
  readonly electronDownload?: any
  
  /**
   * Array of option objects. Order is important — first item will be used as a default auto-update server.
   * @see [Publish options](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts#publish-options).
   */
  readonly publish?: Publish

  /**
   * Whether to fail if application will be not signed (to prevent unsigned app if code signing configuration is not correct).
   * @default false
   */
  readonly forceCodeSigning?: boolean

  readonly directories?: MetadataDirectories | null

  /**
   * The version of electron you are packaging for. Defaults to version of `electron`, `electron-prebuilt` or `electron-prebuilt-compile` dependency.
   */
  readonly electronVersion?: string | null
  
  /**
   * The version of muon you are packaging for.
   */
  readonly muonVersion?: string | null

  /**
   * The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern). Defaults to `${productName}-${version}.${ext}` (some target can have another defaults, see corresponding options).
   */
  readonly artifactName?: string | null

  /**
   * The build version. Maps to the `CFBundleVersion` on macOS, and `FileVersion` metadata property on Windows. Defaults to the `version`.
   * If `TRAVIS_BUILD_NUMBER` or `APPVEYOR_BUILD_NUMBER` or `CIRCLE_BUILD_NUM` or `BUILD_NUMBER` or `bamboo.buildNumber` env defined, it will be used as a build version (`version.build_number`).
   */
  readonly buildVersion?: string | null
  
  /**
   * Whether to use [electron-compile](http://github.com/electron/electron-compile) to compile app. Defaults to `true` if `electron-compile` in the dependencies. And `false` if in the `devDependencies` or doesn't specified.
   */
  readonly electronCompile?: boolean

  /**
   * Whether to infer update channel from application version prerelease components. e.g. if version `0.12.1-alpha.1`, channel will be set to `alpha`. Otherwise to `latest`.
   * @default true
   */
  readonly detectUpdateChannel?: boolean

  /**
   * macOS options.
   */
  readonly mac?: MacOptions | null

  /**
   * MAS (Mac Application Store) options.
   */
  readonly mas?: MasBuildOptions | null

  /**
   * macOS DMG options.
   *
   * To add license to DMG, create file `license_LANG_CODE.txt` in the build resources. Multiple license files in different languages are supported — use lang postfix (e.g. `_de`, `_ru`)). For example, create files `license_de.txt` and `license_en.txt` in the build resources.
   * If OS language is german, `license_de.txt` will be displayed. See map of [language code to name](https://github.com/meikidd/iso-639-1/blob/master/src/data.js).
   */
  readonly dmg?: DmgOptions | null

  /**
   * macOS product archive options.
   */
  readonly pkg?: PkgOptions | null

  /**
   * Windows options.
   */
  readonly win?: WinBuildOptions | null
  readonly nsis?: NsisOptions | null
  readonly nsisWeb?: NsisWebOptions | null
  readonly portable?: PortableOptions | null
  readonly appx?: AppXOptions | null
  readonly squirrelWindows?: SquirrelWindowsOptions | null

  /**
   * Linux options.
   */
  readonly linux?: LinuxBuildOptions | null
  /**
   * Debian package specific options.
   */
  readonly deb?: DebOptions | null
  /**
   * [Snap](http://snapcraft.io) options.
   */
  readonly snap?: SnapOptions | null
  readonly appimage?: LinuxTargetSpecificOptions | null
  readonly pacman?: LinuxTargetSpecificOptions | null
  readonly rpm?: LinuxTargetSpecificOptions | null
  readonly freebsd?: LinuxTargetSpecificOptions | null
  readonly p5p?: LinuxTargetSpecificOptions | null
  readonly apk?: LinuxTargetSpecificOptions | null
  
  /**
   * @private
   */
  readonly icon?: string | null
}

export interface AfterPackContext {
  readonly appOutDir: string
  readonly packager: PlatformPackager<any>
  readonly electronPlatformName: string
  readonly arch: Arch
  readonly targets: Array<Target>
}

export interface MetadataDirectories {
  /**
   * The path to build resources.
   * @default build
   */
  readonly buildResources?: string | null

  /**
   * The output directory.
   * @default dist
   */
  readonly output?: string | null

  /**
   * The application directory (containing the application package.json), defaults to `app`, `www` or working directory.
   */
  readonly app?: string | null
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

/**
 * File associations.
 *
 * macOS (corresponds to [CFBundleDocumentTypes](https://developer.apple.com/library/content/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-101685)) and NSIS only.
 *
 * On Windows works only if [nsis.perMachine](https://github.com/electron-userland/electron-builder/wiki/Options#NsisOptions-perMachine) is set to `true`.
 */
export interface FileAssociation {
  /**
   * The extension (minus the leading period). e.g. `png`.
   */
  readonly ext: string | Array<string>

  /**
   * The name. e.g. `PNG`. Defaults to `ext`.
   */
  readonly name?: string | null

  /**
   * *windows-only.* The description.
   */
  readonly description?: string | null

  /**
   * The path to icon (`.icns` for MacOS and `.ico` for Windows), relative to `build` (build resources directory). Defaults to `${firstExt}.icns`/`${firstExt}.ico` (if several extensions specified, first is used) or to application icon.
   */
  readonly icon?: string | null

  /**
   * *macOS-only* The app’s role with respect to the type. The value can be `Editor`, `Viewer`, `Shell`, or `None`. Corresponds to `CFBundleTypeRole`.
   * @default Editor
   */
  readonly role?: string

  /**
   * *macOS-only* Whether the document is distributed as a bundle. If set to true, the bundle directory is treated as a file. Corresponds to `LSTypeIsPackage`.
   */
  readonly isPackage?: boolean
}

export interface PlatformSpecificBuildOptions extends TargetSpecificOptions {
  readonly files?: Array<string> | string | null
  readonly extraFiles?: Array<FilePattern | string> | FilePattern | string | null
  readonly extraResources?: Array<FilePattern | string> | FilePattern | string | null

  readonly asarUnpack?: Array<string> | string | null

  readonly asar?: AsarOptions | boolean | null

  readonly target?: Array<string | TargetConfig> | string | TargetConfig | null

  readonly icon?: string | null

  readonly fileAssociations?: Array<FileAssociation> | FileAssociation

  readonly forceCodeSigning?: boolean
}

export interface AsarOptions extends AsarIntegrityOptions {
  /**
   * Whether to automatically unpack executables files.
   * @default true
   */
  smartUnpack?: boolean

  ordering?: string | null
}

export interface FilePattern {
  /**
   * The source path relative to the project directory.
   */
  from?: string
  /**
   * The destination path relative to the app's content directory for `extraFiles` and the app's resource directory for `extraResources`.
   */
  to?: string
  /**
   * The [glob patterns](#file-patterns).
   */
  filter?: Array<string> | string
}