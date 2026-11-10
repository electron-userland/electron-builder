import { createRequire } from "node:module"
import type { SignOptions } from "@electron/osx-sign"

const _require = createRequire(import.meta.url)
import {
  Arch,
  AsyncTaskManager,
  copyFile,
  deepAssign,
  exec,
  Executables,
  exists,
  getArchSuffix,
  InvalidConfigurationError,
  isEmptyOrSpaces,
  log,
  orIfFileNotExist,
  sanitizeDirPath,
  unlinkIfExists,
  use,
} from "builder-util"
import { MemoLazy, Nullish } from "builder-util-runtime"
import * as fs from "fs/promises"
import { mkdir, readdir } from "fs/promises"
import { Lazy } from "lazy-val"
import * as path from "path"
import * as semver from "semver"
import { AppInfo } from "./appInfo.js"
import { embedAsarIntegrityDigest, FIRST_ELECTRON_MAJOR_WITH_ASAR_INTEGRITY_DIGEST } from "./electron/mac/asarIntegrityDigest.js"
import { assertSafeHelperName } from "./electron/mac/electronMacUtils.js"
import { forceCodeSigningError, forceCodeSigningOverrideHint, VERIFICATION_FAILED_ERROR_CODE } from "./codeSign/forceCodeSigning.js"
import { isAutoDiscoveryCodeSignIdentity } from "./util/flags.js"
import { CodeSigningInfo, createKeychain, CreateKeychainOptions, Identity, isSignAllowed, macSigningUnavailableError, removeKeychain, sign } from "./codeSign/mac/macCodeSign.js"
import { validateStapledTicket, verifyMacCodeSignature } from "./codeSign/mac/macSignatureVerifier.js"
import { combineSignResults, isSignResultSigned, SigningResult } from "./codeSign/signResult.js"
import { DIR_TARGET, Platform, Target } from "./core.js"
import { AfterPackContext, ElectronPlatformName } from "./index.js"
import { MacTargetHelper, MasPlatformType, PlatformType } from "./targets/mac/MacTargetHelper.js"
import { ElectronSignOptions, MacConfiguration, MasConfiguration } from "./options/macOptions.js"
import { AsarOptions } from "./options/PlatformSpecificBuildOptions.js"
import { Packager } from "./packager.js"
import type { PlannedTargets } from "./packagerApi.js"
import { chooseNotNull, DoPackOptions, PlatformPackager } from "./platformPackager.js"
import { ArchiveTarget } from "./targets/ArchiveTarget.js"
import { PkgTarget, prepareProductBuildArgs } from "./targets/mac/pkg.js"
import { createCommonTarget, NoOpTarget } from "./targets/targetFactory.js"
import { isPlainObject, replaceMergedExcludedExts } from "./util/config/fileOptions.js"
import { isMacOsHighSierra } from "./util/mac/macosVersion.js"
import { buildSingleArchFilesPattern, collectIdenticalSingleArchMachOFiles, collectSingleArchPackageNames } from "./util/archCompatibility.js"
import { expandMacro as doExpandMacro } from "./util/macroExpander.js"
import { resolveFunction } from "./util/resolve.js"
import { makeUniversalApp } from "@electron/universal"

export type CustomMacSignOptions = SignOptions
export type CustomMacSign = (configuration: CustomMacSignOptions, packager: MacPackager) => Promise<void>

function isElectronSignOptions(sign: MacConfiguration["sign"]): sign is ElectronSignOptions {
  return typeof sign === "object" && sign !== null
}

/**
 * Merges the mac → mas (→ masDev) cascade. `deepAssign` merges a later layer into a nested object it took from an earlier one, so each
 * layer's `fileOptions` is copied first: merging the mas configuration must not change the `fileOptions` of the mac one. A later layer's
 * `fileOptions.excludedExts` replaces an earlier one (see replaceMergedExcludedExts).
 */
function mergeMasConfig(...layers: Array<MacConfiguration | MasConfiguration | Nullish>): MasConfiguration {
  const config: MasConfiguration = deepAssign({}, ...layers.map(it => (it != null && isPlainObject(it.fileOptions) ? { ...it, fileOptions: { ...it.fileOptions } } : it)))
  replaceMergedExcludedExts(config, layers)
  return config
}

interface PlatformConfig<C extends MacConfiguration | MasConfiguration = MacConfiguration | MasConfiguration> {
  type: PlatformType
  config: C
  platformName: ElectronPlatformName
}

export class MacPackager extends PlatformPackager<MacConfiguration | MasConfiguration> {
  readonly codeSigningInfo = new MemoLazy<CreateKeychainOptions | null, CodeSigningInfo>(
    () => {
      const cscLink = this.getCscLink()
      if (cscLink == null || process.platform !== "darwin") {
        return null
      }

      const selected = {
        tmpDir: this.tempDirManager,
        cscLink,
        cscKeyPassword: this.getCscPassword(),
        cscILink: chooseNotNull(this.platformSpecificBuildOptions.cscInstallerLink, process.env.CSC_INSTALLER_LINK),
        cscIKeyPassword: chooseNotNull(this.platformSpecificBuildOptions.cscInstallerKeyPassword, process.env.CSC_INSTALLER_KEY_PASSWORD),
        currentDir: this.projectDir,
      }

      return selected
    },
    async selected => {
      if (selected) {
        return createKeychain(selected).then(result => {
          const keychainFile = result.keychainFile
          if (keychainFile != null) {
            this.info.disposeOnBuildFinish(() => removeKeychain(keychainFile))
          }
          return result
        })
      }

      return Promise.resolve({ keychainFile: process.env.CSC_KEYCHAIN || null })
    }
  )

  private _iconPath = new Lazy(() => this.getOrConvertIcon("icns"))

  readonly helper = new MacTargetHelper(this)

  constructor(info: Packager) {
    super(info, Platform.MAC)
    info.onTargetsCreated(plans => this.checkForceCodeSigningAtBuildStart(plans))
  }

  /**
   * Fails a forceCodeSigning build at build start, before anything is packed, when the macOS app could not be signed or
   * notarized: on a host other than macOS, in a pull-request build without CSC_FOR_PULL_REQUEST, or without notarization
   * credentials; and a build with `mac.notarize: true` without notarization credentials, where notarization can happen.
   * sign() and notarizeIfProvided keep their own checks for callers that never emit `targetsCreated`.
   */
  private checkForceCodeSigningAtBuildStart(plans: ReadonlyArray<PlannedTargets>): void {
    const ownPlans = plans.filter(it => it.packager === this)
    // each flavor that is built, with its own forceCodeSigning: the macOS app (and its pkg), and every MAS target
    const flavors = new Set<PlatformType>()
    for (const { targets } of ownPlans) {
      if (MacPackager.packsNonMasApp(targets) || targets.some(it => it.name === "pkg")) {
        flavors.add("mac")
      }
      for (const target of targets) {
        if (MacTargetHelper.isMasTarget(target.name)) {
          flavors.add(MacTargetHelper.getPlatformTypeFromTarget(target.name))
        }
      }
    }
    for (const flavor of flavors) {
      if (!this.forceCodeSigningFor(flavor)) {
        continue
      }
      const unavailable = macSigningUnavailableError(flavor === "mac" ? "the macOS app" : `the ${flavor} app`, this.forceCodeSigningOverrideHintFor(flavor))
      if (unavailable != null) {
        throw unavailable
      }
    }
    if (!flavors.has("mac")) {
      return
    }
    // the non-MAS app is notarized when it is packed (never for a prepackaged one), and the pkg installer always
    const prepackaged = this.packagerOptions.prepackaged != null
    const packsApp = ownPlans.some(({ targets }) => !prepackaged && MacPackager.packsNonMasApp(targets))
    const packsPkg = ownPlans.some(({ targets }) => targets.some(it => it.name === "pkg"))
    const notarize = this.platformSpecificBuildOptions.notarize
    if ((!packsApp && !packsPkg) || notarize === false) {
      return
    }
    // the credentials are read (getNotarizeOptions also rejects an incomplete set) only where they are required
    if (this.forceCodeSigning) {
      if (MacTargetHelper.getNotarizeOptions("") == null) {
        throw MacTargetHelper.missingNotarizationCredentialsError()
      }
      return
    }
    // notarize: true requires notarization where it runs: the app only when sign() signs it, the pkg installer whenever it is built
    if (!MacTargetHelper.isNotarizationRequired(notarize) || (!packsPkg && this.isMacSigningSkippedByConfiguration())) {
      return
    }
    if (MacTargetHelper.getNotarizeOptions("") == null) {
      throw MacTargetHelper.notarizeTrueWithoutCredentialsError()
    }
  }

  /**
   * `forceCodeSigning` of a flavor: `mas` and `mas-dev` cascade `mac` → `mas` → `masDev` like every other option (see
   * getPlatformConfig), then the root value. For `mac` it is {@link forceCodeSigning}.
   */
  forceCodeSigningFor(platformType: PlatformType): boolean {
    if (platformType === "mac") {
      return this.forceCodeSigning
    }
    return this.getPlatformConfig(platformType).config.forceCodeSigning ?? this.config.forceCodeSigning ?? false
  }

  /** The `-c` override that turns `forceCodeSigning` off for a flavor: on the most specific block that sets it. */
  forceCodeSigningOverrideHintFor(platformType: PlatformType): string {
    if (platformType === "mas-dev" && this.config.masDev?.forceCodeSigning != null) {
      return "-c.masDev.forceCodeSigning=false"
    }
    if (platformType !== "mac" && this.config.mas?.forceCodeSigning != null) {
      return "-c.mas.forceCodeSigning=false"
    }
    return forceCodeSigningOverrideHint(this)
  }

  /**
   * Whether sign() skips the macOS app because of the configuration, before it would notarize it: `sign: null`, `sign.identity: null`,
   * or `CSC_IDENTITY_AUTO_DISCOVERY=false` without an identity (`sign.identity` or `CSC_NAME`) or a custom signer.
   */
  private isMacSigningSkippedByConfiguration(): boolean {
    const signConfig = this.platformSpecificBuildOptions.sign
    if (signConfig === null) {
      return true
    }
    const signOpts = isElectronSignOptions(signConfig) ? signConfig : undefined
    if (signConfig != null && signOpts == null) {
      // a custom signer is called without an identity too
      return false
    }
    if (signOpts?.identity === null) {
      return true
    }
    return isEmptyOrSpaces(signOpts?.identity ?? process.env.CSC_NAME) && !isAutoDiscoveryCodeSignIdentity()
  }

  /** Whether `pack` builds the non-MAS app: unless every target is a MAS one. No target at all is a dir build. */
  private static packsNonMasApp(targets: ReadonlyArray<Target>): boolean {
    // Mirror master's condition: skip the non-MAS darwin pack only when there are exclusively MAS
    // targets (hasMas=true, targets.length=1). DIR_TARGET passes targets=[] to pack() because
    // MacPackager.createTargets() doesn't call mapper() for it, so hasMas=false and doPack still runs.
    return !targets.some(it => MacTargetHelper.isMasTarget(it.name)) || targets.length > 1
  }

  get defaultTarget(): Array<string> {
    return this.info.framework.macOsDefaultTargets
  }

  /**
   * Get the merged configuration for a specific platform type. Calls statically known to be a MAS
   * flavor (`mas` / `mas-dev`) get a `MasConfiguration` back, so no cast is needed downstream.
   */
  getPlatformConfig(platformType: MasPlatformType): PlatformConfig<MasConfiguration>
  getPlatformConfig(platformType: PlatformType): PlatformConfig
  getPlatformConfig(platformType: PlatformType): PlatformConfig {
    let config: MacConfiguration | MasConfiguration
    let platformName: ElectronPlatformName

    switch (platformType) {
      case "mas":
        config = mergeMasConfig(this.platformSpecificBuildOptions, this.config.mas)
        platformName = "mas"
        break

      case "mas-dev":
        // `mas-dev` cascades mac → mas → masDev. The development/distribution distinction is no longer
        // carried as a config field; it is derived from `platformType` wherever signing happens.
        config = mergeMasConfig(this.platformSpecificBuildOptions, this.config.mas, this.config.masDev)
        platformName = "mas"
        break

      case "mac":
      default:
        config = this.platformSpecificBuildOptions
        platformName = this.platform.nodeName as ElectronPlatformName
        break
    }

    return { type: platformType, config, platformName }
  }

  expandArch(pattern: string, arch?: Arch | null): string[] {
    if (arch === Arch.universal) {
      // Universal build has `app-x64.asar.unpacked` & `app-arm64.asar.unpacked`
      return [doExpandMacro(pattern, Arch[Arch.arm64], this.appInfo, {}, false), doExpandMacro(pattern, Arch[Arch.x64], this.appInfo, {}, false)]
    }
    // Every other build keeps the name as `app.asar.unpacked`
    return [doExpandMacro(pattern, null, this.appInfo, {}, false)]
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected prepareAppInfo(appInfo: AppInfo): AppInfo {
    const macAppInfo = new AppInfo(this.info, this.platformSpecificBuildOptions.bundleVersion, this.platformSpecificBuildOptions)
    // Electron discovers its helper apps via `${CFBundleName} Helper.app`. We use the product name
    // verbatim for `CFBundleName` and for the on-disk helper/app bundle names, so a name that
    // filename sanitization would change must be rejected (otherwise the two would diverge and break
    // helper discovery). Fail fast during setup.
    assertSafeHelperName(macAppInfo.productName, "productName")
    const executableName = this.platformSpecificBuildOptions.executableName ?? this.info.config.executableName
    if (executableName != null) {
      assertSafeHelperName(executableName, "executableName")
    }
    return macAppInfo
  }

  async getIconPath(): Promise<string | null> {
    return this._iconPath.value
  }

  createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void): void {
    for (const name of targets) {
      switch (name) {
        case DIR_TARGET:
          break

        case "dmg": {
          mapper(name, outDir => {
            const { DmgTarget } = _require("dmg-builder")
            return new DmgTarget(this, outDir)
          })
          break
        }

        case "zip":
          // https://github.com/electron-userland/electron-builder/issues/2313
          mapper(name, outDir => new ArchiveTarget(name, outDir, this, true))
          break

        case "pkg":
          mapper(name, outDir => new PkgTarget(this, outDir))
          break

        default:
          mapper(name, outDir => (MacTargetHelper.isMasTarget(name) ? new NoOpTarget(name) : createCommonTarget(name, outDir, this)))
          break
      }
    }
  }

  protected async doPack(config: DoPackOptions<MacConfiguration>): Promise<any> {
    if (config.arch === Arch.universal) {
      return this.doUniversalPack(config)
    }
    return await super.doPack(config)
  }

  /**
   * Handle universal build packing
   */
  private async doUniversalPack(config: DoPackOptions<MacConfiguration>): Promise<void> {
    const { outDir, appOutDir, platformName, platformType, arch, platformSpecificBuildOptions, targets } = config

    const outDirName = (arch: Arch) => `${appOutDir}-${Arch[arch]}-temp`
    const options = {
      ...config,
      options: {
        sign: false,
        disableAsarIntegrity: true,
        disableFuses: true,
        // Keep both slices symmetric: don't drop platform-mismatched modules per-arch (that asymmetry breaks
        // the universal merge). Single-arch binaries are reconciled below via `computeSingleArchFiles`.
        disableArchFilter: true,
      },
    }

    const x64Arch = Arch.x64
    const x64AppOutDir = outDirName(x64Arch)
    await super.doPack({ ...options, appOutDir: x64AppOutDir, arch: x64Arch })

    if (this.info.cancellationToken.cancelled) {
      return
    }

    const arm64Arch = Arch.arm64
    const arm64AppOutPath = outDirName(arm64Arch)
    await super.doPack({ ...options, appOutDir: arm64AppOutPath, arch: arm64Arch })

    if (this.info.cancellationToken.cancelled) {
      return
    }

    const framework = this.info.framework
    log.info(
      {
        platform: platformName,
        arch: Arch[arch],
        [`${framework.name}`]: framework.version,
        appOutDir: log.filePath(appOutDir),
      },
      `packaging`
    )
    const appFile = `${this.appInfo.productFilename}.app`

    // Make sure the Assets.car file is the same for both architectures
    const safeX64AppOutDir = sanitizeDirPath(x64AppOutDir)
    const safeArm64AppOutPath = sanitizeDirPath(arm64AppOutPath)
    const safeAppOutDir = sanitizeDirPath(appOutDir)

    const sourceCatalogPath = path.join(safeX64AppOutDir, appFile, "Contents/Resources/Assets.car")
    if (await exists(sourceCatalogPath)) {
      const targetCatalogPath = path.join(safeArm64AppOutPath, appFile, "Contents/Resources/Assets.car")
      await fs.copyFile(sourceCatalogPath, targetCatalogPath)
    }

    const universalOpts = platformSpecificBuildOptions.universal

    // Single-arch binaries that can't be merged into a universal Mach-O. Two sources:
    //  1. `cpu`/`os`-declared platform packages (e.g. `@esbuild/darwin-arm64`), which the collection filter
    //     confines to their native slice — mark the whole package so unique non-binary siblings don't trip the merge.
    //  2. Host binaries identical in both slices inside packages that declare no `cpu`/`os` (e.g. esbuild's
    //     install script overwriting `esbuild/bin/esbuild` with the platform binary) — mark the file.
    // Both are reported to `@electron/universal` via `singleArchFiles`; otherwise it aborts on the arch mismatch.
    const singleArchFiles = await this.computeSingleArchFiles(
      path.join(safeX64AppOutDir, appFile),
      path.join(safeArm64AppOutPath, appFile),
      universalOpts?.singleArchFiles ?? undefined
    )

    await makeUniversalApp({
      mergeASARs: true, // preserve electron-builder v2 default; user can override via mac.universal.mergeASARs
      ...universalOpts,
      singleArchFiles,
      x64AppPath: path.join(safeX64AppOutDir, appFile),
      arm64AppPath: path.join(safeArm64AppOutPath, appFile),
      outAppPath: path.join(safeAppOutDir, appFile),
      force: true,
    })
    await fs.rm(x64AppOutDir, { recursive: true, force: true })
    await fs.rm(arm64AppOutPath, { recursive: true, force: true })

    // Give users a final opportunity to perform things on the combined universal package before signing
    const packContext: AfterPackContext = {
      appOutDir,
      outDir,
      arch,
      targets,
      packager: this,
      electronPlatformName: platformName,
    }
    await this.info.emitAfterPack(packContext)

    if (this.info.cancellationToken.cancelled) {
      return
    }

    await this.doAddAsarIntegrityDigest(packContext, platformSpecificBuildOptions, await this.computeAsarOptions(platformSpecificBuildOptions))
    await this.doAddElectronFuses(packContext)

    // Mirror the base-class guard: skip signing when the caller explicitly set sign:false
    // (e.g. packMasTargets passes sign:false so that its own sign() call is the sole signing step).
    if (config.options?.sign ?? true) {
      await this.doSignAfterPack(outDir, appOutDir, platformName, platformType, arch, platformSpecificBuildOptions, targets)
    }
  }

  /**
   * Embeds the ASAR integrity digest into the Electron Framework, see `mac.asarIntegrityDigest`. A universal app gets it after the slices are merged: they
   * have no `ElectronAsarIntegrity` entries, and re-signing the framework of a slice would make the slices differ in a way `@electron/universal` rejects.
   */
  protected async doAddAsarIntegrityDigest(
    packContext: AfterPackContext,
    platformSpecificBuildOptions: MacConfiguration | MasConfiguration,
    asarOptions: AsarOptions | null
  ): Promise<void> {
    // nothing to protect without the entries electron-builder computes: a stock Electron Info.plist still lists the removed default_app.asar
    if (asarOptions == null || asarOptions.disableIntegrity) {
      return
    }
    if (platformSpecificBuildOptions.asarIntegrityDigest === false) {
      log.info({ reason: "asarIntegrityDigest is set to false" }, "skipped ASAR integrity digest")
      return
    }
    const electronVersion = semver.coerce(this.info.framework.version)
    if (electronVersion == null || semver.major(electronVersion) < FIRST_ELECTRON_MAJOR_WITH_ASAR_INTEGRITY_DIGEST) {
      return
    }
    if (process.platform !== "darwin") {
      log.warn({ reason: "supported only on macOS, where codesign can sign the modified Electron Framework again" }, "skipped ASAR integrity digest")
      return
    }
    const frameworkName = `${path.basename(this.info.framework.distMacOsAppName, ".app")} Framework`
    const embedded = await embedAsarIntegrityDigest(path.join(packContext.appOutDir, `${this.appInfo.productFilename}.app`), frameworkName)
    // an afterPack hook that signs the app or changes it in ways the digest must not cover is where this change bites
    if (embedded && this.info.filterPackagerEventListeners("afterPack", "user").length > 0) {
      log
        .once("asar-integrity-digest-after-afterpack")
        .warn(
          { solution: "set mac.asarIntegrityDigest to false if your afterPack hook signs the app" },
          "electron-builder v27 embeds the ASAR integrity digest into the Electron Framework after the afterPack hook and signs the framework again ad hoc, replacing a signature applied in afterPack. " +
            "Changing app.asar or Info.plist after afterPack now fails the app at launch when the enableEmbeddedAsarIntegrityValidation fuse is on. " +
            "See https://www.electron.build/docs/migration/v27-runtime-changes#macos-asar-integrity-digest"
        )
    }
  }

  /**
   * Builds the `singleArchFiles` glob passed to `@electron/universal` by scanning both packed slices for
   * single-architecture binaries that can't be lipo-merged. Merges any user-provided `mac.universal.singleArchFiles`.
   */
  private async computeSingleArchFiles(x64AppPath: string, arm64AppPath: string, userPattern: string | undefined): Promise<string | undefined> {
    const unpacked = (appPath: string) => path.join(appPath, "Contents", "Resources", "app.asar.unpacked")
    const x64Unpacked = unpacked(x64AppPath)
    const arm64Unpacked = unpacked(arm64AppPath)

    // (1) `cpu`/`os`-declared platform packages confined to one slice — mark the whole package.
    const packageNames = new Set<string>()
    await collectSingleArchPackageNames(path.join(x64Unpacked, "node_modules"), packageNames)
    await collectSingleArchPackageNames(path.join(arm64Unpacked, "node_modules"), packageNames)

    // (2) undeclared host binaries identical in both slices (e.g. `esbuild/bin/esbuild`) — mark the file.
    const machOFiles = await collectIdenticalSingleArchMachOFiles(x64Unpacked, arm64Unpacked)

    const patterns = [...Array.from(packageNames).map(name => `**/${name}/**`), ...machOFiles]
    if (patterns.length === 0) {
      return userPattern
    }

    log.warn(
      { packages: Array.from(packageNames).sort().join(", ") || "(none)", files: machOFiles.sort().join(", ") || "(none)" },
      "Universal build contains single-architecture binaries; they are copied as-is per slice (not lipo-merged), so each is only usable on architectures whose platform package was installed on this build host. " +
        "If these are build-only tools (e.g. esbuild), move them to `devDependencies` or exclude them via `files` to omit them entirely. " +
        "If they are needed at runtime, install every target architecture's variant so the universal app works on both Intel and Apple Silicon (pnpm/yarn: `supportedArchitectures`; npm: `--cpu`/`--os`)."
    )
    return buildSingleArchFilesPattern(patterns, userPattern)
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, taskManager: AsyncTaskManager): Promise<void> {
    const masTargets = targets.filter(it => MacTargetHelper.isMasTarget(it.name))
    const nonMasTargets = targets.filter(it => !MacTargetHelper.isMasTarget(it.name))
    const prepackaged = this.packagerOptions.prepackaged

    // mas always first
    await this.packMasTargets(outDir, arch, masTargets, prepackaged)

    if (MacPackager.packsNonMasApp(targets)) {
      await this.packMacTargets(outDir, arch, nonMasTargets, prepackaged, taskManager)
    }
  }

  private async packMasTargets(outDir: string, arch: Arch, targets: Array<Target>, prepackaged: string | null | undefined): Promise<void> {
    const resolvedOutDir = path.resolve(outDir)
    MacTargetHelper.assertSafePathForCommandUsage(resolvedOutDir, "output directory")

    for (const target of targets) {
      const platformType = MacTargetHelper.getPlatformTypeFromTarget(target.name)
      const platformConfig = this.getPlatformConfig(platformType)
      const targetOutDir = path.resolve(resolvedOutDir, `${target.name}${getArchSuffix(arch, this.platformSpecificBuildOptions.defaultArch)}`)
      MacTargetHelper.assertSafePathForCommandUsage(targetOutDir, "target output directory")

      const relativeTargetOutDir = path.relative(resolvedOutDir, targetOutDir)
      if (relativeTargetOutDir.startsWith("..") || path.isAbsolute(relativeTargetOutDir)) {
        throw new InvalidConfigurationError(`Invalid target output directory: ${targetOutDir}`)
      }

      let appPath: string = path.join(targetOutDir, `${this.appInfo.productFilename}.app`)
      if (prepackaged != null) {
        appPath = prepackaged
      } else {
        await this.doPack({
          outDir: resolvedOutDir,
          appOutDir: targetOutDir,
          platformName: platformConfig.platformName,
          platformType: platformConfig.type,
          arch,
          platformSpecificBuildOptions: platformConfig.config,
          targets: [target],
          options: { sign: false },
        })
        MacTargetHelper.assertSafePathForCommandUsage(this.appInfo.productFilename, "product filename")
      }
      const signResult = await this.sign(appPath, arch, platformType)
      const signed = isSignResultSigned(signResult)

      // The MAS flow packs with sign:false and signs here, bypassing doSignAfterPack — the only other
      // emitAfterSign site. Mirror its contract: fire afterSign after codesigning succeeded, but before
      // the .pkg installer is built, and warn when signing was skipped (#9997).
      const packContext: AfterPackContext = {
        appOutDir: path.dirname(appPath),
        outDir: resolvedOutDir,
        arch,
        targets: [target],
        packager: this,
        electronPlatformName: platformConfig.platformName,
      }
      if (signed) {
        await this.info.emitAfterSign(packContext)
      } else if (this.info.filterPackagerEventListeners("afterSign", "user").length) {
        log.warn(null, `skipping "afterSign" hook as no signing occurred, perhaps you intended "afterPack"?`)
      }

      // test-only early exit (see PackagerOptions.afterPackTestHook); a no-op unless the option is set
      if (await this.info.shouldSkipTargetsAfterPack(packContext)) {
        continue
      }

      // A development-signed build (mas-dev, or an explicit sign.type "development" — see
      // MacTargetHelper.shouldCreateMasInstaller) produces no installer
      const masSignConfig = platformConfig.config.sign
      const masSignOpts = isElectronSignOptions(masSignConfig) ? masSignConfig : undefined
      if (signed && MacTargetHelper.shouldCreateMasInstaller(platformType, masSignOpts?.type)) {
        await this.createMasInstaller(appPath, targetOutDir, arch, platformType)
      }
    }
  }

  private async packMacTargets(outDir: string, arch: Arch, targets: Array<Target>, prepackaged: string | null | undefined, taskManager: AsyncTaskManager): Promise<void> {
    const appPath = prepackaged == null ? path.join(this.computeAppOutDir(outDir, arch), `${path.basename(this.appInfo.productFilename)}.app`) : prepackaged

    if (prepackaged == null) {
      const platformConfig = this.getPlatformConfig("mac")
      await this.doPack({
        outDir,
        appOutDir: path.dirname(appPath),
        platformName: platformConfig.platformName,
        platformType: platformConfig.type,
        arch,
        platformSpecificBuildOptions: platformConfig.config,
        targets,
      })
    } else if (this.forceCodeSigning) {
      await this.verifyPrepackagedApp(appPath)
    }

    // test-only early exit (see PackagerOptions.afterPackTestHook); a no-op unless the option is set
    if (
      await this.info.shouldSkipTargetsAfterPack({
        appOutDir: path.dirname(appPath),
        outDir,
        arch,
        targets,
        packager: this,
        electronPlatformName: this.platform.nodeName,
      })
    ) {
      return
    }

    this.packageInDistributableFormat(appPath, arch, targets, taskManager)
  }

  /**
   * electron-builder neither signs nor notarizes a prepackaged app, so under forceCodeSigning the app it packages must
   * already carry a valid signature - and a stapled notarization ticket, unless `mac.notarize` is false.
   */
  private async verifyPrepackagedApp(appPath: string): Promise<void> {
    const unavailable = macSigningUnavailableError(`the prepackaged app ${log.filePath(appPath)}`, forceCodeSigningOverrideHint(this))
    if (unavailable != null) {
      throw unavailable
    }
    const signConfig = this.platformSpecificBuildOptions.sign
    const problem = await verifyMacCodeSignature(appPath, { deep: true, strict: isElectronSignOptions(signConfig) ? signConfig.strictVerify : undefined })
    if (problem != null) {
      throw forceCodeSigningError(
        `forceCodeSigning is enabled, but the prepackaged app ${log.filePath(appPath)} has no valid code signature (codesign --verify --deep: ${problem}). ` +
          "electron-builder does not sign a prepackaged app: sign it before packaging it.",
        VERIFICATION_FAILED_ERROR_CODE
      )
    }
    if (this.platformSpecificBuildOptions.notarize === false) {
      log.warn(
        { file: log.filePath(appPath), reason: "`notarize` is set to false" },
        "the notarization of the prepackaged app is not verified although forceCodeSigning is enabled"
      )
      return
    }
    const ticketProblem = await validateStapledTicket(appPath)
    if (ticketProblem != null) {
      throw forceCodeSigningError(
        `forceCodeSigning is enabled, but the prepackaged app ${log.filePath(appPath)} has no valid stapled notarization ticket (stapler validate: ${ticketProblem}). ` +
          "Notarize and staple it before packaging it, or set mac.notarize: false.",
        VERIFICATION_FAILED_ERROR_CODE
      )
    }
  }

  /**
   * Creates the signed MAS installer .pkg for an already codesigned app. Kept separate from `sign()`
   * so that the `afterSign` hook can run between codesigning and installer creation (see `packMasTargets`).
   */
  protected async createMasInstaller(appPath: string, outDir: string, arch: Arch, targetPlatform: MasPlatformType): Promise<void> {
    const config = this.getPlatformConfig(targetPlatform).config
    const signConfig = config.sign
    const signOpts = isElectronSignOptions(signConfig) ? signConfig : undefined
    const keychainFile = (await this.codeSigningInfo.value).keychainFile
    await this.helper.createMasInstaller(appPath, outDir, config, keychainFile, targetPlatform, arch, signOpts?.identity)
  }

  /**
   * Main signing method with platform awareness. Protected so tests can stub signing
   * (`isSignAllowed()` short-circuits it on non-mac hosts). Failures are thrown, never returned.
   */
  protected async sign(appPath: string, arch: Arch, targetPlatform: PlatformType): Promise<SigningResult> {
    const forceCodeSigning = this.forceCodeSigningFor(targetPlatform)
    if (forceCodeSigning) {
      // checked before isSignAllowed, which would log that signing is skipped right before this fails the build
      const unavailable = macSigningUnavailableError(`the ${targetPlatform} app ${log.filePath(appPath)}`, this.forceCodeSigningOverrideHintFor(targetPlatform))
      if (unavailable != null) {
        throw unavailable
      }
    }
    if (!isSignAllowed()) {
      // non-mac host, or the pull-request CI guard — signing cannot happen in this environment
      return "skipped:unsupported"
    }

    // getPlatformConfig cascades mac → mas → masDev, so `sign` (and `sign.identity`) is already merged for this flavor.
    const config = this.getPlatformConfig(targetPlatform).config.sign

    // sign: null → user explicitly disabled signing
    if (config === null) {
      return this.helper.handleNullIdentity(targetPlatform)
    }

    const signOpts = isElectronSignOptions(config) ? config : undefined
    // sign.identity: null → explicit skip; undefined → auto-discover
    const qualifier = signOpts?.identity
    if (qualifier === null) {
      return this.helper.handleNullIdentity(targetPlatform)
    }

    const keychainFile = (await this.codeSigningInfo.value).keychainFile
    // `config` is a custom fn/string module path when it's non-null and not an options object
    const hasCustomSign = config != null && !signOpts
    const isMas = MacTargetHelper.isMasTarget(targetPlatform)

    const identity = await this.helper.findSigningIdentity(targetPlatform, qualifier, keychainFile, hasCustomSign, signOpts)

    // A custom signer is called without a keychain identity too (a remote or HSM signer needs none); under forceCodeSigning
    // its output is verified below. @electron/osx-sign needs one, and so does the installer of a MAS app (createMasInstaller), so
    // a MAS app is only signed without one under forceCodeSigning, which fails on the missing installer identity instead.
    if (!identity) {
      if (!hasCustomSign) {
        return "skipped:no-certificate"
      }
      // mas-dev builds no installer, so its custom signer is called without an identity too
      if (!forceCodeSigning && MacTargetHelper.shouldCreateMasInstaller(targetPlatform, undefined)) {
        log.warn(
          { file: log.filePath(appPath), reason: "no keychain identity was found, and the MAS installer needs one" },
          "the custom mac.sign signer is not called for the MAS app, which is left unsigned"
        )
        return "skipped:no-certificate"
      }
      log.info({ file: log.filePath(appPath), reason: "no keychain identity was found" }, "calling the custom mac.sign signer without an identity")
    }

    if (!isMacOsHighSierra()) {
      throw new InvalidConfigurationError("macOS High Sierra 10.13.6 is required to sign")
    }

    const signOptions = await this.helper.buildSignOptions(appPath, identity, signOpts, keychainFile, arch, targetPlatform, hasCustomSign)
    await this.doSign(signOptions, config, identity)

    // @electron/osx-sign verifies the signatures it makes; a custom signer replaces it, so its output is checked here
    if (hasCustomSign && forceCodeSigning) {
      const problem = await verifyMacCodeSignature(appPath, { deep: true })
      if (problem != null) {
        throw forceCodeSigningError(
          `forceCodeSigning is enabled, but the custom mac.sign signer left ${log.filePath(appPath)} without a valid code signature (codesign --verify --deep --strict: ${problem}). ` +
            "The signer must sign the app at configuration.app in place.",
          VERIFICATION_FAILED_ERROR_CODE
        )
      }
    }

    // now that everything is signed, flag binaries that still carry a foreign (or missing) signature and would
    // fail library validation at launch — the case the old blanket entitlements default used to mask
    if (!hasCustomSign) {
      await this.helper.warnAboutForeignSignedBinaries(appPath, identity, targetPlatform, signOpts)
    }

    // Handle notarization for non-MAS builds
    if (!isMas) {
      await this.helper.notarizeIfProvided(appPath)
    }

    return hasCustomSign ? "signed:custom" : "signed"
  }

  //noinspection JSMethodCanBeStatic
  protected async doSign(opts: SignOptions, signConfig: MacConfiguration["sign"], identity: Identity | null): Promise<void> {
    // Resolve a custom signer only when signConfig is a function or string module path.
    // ElectronSignOptions objects and undefined use @electron/osx-sign directly.
    const customSign =
      signConfig == null || isElectronSignOptions(signConfig) ? null : await resolveFunction(this.appInfo.type, signConfig, "sign", await this.info.getWorkspaceRoot())

    const { app, platform, type, provisioningProfile } = opts
    log.info(
      {
        file: log.filePath(app),
        platform,
        type,
        identityName: identity?.name || "none",
        identityHash: identity?.hash || "none",
        provisioningProfile: provisioningProfile || "none",
      },
      customSign ? "executing custom sign" : "signing"
    )

    // `opts.identity` is resolved once, in MacTargetHelper.resolveSignIdentity — never re-derive it here, or a
    // custom signer and @electron/osx-sign end up signing with different forms of the same certificate
    return customSign ? Promise.resolve(customSign(opts, this)) : sign(opts)
  }

  //noinspection JSMethodCanBeStatic
  public async doFlat(appPath: string, outFile: string, identity: Identity, keychain: string | Nullish): Promise<any> {
    const safeAppPath = sanitizeDirPath(appPath)
    const safeOutFile = sanitizeDirPath(outFile)
    // productbuild doesn't created directory for out file
    await mkdir(path.dirname(safeOutFile), { recursive: true })

    const args = prepareProductBuildArgs(identity, keychain)
    args.push("--component", safeAppPath, "/Applications")
    args.push(safeOutFile)
    return await exec(Executables.resolve("productbuild"), args)
  }

  public getElectronSrcDir(dist: string) {
    return path.resolve(this.projectDir, dist, this.info.framework.distMacOsAppName)
  }

  public getElectronDestinationDir(appOutDir: string) {
    return path.join(appOutDir, this.info.framework.distMacOsAppName)
  }

  // todo fileAssociations
  async applyCommonInfo(appPlist: any, contentsPath: string, cascadedOptions: MacConfiguration | MasConfiguration): Promise<void> {
    const appInfo = this.appInfo
    const appFilename = appInfo.productFilename

    // https://github.com/electron-userland/electron-builder/issues/1278
    appPlist.CFBundleExecutable = appFilename.endsWith(" Helper") ? appFilename.substring(0, appFilename.length - " Helper".length) : appFilename

    const resourcesPath = path.join(contentsPath, "Resources")

    // Support both legacy `.icns` and modern `.icon` (Icon Composer) inputs via `mac.icon`.
    // Prefer `.icon` if provided; still accept `.icns`.
    const configuredIcon = this.platformSpecificBuildOptions.icon
    const isIconComposer = typeof configuredIcon === "string" && configuredIcon.toLowerCase().endsWith(".icon")

    // Set the app name. The product name is used verbatim (it is validated in `prepareAppInfo` to
    // require no filename sanitization), so `CFBundleName` matches the on-disk helper bundle names
    // that Electron resolves as `${CFBundleName} Helper.app`.
    appPlist.CFBundleName = appInfo.productName
    appPlist.CFBundleDisplayName = appInfo.productName

    // Bundle legacy `icns` format - this should also run when `.icon` is provided
    const setIcnsFile = async (iconPath: string) => {
      const oldIcon = appPlist.CFBundleIconFile
      if (oldIcon != null) {
        await unlinkIfExists(path.join(resourcesPath, oldIcon))
      }
      const iconFileName = "icon.icns"
      appPlist.CFBundleIconFile = iconFileName
      await copyFile(iconPath, path.join(resourcesPath, iconFileName))
    }

    const icnsFilePath = await this.getIconPath()
    if (icnsFilePath != null) {
      await setIcnsFile(icnsFilePath)
    }

    // Bundle new `icon` format
    if (isIconComposer && configuredIcon) {
      const iconComposerPath = await this.getResource(configuredIcon)
      if (iconComposerPath) {
        const { assetCatalog } = await this.generateAssetCatalogData(iconComposerPath)

        // Create and setup the asset catalog
        appPlist.CFBundleIconName = "Icon"
        await fs.writeFile(path.join(resourcesPath, "Assets.car"), assetCatalog)
      }
    }

    const minimumSystemVersion = this.platformSpecificBuildOptions.minimumSystemVersion
    if (minimumSystemVersion != null) {
      appPlist.LSMinimumSystemVersion = minimumSystemVersion
    }

    // const activeOpts = this.getPlatformConfig(distType).config
    appPlist.CFBundleShortVersionString = cascadedOptions.bundleShortVersion || appInfo.version
    appPlist.CFBundleVersion = cascadedOptions.bundleVersion || appInfo.buildVersion

    use(this.platformSpecificBuildOptions.category || (this.config as any).category, it => (appPlist.LSApplicationCategoryType = it))
    appPlist.NSHumanReadableCopyright = appInfo.copyright

    if (this.platformSpecificBuildOptions.darkModeSupport) {
      appPlist.NSRequiresAquaSystemAppearance = false
    }

    const extendInfo = this.platformSpecificBuildOptions.extendInfo
    if (extendInfo != null) {
      deepAssign(appPlist, extendInfo)
    }
    for (const [k, v] of Object.entries(appPlist)) {
      if (v === null || v === undefined) {
        delete appPlist[k]
      }
    }
  }

  protected async signApp(packContext: AfterPackContext, isAsar: boolean, platformType?: PlatformType): Promise<SigningResult> {
    const targetPlatform: PlatformType = platformType ?? (packContext.electronPlatformName === "mas" ? "mas" : "mac")
    const readDirectoryAndSign = async (sourceDirectory: string, directories: string[], shouldSign: (file: string) => boolean): Promise<Array<SigningResult>> => {
      const normalizedSourceDirectory = path.resolve(sourceDirectory)
      MacTargetHelper.assertSafePathForCommandUsage(normalizedSourceDirectory, "application output directory")
      return await Promise.all(
        directories
          .filter(file => shouldSign(file))
          .map(async (file: string) => {
            const entryName = path.basename(file)
            if (file !== entryName) {
              throw new InvalidConfigurationError(`Invalid entry name in source directory: ${file}`)
            }
            const signTarget = path.resolve(normalizedSourceDirectory, entryName)
            const safeSignTarget = sanitizeDirPath(signTarget, normalizedSourceDirectory)
            return await this.sign(safeSignTarget, packContext.arch, targetPlatform)
          })
      )
    }

    const appFileName = `${this.appInfo.productFilename}.app`
    // the combined result gates the `afterSign` hook — a signed result wins (see PlatformPackager.doSignAfterPack)
    const results = await readDirectoryAndSign(packContext.appOutDir, await readdir(packContext.appOutDir), file => file === appFileName)
    if (!isAsar) {
      return combineSignResults(results)
    }

    const outResourcesDir = path.join(packContext.appOutDir, "resources", "app.asar.unpacked")
    results.push(...(await readDirectoryAndSign(outResourcesDir, await orIfFileNotExist(readdir(outResourcesDir), []), file => file.endsWith(".app"))))

    return combineSignResults(results)
  }
}
