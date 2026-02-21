import { IconInfo } from "../../platformPackager"
import { Arch, log, serializeToYaml } from "builder-util"
import { outputFile } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { Target } from "../../core"
import { LinuxPackager } from "../../linuxPackager"
import { AppImageOptions } from "../../options/linuxOptions"
import { getAppUpdatePublishConfiguration } from "../../publish/PublishManager"
import { executeAppBuilderAsJson, objectToArgs } from "../../util/appBuilder"
import { getNotLocalizedLicenseFile } from "../../util/license"
import { LinuxTargetHelper } from "../LinuxTargetHelper"
import { createStageDir, StageDir } from "../targetUtil"
import { buildAppImage } from "./appImageUtil"
import { BlockMapDataHolder } from "builder-util-runtime"

// https://unix.stackexchange.com/questions/375191/append-to-sub-directory-inside-squashfs-file

export const APP_RUN_ENTRYPOINT = "AppRun"

export default class AppImageTarget extends Target {
  readonly options: AppImageOptions = { ...this.packager.platformSpecificBuildOptions, ...(this.packager.config as any)[this.name] }

  private readonly desktopEntry: Lazy<string>

  constructor(
    _ignored: string,
    private readonly packager: LinuxPackager,
    private readonly helper: LinuxTargetHelper,
    readonly outDir: string
  ) {
    super("appImage")

    this.desktopEntry = new Lazy<string>(() => {
      const appimageTool = packager.config.toolsets?.appimage
      const defaultArgs = appimageTool == null || appimageTool === "0.0.0" ? "--no-sandbox" : ""
      const args = this.options.executableArgs?.join(" ") || defaultArgs
      return helper.computeDesktopEntry(this.options, `${APP_RUN_ENTRYPOINT} ${args} %U`, {
        "X-AppImage-Version": `${packager.appInfo.buildVersion}`,
      })
    })
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager

    const options = this.options
    // https://github.com/electron-userland/electron-builder/issues/775
    // https://github.com/electron-userland/electron-builder/issues/1726
    const artifactName = packager.expandArtifactNamePattern(options, "AppImage", arch)
    const artifactPath = path.join(this.outDir, artifactName)

    await packager.info.emitArtifactBuildStarted({
      targetPresentableName: "AppImage",
      file: artifactPath,
      arch,
    })

    // Parallelize independent async operations
    const [publishConfig, stageDir, desktopEntry, icons, license] = await Promise.all([
      getAppUpdatePublishConfiguration(packager, options, arch, false),
      createStageDir(this, packager, arch),
      this.desktopEntry.value,
      this.helper.icons,
      getNotLocalizedLicenseFile(options.license, this.packager, ["txt", "html"]),
    ])

    if (publishConfig != null) {
      await outputFile(path.join(packager.getResourcesDir(appOutDir), "app-update.yml"), serializeToYaml(publishConfig))
    }

    if (this.packager.packagerOptions.effectiveOptionComputed != null && (await this.packager.packagerOptions.effectiveOptionComputed({ desktop: desktopEntry }))) {
      await stageDir.cleanup()
      return
    }

    let updateInfo: BlockMapDataHolder
    try {
      const appimageTool = this.packager.config.toolsets?.appimage
      if (appimageTool == null || appimageTool === "0.0.0") {
        updateInfo = await this.buildFuse2AppImage({ stageDir, arch, artifactPath, appOutDir, options, packager, desktopEntry, icons, license })
      } else {
        updateInfo = await buildAppImage({
          appDir: appOutDir,
          stageDir: stageDir.dir,
          arch,
          output: artifactPath,
          options: {
            productName: this.packager.appInfo.productName,
            productFilename: this.packager.appInfo.productFilename,
            executableName: this.packager.executableName,
            license,
            desktopEntry,
            icons,
            fileAssociations: this.packager.fileAssociations,
            compression: this.packager.compression === "maximum" ? "xz" : undefined,
          },
        })
      }
    } catch (error: any) {
      log.error({ error: error.message }, "failed to build AppImage")
      await stageDir.cleanup().catch(() => {})
      throw error
    }
    await stageDir.cleanup()

    await packager.info.emitArtifactBuildCompleted({
      file: artifactPath,
      safeArtifactName: packager.computeSafeArtifactName(artifactName, "AppImage", arch, false),
      target: this,
      arch,
      packager,
      isWriteUpdateInfo: true,
      updateInfo,
    })
  }

  private async buildFuse2AppImage(props: {
    stageDir: StageDir
    arch: Arch
    artifactPath: string
    appOutDir: string
    options: AppImageOptions
    packager: LinuxPackager
    desktopEntry: string
    icons: IconInfo[]
    license: string | null
  }): Promise<BlockMapDataHolder> {
    const { stageDir, arch, artifactPath, appOutDir, options, packager, desktopEntry, icons, license } = props

    const args = [
      "appimage",
      "--stage",
      stageDir.dir,
      "--arch",
      Arch[arch],
      "--output",
      artifactPath,
      "--app",
      appOutDir,
      "--configuration",
      JSON.stringify({
        productName: this.packager.appInfo.productName,
        productFilename: this.packager.appInfo.productFilename,
        desktopEntry,
        executableName: this.packager.executableName,
        icons,
        fileAssociations: this.packager.fileAssociations,
        ...options,
      }),
    ]
    objectToArgs(args, {
      license,
    })
    if (packager.compression === "maximum") {
      args.push("--compression", "xz")
    }

    const updateInfo = await executeAppBuilderAsJson<BlockMapDataHolder>(args)
    return updateInfo
  }
}
