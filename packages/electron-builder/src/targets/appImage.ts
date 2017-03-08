import BluebirdPromise from "bluebird-lst"
import { Arch, Target } from "electron-builder-core"
import { exec } from "electron-builder-util"
import { getBin } from "electron-builder-util/out/binDownload"
import { unlinkIfExists } from "electron-builder-util/out/fs"
import { log } from "electron-builder-util/out/log"
import { chmod, close, createReadStream, createWriteStream, open, write } from "fs-extra-p"
import * as path from "path"
import { v1 as uuid1 } from "uuid-1345"
import { LinuxPackager } from "../linuxPackager"
import { AppImageOptions } from "../options/linuxOptions"
import { LinuxTargetHelper } from "./LinuxTargetHelper"

const appImageVersion = process.platform === "darwin" ? "AppImage-09-07-16-mac" : "AppImage-09-07-16-linux"
//noinspection SpellCheckingInspection
const appImageSha256 = process.platform === "darwin" ? "5d4a954876654403698a01ef5bd7f218f18826261332e7d31d93ab4432fa0312" : "ac324e90b502f4e995f6a169451dbfc911bb55c0077e897d746838e720ae0221"
//noinspection SpellCheckingInspection
const appImagePathPromise = getBin("AppImage", appImageVersion, `https://dl.bintray.com/electron-userland/bin/${appImageVersion}.7z`, appImageSha256)

export default class AppImageTarget extends Target {
  private readonly options: AppImageOptions = Object.assign({}, this.packager.platformSpecificBuildOptions, (<any>this.packager.config)[this.name])
  private readonly desktopEntry: Promise<string>

  constructor(ignored: string, private readonly packager: LinuxPackager, private readonly helper: LinuxTargetHelper, readonly outDir: string) {
    super("appImage")

    // we add X-AppImage-BuildId to ensure that new desktop file will be installed
    this.desktopEntry = BluebirdPromise.promisify(uuid1)({mac: false})
      .then(uuid => helper.computeDesktopEntry(this.options, "AppRun", null, {
        "X-AppImage-Version": `${packager.appInfo.buildVersion}`,
        "X-AppImage-BuildId": uuid,
      }))
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    log(`Building AppImage for arch ${Arch[arch]}`)

    const packager = this.packager

    // avoid spaces in the file name
    const resultFile = path.join(this.outDir, packager.generateName("AppImage", arch, true))
    await unlinkIfExists(resultFile)

    const appImagePath = await appImagePathPromise
    const desktopFile = await this.desktopEntry
    const args = [
      "-joliet", "on",
      "-volid", "AppImage",
      "-dev", resultFile,
      "-padding", "0",
      "-map", appOutDir, "/usr/bin",
      "-map", path.join(__dirname, "..", "..", "templates", "linux", "AppRun.sh"), "/AppRun",
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

    if (arch === Arch.x64) {
      const libDir = await getBin("AppImage-packages", "22.02.17", "https://bintray.com/electron-userland/bin/download_file?file_path=AppImage-packages-22.02.17-x64.7z", "04842227380e319f80727457ca76017df9e23356408df0d71f2919840cd4ffaf")
      args.push("-map", libDir, "/usr/lib")
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
      const magicData = new Buffer([0x41, 0x49, 0x01])
      await write(fd, magicData, 0, magicData.length, 8)
    }
    finally {
      await close(fd)
    }

    await chmod(resultFile, "0755")

    packager.dispatchArtifactCreated(resultFile, this)
  }
}