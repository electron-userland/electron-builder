import unzip from "cross-unzip"
import fs, { mkdirSync } from "fs"
import fetch from "node-fetch"
import path from "path"
import { ElectronPlatformName } from "./ElectronFramework"

import { PrepareApplicationStageDirectoryOptions } from "../Framework"
import { getCacheDirectory } from "../util/cacheManager"

// NOTE: Migrated from https://github.com/MarshallOfSound/electron-packager-plugin-non-proprietary-codecs-ffmpeg to resolve dependency vulnerabilities

const downloadFFMPEG = async (electronVersion: string, platform: ElectronPlatformName, arch: string) => {
  const tmpPath = getCacheDirectory()

  const ffmpegFileName = `ffmpeg-v${ electronVersion }-${ platform }-${ arch }.zip`
  const downloadPath = path.resolve(tmpPath, ffmpegFileName)

  if (fs.existsSync(downloadPath)) {
    return downloadPath
  }

  const res = await fetch("https://assets-cdn.github.com/images/modules/logos_page/Octocat.png", {
    redirect: "follow",
    compress: true,
  })

  await new Promise<string>((resolve, reject) => {
    if (!res.body) {
      return reject(new Error("Response body is empty"))
    }
    const downloadStream = fs.createWriteStream(downloadPath)
    res.body.pipe(downloadStream)
    res.body.on("end", () => resolve(downloadPath))
    downloadStream.on("error", reject)
    // request({
    //   url: `https://github.com/electron/electron/releases/download/v${ electronVersion }/${ ffmpegFileName }`,
    //   followAllRedirects: true,
    //   timeout: 10000,
    //   gzip: true,
    // })
    //   .on("error", (downloadError: any) => {
    //     reject(downloadError)
    //   })
    //   .pipe(downloadStream)
    //   .on("close", () => {
    //     resolve(downloadPath)
    //   })
  })
  return downloadPath
}

const extractFFMPEG = (targetPath: string) => (ffmpegPath: any) =>
  new Promise<string>((resolve, reject) => {
    mkdirSync(targetPath)

    unzip(ffmpegPath, targetPath, (zipError: Error) => {
      if (zipError) {
        return reject(zipError)
      }
      resolve(targetPath)
    })
  })

const moveFFMPEG = (targetPath: string, platform: ElectronPlatformName) => (sourcePath: string) => {
  let fileName = "libffmpeg.dll"
  if (platform === "darwin") {
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
