import { Arch, serializeToYaml } from "builder-util"
import { outputFile } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { Target } from "../core"
import { LinuxPackager } from "../linuxPackager"
import { AppImageOptions } from "../options/linuxOptions"
import { getAppUpdatePublishConfiguration } from "../publish/PublishManager"
import { executeAppBuilderAsJson, objectToArgs } from "../util/appBuilder"
import { getNotLocalizedLicenseFile } from "../util/license"
import { buildAppImage } from "./appimage/appImageUtil"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { createStageDir } from "./targetUtil"
import { appendBlockmap, createBlockmap } from "./differentialUpdateInfoBuilder"

// https://unix.stackexchange.com/questions/375191/append-to-sub-directory-inside-squashfs-file
export default class AppImageTarget extends Target {
  readonly options: AppImageOptions = { ...this.packager.platformSpecificBuildOptions, ...(this.packager.config as any)[this.name] }
  private readonly desktopEntry: Lazy<string>

  constructor(
    ignored: string,
    private readonly packager: LinuxPackager,
    private readonly helper: LinuxTargetHelper,
    readonly outDir: string
  ) {
    super("appImage")

    this.desktopEntry = new Lazy<string>(() => {
      const args = this.options.executableArgs?.join(" ") || "--no-sandbox"
      return helper.computeDesktopEntry(this.options, `AppRun ${args} %U`, {
        "X-AppImage-Version": `${packager.appInfo.buildVersion}`,
      })
    })
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const options = this.options
    const artifactName = packager.expandArtifactNamePattern(options, "AppImage", arch)
    const artifactPath = path.join(this.outDir, artifactName)

    await packager.info.emitArtifactBuildStarted({
      targetPresentableName: "AppImage",
      file: artifactPath,
      arch,
    })

    const publishConfig = await getAppUpdatePublishConfiguration(packager, options, arch, false)
    const stageDir = await createStageDir(this, packager, arch)

    if (publishConfig != null) {
      await outputFile(path.join(packager.getResourcesDir(stageDir.dir), "app-update.yml"), serializeToYaml(publishConfig))
    }

    if (
      this.packager.packagerOptions.effectiveOptionComputed != null &&
      (await this.packager.packagerOptions.effectiveOptionComputed({ desktop: await this.desktopEntry.value }))
    ) {
      return
    }

    await buildAppImage({
      appDir: appOutDir,
      stageDir: stageDir.dir,
      arch,
      output: artifactPath,
      options: {
        license: options.license,
        productName: this.packager.appInfo.productName,
        productFilename: this.packager.appInfo.productFilename,
        desktopEntry: await this.desktopEntry.value,
        executableName: this.packager.executableName,
        icons: await this.helper.icons,
        fileAssociations: this.packager.fileAssociations,
        compression: this.packager.compression === "maximum" ? "xz" : undefined,
      },
    })

    const info = await appendBlockmap(artifactPath)
    // await packager.info.emitArtifactBuildCompleted({
    //   file: artifactPath,
    //   safeArtifactName: packager.computeSafeArtifactName(artifactName, "AppImage", arch, false),
    //   target: this,
    //   arch,
    //   packager,
    //   isWriteUpdateInfo: true,
    //   updateInfo,
    // })

    // const args = [
    //   "appimage",
    //   "--stage",
    //   stageDir.dir,
    //   "--arch",
    //   Arch[arch],
    //   "--output",
    //   artifactPath,
    //   "--app",
    //   appOutDir,
    //   "--configuration",
    //   JSON.stringify({
    //     productName: this.packager.appInfo.productName,
    //     productFilename: this.packager.appInfo.productFilename,
    //     desktopEntry: await this.desktopEntry.value,
    //     executableName: this.packager.executableName,
    //     icons: this.helper.icons,
    //     fileAssociations: this.packager.fileAssociations,
    //     ...options,
    //   }),
    // ]
    // objectToArgs(args, {
    //   license: await getNotLocalizedLicenseFile(options.license, this.packager, ["txt", "html"]),
    // })
    // if (packager.compression === "maximum") {
    //   args.push("--compression", "xz")
    // }

    // const info = await executeAppBuilderAsJson(args)
    await packager.info.emitArtifactBuildCompleted({
      file: artifactPath,
      safeArtifactName: packager.computeSafeArtifactName(artifactName, "AppImage", arch, false),
      target: this,
      arch,
      packager,
      isWriteUpdateInfo: true,
      updateInfo: info,
    })
  }
}
