import { Arch } from "builder-util"
import { BeforeBuildContext, Target } from "./core"
import { ElectronBrandingOptions } from "./electron/ElectronFramework"
import { PrepareApplicationStageDirectoryOptions } from "./Framework"
import { AppXOptions } from "./options/AppXOptions"
import { AppImageOptions, DebOptions, FlatpakOptions, LinuxConfiguration, LinuxTargetSpecificOptions, PacmanOptions, RpmOptions } from "./options/linuxOptions"
import { DmgOptions, MacConfiguration, MasConfiguration } from "./options/macOptions"
import { MsiOptions } from "./options/MsiOptions"
import { MsiWrappedOptions } from "./options/MsiWrappedOptions"
import { PkgOptions } from "./options/pkgOptions"
import { PlatformSpecificBuildOptions } from "./options/PlatformSpecificBuildOptions"
import { SnapcraftOptions, SnapOptions } from "./options/SnapOptions"
import { SquirrelWindowsOptions } from "./options/SquirrelWindowsOptions"
import { WindowsConfiguration } from "./options/winOptions"
import { BuildResult } from "./packager"
import { ArtifactBuildStarted, ArtifactCreated } from "./packagerApi"
import { PlatformPackager } from "./platformPackager"
import { NsisOptions, NsisWebOptions, PortableOptions } from "./targets/nsis/nsisOptions"
import { ElectronDownloadOptions, ElectronGetOptions } from "./util/electronGet"

// duplicate appId here because it is important
/**
 * Configuration Options
 */
export interface CommonConfiguration {
  /**
   * The application id. Used as [CFBundleIdentifier](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070) for MacOS and as
   * [Application User Model ID](https://msdn.microsoft.com/en-us/library/windows/desktop/dd378459(v=vs.85).aspx) for Windows (NSIS target only, Squirrel.Windows not supported). It is strongly recommended that an explicit ID is set.
   * @default com.electron.${name}
   */
  readonly appId?: string | null

  /**
   * As [name](#metadata), but allows you to specify a product name for your executable which contains spaces and other special characters not allowed in the [name property](https://docs.npmjs.com/files/package.json#name).
   * If not specified inside of the `build` configuration, `productName` property defined at the top level of `package.json` is used. If not specified at the top level of `package.json`, [name property](https://docs.npmjs.com/files/package.json#name) is used.
   */
  readonly productName?: string | null

  /**
   * The human-readable copyright line for the app.
   * @default Copyright © year ${author}
   */
  readonly copyright?: string | null

  /**
   * Directories for build resources
   */
  readonly directories?: MetadataDirectories | null

  /**
   * Configuration of toolsets utilized by electron-builder
   */
  readonly toolsets?: ToolsetConfig | null

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
  /** NSIS installer options. */
  readonly nsis?: NsisOptions | null
  /** NSIS web installer options (downloads app package at install time). */
  readonly nsisWeb?: NsisWebOptions | null
  /** Portable executable options (no installation required). */
  readonly portable?: PortableOptions | null
  /** Windows Store (AppX) package options. */
  readonly appx?: AppXOptions | null
  /**
   * MSI package options.
   */
  readonly msi?: MsiOptions | null
  /**
   * MSI-wrapped installer options.
   */
  readonly msiWrapped?: MsiWrappedOptions | null
  /**
   * Squirrel.Windows installer options. Requires the `electron-builder-squirrel-windows` dependency.
   */
  readonly squirrelWindows?: SquirrelWindowsOptions | null
  /**
   * General Linux build options shared across all Linux targets (icon, category, desktop entry,
   * executable name, etc.). Target-specific compression and packaging options live in the
   * per-format interfaces (`DebOptions`, `RpmOptions`, `PacmanOptions`, etc.).
   */
  readonly linux?: LinuxConfiguration | null
  /**
   * Debian package options. Targets Debian, Ubuntu, and Debian-based distributions.
   * Produces a `.deb` archive installable via `dpkg -i` or `apt install`.
   */
  readonly deb?: DebOptions | null
  /**
   * Flat snap configuration targeting core22 and older snap bases.
   *
   * @deprecated Use `snapcraft` instead — it supersedes `snap` when both are present and supports
   * all snap bases including core24. `snap` will be removed in a future major release.
   * See {@link SnapOptions} for available properties.
   */
  readonly snap?: SnapOptions | null
  /**
   * Snapcraft configuration. Prefer this over the deprecated `snap` field.
   *
   * Selects the snapcraft base and provides per-core options:
   * - `base: "core18" | "core20" | "core22"` — legacy builds; accepts the same options as `snap`
   * - `base: "core24"` — modern builds with the GNOME extension (recommended for new apps, requires Electron 25+)
   * - `base: "custom"` — pass an existing `snapcraft.yaml` through unchanged; no plugs, extensions,
   *   or desktop files are injected
   *
   * When both `snapcraft` and `snap` are set, `snapcraft` takes precedence.
   *
   * @example
   * ```json
   * { "snapcraft": { "base": "core24", "core24": { "useLXD": true } } }
   * ```
   *
   * See {@link SnapcraftOptions} for all available properties.
   */
  readonly snapcraft?: SnapcraftOptions | null
  /**
   * AppImage options. AppImage is a portable application format that bundles the app
   * and its dependencies into a single self-contained executable that runs on most
   * Linux distributions without installation.
   */
  readonly appImage?: AppImageOptions | null
  /**
   * Flatpak options. Flatpak is a sandboxed application distribution format for Linux
   * that runs in a controlled environment and is distributed via [Flathub](https://flathub.org/)
   * or other Flatpak repositories.
   */
  readonly flatpak?: FlatpakOptions | null
  /**
   * Pacman package options. Targets Arch Linux and Arch-based distributions
   * (Manjaro, EndeavourOS, etc.). Produces a `.pacman` archive installable via `pacman -U`.
   */
  readonly pacman?: PacmanOptions | null
  /**
   * RPM package options. Targets Fedora, Red Hat Enterprise Linux, SUSE, and related
   * distributions. Produces a `.rpm` archive installable via `rpm` or `dnf`.
   */
  readonly rpm?: RpmOptions | null
  /**
   * FreeBSD package options. Produces a `.pkg` archive for the FreeBSD `pkg` package manager.
   */
  readonly freebsd?: LinuxTargetSpecificOptions | null
  /**
   * Solaris IPS package options. Produces a `.p5p` archive for the Solaris Image Packaging
   * System (`pkg`).
   */
  readonly p5p?: LinuxTargetSpecificOptions | null
  /**
   * Alpine Linux APK package options. Produces an `.apk` archive installable via `apk add`.
   */
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
   * Use `legacy` app-builder binary for installing native dependencies, or `@electron/rebuild` in `sequential` or `parallel` compilation modes.
   * @default sequential
   */
  readonly nativeRebuilder?: "legacy" | "sequential" | "parallel" | null

  /**
   * The build number. Maps to the `--iteration` flag for builds using FPM on Linux.
   * If not defined, then it will fallback to `BUILD_NUMBER` or `TRAVIS_BUILD_NUMBER` or `APPVEYOR_BUILD_NUMBER` or `CIRCLE_BUILD_NUM` or `BUILD_BUILDNUMBER` or `CI_PIPELINE_IID` env.
   */
  readonly buildNumber?: string | null

  /**
   * The build version. Maps to the `CFBundleVersion` on macOS, and `FileVersion` metadata property on Windows. Defaults to the `version`.
   * If `buildVersion` is not defined and `buildNumber` (or one of the `buildNumber` envs) is defined, it will be used as a build version (`version.buildNumber`).
   */
  readonly buildVersion?: string | null

  /**
   * Whether to download the alternate FFmpeg library from Electron's release assets and replace the default FFmpeg library prior to signing
   */
  readonly downloadAlternateFFmpeg?: boolean

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

  /**
   * Whether to remove `keywords` field from `package.json` files.
   *
   * @default true
   */
  readonly removePackageKeywords?: boolean

  /**
   * Options to pass to `@electron/fuses`
   * Ref: https://github.com/electron/fuses
   */
  readonly electronFuses?: FuseOptionsV1 | null

  /**
   * [Experimental] Configuration for concurrent builds.
   */
  readonly concurrency?: Concurrency | null
}

export interface Configuration extends CommonConfiguration, PlatformSpecificBuildOptions, Hooks {
  /**
   * Whether to use [electron-compile](http://github.com/electron/electron-compile) to compile app. Defaults to `true` if `electron-compile` in the dependencies. And `false` if in the `devDependencies` or doesn't specified.
   * @deprecated `electron-compile` is no longer maintained. Compile your app with a modern bundler (webpack, vite, etc.) instead.
   */
  readonly electronCompile?: boolean

  /**
   * The [electron-download](https://github.com/electron-userland/electron-download#usage) options. (legacy)
   * Alternatively, you can use [electron/get](https://github.com/electron/get#usage) options.
   */
  readonly electronDownload?: ElectronDownloadOptions | ElectronGetOptions | null

  /**
   * The branding used by Electron's distributables. This is needed if a fork has modified Electron's BRANDING.json file.
   */
  readonly electronBranding?: ElectronBrandingOptions

  /**
   * The version of electron you are packaging for. Defaults to version of `electron`, `electron-prebuilt` or `electron-prebuilt-compile` dependency.
   */
  electronVersion?: string | null

  /**
   * The name of a built-in configuration preset (currently, only `react-cra` is supported) or any number of paths to config files (relative to project dir).
   *
   * The latter allows to mixin a config from multiple other configs, as if you `Object.assign` them, but properly combine `files` glob patterns.
   *
   * If `react-scripts` in the app dependencies, `react-cra` will be set automatically. Set to `null` to disable automatic detection.
   */
  extends?: Array<string> | string | null

  /**
   * *libui-based frameworks only* The version of NodeJS you are packaging for.
   * You can set it to `current` to set the Node.js version that you use to run.
   * @deprecated libui-based frameworks (proton-native, etc.) are no longer actively maintained. This option has no effect when using Electron.
   */
  readonly nodeVersion?: string | null

  /**
   * *libui-based frameworks only* The version of LaunchUI you are packaging for. Applicable for Windows only. Defaults to version suitable for used framework version.
   * @deprecated libui-based frameworks (proton-native, etc.) are no longer actively maintained. This option has no effect when using Electron.
   */
  readonly launchUiVersion?: boolean | string | null

  /**
   * The framework name. One of `electron`, `proton`, `libui`. Defaults to `electron`.
   * @deprecated `proton` and `libui` framework support is no longer actively maintained. Use `electron` (the default).
   */
  readonly framework?: string | null

  /**
   * Whether to disable sanity check asar package (useful for custom electron forks that implement their own encrypted integrity validation)
   * @default false
   */
  readonly disableSanityCheckAsar?: boolean

  /**
   * Whether to skip ASAR integrity hash computation. Useful for custom electron forks with encrypted ASAR support where the header is not readable by standard tools.
   * @default false
   */
  readonly disableAsarIntegrity?: boolean
}

export type Hook<T, V> = (contextOrPath: T) => Promise<V> | V

export interface PackContext {
  readonly outDir: string
  readonly appOutDir: string
  readonly packager: PlatformPackager<any>
  readonly electronPlatformName: string
  readonly arch: Arch
  readonly targets: Array<Target>
}
export type AfterPackContext = PackContext
export type BeforePackContext = PackContext
export type AfterExtractContext = PackContext

/**
 * Configuration of toolsets utilized by electron-builder
 */
export interface ToolsetConfig {
  /**
   * `win-codesign` version to use for signing Windows artifacts.
   * Located at https://github.com/electron-userland/electron-builder-binaries/releases?q=win-codesign&expanded=true
   *
   * Stable:
   * v0.0.0 (winCodeSign)
   *
   * Beta:
   * Windows Kits 10.0.26100.0
   * v1.0.0, v1.1.0
   *
   * @default "0.0.0"
   */
  readonly winCodeSign?: "0.0.0" | "1.0.0" | "1.1.0" | "1.2.1" | null

  /**
   * `appimage` bundle version to use for Appimage packaging and runtime.
   * Located at https://github.com/electron-userland/electron-builder-binaries/releases?q=appimage&expanded=true
   * 0.0.0 - legacy toolset (appimage)
   *
   * Betas:
   * 1.0.2 - Runtime 20251108
   * 1.0.3 - Runtime 20251108 (Resolves GH issue #9598)
   *
   * @default "0.0.0"
   */
  readonly appimage?: "0.0.0" | "1.0.2" | "1.0.3" | null

  /**
   * `nsis` bundle version to use for NSIS installer compilation.
   * Located at https://github.com/electron-userland/electron-builder-binaries/releases?q=nsis&expanded=true
   * 0.0.0 - legacy toolset (nsis-3.0.4.1 + nsis-resources-3.4.1)
   *
   * Betas:
   * 1.2.1 - unified bundle (makensis 3.12 + plugins in one archive, entrypoint scripts auto-set NSISDIR)
   *
   * @default "0.0.0"
   */
  readonly nsis?: "0.0.0" | "1.2.1" | null
}

export interface Hooks {
  /**
   * The function (or path to file or module id) to be run before pack.
   * Receives a {@link BeforePackContext}.
   *
   * Can be specified inline as a function in JavaScript configs:
   * ```js
   * // electron-builder.config.js
   * module.exports = {
   *   beforePack: async (context) => {
   *     // your code
   *   }
   * }
   * ```
   *
   * Or as a path to a module that exports the function as its default export:
   * ```json
   * { "build": { "beforePack": "./myBeforePackHook.js" } }
   * ```
   * ```js
   * // myBeforePackHook.js
   * exports.default = async function(context) {
   *   // your custom code
   * }
   * ```
   */
  readonly beforePack?: Hook<BeforePackContext, void> | string | null

  /**
   * The function (or path to file or module id) to be run after the prebuilt Electron binary has been extracted to the output directory.
   * Receives an {@link AfterExtractContext}. For file/module setup, see {@link beforePack}.
   */
  readonly afterExtract?: Hook<AfterExtractContext, void> | string | null

  /**
   * The function (or path to file or module id) to be run after pack but before pack into distributable format and sign.
   * Receives an {@link AfterPackContext}. For file/module setup, see {@link beforePack}.
   */
  readonly afterPack?: Hook<AfterPackContext, void> | string | null

  /**
   * The function (or path to file or module id) to be run after pack and sign but before pack into distributable format.
   * Receives an {@link AfterPackContext}. For file/module setup, see {@link beforePack}.
   */
  readonly afterSign?: Hook<AfterPackContext, void> | string | null

  /**
   * The function (or path to file or module id) to be run when an individual artifact build starts.
   * Receives an {@link ArtifactBuildStarted}. For file/module setup, see {@link beforePack}.
   */
  readonly artifactBuildStarted?: Hook<ArtifactBuildStarted, void> | string | null
  /**
   * The function (or path to file or module id) to be run when an individual artifact build completes.
   * Receives an {@link ArtifactCreated}. For file/module setup, see {@link beforePack}.
   */
  readonly artifactBuildCompleted?: Hook<ArtifactCreated, void> | string | null
  /**
   * The function (or path to file or module id) to be run after all artifacts are built.
   * Receives a {@link BuildResult}. May return an array of additional file paths to publish.
   *
   * For file/module setup, see {@link beforePack}.
   *
   * @example
   * ```js
   * exports.default = function () {
   *   // return additional files to publish
   *   return ["/path/to/additional/result/file"]
   * }
   * ```
   */
  readonly afterAllArtifactBuild?: Hook<BuildResult, Array<string>> | string | null
  /**
   * The function (or path to file or module id) to be run after MSI project created on disk - not packed into .msi package yet.
   */
  readonly msiProjectCreated?: Hook<string, void> | string | null
  /**
   * The function (or path to file or module id) to be run after Appx manifest created on disk - not packed into .appx package yet.
   */
  readonly appxManifestCreated?: Hook<string, void> | string | null
  /**
   * The function (or path to file or module id) to be [run on each node module](#onnodemodulefile) file. Returning `true`/`false` will determine whether to force include or to use the default copier logic
   */
  readonly onNodeModuleFile?: Hook<string, void | boolean> | string | null
  /**
   * The function (or path to file or module id) to be run before dependencies are installed or rebuilt. Works when `npmRebuild` is set to `true`. Resolving to `false` will skip dependencies install or rebuild.
   *
   * If provided and `node_modules` are missing, it will not invoke production dependencies check.
   */
  readonly beforeBuild?: Hook<BeforeBuildContext, boolean | void> | string | null
  /**
   * The function (or path to file or module id) to be run when staging the electron artifact environment.
   * Returns the path to custom Electron build (e.g. `~/electron/out/R`) or folder of electron zips.
   *
   * Zip files must follow the pattern `electron-v${version}-${platformName}-${arch}.zip`, otherwise it will be assumed to be an unpacked Electron app directory
   */
  readonly electronDist?: Hook<PrepareApplicationStageDirectoryOptions, string> | string | null
}

export interface MetadataDirectories {
  /**
   * The path to build resources.
   *
   * Please note — build resources are not packed into the app. If you need to use some files, e.g. as tray icon, please include required files explicitly: `"files": ["**\/*", "build/icon.*"]`
   * @default build
   */
  readonly buildResources?: string | null

  /**
   * The output directory. [File macros](https://www.electron.build/file-patterns#file-macros) are supported.
   * @default dist
   */
  readonly output?: string | null

  /**
   * The application directory (containing the application package.json), defaults to `app`, `www` or working directory.
   */
  readonly app?: string | null
}

/**
 * All options come from [@electron/fuses](https://github.com/electron/fuses)
 * Ref: https://raw.githubusercontent.com/electron/electron/refs/heads/main/docs/tutorial/fuses.md
 */
export interface FuseOptionsV1 {
  /**
   *The runAsNode fuse toggles whether the `ELECTRON_RUN_AS_NODE` environment variable is respected or not.  Please note that if this fuse is disabled then `process.fork` in the main process will not function as expected as it depends on this environment variable to function. Instead, we recommend that you use [Utility Processes](https://github.com/electron/electron/blob/main/docs/api/utility-process.md), which work for many use cases where you need a standalone Node.js process (like a Sqlite server process or similar scenarios).
   */
  runAsNode?: boolean
  /**
   * The cookieEncryption fuse toggles whether the cookie store on disk is encrypted using OS level cryptography keys.  By default the sqlite database that Chromium uses to store cookies stores the values in plaintext.  If you wish to ensure your apps cookies are encrypted in the same way Chrome does then you should enable this fuse.  Please note it is a one-way transition, if you enable this fuse existing unencrypted cookies will be encrypted-on-write but if you then disable the fuse again your cookie store will effectively be corrupt and useless.  Most apps can safely enable this fuse.
   */
  enableCookieEncryption?: boolean
  /**
   * The nodeOptions fuse toggles whether the [`NODE_OPTIONS`](https://nodejs.org/api/cli.html#node_optionsoptions)  and [`NODE_EXTRA_CA_CERTS`](https://github.com/nodejs/node/blob/main/doc/api/cli.md#node_extra_ca_certsfile) environment variables are respected.  The `NODE_OPTIONS` environment variable can be used to pass all kinds of custom options to the Node.js runtime and isn't typically used by apps in production.  Most apps can safely disable this fuse.
   */
  enableNodeOptionsEnvironmentVariable?: boolean
  /**
   * The nodeCliInspect fuse toggles whether the `--inspect`, `--inspect-brk`, etc. flags are respected or not.  When disabled it also ensures that `SIGUSR1` signal does not initialize the main process inspector.  Most apps can safely disable this fuse.
   */
  enableNodeCliInspectArguments?: boolean
  /**
   * The embeddedAsarIntegrityValidation fuse toggles an experimental feature on macOS that validates the content of the `app.asar` file when it is loaded.  This feature is designed to have a minimal performance impact but may marginally slow down file reads from inside the `app.asar` archive.
   * Currently, ASAR integrity checking is supported on:
   *
   *  - macOS as of electron>=16.0.0
   *  - Windows as of electron>=30.0.0
   *
   * For more information on how to use asar integrity validation please read the [Asar Integrity](https://github.com/electron/electron/blob/main/docs/tutorial/asar-integrity.md) documentation.
   */
  enableEmbeddedAsarIntegrityValidation?: boolean
  /**
   * The onlyLoadAppFromAsar fuse changes the search system that Electron uses to locate your app code.  By default Electron will search in the following order `app.asar` -> `app` -> `default_app.asar`.  When this fuse is enabled the search order becomes a single entry `app.asar` thus ensuring that when combined with the `embeddedAsarIntegrityValidation` fuse it is impossible to load non-validated code.
   */
  onlyLoadAppFromAsar?: boolean
  /**
   * The loadBrowserProcessSpecificV8Snapshot fuse changes which V8 snapshot file is used for the browser process.  By default Electron's processes will all use the same V8 snapshot file.  When this fuse is enabled the browser process uses the file called `browser_v8_context_snapshot.bin` for its V8 snapshot. The other processes will use the V8 snapshot file that they normally do.
   */
  loadBrowserProcessSpecificV8Snapshot?: boolean
  /**
   * The grantFileProtocolExtraPrivileges fuse changes whether pages loaded from the `file://` protocol are given privileges beyond what they would receive in a traditional web browser.  This behavior was core to Electron apps in original versions of Electron but is no longer required as apps should be [serving local files from custom protocols](https://github.com/electron/electron/blob/main/docs/tutorial/security.md#18-avoid-usage-of-the-file-protocol-and-prefer-usage-of-custom-protocols) now instead.  If you aren't serving pages from `file://` you should disable this fuse.
   * The extra privileges granted to the `file://` protocol by this fuse are incompletely documented below:
   *
   *  - `file://` protocol pages can use `fetch` to load other assets over `file://`
   *  - `file://` protocol pages can use service workers
   *  - `file://` protocol pages have universal access granted to child frames also running on `file://` protocols regardless of sandbox settings
   */
  grantFileProtocolExtraPrivileges?: boolean
  /**
   * Resets the app signature, specifically used for macOS.
   * Note: This should be unneeded since electron-builder signs the app directly after flipping the fuses.
   * Ref: https://github.com/electron/fuses?tab=readme-ov-file#apple-silicon
   */
  resetAdHocDarwinSignature?: boolean
}

export interface Concurrency {
  /**
   * The maximum number of concurrent jobs to run.
   * @default 1
   */
  jobs: number
}
