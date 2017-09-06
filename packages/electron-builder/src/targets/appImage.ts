import BluebirdPromise from "bluebird-lst"
import { Arch, exec, log } from "builder-util"
import { UUID } from "builder-util-runtime"
import { getBin, getBinFromGithub } from "builder-util/out/binDownload"
import { unlinkIfExists } from "builder-util/out/fs"
import * as ejs from "ejs"
import { chmod, close, createReadStream, createWriteStream, open, outputFile, readFile, write } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import { Target } from "../core"
import { LinuxPackager } from "../linuxPackager"
import { AppImageOptions } from "../options/linuxOptions"
import { getTemplatePath } from "../util/pathManager"
import { LinuxTargetHelper } from "./LinuxTargetHelper"

const appImageVersion = process.platform === "darwin" ? "AppImage-17-06-17-mac" : "AppImage-09-07-16-linux"
//noinspection SpellCheckingInspection
const appImagePathPromise = process.platform === "darwin" ?
  getBinFromGithub("AppImage", "17-06-17-mac", "vIaikS8Z2dEnZXKSgtcTn4gimPHCclp+v62KV2Eh9EhxvOvpDFgR3FCgdOsON4EqP8PvnfifNtxgBixCfuQU0A==") :
  getBin("AppImage", appImageVersion, `https://dl.bintray.com/electron-userland/bin/${appImageVersion}.7z`, "ac324e90b502f4e995f6a169451dbfc911bb55c0077e897d746838e720ae0221")

const appRunTemplate = new Lazy<(data: any) => string>(async () => {
  return ejs.compile(await readFile(path.join(getTemplatePath("linux"), "AppRun.sh"), "utf-8"))
})

export default class AppImageTarget extends Target {
  readonly options: AppImageOptions = {...this.packager.platformSpecificBuildOptions, ...(this.packager.config as any)[this.name]}
  private readonly desktopEntry: Promise<string>

  constructor(ignored: string, private readonly packager: LinuxPackager, private readonly helper: LinuxTargetHelper, readonly outDir: string) {
    super("appImage")

    // we add X-AppImage-BuildId to ensure that new desktop file will be installed
    this.desktopEntry = helper.computeDesktopEntry(this.options, "AppRun", null, {
      "X-AppImage-Version": `${packager.appInfo.buildVersion}`,
      "X-AppImage-BuildId": UUID.v1(),
    })
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    log(`Building AppImage for arch ${Arch[arch]}`)

    const packager = this.packager

    // https://github.com/electron-userland/electron-builder/issues/775
    // https://github.com/electron-userland/electron-builder/issues/1726
    const artifactName = this.options.artifactName == null ? packager.computeSafeArtifactName(null, "AppImage", arch, false)!! : packager.expandArtifactNamePattern(this.options, "AppImage", arch)
    const resultFile = path.join(this.outDir, artifactName)
    await unlinkIfExists(resultFile)

    const appRunData = (await appRunTemplate.value)({
      systemIntegration: this.options.systemIntegration || "ask"
    })
    const appRunFile = await packager.getTempFile(".sh")
    await outputFile(appRunFile, appRunData, {
      mode: "0755",
    })

    const appImagePath = await appImagePathPromise
    const desktopFile = await this.desktopEntry
    const args = [
      "-joliet", "on",
      "-volid", "AppImage",
      "-dev", resultFile,
      "-padding", "0",
      "-map", appOutDir, "/usr/bin",
      "-map", appRunFile, "/AppRun",
      // we get executable name in the AppRun by desktop file name, so, must be named as executable
      "-map", desktopFile, `/${this.packager.executableName}.desktop`,
    ]
    for (const [from, to] of (await this.helper.icons)) {
      args.push("-map", from, `/usr/share/icons/default/${to}`)
    }

    // must be after this.helper.icons call
    if (this.helper.maxIconPath == null) {
      throw new Error("Icon is not provided")
    }
    args.push("-map", this.helper.maxIconPath, "/.DirIcon")

    if (arch === Arch.x64 || arch === Arch.ia32) {
      // noinspection SpellCheckingInspection
      args.push("-map", path.join(await getBinFromGithub("appimage-packages", "28-08-17", "ionv5NRfkOFXTJsu9Db4GNN6bbTvuwvQCuK6eDZCaRJl0+4GwwdZhk2i8Cmk0J2bNNsUSsZxVCnOKw0MJxJRpQ=="), arch === Arch.x64 ? "x86_64-linux-gnu" : "i386-linux-gnu"), "/usr/lib")
    }

    args.push("-chown_r", "0", "/", "--")
    args.push("-zisofs", `level=${process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || (packager.config.compression === "store" ? "0" : "9")}:block_size=128k:by_magic=off`)
    args.push("set_filter_r", "--zisofs", "/")

    if (this.packager.packagerOptions.effectiveOptionComputed != null && await this.packager.packagerOptions.effectiveOptionComputed([args, desktopFile])) {
      return
    }

    await exec(process.arch !== "x64" || (process.env.USE_SYSTEM_XORRISO === "true" || process.env.USE_SYSTEM_XORRISO === "") ? "xorriso" : path.join(appImagePath, "xorriso"), args, {
      maxBuffer: 2 * 1024 * 1024
    })

    await new BluebirdPromise((resolve, reject) => {
      const rd = createReadStream(path.join(appImagePath, arch === Arch.ia32 ? "32" : "64", "runtime"))
      rd.on("error", reject)
      const wr = createWriteStream(resultFile, {flags: "r+"})
      wr.on("error", reject)
      wr.on("close", resolve)
      rd.pipe(wr)
    })

    const fd = await open(resultFile, "r+")
    try {
      const magicData = Buffer.from([0x41, 0x49, 0x01])
      await write(fd, magicData, 0, magicData.length, 8)
    }
    finally {
      await close(fd)
    }

    await chmod(resultFile, "0755")

    packager.dispatchArtifactCreated(resultFile, this, arch, packager.computeSafeArtifactName(artifactName, "AppImage", arch, false))
  }
}
