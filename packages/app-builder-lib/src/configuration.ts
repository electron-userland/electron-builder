import { Arch } from "builder-util"
import { BeforeBuildContext, Target } from "./core"
import { ElectronDownloadOptions } from "./electron/ElectronFramework"
import { AppXOptions } from "./options/AppXOptions"
import { AppImageOptions, DebOptions, LinuxConfiguration, LinuxTargetSpecificOptions } from "./options/linuxOptions"
import { DmgOptions, MacConfiguration, MasConfiguration } from "./options/macOptions"
import { MsiOptions } from "./options/MsiOptions"
import { PkgOptions } from "./options/pkgOptions"
import { PlatformSpecificBuildOptions } from "./options/PlatformSpecificBuildOptions"
import { SnapOptions } from "./options/SnapOptions"
import { SquirrelWindowsOptions } from "./options/SquirrelWindowsOptions"
import { WindowsConfiguration } from "./options/winOptions"
import { BuildResult } from "./packager"
import { ArtifactBuildStarted, ArtifactCreated } from "./packagerApi"
import { PlatformPackager } from "./platformPackager"
import { NsisOptions, NsisWebOptions, PortableOptions } from "./targets/nsis/nsisOptions"

// duplicate appId here because it is important
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
   * As [name](#Metadata-name), but allows you to specify a product name for your executable which contains spaces and other special characters not allowed in the [name property](https://docs.npmjs.com/files/package.json#name).
   */
  readonly productName?: string | null

  /**
   * The human-readable copyright line for the app.
   * @default Copyright © year ${author}
   */
  readonly copyright?: string | null

  readonly directories?: MetadataDirectories | null

  /**
   * Options related to how build macOS targets.
   */
  readonly mac?: MacConfiguration | null
  /**
   * MAS (Mac Application Store) options.
   */
  readonly mas?: MasConfiguration | null
  /**
   * MAS (Mac Application Store) development options (`mas-dev` target).
   */
  readonly masDev?: MasConfiguration | null
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
  /** @private */
  readonly msi?: MsiOptions | null
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
   * The build version. Maps to the `CFBundleVersion` on macOS, and `FileVersion` metadata property on Windows. Defaults to the `version`.
   * If `TRAVIS_BUILD_NUMBER` or `APPVEYOR_BUILD_NUMBER` or `CIRCLE_BUILD_NUM` or `BUILD_NUMBER` or `bamboo.buildNumber` or `CI_PIPELINE_IID` env defined, it will be used as a build version (`version.build_number`).
   */
  readonly buildVersion?: string | null

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
   * If `react-scripts` in the app dependencies, `react-cra` will be set automatically. Set to `null` to disable automatic detection.
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
  readonly ?: boolean

  /**
   * *libui-based frameworks only* The version of NodeJS you are packaging for.
   * You can set it to `current` to set the Node.js version that you use to run.
   */
  readonly nodeVersion?: string | null

  /**
   * *libui-based frameworks only* The version of LaunchUI you are packaging for. Applicable for Windows only. Defaults to version suitable for used framework version.
   */
  readonly launchUiVersion?: boolean | string | null

  /**
   * The framework name. One of `electron`, `proton`, `libui`. Defaults to `electron`.
   */
  readonly framework?: string | null

  /**
   * The function (or path to file or module id) to be [run after pack](#afterpack) (but before pack into distributable format and sign).
   */
  readonly afterPack?: ((context: AfterPackContext) => Promise<any> | any) | string | null
  /**
   * The function (or path to file or module id) to be [run after pack and sign](#aftersign) (but before pack into distributable format).
   */
  readonly afterSign?: ((context: AfterPackContext) => Promise<any> | any) | string | null

  /**
   * The function (or path to file or module id) to be run on artifact build start.
   */
  readonly artifactBuildStarted?: ((context: ArtifactBuildStarted) => Promise<any> | any) | string | null
  /**
   * The function (or path to file or module id) to be run on artifact build completed.
   */
  readonly artifactBuildCompleted?: ((context: ArtifactCreated) => Promise<any> | any) | string | null
  /**
   * The function (or path to file or module id) to be [run after all artifacts are build](#afterAllArtifactBuild).
   */
  readonly afterAllArtifactBuild?: ((context: BuildResult) => Promise<Array<string>> | Array<string>) | string | null

  /**
   * The function (or path to file or module id) to be [run on each node module](#onnodemodulefile) file.
   */
  readonly onNodeModuleFile?: ((file: string) => void) | string | null
  /**
   * The function (or path to file or module id) to be run before dependencies are installed or rebuilt. Works when `npmRebuild` is set to `true`. Resolving to `false` will skip dependencies install or rebuild.
   *
   * If provided and `node_modules` are missing, it will not invoke production dependencies check.
   */
  readonly beforeBuild?: ((context: BeforeBuildContext) => Promise<any>) | string| null

  /**
   * Whether to build using Electron Build Service if target not supported on current OS.
   * @default true
   */
  readonly remoteBuild?: boolean

  /**
   * Whether to include PDB files.
   * @default false
   */
  readonly includePdb?: boolean

  /**
   * Whether to remove `scripts` field from `package.json` files.
   *
   * @default true
   */
  readonly removePackageScripts?: boolean
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
   * The output directory. [File macros](/file-patterns#file-macros) are supported.
   * @default dist
   */
  readonly output?: string | null

  /**
   * The application directory (containing the application package.json), defaults to `app`, `www` or working directory.
   */
  readonly app?: string | null
}
