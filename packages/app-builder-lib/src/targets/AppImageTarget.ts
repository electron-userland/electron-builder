import { Arch, serializeToYaml } from "builder-util"
import { outputFile } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { AppImageOptions } from ".."
import { Target } from "../core"
import { LinuxPackager } from "../linuxPackager"
import { getAppUpdatePublishConfiguration } from "../publish/PublishManager"
import { executeAppBuilderAsJson, objectToArgs } from "../util/appBuilder"
import { getNotLocalizedLicenseFile } from "../util/license"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { createStageDir } from "./targetUtil"

// https://unix.stackexchange.com/questions/375191/append-to-sub-directory-inside-squashfs-file
export default class AppImageTarget extends Target {
  readonly options: AppImageOptions = {...this.packager.platformSpecificBuildOptions, ...(this.packager.config as any)[this.name]}
  private readonly desktopEntry: Lazy<string>

  constructor(ignored: string, private readonly packager: LinuxPackager, private readonly helper: LinuxTargetHelper, readonly outDir: string) {
    super("appImage")

    this.desktopEntry = new Lazy<string>(() => helper.computeDesktopEntry(this.options, "AppRun", {
      "X-AppImage-Version": `${packager.appInfo.buildVersion}`,
    }))
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const options = this.options
    // https://github.com/electron-userland/electron-builder/issues/775
    // https://github.com/electron-userland/electron-builder/issues/1726
    // tslint:disable-next-line:no-invalid-template-strings
    const artifactName = packager.expandArtifactNamePattern(options, "AppImage", arch)
    const artifactPath = path.join(this.outDir, artifactName)
    await packager.info.callArtifactBuildStarted({
      targetPresentableName: "AppImage",
      file: artifactPath,
      arch,
    })

    const c = await Promise.all([
      this.desktopEntry.value,
      this.helper.icons,
      getAppUpdatePublishConfiguration(packager, arch, false /* in any case validation will be done on publish */),
      getNotLocalizedLicenseFile(options.license, this.packager, ["txt", "html"]),
      createStageDir(this, packager, arch),
    ])
    const license = c[3]
    const stageDir = c[4]

    const publishConfig = c[2]
    if (publishConfig != null) {
      await outputFile(path.join(packager.getResourcesDir(stageDir.dir), "app-update.yml"), serializeToYaml(publishConfig))
    }

    if (this.packager.packagerOptions.effectiveOptionComputed != null && await this.packager.packagerOptions.effectiveOptionComputed({desktop: await this.desktopEntry.value})) {
      return
    }

    const args = [
      "appimage",
      "--stage", stageDir.dir,
      "--arch", Arch[arch],
      "--output", artifactPath,
      "--app", appOutDir,
      "--configuration", (JSON.stringify({
        productName: this.packager.appInfo.productName,
        productFilename: this.packager.appInfo.productFilename,
        desktopEntry: c[0],
        executableName: this.packager.executableName,
        icons: c[1],
        fileAssociations: this.packager.fileAssociations,
        ...options,
      })),
    ]
    objectToArgs(args, {
      license,
    })
    if (packager.compression === "maximum") {
      args.push("--compression", "xz")
    }

    await packager.info.callArtifactBuildCompleted({
      file: artifactPath,
      safeArtifactName: packager.computeSafeArtifactName(artifactName, "AppImage", arch, false),
      target: this,
      arch,
      packager,
      isWriteUpdateInfo: true,
      updateInfo: await executeAppBuilderAsJson(args),
    })
  }
}