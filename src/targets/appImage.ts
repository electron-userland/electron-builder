import {  PlatformPackager, TargetEx } from "../platformPackager"
import { LinuxBuildOptions, Arch } from "../metadata"
import * as path from "path"
import { exec, unlinkIfExists } from "../util/util"
import { open, write, createReadStream, createWriteStream, close, chmod } from "fs-extra-p"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { getBin } from "../util/binDownload"
import { Promise as BluebirdPromise } from "bluebird"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter")

const appImageVersion = "AppImage-5"
const appImagePathPromise = getBin("AppImage", appImageVersion, `https://dl.bintray.com/electron-userland/bin/${appImageVersion}.7z`, "")

export default class AppImageTarget extends TargetEx {
  private readonly desktopEntry: Promise<string>

  constructor(private packager: PlatformPackager<LinuxBuildOptions>, private helper: LinuxTargetHelper, private outDir: string) {
    super("appImage")

    this.desktopEntry = helper.computeDesktopEntry(true)
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager

    const destination = path.join(this.outDir, packager.generateName(null, arch, true))
    const appInfo = packager.appInfo

    await unlinkIfExists(destination)

    const appImagePath = await appImagePathPromise
    const args = [
      "-joliet", "on",
      "-volid", "AppImage",
      "-dev", destination,
      "-padding", "0",
      "-map", appOutDir, "/usr/bin", "--",
      "-map", await this.desktopEntry, `/${appInfo.name}.desktop`, "--",
      "-map", path.join(appImagePath, arch === Arch.ia32 ? "32": "64", "AppRun"), "/AppRun", "--",
    ]

    for (let [from, to] of (await this.helper.icons)) {
      args.push("-map", from, `/usr/share/icons/default/${to}`, "--",)
    }

    // must be after this.helper.icons call
    if (this.helper.maxIconPath == null) {
      throw new Error("Icon is not provided")
    }
    args.push("-map", this.helper.maxIconPath, "/.DirIcon", "--",)
    args.push("-map", this.helper.maxIconPath, `/${appInfo.name}${path.extname(this.helper.maxIconPath)}`, "--",)

    args.push("-zisofs", `level=${packager.devMetadata.build.compression === "store" ? "0" : "9"}:block_size=128k:by_magic=off`, "-chown_r", "0")
    args.push("/", "--", "set_filter_r", "--zisofs", "/")

    await exec("xorriso", args)

    const fd = await open(destination, "r+")
    try {
      await new BluebirdPromise((resolve, reject) => {
        const rd = createReadStream(path.join(appImagePath, arch === Arch.ia32 ? "32" : "64", "AppRun"))
        rd.on("error", reject)
        const wr = createWriteStream(destination, <any>{fd: fd, autoClose: false})
        wr.on("error", reject)
        wr.on("finish", resolve)
        rd.pipe(wr)
      })

      const magicData = new Buffer([0x41, 0x49, 0x01])
      await write(fd, magicData, 0, magicData.length, 8)
    }
    finally {
      await close(fd)
    }

    await chmod(destination, "0755")

    packager.dispatchArtifactCreated(destination)
  }
}