import { Arch, AsarOptions, AuthorMetadata, BeforeBuildContext, CompressionLevel, FileAssociation, FilePattern, MetadataDirectories, PlatformSpecificBuildOptions, Protocol, RepositoryInfo, Target } from "electron-builder-core"
import { Publish } from "electron-builder-http/out/publishOptions"
import { DebOptions, LinuxBuildOptions, LinuxTargetSpecificOptions, SnapOptions } from "./options/linuxOptions"
import { DmgOptions, MacOptions, MasBuildOptions, PkgOptions } from "./options/macOptions"
import { AppXOptions, NsisOptions, NsisWebOptions, PortableOptions, SquirrelWindowsOptions, WinBuildOptions } from "./options/winOptions"
import { PlatformPackager } from "./platformPackager"

/**
 * Fields in the package.json
 * Some standard fields should be defined in the `package.json`.
 */
export interface Metadata {
  readonly repository?: string | RepositoryInfo | null

  readonly dependencies?: { [key: string]: string }

  readonly version?: string

  /**
   * The application name.
   * @required
   */
  readonly name?: string

  readonly productName?: string | null

  /**
   * The application description.
   */
  readonly description?: string

  readonly main?: string | null

  readonly author?: AuthorMetadata

  /**
   * The url to the project [homepage](https://docs.npmjs.com/files/package.json#homepage) (NuGet Package `projectUrl` (optional) or Linux Package URL (required)).
   *
   * If not specified and your project repository is public on GitHub, it will be `https://github.com/${user}/${project}` by default.
   */
  readonly homepage?: string | null

  /**
   *linux-only.* The [license](https://docs.npmjs.com/files/package.json#license) name.
   */
  readonly license?: string | null

  readonly build?: Config
}

/**
 * Configuration Options
 */
export interface Config extends PlatformSpecificBuildOptions {
  /**
   * The application id. Used as [CFBundleIdentifier](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070) for MacOS and as
   * [Application User Model ID](https://msdn.microsoft.com/en-us/library/windows/desktop/dd378459(v=vs.85).aspx) for Windows (NSIS target only, Squirrel.Windows not supported).
   * 
   * Defaults to `com.electron.${name}`. It is strongly recommended that an explicit ID be set.
   */
  readonly appId?: string | null

  /**
   * The human-readable copyright line for the app. Defaults to `Copyright © year author`.
   */
  readonly copyright?: string | null
  
  /**
   * As [name](#AppMetadata-name), but allows you to specify a product name for your executable which contains spaces and other special characters not allowed in the [name property](https://docs.npmjs.com/files/package.json#name}).
   */
  readonly productName?: string | null

  /**
   * A [glob patterns](https://www.npmjs.com/package/glob#glob-primer) relative to the [app directory](#MetadataDirectories-app), which specifies which files to include when copying files to create the package.
   * @see [File Patterns](#file-patterns).
   */
  readonly files?: Array<string> | string | null

  /**
   * A [glob patterns](https://www.npmjs.com/package/glob#glob-primer) relative to the project directory, when specified, copy the file or directory with matching names directly into the app's resources directory (`Contents/Resources` for MacOS, `resources` for Linux/Windows).
   *
   * Glob rules the same as for [files](#multiple-glob-patterns).
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
  readonly asar?: AsarOptions | boolean | null

  /**
   * A [glob patterns](https://www.npmjs.com/package/glob#glob-primer) relative to the [app directory](#MetadataDirectories-app), which specifies which files to unpack when creating the [asar](http://electron.atom.io/docs/tutorial/application-packaging/) archive.
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
   * 
   * Currently supported only for `mas`, `pkg`, `dmg` and `nsis`.
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
  
  readonly mac?: MacOptions | null
  readonly mas?: MasBuildOptions | null
  readonly dmg?: DmgOptions | null
  readonly pkg?: PkgOptions | null

  readonly win?: WinBuildOptions | null
  readonly nsis?: NsisOptions | null
  readonly nsisWeb?: NsisWebOptions | null
  readonly portable?: PortableOptions | null
  readonly appx?: AppXOptions | null
  readonly squirrelWindows?: SquirrelWindowsOptions | null

  readonly linux?: LinuxBuildOptions | null
  readonly deb?: DebOptions | null
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