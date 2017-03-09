import { path7za } from "7zip-bin"
import { CompressionLevel } from "electron-builder-core"
import { debug7zArgs, spawn } from "electron-builder-util"
import { exists } from "electron-builder-util/out/fs"
import { unlink } from "fs-extra-p"
import * as path from "path"

class CompressionDescriptor {
  constructor(public flag: string, public env: string, public minLevel: string, public maxLevel: string = "-9") {
  }
}

const extToCompressionDescriptor: { [key: string]: CompressionDescriptor; } = {
  "tar.xz": new CompressionDescriptor("--xz", "XZ_OPT", "-0", "-9e"),
  "tar.lz": new CompressionDescriptor("--lzip", "LZOP", "-0"),
  "tar.gz": new CompressionDescriptor("--gz", "GZIP", "-1"),
  "tar.bz2": new CompressionDescriptor("--bzip2", "BZIP2", "-1"),
}

export async function tar(compression: CompressionLevel | n, format: string, outFile: string, dirToArchive: string, isMacApp: boolean = false) {
  // we don't use 7z here - develar: I spent a lot of time making pipe working - but it works on MacOS and often hangs on Linux (even if use pipe-io lib)
  // and in any case it is better to use system tools (in the light of docker - it is not problem for user because we provide complete docker image).
  const info = extToCompressionDescriptor[format]
  let tarEnv = process.env
  if (process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL != null) {
    tarEnv = Object.assign({}, process.env)
    tarEnv[info.env] = "-" + process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL
  }
  else if (compression != null && compression !== "normal") {
    tarEnv = Object.assign({}, process.env)
    tarEnv[info.env] = compression === "store" ? info.minLevel : info.maxLevel
  }

  const args = [info.flag, "-cf", outFile]
  if (!isMacApp) {
    args.push("--transform", `s,^\.,${path.basename(outFile, "." + format)},`)
  }
  args.push(isMacApp ? path.basename(dirToArchive) : ".")
  await spawn(process.platform === "darwin" || process.platform === "freebsd" ? "gtar" : "tar", args, {
    cwd: isMacApp ? path.dirname(dirToArchive) : dirToArchive,
    env: tarEnv
  })
  return outFile
}

export async function archive(compression: CompressionLevel | n, format: string, outFile: string, dirToArchive: string, withoutDir: boolean = false): Promise<string> {
  let storeOnly = compression === "store"
  const args = debug7zArgs("a")
  if (format === "7z" || format.endsWith(".7z")) {
    if (process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL != null) {
      storeOnly = false
      args.push(`-mx=${process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL}`)
    }
    else if (!storeOnly) {
      // 7z is very fast, so, use ultra compression
      args.push("-mx=9", "-mfb=64", "-md=64m", "-ms=on")
    }
  }
  else if (format === "zip" && compression === "maximum") {
    // http://superuser.com/a/742034
    args.push("-mfb=258", "-mpass=15")
  }
  else if (process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL != null) {
    storeOnly = false
    args.push(`-mx=${process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL}`)
  }
  else if (!storeOnly) {
    args.push("-mx=9")
  }

  // remove file before - 7z doesn't overwrite file, but update
  try {
    await unlink(outFile)
  }
  catch (e) {
    // ignore
  }

  if (format === "zip" || storeOnly) {
    args.push("-mm=" + (storeOnly ? "Copy" : "Deflate"))
  }

  args.push(outFile, withoutDir ? "." : path.basename(dirToArchive))

  try {
    await spawn(path7za, args, {
      cwd: withoutDir ? dirToArchive : path.dirname(dirToArchive),
    })
  }
  catch (e) {
    if (e.code === "ENOENT" && !(await exists(dirToArchive))) {
      throw new Error(`Cannot create archive: "${dirToArchive}" doesn't exist`)
    }
    else {
      throw e
    }
  }

  return outFile
}