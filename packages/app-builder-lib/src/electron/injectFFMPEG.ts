import { unzip } from "cross-unzip"
import * as fs from "fs"
import fetch from "node-fetch"
import * as path from "path"
import { ElectronPlatformName } from "./ElectronFramework"

import { isEmptyOrSpaces, log } from "builder-util"
import { PrepareApplicationStageDirectoryOptions } from "../Framework"
import * as os from "os"

// Copied from `cacheManager.ts` otherwise there's a runtime error `(0 , cacheManager_1.getCacheDirectory) is not a function`??
function getCacheDirectory(): string {
  const env = process.env.ELECTRON_BUILDER_CACHE
  if (!isEmptyOrSpaces(env)) {
    return path.resolve(env)
  }
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Cache", "electron-builder")
  } else if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "electron-builder")
  } else {
    return path.join(os.homedir(), ".cache", "electron-builder")
  }
}

// NOTE: Migrated from https://github.com/MarshallOfSound/electron-packager-plugin-non-proprietary-codecs-ffmpeg to resolve dependency vulnerabilities

const downloadFFMPEG = async (electronVersion: string, platform: ElectronPlatformName, arch: string) => {
  const ffmpegFileName = `ffmpeg-v${electronVersion}-${platform}-${arch}.zip`
  const url = `https://github.com/electron/electron/releases/download/v${electronVersion}/${ffmpegFileName}`

  const cacheDir = getCacheDirectory()
  const downloadPath = path.resolve(cacheDir, ffmpegFileName)

  if (fs.existsSync(downloadPath)) {
    return downloadPath
  }

  log.info({ url }, "downloading non-proprietary FFMPEG")
  const res = await fetch(url, {
    redirect: "follow",
    compress: true,
  })

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir)
  }
  await new Promise<string>((resolve, reject) => {
    if (!res.body) {
      return reject(new Error("Response body is empty"))
    }
    const downloadStream = fs.createWriteStream(downloadPath)
    res.body.pipe(downloadStream)
    res.body.on("end", () => resolve(downloadPath))
    downloadStream.on("error", reject)
  })
  return downloadPath
}

const extractFFMPEG = (targetPath: string) => (ffmpegPath: string) => {
  log.info({ file: ffmpegPath }, "loaded non-proprietary FFMPEG")
  return new Promise<string>((resolve, reject) => {
    unzip(ffmpegPath, targetPath, (zipError: Error) => {
      if (zipError) {
        return reject(zipError)
      }
      resolve(targetPath)
    })
  })
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

  // If we are copying to the source we can stop immediately
  if (libPath === libTargetPath) {
    return
  }

  // If the source doesn't exist we have a problem
  if (!fs.existsSync(libPath)) {
    throw new Error("Failed to find FFMPEG library file")
  }

  return moveFile(libPath, libTargetPath)
}

const moveFile = (sourceFile: fs.PathLike, targetFile: fs.PathLike) => {
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
      // If the copy was successfull we should delete the source file
      if (!doneCalled) {
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

  return downloadFFMPEG(electrionVersion, options.platformName, options.arch).then(extractFFMPEG(options.appOutDir)).then(moveFFMPEG(libPath, options.platformName))
}
