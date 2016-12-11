import { Arch } from "../metadata"
import * as path from "path"
import { exec } from "../util/util"
import { open, write, createReadStream, createWriteStream, close, chmod } from "fs-extra-p"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { getBin } from "../util/binDownload"
import BluebirdPromise from "bluebird-lst-c"
import { v1 as uuid1 } from "uuid-1345"
import { LinuxPackager } from "../linuxPackager"
import { log } from "../util/log"
import { Target } from "./targetFactory"
import { unlinkIfExists } from "../util/fs"

const appImageVersion = process.platform === "darwin" ? "AppImage-09-07-16-mac" : "AppImage-09-07-16-linux"
//noinspection SpellCheckingInspection
const appImageSha256 = process.platform === "darwin" ? "5d4a954876654403698a01ef5bd7f218f18826261332e7d31d93ab4432fa0312" : "ac324e90b502f4e995f6a169451dbfc911bb55c0077e897d746838e720ae0221"
//noinspection SpellCheckingInspection
const appImagePathPromise = getBin("AppImage", appImageVersion, `https://dl.bintray.com/electron-userland/bin/${appImageVersion}.7z`, appImageSha256)

export default class AppImageTarget extends Target {
  private readonly options = Object.assign({}, this.packager.platformSpecificBuildOptions, (<any>this.packager.config)[this.name])
  private readonly desktopEntry: Promise<string>

  constructor(ignored: string, private packager: LinuxPackager, private helper: LinuxTargetHelper, private outDir: string) {
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

    args.push("-chown_r", "0", "/", "--")
    args.push("-zisofs", `level=${packager.config.compression === "store" ? "0" : "9"}:block_size=128k:by_magic=off`)
    args.push("set_filter_r", "--zisofs", "/")

    if (this.packager.options.effectiveOptionComputed != null && await this.packager.options.effectiveOptionComputed([args, desktopFile])) {
      return
    }

    await exec(process.arch === "x64" ? path.join(appImagePath, "xorriso") : "xorriso", args)

    await new BluebirdPromise((resolve, reject) => {
      const rd = createReadStream(path.join(appImagePath, arch === Arch.ia32 ? "32" : "64", "runtime"))
      rd.on("error", reject)
      const wr = createWriteStream(resultFile, {flags: "r+"})
      wr.on("error", reject)
      wr.on("finish", resolve)
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

    packager.dispatchArtifactCreated(resultFile)
  }
}