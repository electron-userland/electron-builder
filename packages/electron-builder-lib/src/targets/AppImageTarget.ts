import BluebirdPromise from "bluebird-lst"
import { Arch, serializeToYaml, executeAppBuilder } from "builder-util"
import { UUID } from "builder-util-runtime"
import { copyOrLinkFile, unlinkIfExists } from "builder-util/out/fs"
import * as ejs from "ejs"
import { ensureDir, outputFile, readFile, symlink, writeFile } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import { AppImageOptions } from ".."
import { Target } from "../core"
import { LinuxPackager } from "../linuxPackager"
import { getAppUpdatePublishConfiguration } from "../publish/PublishManager"
import { getTemplatePath } from "../util/pathManager"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { createStageDir } from "./targetUtil"

const appRunTemplate = new Lazy<(data: any) => string>(async () => {
  return ejs.compile(await readFile(path.join(getTemplatePath("linux"), "AppRun.sh"), "utf-8"))
})

// https://unix.stackexchange.com/questions/375191/append-to-sub-directory-inside-squashfs-file
export default class AppImageTarget extends Target {
  readonly options: AppImageOptions = {...this.packager.platformSpecificBuildOptions, ...(this.packager.config as any)[this.name]}
  private readonly desktopEntry: Lazy<string>

  constructor(ignored: string, private readonly packager: LinuxPackager, private readonly helper: LinuxTargetHelper, readonly outDir: string) {
    super("appImage")

    // we add X-AppImage-BuildId to ensure that new desktop file will be installed
    this.desktopEntry = new Lazy<string>(() => helper.computeDesktopEntry(this.options, "AppRun", {
      "X-AppImage-Version": `${packager.appInfo.buildVersion}`,
      "X-AppImage-BuildId": UUID.v1(),
    }))
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager
    // https://github.com/electron-userland/electron-builder/issues/775
    // https://github.com/electron-userland/electron-builder/issues/1726
    // tslint:disable-next-line:no-invalid-template-strings
    const artifactName = packager.expandArtifactNamePattern(this.options, "AppImage", arch, "${name}-${version}-${arch}.${ext}", false)
    const artifactPath = path.join(this.outDir, artifactName)
    this.logBuilding("AppImage", artifactPath, arch)

    const stageDir = await createStageDir(this, packager, arch)
    const resourceName = `appimagekit-${this.packager.executableName}`
    const installIcons = await this.copyIcons(stageDir.dir, resourceName)

    const finalDesktopFilename = `${this.packager.executableName}.desktop`
    await Promise.all([
      unlinkIfExists(artifactPath),
      writeFile(stageDir.getTempFile("/AppRun"), (await appRunTemplate.value)({
        systemIntegration: this.options.systemIntegration || "ask",
        desktopFileName: finalDesktopFilename,
        executableName: this.packager.executableName,
        resourceName,
        installIcons,
      }), {
        mode: "0755",
      }),
      writeFile(stageDir.getTempFile(finalDesktopFilename), await this.desktopEntry.value),
    ])

    // must be after this.helper.icons call
    if (this.helper.maxIconPath == null) {
      throw new Error("Icon is not provided")
    }

    if (this.packager.packagerOptions.effectiveOptionComputed != null && await this.packager.packagerOptions.effectiveOptionComputed({desktop: await this.desktopEntry.value})) {
      return
    }

    const publishConfig = await getAppUpdatePublishConfiguration(packager, arch, false /* in any case validation will be done on publish */)
    if (publishConfig != null) {
      await outputFile(path.join(packager.getResourcesDir(stageDir.getTempFile("app")), "app-update.yml"), serializeToYaml(publishConfig))
    }

    const args = ["appimage", "--stage", stageDir.dir, "--arch", Arch[arch], "--output", artifactPath, "--app", appOutDir]
    if (packager.compression === "maximum") {
      args.push("--compression", "xz")
    }

    packager.info.dispatchArtifactCreated({
      file: artifactPath,
      safeArtifactName: packager.computeSafeArtifactName(artifactName, "AppImage", arch, false),
      target: this,
      arch,
      packager,
      isWriteUpdateInfo: true,
      updateInfo: JSON.parse(await executeAppBuilder(args)),
    })
  }

  private async copyIcons(stageDir: string, resourceName: string): Promise<string> {
    const iconDirRelativePath = "usr/share/icons/hicolor"
    const iconDir = path.join(stageDir, iconDirRelativePath)
    await ensureDir(iconDir)

    // https://github.com/AppImage/AppImageKit/issues/438#issuecomment-319094239
    // expects icons in the /usr/share/icons/hicolor
    const iconNames = await BluebirdPromise.map(this.helper.icons, async icon => {
      const filename = `${this.packager.executableName}.png`
      const iconSizeDir = `${icon.size}x${icon.size}/apps`
      const dir = path.join(iconDir, iconSizeDir)
      await ensureDir(dir)
      const finalIconFile = path.join(dir, filename)
      await copyOrLinkFile(icon.file, finalIconFile, null, true)

      if (icon.file === this.helper.maxIconPath) {
        await symlink(path.relative(stageDir, finalIconFile), path.join(stageDir, filename))
      }
      return {filename, iconSizeDir, size: icon.size}
    })

    let installIcons = ""
    for (const icon of iconNames) {
      installIcons += `xdg-icon-resource install --noupdate --context apps --size ${icon.size} "$APPDIR/${iconDirRelativePath}/${icon.iconSizeDir}/${icon.filename}" "${resourceName}"\n`
    }
    return installIcons
  }
}