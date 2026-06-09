import { Arch, defaultArchFromString } from "builder-util"
import * as path from "path"
import { Platform, Target, TargetSpecificOptions } from "../core.js"
import { copyFiles, getFileMatchers } from "../fileMatcher.js"
import { PlatformPackager } from "../platformPackager.js"
import { archive, tar } from "./archive.js"
import { appendBlockmap, createBlockmap } from "./differentialUpdateInfoBuilder.js"

export class ArchiveTarget extends Target {
  readonly options: TargetSpecificOptions

  constructor(
    name: string,
    readonly outDir: string,
    private readonly packager: PlatformPackager<any>,
    private readonly isWriteUpdateInfo = false
  ) {
    super(name)
    this.options = (this.packager.config as any)[this.name]
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const isMac = packager.platform === Platform.MAC
    const format = this.name

    let defaultPattern: string
    const defaultArch: Arch = defaultArchFromString(packager.platformOptions.defaultArch)
    if (packager.platform === Platform.LINUX) {
      // tslint:disable-next-line:no-invalid-template-strings
      defaultPattern = "${name}-${version}" + (arch === defaultArch ? "" : "-${arch}") + ".${ext}"
    } else {
      // tslint:disable-next-line:no-invalid-template-strings
      defaultPattern = "${productName}-${version}" + (arch === defaultArch ? "" : "-${arch}") + "-${os}.${ext}"
    }

    this.buildQueueManager.add(async () => {
      const artifactName = packager.expandArtifactNamePattern(this.options, format, arch, defaultPattern, false)
      const artifactPath = path.join(this.outDir, artifactName)

      await packager.emitArtifactBuildStarted({
        targetPresentableName: `${isMac ? "macOS " : ""}${format}`,
        file: artifactPath,
        arch,
      })
      let updateInfo: any = null
      if (format.startsWith("tar.")) {
        await tar({ compression: packager.compression, format, outFile: artifactPath, dirToArchive: appOutDir, isMacApp: isMac, tempDirManager: packager.tempDirManager, linuxToolsMac: packager.config.toolsets?.linuxToolsMac, buildResourcesDir: packager.buildResourcesDir })
      } else {
        let withoutDir = !isMac
        let dirToArchive = appOutDir
        if (isMac) {
          dirToArchive = path.dirname(appOutDir)
          const fileMatchers = getFileMatchers(
            packager.config,
            "extraDistFiles",
            dirToArchive,
            packager.createGetFileMatchersOptions(this.outDir, arch, packager.platformOptions)
          )
          if (fileMatchers == null) {
            dirToArchive = appOutDir
          } else {
            await copyFiles(fileMatchers, null, true)
            withoutDir = true
          }
        }

        const archiveOptions = {
          compression: packager.compression,
          withoutDir,
        }
        await archive(format, artifactPath, dirToArchive, archiveOptions)

        if (this.isWriteUpdateInfo && format === "zip") {
          if (isMac) {
            updateInfo = await createBlockmap(artifactPath, this, packager, artifactName)
          } else {
            updateInfo = await appendBlockmap(artifactPath)
          }
        }
      }

      await packager.emitArtifactBuildCompleted({
        updateInfo,
        file: artifactPath,
        // tslint:disable-next-line:no-invalid-template-strings
        safeArtifactName: packager.computeSafeArtifactName(
          artifactName,
          format,
          arch,
          false,
          packager.platformOptions.defaultArch,
          defaultPattern.replace("${productName}", "${name}")
        ),
        target: this,
        arch,
        packager,
        isWriteUpdateInfo: this.isWriteUpdateInfo,
      })
    })
    return Promise.resolve()
  }
}
