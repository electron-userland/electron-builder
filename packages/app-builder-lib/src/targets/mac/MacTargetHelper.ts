import type { NotarizeOptionsNotaryTool, NotaryToolKeychainCredentials } from "@electron/notarize/lib/types"
import type { PerFileSignOptions, SigningDistributionType, SignOptions } from "@electron/osx-sign/dist/cjs/types"
import type { Identity } from "@electron/osx-sign/dist/cjs/util-identities"
import { Arch, InvalidConfigurationError, log, statOrNull } from "builder-util"
import { dynamicImport } from "../../util/dynamicImport.js"
import { Nullish } from "builder-util-runtime"
import * as path from "path"
import { CertType, findIdentity, reportError } from "../../codeSign/mac/macCodeSign.js"
import type { MacPackager } from "../../macPackager.js"
import { MacConfiguration, MasConfiguration } from "../../options/macOptions.js"
import { getTemplatePath } from "../../util/pathManager.js"

export type PlatformType = "mas" | "mas-dev" | "mac"

export class MacTargetHelper {
  constructor(private packager: MacPackager) {}

  handleNullIdentity(): boolean {
    if (this.packager.forceCodeSigning) {
      throw new InvalidConfigurationError("identity explicitly is set to null, but forceCodeSigning is set to true")
    }
    log.info({ reason: "identity explicitly is set to null" }, "skipped macOS code signing")
    return false
  }

  async findSigningIdentity(
    isMas: boolean,
    isDevelopment: boolean,
    qualifier: string | undefined,
    keychainFile: string | Nullish,
    config: MacConfiguration | MasConfiguration
  ): Promise<Identity | null> {
    const certificateTypes = MacTargetHelper.getCertificateTypes(isMas, isDevelopment)

    let identity: Identity | null = null
    for (const certificateType of certificateTypes) {
      identity = await findIdentity(certificateType, qualifier, keychainFile)
      if (identity != null) {
        break
      }
    }

    if (identity == null) {
      if (!isMas && !isDevelopment && config.type !== "distribution") {
        identity = await findIdentity("Mac Developer", qualifier, keychainFile)
        if (identity != null) {
          log.warn("Mac Developer is used to sign app — it is only for development and testing, not for production")
        }
      }

      const noIdentity = !config.sign && identity == null
      if (qualifier === "-") {
        if (MacTargetHelper.isHardenedRuntimeEnabledForSigning(isMas, config)) {
          log.warn(
            null,
            "ad-hoc signing with hardenedRuntime enabled requires the com.apple.security.cs.disable-library-validation entitlement " +
              "to prevent app launch failures due to library validation. See https://electron.build/code-signing for details."
          )
        }
        const { Identity: IdentityClass } = await dynamicImport<{ Identity: new (name: string, hash?: string) => Identity }>("@electron/osx-sign/dist/cjs/util-identities")
        identity = new IdentityClass("-", undefined)
      } else if (noIdentity) {
        await reportError(isMas, certificateTypes, qualifier, keychainFile, this.packager.forceCodeSigning)
        return null
      }
    }

    return identity
  }

  async buildSignOptions(
    appPath: string,
    identity: Identity,
    type: SigningDistributionType,
    isMas: boolean,
    config: MacConfiguration | MasConfiguration,
    keychainFile: string | Nullish,
    arch: Arch
  ): Promise<SignOptions> {
    let filter = config.signIgnore
    if (Array.isArray(filter)) {
      if (filter.length == 0) {
        filter = null
      }
    } else if (filter != null) {
      filter = filter.length === 0 ? null : [filter]
    }

    const filterRe =
      filter == null
        ? null
        : filter.map(it => {
            try {
              return new RegExp(it)
            } catch (e: any) {
              throw new InvalidConfigurationError(`Invalid regex filter pattern: ${it}. ${e.message}`)
            }
          })

    let binaries = config.binaries || undefined
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
      strictVerify: config.strictVerify,
      preAutoEntitlements: config.preAutoEntitlements,
      optionsForFile: await this.getOptionsForFile(appPath, isMas, config),
      provisioningProfile: config.provisioningProfile || undefined,
    }
  }

  async createMasInstaller(appPath: string, outDir: string, masOptions: MasConfiguration, keychainFile: string | Nullish, isDevelopment: boolean, arch: Arch): Promise<void> {
    const certType = isDevelopment ? "Mac Developer" : "3rd Party Mac Developer Installer"
    const masInstallerIdentity = await findIdentity(certType, masOptions.identity, keychainFile)

    if (masInstallerIdentity == null) {
      throw new InvalidConfigurationError(`Cannot find valid "${certType}" identity to sign MAS installer, please see https://electron.build/code-signing`)
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

  async getOptionsForFile(appPath: string, isMas: boolean, customSignOptions: MacConfiguration | MasConfiguration): Promise<(filePath: string) => PerFileSignOptions> {
    const resourceList = await this.packager.resourceList
    const entitlementsSuffix = isMas ? "mas" : "mac"

    const getEntitlements = (filePath: string) => {
      if (filePath === appPath) {
        if (customSignOptions.entitlements) {
          return customSignOptions.entitlements
        }
        const p = `entitlements.${entitlementsSuffix}.plist`
        if (resourceList.includes(p)) {
          return path.join(this.packager.buildResourcesDir, p)
        } else {
          return getTemplatePath("entitlements.mac.plist")
        }
      }

      if (filePath.includes("Library/LoginItems")) {
        return customSignOptions.entitlementsLoginHelper
      }

      if (customSignOptions.entitlementsInherit) {
        return customSignOptions.entitlementsInherit
      }
      const p = `entitlements.${entitlementsSuffix}.inherit.plist`
      if (resourceList.includes(p)) {
        return path.join(this.packager.buildResourcesDir, p)
      } else {
        return getTemplatePath("entitlements.mac.plist")
      }
    }

    const requirements = isMas || this.packager.platformOptions.requirements == null ? undefined : await this.packager.getResource(this.packager.platformOptions.requirements)

    // harden by default for mac builds. Only harden mas builds if explicitly true (backward compatibility)
    const hardenedRuntime = isMas ? customSignOptions.hardenedRuntime === true : customSignOptions.hardenedRuntime !== false

    return (filePath: string): PerFileSignOptions => {
      const entitlements = getEntitlements(filePath)
      return {
        entitlements: entitlements || undefined,
        hardenedRuntime: hardenedRuntime ?? undefined,
        timestamp: customSignOptions.timestamp || undefined,
        requirements: requirements || undefined,
        additionalArguments: customSignOptions.additionalArguments || [],
      }
    }
  }

  static getCertificateTypes(isMas: boolean, isDevelopment: boolean): CertType[] {
    if (isDevelopment) {
      return isMas ? ["Mac Developer", "Apple Development"] : ["Mac Developer", "Developer ID Application"]
    }
    return isMas ? ["Apple Distribution", "3rd Party Mac Developer Application"] : ["Developer ID Application"]
  }

  static isMasTarget(targetName: string): boolean {
    return targetName === "mas" || targetName === "mas-dev"
  }

  static getPlatformTypeFromTarget(targetName: string): PlatformType {
    if (targetName === "mas") {
      return "mas"
    }
    if (targetName === "mas-dev") {
      return "mas-dev"
    }
    return "mac"
  }

  /**
   * Returns true when hardened runtime will be active for signing.
   * For non-MAS builds it defaults to on; for MAS it defaults to off.
   */
  static isHardenedRuntimeEnabledForSigning(isMas: boolean, config: Pick<MacConfiguration | MasConfiguration, "hardenedRuntime">): boolean {
    return isMas ? config.hardenedRuntime === true : config.hardenedRuntime !== false
  }

  static assertSafePathForCommandUsage(pathValue: string, description: string): void {
    if (/[\0\r\n"'`$;&|<>]/.test(pathValue)) {
      throw new InvalidConfigurationError(`Invalid ${description}: contains unsupported shell-special characters`)
    }
  }

  static getNotarizeOptions(appPath: string): NotarizeOptionsNotaryTool | undefined {
    const tool = "notarytool"
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
      return { tool, appPath, appleId, appleIdPassword, teamId }
    }

    const appleApiKey = process.env.APPLE_API_KEY
    const appleApiKeyId = process.env.APPLE_API_KEY_ID
    const appleApiIssuer = process.env.APPLE_API_ISSUER
    if (appleApiKey || appleApiKeyId || appleApiIssuer) {
      if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) {
        throw new InvalidConfigurationError(`Env vars APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER need to be set`)
      }
      return { tool, appPath, appleApiKey, appleApiKeyId, appleApiIssuer }
    }

    const keychain = process.env.APPLE_KEYCHAIN
    const keychainProfile = process.env.APPLE_KEYCHAIN_PROFILE
    if (keychainProfile) {
      let args: NotaryToolKeychainCredentials = { keychainProfile }
      if (keychain) {
        args = { ...args, keychain }
      }
      return { tool, appPath, ...args }
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
    const { notarize } = await dynamicImport<typeof import("@electron/notarize")>("@electron/notarize")
    await notarize(options)
    log.info(null, "notarization successful")
  }
}
