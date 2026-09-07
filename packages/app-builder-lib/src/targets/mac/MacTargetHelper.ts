import { notarize, type NotarizeOptions, type NotaryToolKeychainCredentials } from "@electron/notarize"
import type { PerFileSignOptions, SigningDistributionType, SignOptions } from "@electron/osx-sign"
import { Arch, InvalidConfigurationError, log, spawnAndWriteWithOutput, statOrNull, walk } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { open, type FileHandle } from "fs/promises"
import * as path from "path"
import { CertType, findIdentity, Identity, reportError } from "../../codeSign/mac/macCodeSign.js"
import { SigningResult } from "../../codeSign/signResult.js"
import type { MacPackager } from "../../macPackager.js"
import { ElectronSignOptions, MasConfiguration } from "../../options/macOptions.js"
import { parsePlistFile, PlistObject } from "../../util/mac/plist.js"
import { getTemplatePath } from "../../util/pathManager.js"

export type MasPlatformType = "mas" | "mas-dev"
export type PlatformType = MasPlatformType | "mac"

const DISABLE_LIBRARY_VALIDATION = "com.apple.security.cs.disable-library-validation"

// e.g. "Developer ID Application: Example Inc. (A1B2C3D4E5)"
const TEAM_ID_IN_IDENTITY_NAME = /\(([A-Z0-9]{10})\)\s*$/

export class MacTargetHelper {
  constructor(private packager: MacPackager) {}

  /** Ad-hoc signing (`sign.identity: "-"`) produces a signature with no Team ID. */
  static isAdHocIdentity(identity: Identity | Nullish): boolean {
    return identity?.name === "-"
  }

  /** The Team ID embedded in a signing identity's common name, or `null` for ad-hoc/unnamed identities. */
  static getTeamIdFromIdentity(identity: Identity | Nullish): string | null {
    return (identity?.name && TEAM_ID_IN_IDENTITY_NAME.exec(identity.name)?.[1]) || null
  }

  handleNullIdentity(): SigningResult {
    if (this.packager.forceCodeSigning) {
      throw new InvalidConfigurationError("identity explicitly is set to null, but forceCodeSigning is set to true")
    }
    log.info({ reason: "identity explicitly is set to null" }, "skipped macOS code signing")
    return "skipped:disabled"
  }

  async findSigningIdentity(
    targetPlatform: PlatformType,
    qualifier: string | undefined,
    keychainFile: string | Nullish,
    hasCustomSign: boolean,
    signOpts: ElectronSignOptions | null | undefined
  ): Promise<Identity | null> {
    const isMas = MacTargetHelper.isMasTarget(targetPlatform)
    const certificateTypes = MacTargetHelper.getCertificateTypes(targetPlatform, MacTargetHelper.resolveSigningType(targetPlatform, signOpts?.type))

    let identity: Identity | null = null
    for (const certificateType of certificateTypes) {
      identity = await findIdentity(certificateType, qualifier, keychainFile)
      if (identity != null) {
        break
      }
    }

    if (identity == null) {
      const noIdentity = !hasCustomSign
      if (qualifier === "-") {
        if (MacTargetHelper.isHardenedRuntimeEnabledForSigning(targetPlatform, signOpts?.hardenedRuntime) && !(await this.isLibraryValidationDisabled(targetPlatform, signOpts))) {
          log.warn(
            null,
            `ad-hoc signing with hardenedRuntime enabled requires the ${DISABLE_LIBRARY_VALIDATION} entitlement ` +
              "to prevent app launch failures due to library validation, but your entitlements file does not grant it. " +
              "See https://electron.build/docs/features/code-signing for details."
          )
        }
        identity = new Identity("-", undefined)
      } else if (noIdentity) {
        await reportError(isMas, certificateTypes, qualifier, keychainFile, this.packager.forceCodeSigning)
        return null
      }
    }

    return identity
  }

  /**
   * Resolves the app entitlements file for an ad-hoc build — same precedence as `getAppEntitlements()` — and
   * returns whether it grants `com.apple.security.cs.disable-library-validation`.
   * Fails open: returns false (so callers still warn) when the file cannot be read or parsed.
   */
  async isLibraryValidationDisabled(targetPlatform: PlatformType, signOpts: ElectronSignOptions | Nullish): Promise<boolean> {
    return this.grantsDisableLibraryValidation(await this.getAppEntitlements(targetPlatform, signOpts, true /* adHoc */))
  }

  private async grantsDisableLibraryValidation(file: string | null): Promise<boolean> {
    if (file == null) {
      // no user-supplied file and no bundled default — @electron/osx-sign's defaults never grant the key
      return false
    }
    try {
      const entitlements = await parsePlistFile<PlistObject>(file)
      return entitlements[DISABLE_LIBRARY_VALIDATION] === true
    } catch (e: any) {
      log.debug({ file, error: e.message }, "cannot read entitlements to verify library validation")
      return false
    }
  }

  /**
   * Resolves the entitlements file for the app bundle itself.
   *
   * Precedence: explicit `sign.entitlements` → `build/entitlements.{mac,mas}.plist` → a bundled default.
   * Returns `null` when no default applies, which lets `@electron/osx-sign` fall back to its own
   * Chromium-derived defaults (`default.mas.plist` for MAS).
   */
  async getAppEntitlements(targetPlatform: PlatformType, signOpts: ElectronSignOptions | Nullish, adHoc: boolean): Promise<string | null> {
    if (signOpts?.entitlements) {
      return signOpts.entitlements
    }
    const isMas = MacTargetHelper.isMasTarget(targetPlatform)
    const p = `entitlements.${isMas ? "mas" : "mac"}.plist`
    if ((await this.packager.resourceList).includes(p)) {
      return path.join(this.packager.buildResourcesDir, p)
    }
    if (isMas) {
      // @electron/osx-sign's default.mas.plist enables the App Sandbox, which a MAS build cannot ship without
      return null
    }
    return getTemplatePath(adHoc ? "entitlements.mac.adhoc.plist" : "entitlements.mac.plist")
  }

  /**
   * Resolves the entitlements file for the nested binaries (helpers, frameworks, unpacked executables) that
   * inherit the app's signature.
   *
   * Precedence: explicit `sign.entitlementsInherit` → `build/entitlements.{mac,mas}.inherit.plist` → `null`,
   * which hands the file to `@electron/osx-sign`'s per-file defaults. Those mirror Chromium's own entitlements
   * (renderer and GPU helpers get only `allow-jit`; the plugin helper gets the looser exceptions it needs), so
   * they are strictly tighter than applying one blanket plist to every binary.
   */
  async getInheritEntitlements(targetPlatform: PlatformType, signOpts: ElectronSignOptions | Nullish, adHoc: boolean): Promise<string | null> {
    if (signOpts?.entitlementsInherit) {
      return signOpts.entitlementsInherit
    }
    const isMas = MacTargetHelper.isMasTarget(targetPlatform)
    const p = `entitlements.${isMas ? "mas" : "mac"}.inherit.plist`
    if ((await this.packager.resourceList).includes(p)) {
      return path.join(this.packager.buildResourcesDir, p)
    }
    // an ad-hoc signature has no Team ID, so every process in the bundle — not just the main one — needs
    // library validation disabled or it cannot load the Electron framework
    return adHoc && !isMas ? getTemplatePath("entitlements.mac.adhoc.plist") : null
  }

  async buildSignOptions(
    appPath: string,
    identity: Identity,
    config: ElectronSignOptions | null | undefined,
    keychainFile: string | Nullish,
    arch: Arch,
    targetPlatform: PlatformType
  ): Promise<SignOptions> {
    const isMas = MacTargetHelper.isMasTarget(targetPlatform)
    const type = MacTargetHelper.resolveSigningType(targetPlatform, config?.type)

    let binaries = config?.binaries || undefined
    if (binaries) {
      // Accept absolute paths for external binaries, else resolve relative paths from the artifact's app Contents path.
      binaries = (
        await Promise.all(
          binaries.flatMap(async destination => {
            const expandedDestination = this.packager.expandArch(destination, arch)
            return await Promise.all(
              expandedDestination.map(async d => {
                if (await statOrNull(d)) {
                  return d
                }
                return path.resolve(appPath, d)
              })
            )
          })
        )
      ).flat()
      log.info({ binaries, arch: arch == null ? null : Arch[arch] }, "signing additional user-defined binaries for arch")
    }

    let filter = config?.ignore
    if (Array.isArray(filter)) {
      if (filter.length == 0) {
        filter = undefined
      }
    } else if (typeof filter === "string") {
      filter = filter.length === 0 ? undefined : [filter]
    }

    const filterRe =
      typeof filter === "function"
        ? null
        : filter?.map(it => {
            try {
              return new RegExp(it)
            } catch (e: any) {
              throw new InvalidConfigurationError(`Invalid regex filter pattern: ${it}. ${e.message}`)
            }
          })

    return {
      identityValidation: false,
      // https://github.com/electron-userland/electron-builder/issues/1699
      // kext are signed by the chipset manufacturers. You need a special certificate (only available on request) from Apple to be able to sign kext.
      ignore: (file: string) => {
        if (filterRe != null) {
          for (const regExp of filterRe) {
            if (regExp.test(file)) {
              return true
            }
          }
        }
        if (typeof filter === "function" && filter(file)) {
          return true
        }
        return (
          file.endsWith(".kext") ||
          file.startsWith("/Contents/PlugIns", appPath.length) ||
          file.includes("/node_modules/puppeteer/.local-chromium") ||
          file.includes("/node_modules/playwright-firefox/.local-browsers") ||
          file.includes("/node_modules/playwright/.local-browsers")
        )

        /* Those are browser automating modules, browser (chromium, nightly) cannot be signed
          https://github.com/electron-userland/electron-builder/issues/2010
          https://github.com/electron-userland/electron-builder/issues/5383
          */
      },
      identity: identity ? identity.hash || identity.name : undefined,
      type,
      platform: isMas ? "mas" : "darwin",
      version: this.packager.config.electronVersion || undefined,
      app: appPath,
      keychain: keychainFile || undefined,
      binaries,
      // https://github.com/electron-userland/electron-builder/issues/1480
      strictVerify: config?.strictVerify,
      preAutoEntitlements: config?.preAutoEntitlements,
      optionsForFile: await this.getOptionsForFile(appPath, targetPlatform, config, identity),
      provisioningProfile: config?.provisioningProfile || undefined,
    }
  }

  /**
   * Post-sign diagnostic replacing the blanket `com.apple.security.cs.disable-library-validation` default.
   *
   * Walks the Mach-O binaries under `app.asar.unpacked` and reports the ones this build did not sign with its
   * own Team ID — typically excluded via `sign.ignore`, or fetched at build time already signed by a third
   * party. Under the hardened runtime those fail library validation at launch, which is precisely the failure
   * the old default hid from every user instead of only the affected ones.
   *
   * Best-effort: never fails the build.
   */
  async warnAboutForeignSignedBinaries(appPath: string, identity: Identity | Nullish, targetPlatform: PlatformType, signOpts: ElectronSignOptions | Nullish): Promise<void> {
    if (
      MacTargetHelper.isMasTarget(targetPlatform) ||
      MacTargetHelper.isAdHocIdentity(identity) ||
      !MacTargetHelper.isHardenedRuntimeEnabledForSigning(targetPlatform, signOpts?.hardenedRuntime)
    ) {
      return
    }
    const teamId = MacTargetHelper.getTeamIdFromIdentity(identity)
    if (teamId == null || (await this.grantsDisableLibraryValidation(await this.getAppEntitlements(targetPlatform, signOpts, false)))) {
      // no Team ID to compare against, or the app already opted out of library validation
      return
    }

    const unpackedDir = path.join(appPath, "Contents", "Resources", "app.asar.unpacked")
    if ((await statOrNull(unpackedDir)) == null) {
      return
    }

    try {
      const files = await walk(unpackedDir)
      const foreign: string[] = []
      for (const file of files) {
        if (!(await isMachOFile(file))) {
          continue
        }
        if ((await readSigningTeamId(file)) !== teamId) {
          foreign.push(path.relative(appPath, file))
        }
      }
      if (foreign.length > 0) {
        log.warn(
          { files: foreign.join(", "), teamId },
          `binaries in app.asar.unpacked are unsigned or signed by another team — under the hardened runtime they will fail library validation at launch. ` +
            `Sign them with the same identity, or grant ${DISABLE_LIBRARY_VALIDATION} in your build/entitlements.mac.plist`
        )
      }
    } catch (e: any) {
      log.debug({ error: e.message }, "cannot inspect app.asar.unpacked for foreign-signed binaries")
    }
  }

  async createMasInstaller(
    appPath: string,
    outDir: string,
    masOptions: MasConfiguration,
    keychainFile: string | Nullish,
    targetPlatform: PlatformType,
    arch: Arch,
    identityQualifier?: string | null
  ): Promise<void> {
    const certType = MacTargetHelper.isMasDevelopment(targetPlatform) ? "Mac Developer" : "3rd Party Mac Developer Installer"
    const masInstallerIdentity = await findIdentity(certType, identityQualifier, keychainFile)

    if (masInstallerIdentity == null) {
      throw new InvalidConfigurationError(`Cannot find valid "${certType}" identity to sign MAS installer, please see https://electron.build/docs/features/code-signing`)
    }

    MacTargetHelper.assertSafePathForCommandUsage(outDir, "output directory")

    // mas uploaded to AppStore, so, use "-" instead of space for name
    // path.basename prevents path traversal if a crafted artifactName contains "../../"
    const artifactName = path.basename(this.packager.expandArtifactNamePattern(masOptions, "pkg", arch))
    MacTargetHelper.assertSafePathForCommandUsage(artifactName, "artifact name")
    const artifactPath = path.resolve(outDir, artifactName)
    await this.packager.doFlat(appPath, artifactPath, masInstallerIdentity, keychainFile)
    await this.packager.emitArtifactBuildCompleted({
      file: artifactPath,
      target: null,
      arch: Arch.x64,
      safeArtifactName: this.packager.computeSafeArtifactName(artifactName, "pkg", arch, true, this.packager.platformOptions.defaultArch),
      packager: this.packager,
    })
  }

  async getOptionsForFile(
    appPath: string,
    targetPlatform: PlatformType,
    customSignOptions: ElectronSignOptions | Nullish,
    identity: Identity | Nullish
  ): Promise<(filePath: string) => PerFileSignOptions> {
    const isMas = MacTargetHelper.isMasTarget(targetPlatform)
    const adHoc = MacTargetHelper.isAdHocIdentity(identity)
    const appEntitlements = await this.getAppEntitlements(targetPlatform, customSignOptions, adHoc)
    const inheritEntitlements = await this.getInheritEntitlements(targetPlatform, customSignOptions, adHoc)

    const getEntitlements = (filePath: string) => {
      if (filePath === appPath) {
        return appEntitlements
      }

      if (filePath.includes("Library/LoginItems")) {
        return customSignOptions?.entitlementsLoginHelper
      }

      // `null` leaves the file to @electron/osx-sign's per-file defaults, which are tighter than one blanket plist
      return inheritEntitlements
    }

    const requirements = isMas || customSignOptions?.requirements == null ? undefined : await this.packager.getResource(customSignOptions.requirements)

    return (filePath: string): PerFileSignOptions => {
      const entitlements = getEntitlements(filePath)
      return {
        entitlements: entitlements || undefined,
        hardenedRuntime: MacTargetHelper.isHardenedRuntimeEnabledForSigning(targetPlatform, customSignOptions?.hardenedRuntime) ?? undefined,
        timestamp: customSignOptions?.timestamp || undefined,
        requirements: requirements || undefined,
        additionalArguments: customSignOptions?.additionalArguments || undefined,
      }
    }
  }

  /**
   * The effective signing type: an explicit `sign.type` wins, otherwise derived from the build flavor
   * (`mas-dev` → `development`, otherwise `distribution`).
   */
  static resolveSigningType(targetPlatform: PlatformType, configType: SigningDistributionType | Nullish): SigningDistributionType {
    return configType ?? (MacTargetHelper.isMasDevelopment(targetPlatform) ? "development" : "distribution")
  }

  static getCertificateTypes(targetPlatform: PlatformType, type: SigningDistributionType): CertType[] {
    if (type === "development") {
      return ["Mac Developer", "Apple Development"]
    }
    return MacTargetHelper.isMasTarget(targetPlatform) ? ["Apple Distribution", "3rd Party Mac Developer Application"] : ["Developer ID Application"]
  }

  /**
   * The MAS `.pkg` installer is only built for distribution signing — a development-signed build
   * (`mas-dev`, or an explicit `sign.type: "development"` on a `mas` build) is installed directly.
   */
  static shouldCreateMasInstaller(targetPlatform: PlatformType, configType: SigningDistributionType | Nullish): targetPlatform is MasPlatformType {
    return MacTargetHelper.isMasTarget(targetPlatform) && MacTargetHelper.resolveSigningType(targetPlatform, configType) !== "development"
  }

  static isMasTarget(targetName: string): boolean {
    return targetName === "mas" || targetName === "mas-dev"
  }

  static isMasDevelopment(targetName: string): boolean {
    return targetName === "mas-dev"
  }

  static getPlatformTypeFromTarget(targetName: string): PlatformType {
    // must check for mas-dev first
    if (MacTargetHelper.isMasDevelopment(targetName)) {
      return "mas-dev"
    }
    if (MacTargetHelper.isMasTarget(targetName)) {
      return "mas"
    }
    return "mac"
  }

  /**
   * Returns true when hardened runtime will be active for signing.
   * For non-MAS builds it defaults to on; for MAS it defaults to off.
   */
  static isHardenedRuntimeEnabledForSigning(targetPlatform: PlatformType, hardenedRuntime: boolean | null | undefined): boolean {
    return MacTargetHelper.isMasTarget(targetPlatform) ? hardenedRuntime === true : hardenedRuntime !== false
  }

  static assertSafePathForCommandUsage(pathValue: string, description: string): void {
    if (/[\0\r\n"'`$;&|<>]/.test(pathValue)) {
      throw new InvalidConfigurationError(`Invalid ${description}: contains unsupported shell-special characters`)
    }
  }

  static getNotarizeOptions(appPath: string): NotarizeOptions | undefined {
    const teamId = process.env.APPLE_TEAM_ID
    const appleId = process.env.APPLE_ID
    const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD

    if (appleId || appleIdPassword) {
      if (!appleId) {
        throw new InvalidConfigurationError(`APPLE_ID env var needs to be set`)
      }
      if (!appleIdPassword) {
        throw new InvalidConfigurationError(`APPLE_APP_SPECIFIC_PASSWORD env var needs to be set`)
      }
      if (!teamId) {
        throw new InvalidConfigurationError(`APPLE_TEAM_ID env var needs to be set`)
      }
      return { appPath, appleId, appleIdPassword, teamId }
    }

    const appleApiKey = process.env.APPLE_API_KEY
    const appleApiKeyId = process.env.APPLE_API_KEY_ID
    const appleApiIssuer = process.env.APPLE_API_ISSUER
    if (appleApiKey || appleApiKeyId || appleApiIssuer) {
      if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) {
        throw new InvalidConfigurationError(`Env vars APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER need to be set`)
      }
      return { appPath, appleApiKey, appleApiKeyId, appleApiIssuer }
    }

    const keychain = process.env.APPLE_KEYCHAIN
    const keychainProfile = process.env.APPLE_KEYCHAIN_PROFILE
    if (keychainProfile) {
      let args: NotaryToolKeychainCredentials = { keychainProfile }
      if (keychain) {
        args = { ...args, keychain }
      }
      return { appPath, ...args }
    }

    return undefined
  }

  async notarizeIfProvided(appPath: string): Promise<void> {
    const notarizeOptions = this.packager.platformOptions.notarize
    if (notarizeOptions === false) {
      log.info({ reason: "`notarize` options were set explicitly `false`" }, "skipped macOS notarization")
      return
    }
    const options = MacTargetHelper.getNotarizeOptions(appPath)
    if (!options) {
      log.warn({ reason: "`notarize` options were unable to be generated" }, "skipped macOS notarization")
      return
    }
    await notarize(options)
    log.info(null, "notarization successful")
  }
}

const MACH_O_MAGIC = new Set([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca])

/** Reads the 4-byte magic to tell Mach-O executables/dylibs apart from the scripts and data files alongside them. */
async function isMachOFile(file: string): Promise<boolean> {
  let handle: FileHandle | null = null
  try {
    handle = await open(file, "r")
    const buffer = Buffer.alloc(4)
    const { bytesRead } = await handle.read(buffer, 0, 4, 0)
    return bytesRead === 4 && MACH_O_MAGIC.has(buffer.readUInt32BE(0))
  } catch {
    return false
  } finally {
    await handle?.close()
  }
}

/** The Team ID of a file's existing code signature, or `null` when it is unsigned or ad-hoc signed. */
async function readSigningTeamId(file: string): Promise<string | null> {
  try {
    // `codesign -d` reports on stderr, so stdout alone (as `exec` returns) is not enough
    const { stderr } = await spawnAndWriteWithOutput("/usr/bin/codesign", ["-d", "--verbose=4", file], "")
    return /^TeamIdentifier=(.+)$/m.exec(stderr)?.[1].trim() ?? null
  } catch {
    // unsigned binaries make `codesign -d` exit non-zero
    return null
  }
}
