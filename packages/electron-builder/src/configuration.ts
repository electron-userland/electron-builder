import { AsarIntegrityOptions } from "asar-integrity"
import { Arch } from "builder-util"
import { Publish } from "builder-util-runtime"
import { BeforeBuildContext, CompressionLevel, Target, TargetConfiguration, TargetSpecificOptions } from "./core"
import { AppImageOptions, DebOptions, LinuxConfiguration, LinuxTargetSpecificOptions } from "./options/linuxOptions"
import { DmgOptions, MacConfiguration, MasConfiguration, PkgOptions } from "./options/macOptions"
import { SnapOptions } from "./options/SnapOptions"
import { SquirrelWindowsOptions } from "./options/SquirrelWindowsOptions"
import { AppXOptions, WindowsConfiguration } from "./options/winOptions"
import { PlatformPackager } from "./platformPackager"
import { NsisOptions, NsisWebOptions, PortableOptions } from "./targets/nsis/nsisOptions"

/**
 * Configuration Options
 */
export interface Configuration extends PlatformSpecificBuildOptions {
  /**
   * The application id. Used as [CFBundleIdentifier](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070) for MacOS and as
   * [Application User Model ID](https://msdn.microsoft.com/en-us/library/windows/desktop/dd378459(v=vs.85).aspx) for Windows (NSIS target only, Squirrel.Windows not supported). It is strongly recommended that an explicit ID is set.
   * @default com.electron.${name}
   */
  readonly appId?: string | null

  /**
   * As [name](#Metadata-name), but allows you to specify a product name for your executable which contains spaces and other special characters not allowed in the [name property](https://docs.npmjs.com/files/package.json#name}).
   */
  readonly productName?: string | null

  /**
   * The [artifact file name template](/configuration/configuration.md#artifact-file-name-template). Defaults to `${productName}-${version}.${ext}` (some target can have other defaults, see corresponding options).
   */
  readonly artifactName?: string | null

  /**
   * Whether to package the application's source code into an archive, using [Electron's archive format](http://electron.atom.io/docs/tutorial/application-packaging/).
   *
   * Node modules, that must be unpacked, will be detected automatically, you don't need to explicitly set [asarUnpack](#configuration-asarUnpack) - please file an issue if this doesn't work.
   * @default true
  */
  readonly asar?: boolean | AsarOptions | null

  /**
   * A [glob patterns](/file-patterns.md) relative to the [app directory](#MetadataDirectories-app), which specifies which files to unpack when creating the [asar](http://electron.atom.io/docs/tutorial/application-packaging/) archive.
   */
  readonly asarUnpack?: Array<string> | string | null

  /**
   * The compression level. If you want to rapidly test build, `store` can reduce build time significantly. `maximum` doesn't lead to noticeable size difference, but increase build time.
   * @default normal
   */
  readonly compression?: CompressionLevel | null

  /**
   * The human-readable copyright line for the app.
   * @default Copyright © year ${author}
   */
  readonly copyright?: string | null

  publish?: Publish

  readonly directories?: MetadataDirectories | null

  readonly files?: Array<FileSet | string> | FileSet | string | null

  readonly extraResources?: Array<FileSet | string> | FileSet | string | null

  readonly extraFiles?: Array<FileSet | string> | FileSet | string | null

  /**
   * The file associations.
   */
  readonly fileAssociations?: Array<FileAssociation> | FileAssociation
  /**
   * The URL protocol schemes.
   */
  readonly protocols?: Array<Protocol> | Protocol

  /**
   * Options related to how build macOS targets.
   */
  readonly mac?: MacConfiguration | null
  /**
   * MAS (Mac Application Store) options.
   */
  readonly mas?: MasConfiguration | null
  /**
   * macOS DMG options.
   */
  readonly dmg?: DmgOptions | null
  /**
   * macOS PKG options.
   */
  readonly pkg?: PkgOptions | null

  /**
   * Options related to how build Windows targets.
   */
  readonly win?: WindowsConfiguration | null
  readonly nsis?: NsisOptions | null
  readonly nsisWeb?: NsisWebOptions | null
  readonly portable?: PortableOptions | null
  readonly appx?: AppXOptions | null
  readonly squirrelWindows?: SquirrelWindowsOptions | null

  /**
   * Options related to how build Linux targets.
   */
  readonly linux?: LinuxConfiguration | null
  /**
   * Debian package options.
   */
  readonly deb?: DebOptions | null
  /**
   * Snap options.
   */
  readonly snap?: SnapOptions | null
  /**
   * AppImage options.
   */
  readonly appImage?: AppImageOptions | null
  readonly pacman?: LinuxTargetSpecificOptions | null
  readonly rpm?: LinuxTargetSpecificOptions | null
  readonly freebsd?: LinuxTargetSpecificOptions | null
  readonly p5p?: LinuxTargetSpecificOptions | null
  readonly apk?: LinuxTargetSpecificOptions | null

  /**
   * Whether to build the application native dependencies from source.
   * @default false
   */
  buildDependenciesFromSource?: boolean
  /**
   * Whether to execute `node-gyp rebuild` before starting to package the app.
   *
   * Don't [use](https://github.com/electron-userland/electron-builder/issues/683#issuecomment-241214075) [npm](http://electron.atom.io/docs/tutorial/using-native-node-modules/#using-npm) (neither `.npmrc`) for configuring electron headers. Use `electron-builder node-gyp-rebuild` instead.
   * @default false
   */
  readonly nodeGypRebuild?: boolean
  /**
   * Additional command line arguments to use when installing app native deps.
   */
  readonly npmArgs?: Array<string> | string | null
  /**
   * Whether to [rebuild](https://docs.npmjs.com/cli/rebuild) native dependencies before starting to package the app.
   * @default true
   */
  readonly npmRebuild?: boolean
  /**
   * @deprecated Please use npmBuildFromSource.
   * @private
   */
  readonly npmSkipBuildFromSource?: boolean

  /**
   * The build version. Maps to the `CFBundleVersion` on macOS, and `FileVersion` metadata property on Windows. Defaults to the `version`.
   * If `TRAVIS_BUILD_NUMBER` or `APPVEYOR_BUILD_NUMBER` or `CIRCLE_BUILD_NUM` or `BUILD_NUMBER` or `bamboo.buildNumber` env defined, it will be used as a build version (`version.build_number`).
   */
  readonly buildVersion?: string | null

  /**
   * Whether to infer update channel from application version pre-release components. e.g. if version `0.12.1-alpha.1`, channel will be set to `alpha`. Otherwise to `latest`.
   * @default true
   */
  readonly detectUpdateChannel?: boolean

  /**
   * Please see [Building and Releasing using Channels](https://github.com/electron-userland/electron-builder/issues/1182#issuecomment-324947139).
   * @default false
   */
  readonly generateUpdatesFilesForAllChannels?: boolean

  /**
   * Whether to use [electron-compile](http://github.com/electron/electron-compile) to compile app. Defaults to `true` if `electron-compile` in the dependencies. And `false` if in the `devDependencies` or doesn't specified.
   */
  readonly electronCompile?: boolean

  /**
   * The path to custom Electron build (e.g. `~/electron/out/R`).
   */
  readonly electronDist?: string

  /**
   * The [electron-download](https://github.com/electron-userland/electron-download#usage) options.
   */
  readonly electronDownload?: ElectronDownloadOptions

  /**
   * The version of electron you are packaging for. Defaults to version of `electron`, `electron-prebuilt` or `electron-prebuilt-compile` dependency.
   */
  electronVersion?: string | null

  /**
   * The name of a built-in configuration preset or path to config file (relative to project dir). Currently, only `react-cra` is supported.
   *
   * If `react-scripts` in the app dev dependencies, `react-cra` will be set automatically. Set to `null` to disable automatic detection.
   */
  extends?: string | null

  /**
   * Inject properties to `package.json`.
   */
  readonly extraMetadata?: any

  /**
   * Whether to fail if the application is not signed (to prevent unsigned app if code signing configuration is not correct).
   * @default false
   */
  readonly forceCodeSigning?: boolean

  /**
   * The version of muon you are packaging for.
   */
  readonly muonVersion?: string | null

  /**
   * The release info. Intended for command line usage:
   *
   * ```
   * -c.releaseInfo.releaseNotes="new features"
   * ```
   */
  readonly releaseInfo?: ReleaseInfo

  /**
   * The function (or path to file or module id) to be run after pack (but before pack into distributable format and sign).
   */
  readonly afterPack?: (context: AfterPackContext) => Promise<any> | null
  /**
   * The function (or path to file or module id) to be run before dependencies are installed or rebuilt. Works when `npmRebuild` is set to `true`. Resolving to `false` will skip dependencies install or rebuild.
   */
  readonly beforeBuild?: (context: BeforeBuildContext) => Promise<any> | null

  /** @private */
  readonly icon?: string | null
}

export interface AfterPackContext {
  readonly outDir: string
  readonly appOutDir: string
  readonly packager: PlatformPackager<any>
  readonly electronPlatformName: string
  readonly arch: Arch
  readonly targets: Array<Target>
}

export interface MetadataDirectories {
  /**
   * The path to build resources.
   *
   * Please note — build resources is not packed into the app. If you need to use some files, e.g. as tray icon, please include required files explicitly: `"files": ["**\/*", "build/icon.*"]`
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
 * On Windows works only if [nsis.perMachine](https://electron.build/configuration/configuration#NsisOptions-perMachine) is set to `true`.
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
  readonly files?: Array<FileSet | string> | FileSet | string | null
  readonly extraFiles?: Array<FileSet | string> | FileSet | string | null
  readonly extraResources?: Array<FileSet | string> | FileSet | string | null

  readonly asarUnpack?: Array<string> | string | null

  readonly asar?: AsarOptions | boolean | null

  readonly target?: Array<string | TargetConfiguration> | string | TargetConfiguration | null

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

export interface FileSet {
  /**
   * The source path relative to the project directory.
   */
  from?: string
  /**
   * The destination path relative to the app's content directory for `extraFiles` and the app's resource directory for `extraResources`.
   */
  to?: string
  /**
   * The [glob patterns](/file-patterns.md).
   */
  filter?: Array<string> | string
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
   * The path to release notes file. Defaults to `release-notes.md` in the [build resources](#MetadataDirectories-buildResources).
   */
  releaseNotesFile?: string | null

  /**
   * The release date.
   */
  releaseDate?: string
}

export interface ElectronDownloadOptions {
  /**
   * The [cache location](https://github.com/electron-userland/electron-download#cache-location).
   */
  cache?: string | null

  /**
   * The mirror.
   */
  mirror?: string | null

  /** @private */
  customDir?: string | null
  /** @private */
  customFilename?: string | null

  quiet?: boolean

  strictSSL?: boolean
  verifyChecksum?: boolean

  /** @private */
  force?: boolean
}