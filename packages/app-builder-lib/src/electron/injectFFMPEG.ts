import * as fs from "fs"
import * as path from "path"
import { ElectronPlatformName } from "./ElectronFramework"

import { log } from "builder-util"
import { getBin } from "../binDownload"
import { PrepareApplicationStageDirectoryOptions } from "../Framework"

// NOTE: Adapted from https://github.com/MarshallOfSound/electron-packager-plugin-non-proprietary-codecs-ffmpeg to resolve dependency vulnerabilities
const downloadFFMPEG = async (electronVersion: string, platform: ElectronPlatformName, arch: string) => {
  const ffmpegFileName = `ffmpeg-v${electronVersion}-${platform}-${arch}.zip`
  const url = `https://github.com/electron/electron/releases/download/v${electronVersion}/${ffmpegFileName}`

  log.info({ file: ffmpegFileName }, "downloading non-proprietary FFMPEG")
  return getBin(ffmpegFileName, url)
}

const copyFFMPEG = (targetPath: string, platform: ElectronPlatformName) => (sourcePath: string) => {
  let fileName = "ffmpeg.dll"
  if (["darwin", "mas"].includes(platform)) {
    fileName = "libffmpeg.dylib"
  } else if (platform === "linux") {
    fileName = "libffmpeg.so"
  }

  const libPath = path.resolve(sourcePath, fileName)
  const libTargetPath = path.resolve(targetPath, fileName)
  log.info({ lib: libPath, target: libTargetPath }, "copying non-proprietary FFMPEG")

  // If the source doesn't exist we have a problem
  if (!fs.existsSync(libPath)) {
    throw new Error(`Failed to find FFMPEG library file at path: ${libPath}`)
  }

  // If we are copying to the source we can stop immediately
  if (libPath !== libTargetPath) {
    fs.copyFileSync(libPath, libTargetPath)
  }
  return libTargetPath
}

export default function injectFFMPEG(options: PrepareApplicationStageDirectoryOptions, electrionVersion: string) {
  let libPath = options.appOutDir
  if (options.platformName === "darwin") {
    libPath = path.resolve(options.appOutDir, "Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries")
  }

  return downloadFFMPEG(electrionVersion, options.platformName, options.arch).then(copyFFMPEG(libPath, options.platformName))
}
