import {  PlatformPackager, TargetEx } from "../platformPackager"
import { LinuxBuildOptions, Arch } from "../metadata"
import * as path from "path"
import { exec, unlinkIfExists, spawn, debug } from "../util/util"
import { open, write, createReadStream, createWriteStream, close, chmod } from "fs-extra-p"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { getBin } from "../util/binDownload"
import { Promise as BluebirdPromise } from "bluebird"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter")

const appImageVersion = "AppImage-5"
//noinspection SpellCheckingInspection
const appImagePathPromise = getBin("AppImage", appImageVersion, `https://dl.bintray.com/electron-userland/bin/${appImageVersion}.7z`, "19833e5db3cbc546432de8ddc8a54181489e6faad4944bd1f3138adf4b771259")

export default class AppImageTarget extends TargetEx {
  private readonly desktopEntry: Promise<string>

  constructor(private packager: PlatformPackager<LinuxBuildOptions>, private helper: LinuxTargetHelper, private outDir: string) {
    super("appImage")

    this.desktopEntry = helper.computeDesktopEntry("AppRun", `X-AppImage-Version=${packager.appInfo.buildVersion}`)
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager

    const image = path.join(this.outDir, packager.generateName(null, arch, true))
    const appInfo = packager.appInfo
    await unlinkIfExists(image)

    const appImagePath = await appImagePathPromise
    const args = [
      "-joliet", "on",
      "-volid", "AppImage",
      "-dev", image,
      "-padding", "0",
      "-map", appOutDir, "/usr/bin",
      "-map", path.join(__dirname, "..", "..", "templates", "linux", "AppRun.sh"), `/AppRun`,
      "-map", await this.desktopEntry, `/${appInfo.name}.desktop`,
      "-move", `/usr/bin/${appInfo.productFilename}`, "/usr/bin/app",
    ]
    for (let [from, to] of (await this.helper.icons)) {
      args.push("-map", from, `/usr/share/icons/default/${to}`)
    }

    // must be after this.helper.icons call
    if (this.helper.maxIconPath == null) {
      throw new Error("Icon is not provided")
    }
    args.push("-map", this.helper.maxIconPath, "/.DirIcon")

    // args.push("-zisofs", `level=0:block_size=128k:by_magic=off`, "-chown_r", "0")
    // args.push("/", "--", "set_filter_r", "--zisofs", "/")

    await exec(process.platform === "darwin" ? path.join(appImagePath, "xorriso") : "xorriso", args)

    await new BluebirdPromise((resolve, reject) => {
      const rd = createReadStream(path.join(appImagePath, arch === Arch.ia32 ? "32" : "64", "runtime"))
      rd.on("error", reject)
      const wr = createWriteStream(image)
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
    // we archive because you cannot distribute exe as is - e.g. Ubuntu clear exec flag and user cannot just click on AppImage to run
    // also, LZMA compression - 29MB vs zip 42MB
    // we use slow xz instead of 7za because 7za doesn't preserve exec file permissions for xz
    await spawn("xz", ["--x86", "--lzma2", "--compress", "--force", packager.devMetadata.build.compression === "store" ? "-0" : "-9e", image], {
      cwd: path.dirname(image),
      stdio: ["ignore", debug.enabled ? "inherit" : "ignore", "inherit"],
    })

    packager.dispatchArtifactCreated(image)
  }
}