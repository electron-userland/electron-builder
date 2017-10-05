import BluebirdPromise from "bluebird-lst"
import { Arch, exec, log, debug } from "builder-util"
import { UUID } from "builder-util-runtime"
import { getBinFromGithub } from "builder-util/out/binDownload"
import { unlinkIfExists, copyOrLinkFile, copyDir, USE_HARD_LINKS } from "builder-util/out/fs"
import * as ejs from "ejs"
import { emptyDir, ensureDir, readFile, remove, symlink, writeFile } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import { Target } from "../core"
import { LinuxPackager } from "../linuxPackager"
import { AppImageOptions } from "../options/linuxOptions"
import { getTemplatePath } from "../util/pathManager"
import { LinuxTargetHelper } from "./LinuxTargetHelper"

const appRunTemplate = new Lazy<(data: any) => string>(async () => {
  return ejs.compile(await readFile(path.join(getTemplatePath("linux"), "AppRun.sh"), "utf-8"))
})

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
    log(`Building AppImage for arch ${Arch[arch]}`)

    const packager = this.packager

    // https://github.com/electron-userland/electron-builder/issues/775
    // https://github.com/electron-userland/electron-builder/issues/1726
    const artifactName = this.options.artifactName == null ? packager.computeSafeArtifactName(null, "AppImage", arch, false)!! : packager.expandArtifactNamePattern(this.options, "AppImage", arch)
    const resultFile = path.join(this.outDir, artifactName)

    // pax doesn't like dir with leading dot (e.g. `.__appimage`)
    const stageDir = path.join(this.outDir, `__appimage-${Arch[arch]}`)
    const appInStageDir = path.join(stageDir, "app")
    await emptyDir(stageDir)
    await copyDirUsingHardLinks(appOutDir, appInStageDir)

    const resourceName = `appimagekit-${this.packager.executableName}`
    const installIcons = await this.copyIcons(stageDir, resourceName)

    const finalDesktopFilename = `${this.packager.executableName}.desktop`
    await BluebirdPromise.all([
      unlinkIfExists(resultFile),
      writeFile(path.join(stageDir, "/AppRun"), (await appRunTemplate.value)({
        systemIntegration: this.options.systemIntegration || "ask",
        desktopFileName: finalDesktopFilename,
        executableName: this.packager.executableName,
        resourceName,
        installIcons,
      }), {
        mode: "0755",
      }),
      writeFile(path.join(stageDir, finalDesktopFilename), await this.desktopEntry.value),
    ])

    // must be after this.helper.icons call
    if (this.helper.maxIconPath == null) {
      throw new Error("Icon is not provided")
    }

    //noinspection SpellCheckingInspection
    const vendorDir = await getBinFromGithub("appimage", "9.0.1", "mcme+7/krXSYb5C+6BpSt9qgajFYpn9dI1rjxzSW3YB5R/KrGYYrpZbVflEMG6pM7k9CL52poiOpGLBDG/jW3Q==")

    if (arch === Arch.x64 || arch === Arch.ia32) {
      await copyDir(path.join(vendorDir, "lib", arch === Arch.x64 ? "x86_64-linux-gnu" : "i386-linux-gnu"), path.join(stageDir, "usr/lib"), {
        isUseHardLink: USE_HARD_LINKS,
      })
    }

    if (this.packager.packagerOptions.effectiveOptionComputed != null && await this.packager.packagerOptions.effectiveOptionComputed({desktop: await this.desktopEntry.value})) {
      return
    }

    const vendorToolDir = path.join(vendorDir, process.platform === "darwin" ? "darwin" : `linux-${process.arch}`)
    // default gzip compression - 51.9, xz - 50.4 difference is negligible, start time - well, it seems, a little bit longer (but on Parallels VM on external SSD disk)
    // so, to be decided later, is it worth to use xz by default
    const args = ["--runtime-file", path.join(vendorDir, `runtime-${(arch === Arch.ia32 ? "i686" : (arch === Arch.x64 ? "x86_64" : "armv7l"))}`)]
    if (debug.enabled) {
      args.push("--verbose")
    }
    args.push(stageDir, resultFile)
    await exec(path.join(vendorToolDir, "appimagetool"), args, {
      env: {
        ...process.env,
        PATH: `${vendorToolDir}:${process.env.PATH}`,
        // to avoid detection by appimagetool (see extract_arch_from_text about expected arch names)
        ARCH: arch === Arch.ia32 ? "i386" : (arch === Arch.x64 ? "x86_64" : "arm"),
      }
    })
    if (!debug.enabled) {
      await remove(stageDir)
    }
    packager.dispatchArtifactCreated(resultFile, this, arch, packager.computeSafeArtifactName(artifactName, "AppImage", arch, false))
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