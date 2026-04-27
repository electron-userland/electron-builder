import { DmgOptions, Target } from "app-builder-lib"
import { findIdentity, isSignAllowed } from "app-builder-lib/out/codeSign/macCodeSign"
import { MacPackager } from "app-builder-lib/out/macPackager"
import { createBlockmap } from "app-builder-lib/out/targets/differentialUpdateInfoBuilder"
import { Arch, exec, getArchSuffix, InvalidConfigurationError, isEmptyOrSpaces } from "builder-util"
import { sanitizeFileName } from "builder-util/out/filename"
import { release as getOsRelease } from "os"
import * as path from "path"
import { addLicenseToDmg } from "./dmgLicense"
import { computeBackground, customizeDmg } from "./dmgUtil"
import { hdiUtil } from "./hdiuil"

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
  license?: string | null
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

  async build(appPath: string, arch: Arch) {
    const packager = this.packager
    // tslint:disable-next-line:no-invalid-template-strings
    const artifactName = packager.expandArtifactNamePattern(
      this.options,
      "dmg",
      arch,
      "${productName}-" + (packager.platformSpecificBuildOptions.bundleShortVersion || "${version}") + "-${arch}.${ext}",
      true,
      packager.platformSpecificBuildOptions.defaultArch
    )
    const artifactPath = path.join(this.outDir, artifactName)
    await packager.info.emitArtifactBuildStarted({
      targetPresentableName: "DMG",
      file: artifactPath,
      arch,
    })

    const volumeName = sanitizeFileName(this.computeVolumeName(arch, this.options.title))

    const specification = await this.computeDmgOptions(appPath)

    if (!(await customizeDmg({ appPath, artifactPath, volumeName, specification, packager }))) {
      return
    }

    if (this.options.internetEnabled && parseInt(getOsRelease().split(".")[0], 10) < 19) {
      await hdiUtil(addLogLevel(["internet-enable"]).concat(artifactPath))
    }

    const licenseData = await addLicenseToDmg(packager, artifactPath)
    if (packager.packagerOptions.effectiveOptionComputed != null) {
      await packager.packagerOptions.effectiveOptionComputed({ licenseData })
    }

    if (this.options.sign === true) {
      await this.signDmg(artifactPath)
    }

    const safeArtifactName = packager.computeSafeArtifactName(artifactName, "dmg")
    const updateInfo = this.options.writeUpdateInfo === false ? null : await createBlockmap(artifactPath, this, packager, safeArtifactName, arch)
    await packager.info.emitArtifactBuildCompleted({
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
    if (!isSignAllowed(false)) {
      return
    }

    const packager = this.packager
    const qualifier = packager.platformSpecificBuildOptions.identity
    // explicitly disabled if set to null
    if (qualifier === null) {
      // macPackager already somehow handle this situation, so, here just return
      return
    }

    const keychainFile = (await packager.codeSigningInfo.value).keychainFile
    const certificateType = "Developer ID Application"
    let identity = await findIdentity(certificateType, qualifier, keychainFile)
    if (identity == null) {
      identity = await findIdentity("Mac Developer", qualifier, keychainFile)
      if (identity == null) {
        return
      }
    }

    const args = ["--sign", identity.hash!]
    if (keychainFile != null) {
      args.push("--keychain", keychainFile)
    }
    args.push(artifactPath)
    await exec("codesign", args)
  }

  computeVolumeName(arch: Arch, custom?: string | null): string {
    const appInfo = this.packager.appInfo
    const shortVersion = this.packager.platformSpecificBuildOptions.bundleShortVersion || appInfo.version
    const archString = getArchSuffix(arch, this.packager.platformSpecificBuildOptions.defaultArch)

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
