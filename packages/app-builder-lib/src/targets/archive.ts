import { path7za } from "7zip-bin"
import { debug7z, exec } from "builder-util"
import { exists, unlinkIfExists } from "builder-util/out/fs"
import { move } from "fs-extra"
import * as path from "path"
import { TmpDir } from "temp-file"
import { CompressionLevel } from "../core"
import { getLinuxToolsPath } from "./tools"

/** @internal */
export async function tar(compression: CompressionLevel | any | any, format: string, outFile: string, dirToArchive: string, isMacApp: boolean, tempDirManager: TmpDir): Promise<void> {
  const tarFile = await tempDirManager.getTempFile({suffix: ".tar"})
  const tarArgs = debug7zArgs("a")
  tarArgs.push(tarFile)
  tarArgs.push(path.basename(dirToArchive))

  await Promise.all([
    exec(path7za, tarArgs, {cwd: path.dirname(dirToArchive)}),
    // remove file before - 7z doesn't overwrite file, but update
    unlinkIfExists(outFile),
  ])

  if (!isMacApp) {
    await exec(path7za, ["rn", tarFile, path.basename(dirToArchive), path.basename(outFile, `.${format}`)])
  }

  if (format === "tar.lz") {
    // noinspection SpellCheckingInspection
    let lzipPath = "lzip"
    if (process.platform === "darwin") {
      lzipPath = path.join(await getLinuxToolsPath(), "bin", lzipPath)
    }
    await exec(lzipPath, [compression === "store" ? "-1" : "-9", "--keep" /* keep (don't delete) input files */, tarFile])
    // bloody lzip creates file in the same dir where input file with postfix `.lz`, option --output doesn't work
    await move(`${tarFile}.lz`, outFile)
    return
  }

  const args = compute7zCompressArgs(format === "tar.xz" ? "xz" : (format === "tar.bz2" ? "bzip2" : "gzip"), {
    isRegularFile: true,
    method: "DEFAULT",
    compression,
  })
  args.push(outFile, tarFile)
  await exec(path7za, args, {
    cwd: path.dirname(dirToArchive),
  }, debug7z.enabled)
}

export interface ArchiveOptions {
  compression?: CompressionLevel | null

  /**
   * @default false
   */
  withoutDir?: boolean

  /**
   * @default true
   */
  solid?: boolean

  /**
   * @default true
   */
  isArchiveHeaderCompressed?: boolean

  dictSize?: number
  excluded?: Array<string> | null

  // DEFAULT allows to disable custom logic and do not pass method switch at all
  method?: "Copy" | "LZMA" | "Deflate" | "DEFAULT"

  isRegularFile?: boolean
}

export function compute7zCompressArgs(format: string, options: ArchiveOptions = {}) {
  let storeOnly = options.compression === "store"
  const args = debug7zArgs("a")

  let isLevelSet = false
  if (process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL != null) {
    storeOnly = false
    args.push(`-mx=${process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL}`)
    isLevelSet = true
  }

  const isZip = format === "zip"
  if (!storeOnly) {
    if (isZip && options.compression === "maximum") {
      // http://superuser.com/a/742034
      args.push("-mfb=258", "-mpass=15")
    }

    if (!isLevelSet) {
      // https://github.com/electron-userland/electron-builder/pull/3032
      args.push("-mx=" + ((!isZip || options.compression === "maximum") ? "9" : "7"))
    }
  }

  if (options.dictSize != null) {
    args.push(`-md=${options.dictSize}m`)
  }

  // https://sevenzip.osdn.jp/chm/cmdline/switches/method.htm#7Z
  // https://stackoverflow.com/questions/27136783/7zip-produces-different-output-from-identical-input
  // tc and ta are off by default, but to be sure, we explicitly set it to off
  // disable "Stores NTFS timestamps for files: Modification time, Creation time, Last access time." to produce the same archive for the same data
  if (!options.isRegularFile) {
    args.push("-mtc=off")
  }

  if (format === "7z" || format.endsWith(".7z")) {
    if (options.solid === false) {
      args.push("-ms=off")
    }

    if (options.isArchiveHeaderCompressed === false) {
      args.push("-mhc=off")
    }

    // args valid only for 7z
    // -mtm=off disable "Stores last Modified timestamps for files."
    args.push("-mtm=off", "-mta=off")
  }

  if (options.method != null) {
    if (options.method !== "DEFAULT") {
      args.push(`-mm=${options.method}`)
    }
  }
  else if (isZip || storeOnly) {
    args.push(`-mm=${storeOnly ? "Copy" : "Deflate"}`)
  }

  if (isZip) {
    // -mcu switch:  7-Zip uses UTF-8, if there are non-ASCII symbols.
    // because default mode: 7-Zip uses UTF-8, if the local code page doesn't contain required symbols.
    // but archive should be the same regardless where produced
    args.push("-mcu")
  }
  return args
}

// 7z is very fast, so, use ultra compression
/** @internal */
export async function archive(format: string, outFile: string, dirToArchive: string, options: ArchiveOptions = {}): Promise<string> {
  const args = compute7zCompressArgs(format, options)
  // remove file before - 7z doesn't overwrite file, but update
  await unlinkIfExists(outFile)

  args.push(outFile, options.withoutDir ? "." : path.basename(dirToArchive))
  if (options.excluded != null) {
    for (const mask of options.excluded) {
      args.push(`-xr!${mask}`)
    }
  }

  try {
    await exec(path7za, args, {
      cwd: options.withoutDir ? dirToArchive : path.dirname(dirToArchive),
    }, debug7z.enabled)
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

function debug7zArgs(command: "a" | "x"): Array<string> {
  const args = [command, "-bd"]
  if (debug7z.enabled) {
    args.push("-bb")
  }
  return args
}