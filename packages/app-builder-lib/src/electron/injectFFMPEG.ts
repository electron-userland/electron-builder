import { executeAppBuilder, log } from "builder-util"
import { MultiProgress } from "electron-publish/out/multiProgress"
import * as fs from "fs-extra"
import * as path from "path"
import { PrepareApplicationStageDirectoryOptions } from "../Framework"
import { downloadArtifact } from "../util/electronGet"
import { ElectronBrandingOptions } from "./ElectronFramework"
import { Platform } from "../core"

export class FFMPEGInjector {
  constructor(
    private readonly progress: MultiProgress | null,
    private readonly options: PrepareApplicationStageDirectoryOptions,
    private readonly electronVersion: string,
    private readonly branding: Required<ElectronBrandingOptions>
  ) {}

  async inject() {
    const libPath =
      this.options.platformName === Platform.MAC.nodeName
        ? path.join(this.options.appOutDir, `${this.branding.productName}.app`, `/Contents/Frameworks/${this.branding.productName} Framework.framework/Versions/A/Libraries`)
        : this.options.appOutDir

    const ffmpegDir = await this.downloadFFMPEG()
    return this.copyFFMPEG(libPath, ffmpegDir)
  }

  private async downloadFFMPEG(): Promise<string> {
    const ffmpegFileName = `ffmpeg-v${this.electronVersion}-${this.options.platformName}-${this.options.arch}`

    log.info({ ffmpegFileName }, "downloading")

    const {
      packager: {
        config: { electronDownload },
      },
      platformName,
      arch,
    } = this.options

    const file = await downloadArtifact(
      {
        electronDownload,
        artifactName: "ffmpeg",
        platformName,
        arch,
        version: this.electronVersion,
      },
      this.progress
    )

    const ffmpegDir = await this.options.packager.info.tempDirManager.getTempDir({ prefix: "ffmpeg" })
    log.debug(null, "extracting FFMPEG zip")
    await executeAppBuilder(["unzip", "--input", file, "--output", ffmpegDir])
    return ffmpegDir
  }

  async copyFFMPEG(targetPath: string, sourcePath: string) {
    let fileName = "ffmpeg.dll"
    if (["darwin", "mas"].includes(this.options.platformName)) {
      fileName = "libffmpeg.dylib"
    } else if (this.options.platformName === "linux") {
      fileName = "libffmpeg.so"
    }

    const libPath = path.resolve(sourcePath, fileName)
    const libTargetPath = path.resolve(targetPath, fileName)
    log.info({ lib: log.filePath(libPath), target: libTargetPath }, "copying non-proprietary FFMPEG")

    // If the source doesn't exist we have a problem
    if (!fs.existsSync(libPath)) {
      throw new Error(`Failed to find FFMPEG library file at path: ${libPath}`)
    }

    // If we are copying to the source we can stop immediately
    if (libPath !== libTargetPath) {
      await fs.copyFile(libPath, libTargetPath)
    }
    return libTargetPath
  }
}
