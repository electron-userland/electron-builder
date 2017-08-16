import BluebirdPromise from "bluebird-lst"
import { Arch, exec, log } from "electron-builder-util"
import { getBin, getBinFromGithub } from "electron-builder-util/out/binDownload"
import { unlinkIfExists } from "electron-builder-util/out/fs"
import { chmod, close, createReadStream, createWriteStream, open, write } from "fs-extra-p"
import * as path from "path"
import { v1 as uuid1 } from "uuid-1345"
import { Target } from "../core"
import { LinuxPackager } from "../linuxPackager"
import { LinuxBuildOptions } from "../options/linuxOptions"
import { LinuxTargetHelper } from "./LinuxTargetHelper"

const appImageVersion = process.platform === "darwin" ? "AppImage-17-06-17-mac" : "AppImage-09-07-16-linux"
//noinspection SpellCheckingInspection
const appImagePathPromise = process.platform === "darwin" ? getBinFromGithub("AppImage", "17-06-17-mac", "vIaikS8Z2dEnZXKSgtcTn4gimPHCclp+v62KV2Eh9EhxvOvpDFgR3FCgdOsON4EqP8PvnfifNtxgBixCfuQU0A==") : getBin("AppImage", appImageVersion, `https://dl.bintray.com/electron-userland/bin/${appImageVersion}.7z`, "ac324e90b502f4e995f6a169451dbfc911bb55c0077e897d746838e720ae0221")

export default class AppImageTarget extends Target {
  readonly options: LinuxBuildOptions = {...this.packager.platformSpecificBuildOptions, ...(this.packager.config as any)[this.name]}
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

    // https://github.com/electron-userland/electron-builder/issues/775
    // https://github.com/electron-userland/electron-builder/issues/1726
    const safeArtifactName = this.options.artifactName == null ? packager.computeSafeArtifactName("AppImage", arch, false) : packager.expandArtifactNamePattern(this.options, "AppImage", arch)
    const resultFile = path.join(this.outDir, safeArtifactName)
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
      // noinspection SpellCheckingInspection
      const libDir = process.platform === "darwin" ? path.join(appImagePath, "packages") : await getBin("AppImage-packages", "10.03.17", "https://bintray.com/electron-userland/bin/download_file?file_path=AppImage-packages-10.03.17-x64.7z", "172f9977fe9b24d35091d26ecbfebe2a14d96516a9c903e109e12b2a929042fe")
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

    packager.dispatchArtifactCreated(resultFile, this, arch, safeArtifactName)
  }
}
