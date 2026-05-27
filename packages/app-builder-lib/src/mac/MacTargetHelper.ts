import { PerFileSignOptions, SigningDistributionType, SignOptions } from "@electron/osx-sign/dist/cjs/types"
import { Identity } from "@electron/osx-sign/dist/cjs/util-identities"
import { Arch, InvalidConfigurationError, log, statOrNull } from "builder-util"
import { Nullish } from "builder-util-runtime"
import * as path from "path"
import { CertType, findIdentity, reportError } from "../codeSign/macCodeSign"
import type { MacPackager } from "../macPackager"
import { MacConfiguration, MasConfiguration } from "../options/macOptions"
import { getTemplatePath } from "../util/pathManager"

export class MacTargetHelper {
  constructor(private packager: MacPackager) {}

  handleNullIdentity(fallBackToAdhoc: boolean): boolean {
    if (this.packager.forceCodeSigning) {
      throw new InvalidConfigurationError("identity explicitly is set to null, but forceCodeSigning is set to true")
    }
    log.info({ reason: "identity explicitly is set to null" }, "skipped macOS code signing")
    if (fallBackToAdhoc) {
      log.warn("arm64 requires signing, but identity is set to null and signing is being skipped")
    }
    return false
  }

  async findSigningIdentity(
    isMas: boolean,
    isDevelopment: boolean,
    qualifier: string | undefined,
    keychainFile: string | Nullish,
    config: MacConfiguration | MasConfiguration,
    fallBackToAdhoc: boolean
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
        identity = new Identity("-", undefined)
      } else if (noIdentity && fallBackToAdhoc) {
        log.warn(null, "falling back to ad-hoc signature for macOS application code signing")
        identity = new Identity("-", undefined)
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

    const signOptions: SignOptions = {
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

    return signOptions
  }

  async createMasInstaller(appPath: string, outDir: string, masOptions: MasConfiguration, keychainFile: string | Nullish, isDevelopment: boolean, arch: Arch): Promise<void> {
    const certType = isDevelopment ? "Mac Developer" : "3rd Party Mac Developer Installer"
    const masInstallerIdentity = await findIdentity(certType, masOptions.identity, keychainFile)

    if (masInstallerIdentity == null) {
      throw new InvalidConfigurationError(`Cannot find valid "${certType}" identity to sign MAS installer, please see https://electron.build/code-signing`)
    }

    // mas uploaded to AppStore, so, use "-" instead of space for name
    // path.basename prevents path traversal if a crafted artifactName contains "../"
    const artifactName = path.basename(this.packager.expandArtifactNamePattern(masOptions, "pkg", arch))
    const artifactPath = path.join(outDir, artifactName)
    await this.packager.doFlat(appPath, artifactPath, masInstallerIdentity, keychainFile)
    await this.packager.info.emitArtifactBuildCompleted({
      file: artifactPath,
      target: null,
      arch: Arch.x64,
      safeArtifactName: this.packager.computeSafeArtifactName(artifactName, "pkg", arch, true, this.packager.platformSpecificBuildOptions.defaultArch),
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
          return path.join(this.packager.info.buildResourcesDir, p)
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
        return path.join(this.packager.info.buildResourcesDir, p)
      } else {
        return getTemplatePath("entitlements.mac.plist")
      }
    }

    const requirements =
      isMas || this.packager.platformSpecificBuildOptions.requirements == null
        ? undefined
        : await this.packager.getResource(this.packager.platformSpecificBuildOptions.requirements)

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
}
