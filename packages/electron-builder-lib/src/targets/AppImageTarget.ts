import BluebirdPromise from "bluebird-lst"
import { Arch, debug, exec, serializeToYaml } from "builder-util"
import { UUID } from "builder-util-runtime"
import { copyDir, copyOrLinkFile, unlinkIfExists, USE_HARD_LINKS } from "builder-util/out/fs"
import * as ejs from "ejs"
import { ensureDir, readFile, symlink, writeFile } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import { AppImageOptions } from ".."
import { Target } from "../core"
import { LinuxPackager } from "../linuxPackager"
import { getAppUpdatePublishConfiguration } from "../publish/PublishManager"
import { getTemplatePath } from "../util/pathManager"
import { appendBlockmap } from "./differentialUpdateInfoBuilder"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { createStageDir } from "./targetUtil"
import { getAppImage } from "./tools"

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

    // pax doesn't like dir with leading dot (e.g. `.__appimage`)
    const stageDir = await createStageDir(this, packager, arch)
    const appInStageDir = stageDir.getTempFile("app")
    await copyDirUsingHardLinks(appOutDir, appInStageDir)

    const resourceName = `appimagekit-${this.packager.executableName}`
    const installIcons = await this.copyIcons(stageDir.dir, resourceName)

    const finalDesktopFilename = `${this.packager.executableName}.desktop`
    await BluebirdPromise.all([
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

    //noinspection SpellCheckingInspection
    const vendorDir = await getAppImage()

    if (this.packager.packagerOptions.effectiveOptionComputed != null && await this.packager.packagerOptions.effectiveOptionComputed({desktop: await this.desktopEntry.value})) {
      return
    }

    if (arch === Arch.x64 || arch === Arch.ia32) {
      await copyDir(path.join(vendorDir, "lib", arch === Arch.x64 ? "x86_64-linux-gnu" : "i386-linux-gnu"), stageDir.getTempFile("usr/lib"), {
        isUseHardLink: USE_HARD_LINKS,
      })
    }

    const publishConfig = await getAppUpdatePublishConfiguration(packager, arch)
    if (publishConfig != null) {
      await writeFile(path.join(packager.getResourcesDir(appInStageDir), "app-update.yml"), serializeToYaml(publishConfig))
    }

    const vendorToolDir = path.join(vendorDir, process.platform === "darwin" ? "darwin" : `linux-${process.arch}`)
    // default gzip compression - 51.9, xz - 50.4 difference is negligible, start time - well, it seems, a little bit longer (but on Parallels VM on external SSD disk)
    // so, to be decided later, is it worth to use xz by default
    const args = [
      "--runtime-file", path.join(vendorDir, `runtime-${(archToRuntimeName(arch))}`),
      "--no-appstream",
    ]
    if (debug.enabled) {
      args.push("--verbose")
    }
    if (packager.compression === "maximum") {
      args.push("--comp", "xz")
    }
    args.push(stageDir.dir, artifactPath)
    await exec(path.join(vendorToolDir, "appimagetool"), args, {
      env: {
        ...process.env,
        PATH: `${vendorToolDir}:${process.env.PATH}`,
        // to avoid detection by appimagetool (see extract_arch_from_text about expected arch names)
        ARCH: arch === Arch.ia32 ? "i386" : (arch === Arch.x64 ? "x86_64" : (arch === Arch.arm64 ? "arm_aarch64" : "arm")),
      }
    })

    await stageDir.cleanup()

    const updateInfo = await appendBlockmap(artifactPath)
    packager.info.dispatchArtifactCreated({
      file: artifactPath,
      safeArtifactName: packager.computeSafeArtifactName(artifactName, "AppImage", arch, false),
      target: this,
      arch,
      packager,
      isWriteUpdateInfo: true,
      updateInfo,
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

// https://unix.stackexchange.com/questions/202430/how-to-copy-a-directory-recursively-using-hardlinks-for-each-file
function copyDirUsingHardLinks(source: string, destination: string) {
  if (process.platform !== "darwin") {
    const args = ["-d", "--recursive", "--preserve=mode"]
    args.push("--link")
    args.push(source + "/", destination + "/")
    return ensureDir(path.dirname(destination)).then(() => exec("cp", args))
  }

  // pax requires created dir
  const promise = ensureDir(destination)
  return promise
    .then(() => exec("pax", ["-rwl", "-p", "amp" /* Do not preserve file access times, Do not preserve file modification times, Preserve the file mode	bits */, ".", destination], {
      cwd: source,
    }))
}

function archToRuntimeName(arch: Arch) {
  switch (arch) {
    case Arch.armv7l:
      return "armv7"

    case Arch.arm64:
      return "arm64"

    case Arch.ia32:
      return "i686"

    case Arch.x64:
      return "x86_64"

    default:
      throw new Error(`AppImage for arch ${Arch[arch]} not supported`)
  }
}