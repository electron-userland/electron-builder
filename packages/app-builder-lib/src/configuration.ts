import { Arch } from "builder-util"
import { BeforeBuildContext, Target } from "./core.js"
import { ElectronBrandingOptions } from "./electron/ElectronFramework.js"
import { PrepareApplicationStageDirectoryOptions } from "./Framework.js"
import { AppXOptions } from "./options/AppXOptions.js"
import { AppImageOptions, DebOptions, FlatpakOptions, LinuxConfiguration, LinuxTargetSpecificOptions, PacmanOptions, RpmOptions } from "./options/linuxOptions.js"
import { DmgOptions, MacConfiguration, MasConfiguration } from "./options/macOptions.js"
import { MsiOptions } from "./options/MsiOptions.js"
import { MsiWrappedOptions } from "./options/MsiWrappedOptions.js"
import { PkgOptions } from "./options/pkgOptions.js"
import { PlatformSpecificBuildOptions } from "./options/PlatformSpecificBuildOptions.js"
import { SnapcraftOptions } from "./options/SnapOptions.js"
import { SquirrelWindowsOptions } from "./options/SquirrelWindowsOptions.js"
import { WindowsConfiguration } from "./options/winOptions.js"
import { BuildResult } from "./packager.js"
import { ArtifactBuildStarted, ArtifactCreated } from "./packagerApi.js"
import { PlatformPackager } from "./platformPackager.js"
import { NsisOptions, NsisWebOptions, PortableOptions } from "./targets/win/nsis/nsisOptions.js"
import { ElectronDownloadOptions, ElectronGetOptions } from "./util/electronGet.js"

// duplicate appId here because it is important
/**
 * Configuration options shared across all platforms.
 *
 * These properties apply regardless of the target platform and control general build behaviour such
 * as the application identity, output paths, native dependency rebuilding, toolset versions, and
 * platform-specific target sub-configurations.
 */
export interface CommonConfiguration {
  /**
   * The application identifier.
   *
   * Used as [`CFBundleIdentifier`](https://developer.apple.com/documentation/bundleresources/information_property_list/cfbundleidentifier)
   * on macOS and as the
   * [Application User Model ID](https://learn.microsoft.com/en-us/windows/win32/shell/appids)
   * on Windows (NSIS target only; Squirrel.Windows does not support custom Application User Model IDs).
   *
   * It is strongly recommended to set an explicit, reverse-DNS-style identifier (e.g. `"com.example.myapp"`)
   * rather than relying on the generated default.
   *
   * @default com.electron.${name}
   */
  readonly appId?: string | null

  /**
   * The human-readable product name displayed in installers, the macOS dock, and the Windows
   * Apps & Features list.
   *
   * Unlike the `name` field in `package.json`, this value may contain spaces and other characters
   * that are not allowed in npm package names.
   *
   * Resolution order:
   * 1. `productName` inside the `build` configuration block.
   * 2. `productName` at the top level of `package.json`.
   * 3. `name` at the top level of `package.json`.
   */
  readonly productName?: string | null

  /**
   * The copyright string embedded in the built artifacts.
   *
   * Appears in the Windows `LegalCopyright` version-info field and the macOS `NSHumanReadableCopyright`
   * Info.plist key.
   *
   * @default Copyright © ${year} ${author}
   */
  readonly copyright?: string | null

  /**
   * Overrides for input/output directory paths used during the build.
   *
   * @see {@link MetadataDirectories}
   */
  readonly directories?: MetadataDirectories | null

  /**
   * Pinned versions of the binary toolsets electron-builder downloads and uses internally.
   *
   * Each property selects a specific release of the corresponding tool bundle. Set a property to
   * `"0.0.0"` to force the legacy bundle (pre-v27 behaviour). Leave a property unset (or set to
   * `null`) to use the modern default for that toolset.
   *
   * @see {@link ToolsetConfig}
   */
  readonly toolsets?: ToolsetConfig | null

  /**
   * macOS-specific build options (signing, entitlements, notarization, target categories, etc.).
   * @see {@link MacConfiguration}
   */
  readonly mac?: MacConfiguration | null
  /**
   * macOS App Store (MAS) submission options.
   * @see {@link MasConfiguration}
   */
  readonly mas?: MasConfiguration | null
  /**
   * macOS App Store development-signing options (`mas-dev` target).
   * Used for local testing of MAS builds without submitting to the store.
   * @see {@link MasConfiguration}
   */
  readonly masDev?: MasConfiguration | null
  /**
   * macOS DMG disk image options (background image, window position, icon layout, licence, etc.).
   * @see {@link DmgOptions}
   */
  readonly dmg?: DmgOptions | null
  /**
   * macOS PKG flat-package installer options.
   * @see {@link PkgOptions}
   */
  readonly pkg?: PkgOptions | null

  /**
   * Windows-specific build options (signing, NSIS, icon, file associations, etc.).
   * @see {@link WindowsConfiguration}
   */
  readonly win?: WindowsConfiguration | null
  /**
   * NSIS one-click installer options.
   *
   * NSIS (Nullsoft Scriptable Install System) is the default Windows installer format produced by
   * electron-builder. It generates a lightweight, self-extracting `.exe` installer.
   *
   * @see {@link NsisOptions}
   */
  readonly nsis?: NsisOptions | null
  /**
   * NSIS web installer options.
   *
   * Like the standard NSIS installer but the app payload is downloaded from a remote URL at install
   * time rather than bundled into the `.exe`. Useful for very large apps or staged rollouts.
   *
   * @see {@link NsisWebOptions}
   */
  readonly nsisWeb?: NsisWebOptions | null
  /**
   * Portable executable options.
   *
   * Produces a single `.exe` that requires no installation — it extracts and runs directly.
   *
   * @see {@link PortableOptions}
   */
  readonly portable?: PortableOptions | null
  /**
   * Windows Store (MSIX/AppX) package options.
   *
   * Produces a `.appx` or `.msix` package suitable for distribution through the Microsoft Store or
   * side-loading.
   *
   * @see {@link AppXOptions}
   */
  readonly appx?: AppXOptions | null
  /**
   * WiX-based MSI installer options.
   *
   * Produces a traditional `.msi` package built with the WiX Toolset. Best for enterprise
   * deployments that require MSI-based installation policies.
   *
   * @see {@link MsiOptions}
   */
  readonly msi?: MsiOptions | null
  /**
   * MSI-wrapped NSIS installer options.
   *
   * Wraps the standard NSIS installer inside an MSI package so that it can be deployed via
   * Group Policy or other MSI-only channels while preserving the NSIS installer UX.
   *
   * @see {@link MsiWrappedOptions}
   */
  readonly msiWrapped?: MsiWrappedOptions | null
  /**
   * Squirrel.Windows auto-update installer options.
   *
   * Requires the `electron-builder-squirrel-windows` optional dependency.
   *
   * @see {@link SquirrelWindowsOptions}
   */
  readonly squirrelWindows?: SquirrelWindowsOptions | null
  /**
   * General Linux build options shared across all Linux targets (icon, category, desktop entry,
   * executable name, etc.). Target-specific compression and packaging options live in the
   * per-format interfaces (`DebOptions`, `RpmOptions`, `PacmanOptions`, etc.).
   *
   * @see {@link LinuxConfiguration}
   */
  readonly linux?: LinuxConfiguration | null
  /**
   * Debian package options.
   *
   * Targets Debian, Ubuntu, and Debian-based distributions. Produces a `.deb` archive
   * installable via `dpkg -i` or `apt install ./package.deb`.
   *
   * @see {@link DebOptions}
   */
  readonly deb?: DebOptions | null
  /**
   * Snapcraft configuration.
   *
   * Selects the snapcraft base and provides per-core options:
   * - `base: "core18" | "core20" | "core22"` — legacy bases; still functional but not recommended
   *   for new apps.
   * - `base: "core24"` — modern base with the GNOME extension (recommended, requires Electron 25+).
   * - `base: "custom"` — pass an existing `snapcraft.yaml` through unchanged; no plugs, extensions,
   *   or desktop files are injected.
   *
   * @example
   * ```json
   * { "snapcraft": { "base": "core24", "core24": { "useLXD": true } } }
   * ```
   *
   * @see {@link SnapcraftOptions}
   */
  readonly snapcraft?: SnapcraftOptions | null
  /**
   * AppImage options.
   *
   * AppImage is a portable application format that bundles the app and its runtime dependencies
   * into a single self-contained executable that runs on most Linux distributions without
   * installation. The produced `.AppImage` file is executable after `chmod +x`.
   *
   * @see {@link AppImageOptions}
   */
  readonly appImage?: AppImageOptions | null
  /**
   * Flatpak options.
   *
   * Flatpak is a sandboxed application distribution format for Linux distributed via
   * [Flathub](https://flathub.org/) or self-hosted OSTree repositories.
   *
   * @see {@link FlatpakOptions}
   */
  readonly flatpak?: FlatpakOptions | null
  /**
   * Pacman package options.
   *
   * Targets Arch Linux and Arch-based distributions (Manjaro, EndeavourOS, etc.).
   * Produces a `.pacman` archive installable via `pacman -U ./package.pacman`.
   *
   * @see {@link PacmanOptions}
   */
  readonly pacman?: PacmanOptions | null
  /**
   * RPM package options.
   *
   * Targets Fedora, Red Hat Enterprise Linux, SUSE, and RPM-based distributions.
   * Produces a `.rpm` archive installable via `rpm -i` or `dnf install ./package.rpm`.
   *
   * @see {@link RpmOptions}
   */
  readonly rpm?: RpmOptions | null
  /**
   * FreeBSD `pkg` package options.
   *
   * Produces a `.pkg` archive for the FreeBSD package manager.
   */
  readonly freebsd?: LinuxTargetSpecificOptions | null
  /**
   * Solaris IPS package options.
   *
   * Produces a `.p5p` archive for the Solaris Image Packaging System (`pkg`).
   */
  readonly p5p?: LinuxTargetSpecificOptions | null
  /**
   * Alpine Linux APK package options.
   *
   * Produces an `.apk` archive installable via `apk add --allow-untrusted ./package.apk`.
   */
  readonly apk?: LinuxTargetSpecificOptions | null

  /**
   * Additional command-line arguments appended to the package manager's `install` command when
   * electron-builder installs app dependencies (i.e., when `node_modules` is missing and a fresh
   * install is required).
   *
   * These arguments are appended **only** during the install phase, not during the rebuild phase.
   * To influence `@electron/rebuild` directly, see {@link NativeModulesConfig.rebuildMode}.
   *
   * @example
   * ```json
   * { "npmArgs": ["--prefer-offline", "--ignore-scripts"] }
   * ```
   */
  readonly npmArgs?: Array<string> | string | null

  /**
   * Configuration for native Node.js module installation and rebuilding.
   *
   * Groups all options that control how electron-builder handles native modules — from forcing
   * source builds during install through to the `@electron/rebuild` compilation mode.
   *
   * @see {@link NativeModulesConfig}
   */
  readonly nativeModules?: NativeModulesConfig | null

  /**
   * The build number.
   *
   * Maps to the `--iteration` flag for FPM-based Linux targets and is appended to the version
   * string in `CFBundleVersion` (macOS) and `FileVersion` (Windows) when {@link buildVersion} is
   * not set explicitly.
   *
   * If not set, falls back to the first defined environment variable among:
   * `BUILD_NUMBER`, `TRAVIS_BUILD_NUMBER`, `APPVEYOR_BUILD_NUMBER`, `CIRCLE_BUILD_NUM`,
   * `BUILD_BUILDNUMBER`, `CI_PIPELINE_IID`.
   */
  readonly buildNumber?: string | null

  /**
   * The full build version string.
   *
   * Maps to `CFBundleVersion` on macOS and the `FileVersion` metadata field on Windows.
   * Defaults to the `version` field from `package.json`.
   *
   * If `buildVersion` is not set but {@link buildNumber} is defined (or resolved from an
   * environment variable), the effective build version becomes `${version}.${buildNumber}`.
   */
  readonly buildVersion?: string | null

  /**
   * Whether to download the FFmpeg library variant from Electron's release assets and replace the
   * default (proprietary codec) FFmpeg library before signing.
   *
   * The alternate FFmpeg is compiled without proprietary codec support (H.264, AAC, etc.) and is
   * required for distributing on certain platforms (e.g., Linux distributions that prohibit
   * proprietary codecs). Enabling this swaps the bundled `ffmpeg` dynamic library before the app
   * is signed.
   */
  readonly downloadAlternateFFmpeg?: boolean

  /**
   * Additional properties to deep-merge into the app's `package.json` at build time.
   *
   * Useful for injecting build-time metadata (e.g., a git commit hash or CI build URL) that
   * should be readable at runtime via `require('./package.json')` or `import.meta.url`.
   *
   * @example
   * ```json
   * { "extraMetadata": { "commitHash": "abc1234", "buildDate": "2025-01-01" } }
   * ```
   */
  readonly extraMetadata?: any

  /**
   * Whether to throw an error and abort the build if the app could not be code-signed.
   *
   * Set to `true` in release pipelines to catch missing or misconfigured signing credentials
   * before producing unsigned artifacts. When `false` (the default), missing signing credentials
   * produce a warning and the build continues unsigned.
   *
   * @default false
   */
  readonly forceCodeSigning?: boolean

  /**
   * Whether to include `.pdb` (Program Database) symbol files in the output.
   *
   * PDB files enable Windows crash-dump analysis but significantly increase artifact size. Enable
   * for internal builds where you want symbol information; disable for public distribution.
   *
   * @default false
   */
  readonly includePdb?: boolean

  /**
   * Whether to remove the `scripts` field from bundled `package.json` files.
   *
   * Lifecycle scripts (`preinstall`, `postinstall`, etc.) have no meaning inside a packaged
   * Electron app and can trigger unintended behaviour if any tooling inspects the bundled
   * `package.json`. Removing them reduces artifact size and prevents accidental execution.
   *
   * @default true
   */
  readonly removePackageScripts?: boolean

  /**
   * Whether to remove the `keywords` field from bundled `package.json` files.
   *
   * The `keywords` array is only meaningful for package registry discoverability and has no
   * runtime value inside a packaged Electron app. Removing it marginally reduces artifact size.
   *
   * @default true
   */
  readonly removePackageKeywords?: boolean

  /**
   * Options forwarded to [`@electron/fuses`](https://github.com/electron/fuses) to flip Electron
   * feature flags in the binary.
   *
   * Fuses are compile-time-like flags baked into the Electron binary that cannot be changed at
   * runtime. Flipping them is the approved mechanism for hardening Electron apps (e.g., disabling
   * `ELECTRON_RUN_AS_NODE`, enabling ASAR integrity, etc.).
   *
   * electron-builder flips fuses after packaging but before signing so that the final signature
   * covers the modified binary.
   *
   * @see {@link FuseOptionsV1}
   */
  readonly electronFuses?: FuseOptionsV1 | null

  /**
   * Configuration for experimental concurrent (multi-platform / multi-arch) builds.
   *
   * When `jobs > 1`, electron-builder runs up to `jobs` platform builds in parallel. This is an
   * experimental feature — use with caution and verify that your hook functions and build resources
   * are safe to execute concurrently.
   *
   * @see {@link Concurrency}
   */
  readonly concurrency?: Concurrency | null
}

/**
 * The root build configuration object passed to electron-builder.
 *
 * Extends {@link CommonConfiguration} with top-level Electron-specific options, configuration
 * inheritance/presets, and all per-platform build hooks.
 */
export interface Configuration extends CommonConfiguration, PlatformSpecificBuildOptions, Hooks {
  /**
   * Options forwarded to [`@electron/get`](https://github.com/electron/get) when downloading the
   * Electron distribution to package.
   *
   * Also accepts the legacy `electron-download` shape for backward compatibility.
   */
  readonly electronDownload?: ElectronDownloadOptions | ElectronGetOptions | null

  /**
   * Electron branding overrides.
   *
   * Required only when packaging a custom Electron fork that ships a modified `BRANDING.json`
   * (e.g., a fork that renames the `Electron Helper` process or the `Electron Framework`).
   * Standard Electron builds do not need this.
   */
  readonly electronBranding?: ElectronBrandingOptions

  /**
   * The Electron version to package against.
   *
   * Defaults to the version of the `electron` (or `electron-prebuilt`) dependency declared in
   * `package.json`. Set this explicitly only when the installed Electron version is not the one
   * you want to package against (e.g., in monorepos where the Electron dependency lives in a
   * different workspace).
   */
  electronVersion?: string | null

  /**
   * One or more configuration presets or file paths to merge into this configuration.
   *
   * Accepts a string or array of strings, each of which is either:
   * - A built-in preset name (`"react-cra"` is the only currently supported value).
   * - A path to a JS/JSON config file relative to the project directory.
   *
   * Configs are merged left-to-right using a deep-assign strategy that properly combines `files`
   * glob patterns rather than replacing them.
   *
   * The `react-cra` preset is applied automatically when `react-scripts` is found in
   * `dependencies`. Set `extends: null` to opt out of automatic preset detection.
   */
  extends?: Array<string> | string | null
}

/**
 * Configuration for native Node.js module installation and rebuilding.
 *
 * All options that control how electron-builder handles native modules — from forcing source
 * builds at install time through to the `@electron/rebuild` compilation mode.
 */
export interface NativeModulesConfig {
  /**
   * Whether to pass `--build-from-source` to the package manager when installing native
   * dependencies, forcing them to compile from source rather than using pre-built binaries.
   *
   * Useful when pre-built binaries are not available for the target platform/arch combination,
   * or when you need to ensure native modules are compiled against the exact Electron ABI.
   *
   * @default false
   */
  buildDependenciesFromSource?: boolean

  /**
   * Whether to run `node-gyp rebuild` with Electron headers before packaging.
   *
   * This is a low-level escape hatch for cases where the standard `@electron/rebuild` path
   * (controlled by {@link npmRebuild}) is insufficient. Most projects should leave this `false`
   * and rely on `@electron/rebuild` instead.
   *
   * When `true`, electron-builder runs `node-gyp rebuild` with the correct `npm_config_*`
   * environment variables set for the target Electron version and architecture before the
   * normal rebuild step.
   *
   * @default false
   */
  readonly nodeGypRebuild?: boolean

  /**
   * Whether to rebuild native Node.js modules for the target Electron version and architecture
   * before packaging.
   *
   * When `true` (the default), electron-builder runs `@electron/rebuild` against the app's
   * `node_modules` directory to ensure all native modules are compiled against the correct Electron
   * ABI. Set to `false` to skip this step entirely — useful when native modules are pre-built
   * elsewhere in your pipeline or when the app has no native dependencies.
   *
   * The compilation mode (`sequential` vs `parallel`) is controlled by {@link rebuildMode}.
   *
   * @default true
   */
  readonly npmRebuild?: boolean

  /**
   * Compilation mode for `@electron/rebuild`.
   *
   * - `"sequential"` — rebuilds native modules one at a time. Safer in memory-constrained
   *   environments and produces cleaner log output.
   * - `"parallel"` — rebuilds all native modules concurrently. Faster on machines with many cores
   *   and plentiful memory, but may exhaust resources on CI agents with limited RAM.
   *
   * @default "sequential"
   */
  readonly rebuildMode?: "sequential" | "parallel" | null
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
 * Version pins and custom bundle overrides for the binary toolsets that electron-builder
 * downloads and caches locally.
 *
 * Each toolset is a versioned archive hosted at
 * [electron-userland/electron-builder-binaries](https://github.com/electron-userland/electron-builder-binaries/releases).
 * Omitting a property (or setting it to `null`) selects the modern default for that toolset.
 * Setting a property to `"0.0.0"` forces the legacy bundle — useful only for diagnosing
 * regressions introduced by newer toolset bundles.
 *
 * To supply your own bundle, set the property to a {@link ToolsetCustom} object with a `url`
 * (https:// or file://) and a `checksum` for verification. The bundle must mirror the expected
 * directory layout of the corresponding built-in bundle; see the build scripts at
 * https://github.com/electron-userland/electron-builder-binaries/tree/master/packages.
 */
export interface ToolsetConfig {
  /**
   * Version of the `win-codesign` bundle used for Windows code signing and resource editing.
   *
   * The bundle ships:
   * - **`signtool.exe`** (Windows) / **`osslsigncode`** (macOS & Linux) — used to sign `.exe`,
   *   `.dll`, and `.msix` artifacts.
   * - **`rcedit`** — used to embed version metadata and icons into `.exe` files.
   * - **Windows Kits** (`10.0.26100.0`) — used by AppX/MSIX packaging (`makeappx`, `signtool`).
   *
   * Available versions:
   * | Version | Contents |
   * |---------|----------|
   * | `"0.0.0"` | Legacy bundle — `winCodeSign-2.6.0` (pre-v27 default) |
   * | `"1.0.0"` | Modern bundle — Windows Kits 10.0.26100.0, `win-codesign` v1.0.0 |
   * | `"1.1.0"` | Modern bundle — Windows Kits 10.0.26100.0, `win-codesign` v1.1.0 |
   * | `"1.1.1"` | Modern bundle — Windows Kits 10.0.26100.0, `win-codesign` v1.1.1 |
   * | `"1.2.1"` | Modern bundle — Windows Kits 10.0.26100.0, `win-codesign` v1.2.1 |
   * | `"1.3.0"` | Modern bundle — Windows Kits 10.0.26100.0, `win-codesign` v1.3.0 + separate ATS dlib bundle + .NET 8 runtime (required for Azure Trusted Signing `signtool /dlib`) |
   *
   * Releases: https://github.com/electron-userland/electron-builder-binaries/blob/master/packages/win-codesign/CHANGELOG.md
   *
   * @default "1.1.0"
   */
  readonly winCodeSign?: "0.0.0" | "1.0.0" | "1.1.0" | "1.1.1" | "1.2.1" | "1.3.0" | ToolsetCustom | null

  /**
   * Version of the AppImage toolset bundle used for building `.AppImage` files.
   *
   * The bundle ships:
   * - **`mksquashfs`** — creates the SquashFS filesystem embedded in the AppImage.
   * - **`desktop-file-validate`** — validates the generated `.desktop` entry.
   * - **AppImage runtime** — the self-executing stub that mounts the SquashFS at launch.
   *
   * Available versions:
   * | Version | Runtime date | Notes |
   * |---------|-------------|-------|
   * | `"0.0.0"` | Legacy | FUSE2-based AppImage runtime (pre-v27 default) |
   * | `"1.0.2"` | 20251108 | Static-runtime (FUSE3-compatible) |
   * | `"1.0.3"` | 20251108 | Static-runtime (FUSE3-compatible); recommended (default) |
   *
   * Releases: https://github.com/electron-userland/electron-builder-binaries/blob/master/packages/appimage/CHANGELOG.md
   *
   * @default "1.0.3"
   */
  readonly appimage?: "0.0.0" | "1.0.2" | "1.0.3" | ToolsetCustom | null

  /**
   * Version of the NSIS toolset bundle used to compile Windows installers.
   *
   * The bundle ships:
   * - **`makensis`** — the NSIS compiler invoked to build `.nsi` scripts into `.exe` installers.
   * - **NSIS plugins** — the plugin DLLs (`NsisMultiUser`, `UAC`, `StdUtils`, etc.) referenced by
   *   electron-builder's default installer scripts.
   * - **`elevate.exe`** — UAC elevation helper included in NSIS installers.
   *
   * Available versions:
   * | Version | `makensis` version | Notes |
   * |---------|------------------|-------|
   * | `"0.0.0"` | 3.0.4.1 | Legacy split bundle — `nsis` + `nsis-resources` archives (pre-v27 default) |
   * | `"1.2.1"` | 3.12 | Unified bundle — single archive, entrypoint scripts auto-set `NSISDIR` (default) |
   *
   * Releases: https://github.com/electron-userland/electron-builder-binaries/blob/master/packages/nsis/CHANGELOG.md
   *
   * @default "1.2.1"
   */
  readonly nsis?: "0.0.0" | "1.2.1" | ToolsetCustom | null

  /**
   * Version of the Wine bundle used to run Windows tools (NSIS, rcedit, signtool) on
   * non-Windows hosts (macOS and Linux).
   *
   * Wine is only required when building Windows targets on a non-Windows machine. On Windows,
   * this setting has no effect.
   *
   * Available versions:
   * | Version | Wine version | Platform support | Notes |
   * |---------|-------------|-----------------|-------|
   * | `"0.0.0"` | 4.0.1 | macOS only | Legacy portable bundle (pre-v27 default) |
   *
   * On Linux, the system `wine` binary is used instead of a bundled one.
   * Set `USE_SYSTEM_WINE=true` to force system Wine regardless of this setting.
   *
   * Releases: https://github.com/electron-userland/electron-builder-binaries/blob/master/packages/wine/CHANGELOG.md
   *
   * @default "0.0.0"
   */
  readonly wine?: "0.0.0" | ToolsetCustom | null

  /**
   * Version of the FPM bundle used to build Linux packages (`.deb`, `.rpm`, `.pacman`, etc.)
   * on macOS and Linux hosts.
   *
   * Available versions:
   * | Version | FPM version | Notes |
   * |---------|------------|-------|
   * | `"2.2.1"` | 1.17.0 (Ruby 3.4.3) | Current default |
   *
   * Releases: https://github.com/electron-userland/electron-builder-binaries/blob/master/packages/fpm/CHANGELOG.md
   *
   * @default "2.2.1"
   */
  readonly fpm?: "2.2.1" | ToolsetCustom | null

  /**
   * Version of the Linux-tools-mac bundle used to produce `.tar.lz` archives and build
   * Linux targets on macOS hosts.
   *
   * The bundle ships macOS-native builds of `ar`, `lzip`, and `gtar` (GNU tar).
   *
   * Available versions:
   * | Version | Notes |
   * |---------|-------|
   * | `"1.0.0"` | Current default |
   *
   * Releases: https://github.com/electron-userland/electron-builder-binaries/blob/master/packages/linux-tools-mac/CHANGELOG.md
   *
   * @default "1.0.0"
   */
  readonly linuxToolsMac?: "1.0.0" | ToolsetCustom | null

  /**
   * Version of the 7-Zip binary bundle used internally to extract `.7z` and `.tar.xz` archives.
   *
   * Set to a {@link ToolsetCustom} object to supply your own 7za binary.
   * The `url` must point to a directory (or a `.tar.gz`/`.zip` archive of one) that contains
   * `bin/7za` (macOS/Linux) or `bin/7za.exe` (Windows).
   *
   * **Bootstrap constraint:** the custom bundle itself must be a `.tar.gz` or `.zip` archive
   * (or a bare `file://` directory). `.7z` and `.tar.xz` archives cannot be used here because
   * extracting them requires 7za — a circular dependency.
   *
   * @default "1.0.0"
   */
  readonly sevenZip?: "1.0.0" | ToolsetCustom | null

  /**
   * Version of the icons-conversion bundle used to convert source images to `.icns`, `.ico`,
   * and PNG icon sets.
   *
   * Set to a {@link ToolsetCustom} object to supply your own icons bundle directory.
   *
   * Available versions:
   * | Version | Notes |
   * |---------|-------|
   * | `"1.1.0"` | Current default |
   *
   * Releases: https://github.com/electron-userland/electron-builder-binaries/blob/master/packages/icons/CHANGELOG.md
   *
   * @default "1.1.0"
   */
  readonly icons?: "1.1.0" | ToolsetCustom | null
}

/**
 * A custom toolset bundle supplied by the user in place of a built-in versioned bundle.
 *
 * The bundle must mirror the expected directory layout of the corresponding built-in bundle.
 * See the build scripts at
 * https://github.com/electron-userland/electron-builder-binaries/tree/master/packages.
 *
 * File formats supported for `url` archives: `.zip`, `.7z`, `.tar.gz`, `.tar.xz`.
 *
 * @example
 * ```json
 * {
 *   "toolsets": {
 *     "nsis": {
 *       "url": "file:///path/to/my-nsis-bundle.tar.gz",
 *       "checksum": "abc123...",
 *       "version": "my-custom-1.0"
 *     }
 *   }
 * }
 * ```
 */
export interface ToolsetCustom {
  /**
   * The `https://` URL or `file://` path to load the custom toolset bundle from.
   *
   * - `https://` — downloaded and cached locally; the archive is extracted before use.
   * - `file:///absolute/path` — used directly; relative paths must be within the project resources dir.
   *
   * Archives (`.zip`, `.7z`, `.tar.gz`, `.tar.xz`) are extracted automatically.
   * A bare directory path (no archive) is used as-is.
   */
  readonly url: string

  /**
   * SHA checksum of the custom toolset bundle for verification.
   * Required for remote (`https://`) URLs and local archive files (`file://`).
   * Not needed for bare directory paths — the directory is used as-is with no caching.
   */
  readonly checksum?: string

  /**
   * Optional version label used in the local cache directory name.
   * Falls back to the first 8 characters of `checksum` when omitted.
   */
  readonly version?: string
}

/**
 * Lifecycle hooks that run at specific points during the electron-builder pipeline.
 *
 * Each hook can be specified as:
 * - An **inline function** (JavaScript/TypeScript config files only):
 *   ```js
 *   // electron-builder.config.js
 *   module.exports = { beforePack: async (context) => { /* ... *\/ } }
 *   ```
 * - A **path** to a CommonJS/ESM module (relative to the project directory) that exports the
 *   hook as its **default export**:
 *   ```json
 *   { "build": { "beforePack": "./scripts/myHook.js" } }
 *   ```
 *   ```js
 *   // scripts/myHook.js
 *   export default async function (context) { /* ... *\/ }
 *   ```
 */
export interface Hooks {
  /**
   * Called immediately before electron-builder begins packing the app for each platform/arch
   * combination.
   *
   * Use this hook to perform last-minute modifications to source files or build resources before
   * they are read by the packager.
   *
   * Receives a {@link BeforePackContext}.
   */
  readonly beforePack?: Hook<BeforePackContext, void> | string | null

  /**
   * Called after the prebuilt Electron binary has been extracted to the staging directory but
   * before the app files have been copied into it.
   *
   * Use this hook to patch or augment the Electron binary itself (e.g. rename helper processes,
   * inject native libraries) before the app payload is laid down on top.
   *
   * Receives an {@link AfterExtractContext}.
   */
  readonly afterExtract?: Hook<AfterExtractContext, void> | string | null

  /**
   * Called after the app files have been copied into the staging directory (and ASAR created if
   * applicable) but **before** signing and before the output archive/installer is built.
   *
   * Use this hook to post-process the staged app bundle (e.g. strip debug symbols, inject
   * platform-specific resources).
   *
   * Receives an {@link AfterPackContext}.
   */
  readonly afterPack?: Hook<AfterPackContext, void> | string | null

  /**
   * Called after code signing but **before** the signed app is packed into the final
   * distributable format (e.g. before `dmg` is created from the signed `.app`).
   *
   * Use this hook to perform post-sign validation or to add signed resources that are not part of
   * the main app bundle.
   *
   * Receives an {@link AfterPackContext}.
   */
  readonly afterSign?: Hook<AfterPackContext, void> | string | null

  /**
   * Called when an individual artifact build starts (e.g. just before a `.dmg` or `.exe` is
   * written to disk).
   *
   * Receives an {@link ArtifactBuildStarted}.
   */
  readonly artifactBuildStarted?: Hook<ArtifactBuildStarted, void> | string | null

  /**
   * Called when an individual artifact has been successfully built and written to disk.
   *
   * Use this hook to collect artifact paths, upload to custom destinations, or trigger
   * post-processing steps.
   *
   * Receives an {@link ArtifactCreated}.
   */
  readonly artifactBuildCompleted?: Hook<ArtifactCreated, void> | string | null

  /**
   * Called after **all** artifacts across all platforms/architectures have been built.
   *
   * May return an array of additional file paths that should be treated as publish targets
   * (i.e. uploaded to the configured publisher).
   *
   * Receives a {@link BuildResult}.
   *
   * @example
   * ```js
   * export default async function afterAllArtifactBuild(result) {
   *   return ["/path/to/extra-file.txt"]
   * }
   * ```
   */
  readonly afterAllArtifactBuild?: Hook<BuildResult, Array<string>> | string | null

  /**
   * Called after the WiX MSI project XML has been written to a temporary directory but before
   * `candle.exe` / `light.exe` compile it into a `.msi` package.
   *
   * The hook receives the path to the project directory as a string. Use it to patch the generated
   * `.wxs` files for customizations not exposed through electron-builder's options.
   */
  readonly msiProjectCreated?: Hook<string, void> | string | null

  /**
   * Called after the AppX/MSIX manifest XML has been written to the staging directory but before
   * `makeappx` packages it.
   *
   * The hook receives the path to the manifest file as a string. Use it to inject custom manifest
   * extensions (capabilities, protocol handlers, etc.) not exposed through {@link AppXOptions}.
   */
  readonly appxManifestCreated?: Hook<string, void> | string | null

  /**
   * Called for every file inside each `node_modules` package directory as electron-builder
   * decides whether to include it in the packaged app.
   *
   * Return `true` to force-include the file regardless of the default exclusion rules.
   * Return `false` or `undefined` to let electron-builder apply its normal filtering logic.
   *
   * Receives the absolute path of the file as a string.
   */
  readonly onNodeModuleFile?: Hook<string, void | boolean> | string | null

  /**
   * Called before dependencies are installed or native modules are rebuilt.
   *
   * Return `false` (or a `Promise` that resolves to `false`) to skip the install/rebuild step
   * entirely — useful when you manage `node_modules` externally (e.g. in a CI pipeline that
   * restores them from cache). When not set, electron-builder proceeds with the normal
   * install/rebuild flow.
   *
   * If this hook is provided and `node_modules` is missing, electron-builder will not perform
   * the production-dependencies check.
   *
   * Receives a {@link BeforeBuildContext}.
   */
  readonly beforeBuild?: Hook<BeforeBuildContext, boolean | void> | string | null

  /**
   * Override the source of the Electron distribution to stage.
   *
   * Should return the path to either:
   * - A **directory** containing a pre-built, unpacked Electron app (e.g. `~/electron/out/R`).
   * - A **directory** containing Electron zip archives following the naming convention
   *   `electron-v${version}-${platformName}-${arch}.zip`.
   *
   * When not set, electron-builder downloads the official Electron release from GitHub (or the
   * mirror configured via `electronDownload`).
   *
   * Receives a {@link PrepareApplicationStageDirectoryOptions}.
   */
  readonly electronDist?: Hook<PrepareApplicationStageDirectoryOptions, string> | string | null
}

/**
 * Overrides for the input and output directories used during the build.
 */
export interface MetadataDirectories {
  /**
   * The directory that contains static build resources (icons, background images, license files,
   * custom NSIS scripts, etc.) that electron-builder reads during packaging.
   *
   * **Build resources are not copied into the packaged app.** If you need runtime access to a
   * file (e.g. a tray icon), include it explicitly via the `files` option:
   * ```json
   * { "files": ["**\/*", "build/icon.*"] }
   * ```
   *
   * @default "build"
   */
  readonly buildResources?: string | null

  /**
   * The directory where electron-builder writes its output (installers, zip archives, etc.).
   *
   * [File macros](https://www.electron.build/file-patterns#file-macros) are supported, e.g.
   * `"dist/${os}-${arch}"` to separate outputs by platform and architecture.
   *
   * @default "dist"
   */
  readonly output?: string | null

  /**
   * The directory that contains the application's `package.json` and source code.
   *
   * Defaults to `app`, then `www`, then the project root. Set this when your packagable app
   * lives in a subdirectory (common in monorepos or when using a separate frontend build step).
   */
  readonly app?: string | null
}

/**
 * Feature flags ("fuses") baked into the Electron binary at build time.
 *
 * All options map 1:1 to the flags documented by
 * [`@electron/fuses`](https://github.com/electron/fuses) and the upstream
 * [Electron fuses guide](https://www.electronjs.org/docs/latest/tutorial/fuses).
 *
 * electron-builder flips fuses after packaging and **before** signing so that the final
 * code signature covers the modified binary. On Apple Silicon, the ad-hoc signature is
 * re-applied automatically after flipping fuses.
 */
export interface FuseOptionsV1 {
  /**
   * Controls whether the `ELECTRON_RUN_AS_NODE` environment variable is respected.
   *
   * When `true` (the Electron default), setting `ELECTRON_RUN_AS_NODE=1` in the environment
   * makes Electron behave like a plain Node.js process, bypassing the app entirely. Disable
   * this fuse in production apps to prevent that escape path.
   *
   * **Note:** Disabling this fuse also breaks `process.fork()` in the main process because
   * it relies on `ELECTRON_RUN_AS_NODE` internally. Use
   * [Utility Processes](https://www.electronjs.org/docs/latest/api/utility-process) as a
   * replacement.
   */
  runAsNode?: boolean

  /**
   * Controls whether the Chromium cookie store is encrypted using OS-level cryptography keys.
   *
   * When enabled, cookies are stored encrypted on disk (the same mechanism Chrome uses).
   * **This is a one-way transition**: existing unencrypted cookies are re-encrypted on write, but
   * disabling the fuse afterwards will leave the cookie database unreadable.
   *
   * Most production apps can safely enable this fuse.
   */
  enableCookieEncryption?: boolean

  /**
   * Controls whether the [`NODE_OPTIONS`](https://nodejs.org/api/cli.html#node_optionsoptions)
   * and `NODE_EXTRA_CA_CERTS` environment variables are respected.
   *
   * `NODE_OPTIONS` allows injecting arbitrary Node.js runtime flags (e.g. `--require`) and is
   * rarely needed in production. Most apps can safely disable this fuse.
   */
  enableNodeOptionsEnvironmentVariable?: boolean

  /**
   * Controls whether the `--inspect`, `--inspect-brk`, and related Node.js debugger flags are
   * honoured.
   *
   * When disabled, `SIGUSR1` no longer opens the V8 inspector in the main process either.
   * Most production apps can safely disable this fuse.
   */
  enableNodeCliInspectArguments?: boolean

  /**
   * Enables ASAR integrity validation — Electron verifies the embedded SHA-256 hash of
   * `app.asar` before loading it.
   *
   * Platform support:
   * - macOS: Electron ≥ 16.0.0
   * - Windows: Electron ≥ 30.0.0
   *
   * For this fuse to be meaningful, `asar.disableIntegrity` must **not** be
   * `true` (otherwise the hash is not embedded).
   *
   * See the [ASAR Integrity guide](https://www.electronjs.org/docs/latest/tutorial/asar-integrity).
   */
  enableEmbeddedAsarIntegrityValidation?: boolean

  /**
   * When enabled, Electron searches for the app exclusively in `app.asar`, skipping the `app`
   * directory and `default_app.asar` fallbacks.
   *
   * Combined with `enableEmbeddedAsarIntegrityValidation`, this makes it impossible to side-load
   * unverified code by replacing `app.asar` with an unarchived `app/` directory.
   */
  onlyLoadAppFromAsar?: boolean

  /**
   * When enabled, the browser (main) process uses a separate V8 snapshot file
   * (`browser_v8_context_snapshot.bin`) instead of the shared one.
   *
   * This is only useful when you ship a custom V8 snapshot for the main process that differs
   * from the renderer snapshot. Standard apps do not need this.
   */
  loadBrowserProcessSpecificV8Snapshot?: boolean

  /**
   * Controls whether pages loaded from the `file://` protocol receive elevated privileges
   * beyond what a standard web browser would grant.
   *
   * These extra privileges include `fetch` to other `file://` URLs, service workers, and
   * universal frame access for child frames also on `file://`. This behaviour pre-dates modern
   * Electron security best practices.
   *
   * Disable this fuse if your app does not load content directly from `file://` (i.e. you use
   * a [custom protocol](https://www.electronjs.org/docs/latest/tutorial/security#18-avoid-usage-of-the-file-protocol-and-prefer-usage-of-custom-protocols)).
   */
  grantFileProtocolExtraPrivileges?: boolean

  /**
   * Re-applies the ad-hoc codesignature on macOS after fuses are flipped.
   *
   * electron-builder already re-signs the app after flipping fuses, so this flag is
   * generally not needed and exists only as a compatibility shim for edge cases.
   *
   * See [`@electron/fuses` — Apple Silicon](https://github.com/electron/fuses?tab=readme-ov-file#apple-silicon).
   */
  resetAdHocDarwinSignature?: boolean
}

/**
 * Configuration for experimental concurrent builds.
 */
export interface Concurrency {
  /**
   * Maximum number of platform/architecture builds to run in parallel.
   *
   * Set to `1` to disable concurrency (sequential builds, the safe default). Higher values
   * reduce wall-clock time on multi-platform builds at the cost of increased memory and CPU
   * usage. Ensure that your {@link Hooks} and build resources are safe to execute concurrently
   * before raising this limit.
   *
   * @default 1
   */
  jobs: number
}
