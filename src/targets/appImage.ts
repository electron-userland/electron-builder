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

const appImageVersion = process.platform === "darwin" ? "AppImage-09-07-16-mac" : "AppImage-09-07-16-linux"
//noinspection SpellCheckingInspection
const appImageSha256 = process.platform === "darwin" ? "5d4a954876654403698a01ef5bd7f218f18826261332e7d31d93ab4432fa0312" : "ac324e90b502f4e995f6a169451dbfc911bb55c0077e897d746838e720ae0221"
//noinspection SpellCheckingInspection
const appImagePathPromise = getBin("AppImage", appImageVersion, `https://dl.bintray.com/electron-userland/bin/${appImageVersion}.7z`, appImageSha256)

export default class AppImageTarget extends TargetEx {
  private readonly desktopEntry: Promise<string>

  constructor(private packager: PlatformPackager<LinuxBuildOptions>, private helper: LinuxTargetHelper, private outDir: string) {
    super("appImage")

    this.desktopEntry = helper.computeDesktopEntry("AppRun", `X-AppImage-Version=${packager.appInfo.buildVersion}`)
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager

    // avoid spaces in the file name
    const image = path.join(this.outDir, packager.generateName("AppImage", arch, true))
    const appInfo = packager.appInfo
    await unlinkIfExists(image)

    const appImagePath = await appImagePathPromise
    const appExecutableImagePath = `/usr/bin/${appInfo.name}`
    const args = [
      "-joliet", "on",
      "-volid", "AppImage",
      "-dev", image,
      "-padding", "0",
      "-map", appOutDir, "/usr/bin",
      "-map", path.join(__dirname, "..", "..", "templates", "linux", "AppRun.sh"), "/AppRun",
      "-map", await this.desktopEntry, `/${appInfo.name}.desktop`,
      "-move", `/usr/bin/${appInfo.productFilename}`, appExecutableImagePath,
      // http://stackoverflow.com/questions/13633488/can-i-store-unix-permissions-in-a-zip-file-built-with-apache-ant, xorriso doesn't preserve it for zip, but we set it in any case
      "-chmod", "+x", appExecutableImagePath, "--",
      "-chmod", "+x", "/AppRun", appExecutableImagePath, "--",
    ]
    for (let [from, to] of (await this.helper.icons)) {
      args.push("-map", from, `/usr/share/icons/default/${to}`)
    }

    // must be after this.helper.icons call
    if (this.helper.maxIconPath == null) {
      throw new Error("Icon is not provided")
    }
    args.push("-map", this.helper.maxIconPath, "/.DirIcon")

    args.push("-chown_r", "0", "/", "--")
    args.push("-zisofs", `level=${packager.devMetadata.build.compression === "store" ? "0" : "9"}:block_size=128k:by_magic=off`)
    args.push("set_filter_r", "--zisofs", "/")

    await exec(process.env.USE_SYSTEM_FPM === "true" || process.arch !== "x64" ? "xorriso" : path.join(appImagePath, "xorriso"), args)

    await new BluebirdPromise((resolve, reject) => {
      const rd = createReadStream(path.join(appImagePath, arch === Arch.ia32 ? "32" : "64", "runtime"))
      rd.on("error", reject)
      const wr = createWriteStream(image, {flags: "r+"})
      wr.on("error", reject)
      wr.on("finish", resolve)
      rd.pipe(wr)
    })

    const fd = await open(image, "r+")
    try {
      const magicData = new Buffer([0x41, 0x49, 0x01])
      await write(fd, magicData, 0, magicData.length, 8)
    }
    finally {
      await close(fd)
    }

    await chmod(image, "0755")

    packager.dispatchArtifactCreated(image, packager.generateName("AppImage", arch, true))
  }
}