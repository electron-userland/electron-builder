import { Arch, log } from "builder-util"
import * as path from "path"
import { Platform, Target } from "../core"
import { PlatformPackager } from "../platformPackager"
import { archive, tar } from "./archive"

export class ArchiveTarget extends Target {
  readonly options = (this.packager.config as any)[this.name]

  constructor(name: string, readonly outDir: string, private readonly packager: PlatformPackager<any>) {
    super(name)
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const isMac = packager.platform === Platform.MAC
    const format = this.name
    log(`Building ${isMac ? "macOS " : ""}${format}`)

    // do not specify arch if x64
    // tslint:disable:no-invalid-template-strings
    const outFile = path.join(this.outDir, packager.expandArtifactNamePattern(this.options, format, arch, packager.platform === Platform.LINUX ? "${name}-${version}-${arch}.${ext}" : "${productName}-${version}-${arch}-${os}.${ext}"))
    if (format.startsWith("tar.")) {
      await tar(packager.compression, format, outFile, appOutDir, isMac, packager.info.tempDirManager)
    }
    else {
      await archive(packager.compression, format, outFile, appOutDir, {withoutDir: !isMac})
    }

    packager.dispatchArtifactCreated(outFile, this, arch, isMac ? packager.generateName2(format, "mac", true) : packager.generateName(format, arch, true, packager.platform === Platform.WINDOWS ? "win" : null))
  }
}