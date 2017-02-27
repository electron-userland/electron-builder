import { Arch, Platform, Target } from "electron-builder-core"
import { log } from "electron-builder-util/out/log"
import * as path from "path"
import { PlatformPackager } from "../platformPackager"
import { archive, tar } from "./archive"

export class ArchiveTarget extends Target {
  constructor(name: string, readonly outDir: string, private readonly packager: PlatformPackager<any>) {
    super(name)
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const isMac = packager.platform === Platform.MAC
    const outDir = this.outDir

    const format = this.name
    log(`Building ${isMac ? "macOS " : ""}${format}`)

    // we use app name here - see https://github.com/electron-userland/electron-builder/pull/204
    const outFile = (() => {
      switch (packager.platform) {
        case Platform.MAC:
          return path.join(outDir, packager.generateName2(format, "mac", false))
        case Platform.WINDOWS:
          return path.join(outDir, packager.generateName(format, arch, false, "win"))
        case Platform.LINUX:
          return path.join(outDir, packager.generateName(format, arch, true))
        default:
          throw new Error(`Unknown platform: ${packager.platform}`)
      }
    })()

    if (format.startsWith("tar.")) {
      await tar(packager.config.compression, format, outFile, appOutDir, isMac)
    }
    else {
      await archive(packager.config.compression, format, outFile, appOutDir)
    }

    packager.dispatchArtifactCreated(outFile, this, isMac ? packager.generateName2(format, "mac", true) : packager.generateName(format, arch, true, packager.platform === Platform.WINDOWS ? "win" : null))
  }
}