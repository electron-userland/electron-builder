import { spawn, debug7zArgs } from "../util/util"
import { CompressionLevel } from "../metadata"
import * as path from "path"
import { unlink } from "fs-extra-p"
import { path7za } from "7zip-bin"

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
  if (compression != null && compression !== "normal") {
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
  const storeOnly = compression === "store"
  const args = debug7zArgs("a")
  if (format === "7z" || format.endsWith(".7z")) {
    if (!storeOnly) {
      // 7z is very fast, so, use ultra compression
      args.push("-mx=9", "-mfb=64", "-md=64m", "-ms=on")
    }
  }
  else if (format === "zip") {
    if (compression === "maximum") {
      // http://superuser.com/a/742034
      //noinspection SpellCheckingInspection
      args.push("-mfb=258", "-mpass=15")
    }
  }
  else if (compression === "maximum") {
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

  await spawn(path7za, args, {
    cwd: withoutDir ? dirToArchive : path.dirname(dirToArchive),
  })

  return outFile
}