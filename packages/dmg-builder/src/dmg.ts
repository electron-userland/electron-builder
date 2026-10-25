import { DmgOptions, MacPackager, Target } from "app-builder-lib"
import {
  createBlockmap,
  findIdentity,
  forceCodeSigningError,
  forceCodeSigningOverrideHint,
  isSignAllowed,
  macSigningUnavailableError,
  VERIFICATION_FAILED_ERROR_CODE,
  verifyMacCodeSignature,
} from "app-builder-lib/internal"
import { Arch, exec, Executables, getArchSuffix, InvalidConfigurationError, isEmptyOrSpaces, log } from "builder-util"
import { sanitizeFileName } from "builder-util/internal"
import { release as getOsRelease } from "os"
import * as path from "path"
import type { DmgBuildLicenseConfig } from "./dmgLicense.js"
import { addLicenseToDmg } from "./dmgLicense.js"
import { computeBackground, customizeDmg } from "./dmgUtil.js"
import { hdiUtil } from "./hdiuil.js"

export interface DmgBuildConfig {
  title: string
  icon?: string | null
  "badge-icon"?: string | null
  background?: string | null
  "background-color"?: string | null
  "icon-size"?: number | null
  "text-size"?: number | null
  window?: {
    position?: {
      x?: number
      y?: number
    }
    size?: {
      width?: number
      height?: number
    }
  }
  format?: string
  size?: string | null
  shrink?: boolean
  filesystem?: string
  "compression-level"?: number | null
  license?: DmgBuildLicenseConfig | null
  contents?: Array<{
    path: string
    x: number
    y: number
    name?: string
    type?: "file" | "link" | "position"
    hide_extension?: boolean
    hidden?: boolean
  }>
}
export class DmgTarget extends Target {
  readonly options: DmgOptions = this.packager.config.dmg || Object.create(null)

  isAsyncSupported = false

  constructor(
    private readonly packager: MacPackager,
    readonly outDir: string
  ) {
    super("dmg")
  }

  get writesUpdateInfo(): boolean {
    return this.options.writeUpdateInfo !== false
  }

  async build(appPath: string, arch: Arch) {
    const packager = this.packager
    // tslint:disable-next-line:no-invalid-template-strings
    const artifactName = packager.expandArtifactNamePattern(
      this.options,
      "dmg",
      arch,
      "${productName}-" + (packager.platformOptions.bundleShortVersion || "${version}") + "-${arch}.${ext}",
      true,
      packager.platformOptions.defaultArch
    )
    const artifactPath = path.join(this.outDir, artifactName)
    await packager.emitArtifactBuildStarted({
      targetPresentableName: "DMG",
      file: artifactPath,
      arch,
    })

    const volumeName = sanitizeFileName(this.computeVolumeName(arch, this.options.title))

    const specification = await this.computeDmgOptions(appPath)

    const licenseData = await addLicenseToDmg(packager, this.options.license)

    if (!(await customizeDmg({ appPath, artifactPath, volumeName, specification, packager, licenseData }))) {
      return
    }

    if (this.options.internetEnabled && parseInt(getOsRelease().split(".")[0], 10) < 19) {
      await hdiUtil(addLogLevel(["internet-enable"]).concat(artifactPath))
    }

    if (packager.packagerOptions.effectiveOptionComputed != null) {
      await packager.packagerOptions.effectiveOptionComputed({ licenseData })
    }

    if (this.options.sign === true) {
      await this.signDmg(artifactPath)
    }

    const safeArtifactName = packager.computeSafeArtifactName(artifactName, "dmg")
    const updateInfo = this.options.writeUpdateInfo === false ? null : await createBlockmap(artifactPath, this, packager, safeArtifactName, arch)
    await packager.emitArtifactBuildCompleted({
      file: artifactPath,
      safeArtifactName,
      target: this,
      arch,
      packager,
      isWriteUpdateInfo: updateInfo != null,
      updateInfo,
    })
  }

  private async signDmg(artifactPath: string) {
    const packager = this.packager
    // with dmg.sign: true, forceCodeSigning turns every silent skip below into an error and verifies the signature
    const forceCodeSigning = packager.forceCodeSigning
    const cannotSign = (reason: string) =>
      forceCodeSigningError(`forceCodeSigning is enabled and dmg.sign is true, but the DMG ${log.filePath(artifactPath)} cannot be signed: ${reason}.`)
    if (forceCodeSigning) {
      const unavailable = macSigningUnavailableError(`the DMG ${log.filePath(artifactPath)}`, forceCodeSigningOverrideHint(packager))
      if (unavailable != null) {
        throw unavailable
      }
    }
    if (!isSignAllowed(false)) {
      return
    }

    const signConfig = packager.platformOptions.sign
    // explicitly disabled if `sign` (or its identity) is set to null — macPackager already handles this, so just return
    if (signConfig === null) {
      if (forceCodeSigning) {
        throw cannotSign("mac.sign is null")
      }
      return
    }
    const qualifier = typeof signConfig === "object" ? signConfig.identity : undefined
    if (qualifier === null) {
      if (forceCodeSigning) {
        throw cannotSign("mac.sign.identity is null")
      }
      return
    }

    const keychainFile = (await packager.codeSigningInfo.value).keychainFile
    const certificateType = "Developer ID Application"
    let identity = await findIdentity(certificateType, qualifier, keychainFile)
    if (identity == null) {
      identity = await findIdentity("Mac Developer", qualifier, keychainFile)
      if (identity == null) {
        if (forceCodeSigning) {
          throw cannotSign(`no "${certificateType}" or "Mac Developer" identity was found`)
        }
        return
      }
    }

    const args = ["--sign", identity.hash!]
    if (keychainFile != null) {
      args.push("--keychain", keychainFile)
    }
    args.push(artifactPath)
    // by absolute path, a program the keychain lets use the signing key (security import -T, see keychainTrustedApplications)
    await exec(Executables.resolve("codesign"), args)

    if (forceCodeSigning) {
      const problem = await verifyMacCodeSignature(artifactPath, { deep: false })
      if (problem != null) {
        throw forceCodeSigningError(
          `forceCodeSigning is enabled, but the signed DMG ${log.filePath(artifactPath)} does not verify (codesign --verify: ${problem}).`,
          VERIFICATION_FAILED_ERROR_CODE
        )
      }
    }
  }

  computeVolumeName(arch: Arch, custom?: string | null): string {
    const appInfo = this.packager.appInfo
    const shortVersion = this.packager.platformOptions.bundleShortVersion || appInfo.version
    const archString = getArchSuffix(arch, this.packager.platformOptions.defaultArch)

    if (custom == null) {
      return `${appInfo.productFilename} ${shortVersion}${archString}`
    }

    return custom
      .replace(/\${arch}/g, archString)
      .replace(/\${shortVersion}/g, shortVersion)
      .replace(/\${version}/g, appInfo.version)
      .replace(/\${name}/g, appInfo.name)
      .replace(/\${productName}/g, appInfo.productName)
  }

  // public to test
  async computeDmgOptions(appPath: string): Promise<DmgOptions> {
    const packager = this.packager
    const specification: DmgOptions = { ...this.options }
    if (specification.icon == null && specification.icon !== null) {
      specification.icon = await packager.getIconPath()
    }

    if (specification.icon != null && isEmptyOrSpaces(specification.icon)) {
      throw new InvalidConfigurationError("dmg.icon cannot be specified as empty string")
    }

    const background = specification.background
    if (specification.backgroundColor != null) {
      if (background != null) {
        throw new InvalidConfigurationError("Both dmg.backgroundColor and dmg.background are specified — please set the only one")
      }
    } else if (background == null) {
      specification.background = await computeBackground(packager)
    } else {
      specification.background = await packager.getResource(background)
    }

    if (specification.format == null) {
      if (process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL != null) {
        specification.format = "UDZO"
      } else if (packager.compression === "store") {
        specification.format = "UDRO"
      } else {
        specification.format = packager.compression === "maximum" ? "UDBZ" : "UDZO"
      }
    }

    if (specification.contents == null) {
      specification.contents = [
        {
          x: 130,
          y: 220,
          path: appPath,
          type: "file",
          name: `${packager.appInfo.productFilename}.app`,
        },
        {
          x: 410,
          y: 220,
          type: "link",
          path: "/Applications",
        },
      ]
    }
    return specification
  }
}

function addLogLevel(args: Array<string>, isVerbose = process.env.DEBUG_DMG === "true"): Array<string> {
  args.push(isVerbose ? "-verbose" : "-quiet")
  return args
}
