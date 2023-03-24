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

  log.info({ url }, "downloading non-proprietary FFMPEG")
  return getBin(ffmpegFileName, url)
}

const moveFFMPEG = (targetPath: string, platform: ElectronPlatformName) => (sourcePath: string) => {
  let fileName = "libffmpeg.dll"
  if (["darwin", "mas"].includes(platform)) {
    fileName = "libffmpeg.dylib"
  } else if (platform === "linux") {
    fileName = "libffmpeg.so"
  }

  const libTargetPath = path.resolve(targetPath, fileName)
  const libPath = path.resolve(sourcePath, fileName)
  log.info({ lib: libPath, target: libTargetPath }, "copying non-proprietary FFMPEG")

  // If we are copying to the source we can stop immediately
  if (libPath === libTargetPath) {
    return
  }

  // If the source doesn't exist we have a problem
  if (!fs.existsSync(libPath)) {
    throw new Error("Failed to find FFMPEG library file")
  }

  return copyFile(libPath, libTargetPath)
}

const copyFile = (sourceFile: fs.PathLike, targetFile: fs.PathLike, deleteAfter = false) => {
  return new Promise<Error | undefined>(resolve => {
    let doneCalled = false

    // If the target exists we should delete it
    if (fs.existsSync(targetFile)) {
      fs.unlinkSync(targetFile)
    }

    const done = (err: Error | undefined) => {
      if (doneCalled) {
        return
      }
      resolve(err)
      doneCalled = true
    }

    const readStream = fs.createReadStream(sourceFile)
    readStream.on("error", err => {
      done(err)
    })
    const writeStream = fs.createWriteStream(targetFile)
    writeStream.on("error", err => {
      done(err)
    })
    writeStream.on("close", () => {
      if (!doneCalled && deleteAfter) {
        fs.unlinkSync(sourceFile)
      }
      done(undefined)
    })
    readStream.pipe(writeStream)
  })
}

export default function injectFFMPEG(options: PrepareApplicationStageDirectoryOptions, electrionVersion: string) {
  let libPath = options.appOutDir
  if (options.platformName === "darwin") {
    libPath = path.resolve(options.appOutDir, "Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries")
  }

  return downloadFFMPEG(electrionVersion, options.platformName, options.arch).then(moveFFMPEG(libPath, options.platformName))
}
