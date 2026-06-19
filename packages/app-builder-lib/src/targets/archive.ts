import { debug7z, exec, exists, log, statOrNull, unlinkIfExists } from "builder-util"
import * as path from "path"
import { create } from "tar"
import type { TarOptionsWithAliasesAsync } from "tar"
import { TmpDir } from "temp-file"
import { CompressionLevel, Platform } from "../core.js"
import { getLinuxToolsMacToolset } from "../toolsets/linuxToolsMac.js"
import { ToolsetConfig } from "../configuration.js"
import { getPath7za } from "../toolsets/7zip.js"
import _fsExtra from "fs-extra"
const { move } = _fsExtra

const ALLOWED_7Z_FILTERS = new Set(["BCJ", "BCJ2", "ARM", "ARMT", "IA64", "PPC", "SPARC", "DELTA"])

function validateCompressionLevel(level: string): void {
  if (!/^[0-9]$/.test(level)) {
    throw new Error(`ELECTRON_BUILDER_COMPRESSION_LEVEL must be a single digit 0-9, got: "${level}"`)
  }
}

type TarConfig = {
  compression: CompressionLevel | null | undefined
  format: string
  outFile: string
  dirToArchive: string
  isMacApp: boolean
  tempDirManager: TmpDir
  linuxToolsMac: ToolsetConfig["linuxToolsMac"]
  buildResourcesDir: string
}

/** @internal */
export async function tar({ compression, format, outFile, dirToArchive, isMacApp, tempDirManager, linuxToolsMac, buildResourcesDir }: TarConfig): Promise<void> {
  const tarFile = await tempDirManager.getTempFile({ suffix: ".tar" })
  const tarArgs: TarOptionsWithAliasesAsync = {
    file: tarFile,
    portable: true,
    cwd: dirToArchive,
    prefix: path.basename(outFile, `.${format}`),
  }
  let tarDirectory = "."
  if (isMacApp) {
    delete tarArgs.prefix
    tarArgs.cwd = path.dirname(dirToArchive)
    tarDirectory = path.basename(dirToArchive)
  }

  await Promise.all([
    create(tarArgs, [tarDirectory]),
    // remove file before - 7z doesn't overwrite file, but update
    unlinkIfExists(outFile),
  ])

  if (format === "tar.lz") {
    const lzipPath = process.platform === "darwin" ? (await getLinuxToolsMacToolset(linuxToolsMac, buildResourcesDir)).lzip : "lzip"
    await exec(lzipPath, [compression === "store" ? "-1" : "-9", "--keep" /* keep (don't delete) input files */, tarFile])
    // lzip creates the output file in the same directory as the input with a .lz suffix
    await move(`${tarFile}.lz`, outFile)
    return
  }

  const compressFormat = format === "tar.xz" ? "xz" : format === "tar.bz2" ? "bzip2" : "gzip"
  const args = compute7zCompressArgs(compressFormat, { isRegularFile: true, method: "DEFAULT", compression })
  args.push(outFile, tarFile)
  await exec(await getPath7za(), args, { cwd: path.dirname(dirToArchive) }, debug7z.enabled)
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

  /**
   * Preserve symlinks (e.g. macOS .framework `Versions/Current`) instead of dereferencing them.
   * Passes `-snl` to 7za — modern 7-Zip derefs by default, which breaks bundle codesigning. See #9846.
   * @default false
   */
  preserveSymlinks?: boolean
}

/**
 * Whether archives for the given target platform should preserve symlinks (i.e. pass `-snl`).
 * Non-Windows targets preserve them: macOS `.framework` bundles need them for codesigning (#9846)
 * and Linux bundles may legitimately contain them. Windows dereferences because restoring symlinks
 * there requires elevated privileges. Keyed on the target platform, not the build host.
 */
export function shouldPreserveSymlinks(platform: Platform): boolean {
  return platform !== Platform.WINDOWS
}

export function compute7zCompressArgs(format: string, options: ArchiveOptions = {}) {
  let storeOnly = options.compression === "store"
  const args = debug7zArgs("a")

  const compressionLevel = process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL
  if (compressionLevel != null) {
    validateCompressionLevel(compressionLevel)
    storeOnly = false // env var overrides "store" config
    args.push(`-mx=${compressionLevel}`)
  } else if (storeOnly) {
    // -mx=0 is the universal "no compression" flag across all formats (zip, 7z, gzip, xz, bzip2).
    // -mm=Copy would only be valid for zip/7z and causes E_INVALIDARG on xz/gzip/bzip2.
    args.push("-mx=0")
  } else {
    const isZip = format === "zip"
    // ZIP uses level 7 by default; everything else (7z, gzip, xz, bzip2) uses level 9
    args.push("-mx=" + (isZip && options.compression !== "maximum" ? "7" : "9"))
    if (isZip && options.compression === "maximum") {
      // http://superuser.com/a/742034
      args.push("-mfb=258", "-mpass=15")
    }
  }

  if (options.dictSize != null) {
    args.push(`-md=${options.dictSize}m`)
  }

  // Disable NTFS timestamps for reproducible archives
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

    const sevenZFilter = process.env.ELECTRON_BUILDER_7Z_FILTER
    if (sevenZFilter) {
      if (!ALLOWED_7Z_FILTERS.has(sevenZFilter.toUpperCase())) {
        throw new Error(`ELECTRON_BUILDER_7Z_FILTER must be one of: ${[...ALLOWED_7Z_FILTERS].join(", ")}`)
      }
      args.push(`-mf=${sevenZFilter}`)
    }

    args.push("-mtm=off", "-mta=off")
  }

  if (options.method != null && options.method !== "DEFAULT") {
    args.push(`-mm=${options.method}`)
  } else if (format === "zip") {
    // -mm is only set explicitly for zip (Deflate/Copy) and includes the UTF-8 flag.
    // For all other formats the codec is implicit from the output file extension.
    args.push(`-mm=${storeOnly ? "Copy" : "Deflate"}`)
    args.push("-mcu")
  }

  return args
}

// 7z is very fast, so, use ultra compression
/** @internal */
export async function archive(format: string, outFile: string, dirToArchive: string, options: ArchiveOptions = {}): Promise<string> {
  const outFileStat = await statOrNull(outFile)
  const dirStat = await statOrNull(dirToArchive)
  if (outFileStat && dirStat && outFileStat.mtime > dirStat.mtime) {
    log.info({ reason: "Archive file is up to date", outFile }, `skipped archiving`)
    return outFile
  }

  // Use 7za for all formats (matches pre-26.15 behavior). Native macOS `zip` is only a
  // fallback for NFD-normalized filenames, which 7za mangles.
  let use7z = true
  if (process.platform === "darwin" && format === "zip" && dirToArchive.normalize("NFC") !== dirToArchive) {
    log.warn({ reason: "7z doesn't support NFD-normalized filenames" }, `using zip`)
    use7z = false
  }

  if (use7z) {
    const args = compute7zCompressArgs(format, options)
    // Modern 7-Zip (24.09) dereferences symlinks by default; the 7-Zip 16.02 bundled before
    // 26.15 stored them as links. Without -snl, a macOS .framework `Versions/Current` extracts
    // as a real directory → codesign "bundle format is ambiguous" → breaks Squirrel.Mac
    // auto-update (#9846). Callers enable it for all non-Windows targets (see ArchiveTarget).
    if (options.preserveSymlinks) {
      args.push("-snl")
    }
    await unlinkIfExists(outFile)
    args.push(outFile, options.withoutDir ? "." : path.basename(dirToArchive))
    if (options.excluded != null) {
      for (const mask of options.excluded) {
        if (mask.includes("..")) {
          throw new Error(`Excluded archive pattern contains path traversal sequence: "${mask}"`)
        }
        args.push(`-xr!${mask}`)
      }
    }

    try {
      await exec(await getPath7za(), args, { cwd: options.withoutDir ? dirToArchive : path.dirname(dirToArchive) }, debug7z.enabled)
    } catch (e: any) {
      if (e.code === "ENOENT" && !(await exists(dirToArchive))) {
        throw new Error(`Cannot create archive: "${dirToArchive}" doesn't exist`)
      } else {
        throw e
      }
    }
  } else {
    // macOS native zip (NFD fallback): -y preserves symlinks
    const args = ["-q", "-r", "-y"]
    if (debug7z.enabled) {
      args.push("-v")
    }
    if (options.compression === "store") {
      args.push("-0")
    } else {
      args.push(options.compression === "maximum" ? "-9" : "-7")
    }
    await unlinkIfExists(outFile)
    args.push(outFile, options.withoutDir ? "." : path.basename(dirToArchive))
    if (options.excluded != null) {
      for (const mask of options.excluded) {
        if (mask.includes("..")) {
          throw new Error(`Excluded archive pattern contains path traversal sequence: "${mask}"`)
        }
        args.push(`-x${mask}`)
      }
    }
    await exec("zip", args, { cwd: options.withoutDir ? dirToArchive : path.dirname(dirToArchive) }, debug7z.enabled)
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
