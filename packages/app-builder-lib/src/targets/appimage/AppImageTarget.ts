import { Arch, log, serializeToYaml } from "builder-util"
import { outputFile } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { Target } from "../../core"
import { LinuxPackager } from "../../linuxPackager"
import { AppImageOptions } from "../../options/linuxOptions"
import { getAppUpdatePublishConfiguration } from "../../publish/PublishManager"
import { getNotLocalizedLicenseFile } from "../../util/license"
import { buildExecArgs, LinuxTargetHelper } from "../LinuxTargetHelper"
import { createStageDir } from "../targetUtil"
import { buildLegacyFuse2AppImage, buildStaticRuntimeAppImage } from "./appImageUtil"
import { BlockMapDataHolder, deepAssign } from "builder-util-runtime"

// https://unix.stackexchange.com/questions/375191/append-to-sub-directory-inside-squashfs-file

export const APP_RUN_ENTRYPOINT = "AppRun"

export default class AppImageTarget extends Target {
  readonly options: AppImageOptions = deepAssign({}, this.packager.platformSpecificBuildOptions, (this.packager.config as any)[this.name])

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
      const defaultArgs = appimageTool == null || appimageTool === "0.0.0" ? ["--no-sandbox"] : []
      const args = this.options.executableArgs ?? defaultArgs
      const exec = [APP_RUN_ENTRYPOINT, buildExecArgs(args), "%U"].filter(Boolean).join(" ")
      return helper.computeDesktopEntry(this.options, exec, {
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

    // Validated once here; throws InvalidConfigurationError for path traversal / NUL.
    const desktopBaseName = this.helper.getDesktopFileName()

    if (
      this.packager.packagerOptions.effectiveOptionComputed != null &&
      (await this.packager.packagerOptions.effectiveOptionComputed({ desktop: desktopEntry, desktopFileName: `${desktopBaseName}.desktop` }))
    ) {
      await stageDir.cleanup()
      return
    }

    let updateInfo: BlockMapDataHolder
    try {
      const appimageTool = this.packager.config.toolsets?.appimage
      if (appimageTool == null || appimageTool === "0.0.0") {
        updateInfo = await buildLegacyFuse2AppImage({
          appDir: appOutDir,
          stageDir: stageDir.dir,
          arch,
          output: artifactPath,
          options: {
            productName: packager.appInfo.productName,
            productFilename: packager.appInfo.productFilename,
            executableName: packager.executableName,
            license,
            desktopEntry,
            icons,
            fileAssociations: packager.fileAssociations,
            desktopBaseName,
            compression: (() => {
              const c = options.compression
              if (c === "xz" || c === "gzip") {
                return c
              }
              if (packager.compression === "maximum") {
                return "xz"
              }
              return undefined // normal/store/unset/zstd → mksquashfs defaults to gzip
            })(),
          },
        })
      } else {
        updateInfo = await buildStaticRuntimeAppImage(appimageTool, {
          appDir: appOutDir,
          stageDir: stageDir.dir,
          arch,
          output: artifactPath,
          options: {
            productName: packager.appInfo.productName,
            productFilename: packager.appInfo.productFilename,
            executableName: packager.executableName,
            license,
            desktopEntry,
            icons,
            fileAssociations: packager.fileAssociations,
            desktopBaseName,
            compression: (() => {
              const c = options.compression
              if (c === "gzip" || c === "zstd") {
                return c
              }
              if (c === "xz") {
                return "zstd" // nearest equivalent; static runtime does not support xz
              }
              if (packager.compression === "store") {
                return "gzip"
              }
              return "zstd" // maximum/normal/unset → zstd for static runtime
            })(),
          },
        })
      }
    } catch (error: any) {
      log.error({ error: error.message }, "failed to build AppImage")
      throw error
    } finally {
      await stageDir.cleanup().catch(() => {})
    }

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
}
