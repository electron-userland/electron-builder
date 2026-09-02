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

// Values accepted by ELECTRON_BUILDER_7Z_FILTER (passed through as `-mf=<value>`). "OFF" disables the
// branch/exec filter entirely (plain LZMA2); the rest are 7-Zip branch converters. 7za matches these
// case-insensitively, so the value is canonicalized to uppercase before use.
const ALLOWED_7Z_FILTERS = new Set(["OFF", "BCJ", "BCJ2", "ARM", "ARMT", "IA64", "PPC", "SPARC", "DELTA"])

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

  /**
   * Restrict the 7z filter to one the install-time extractor (the self-vendored Nsis7z plugin) can
   * decode. Modern 7za (24.09) auto-applies a CPU branch converter to executable content at
   * `-mx>=1` — `BCJ2` on x86/x64 and `ARM64` on arm64 — which that decoder silently skips, dropping
   * every executable from the install. When set, the archive is pinned to the single-stream `BCJ`
   * filter while compressing (decodable, and the best-ratio filter that decoder supports) and to
   * plain `Copy` while storing. Deliberately NOT overridable by `ELECTRON_BUILDER_7Z_FILTER`, which
   * could otherwise reintroduce an unreadable archive. Only affects the 7z format. See #9983.
   * @default false
   */
  installTimeDecodable?: boolean
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

/**
 * Builds the exclude switches for the given masks, rejecting any pattern that contains a path
 * traversal sequence. `prefix` is the tool-specific flag (`-xr!` for 7za, `-x` for native zip).
 */
function buildExcludeArgs(excluded: Array<string> | null | undefined, prefix: string): Array<string> {
  if (excluded == null) {
    return []
  }
  return excluded.map(mask => {
    if (mask.includes("..")) {
      throw new Error(`Excluded archive pattern contains path traversal sequence: "${mask}"`)
    }
    return `${prefix}${mask}`
  })
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

    // Branch/exec filter selection. installTimeDecodable archives are unpacked by the self-vendored
    // Nsis7z extractor, whose decoder only understands plain LZMA2/Copy and the single-stream BCJ
    // filter — not the CPU branch converters modern 7za auto-applies (BCJ2 on x86/x64, ARM64 on
    // arm64). So pin them to BCJ while compressing (the best filter that decoder can read; Copy
    // needs none) and do not honor ELECTRON_BUILDER_7Z_FILTER, which could reintroduce an unreadable
    // archive. Any other 7z archive may use ELECTRON_BUILDER_7Z_FILTER, else 7za's auto-selection.
    if (options.installTimeDecodable) {
      if (!storeOnly) {
        args.push("-mf=BCJ")
      }
    } else {
      const sevenZFilter = process.env.ELECTRON_BUILDER_7Z_FILTER
      if (sevenZFilter) {
        const canonicalFilter = sevenZFilter.toUpperCase()
        if (!ALLOWED_7Z_FILTERS.has(canonicalFilter)) {
          throw new Error(`ELECTRON_BUILDER_7Z_FILTER must be one of: ${[...ALLOWED_7Z_FILTERS].join(", ")}`)
        }
        args.push(`-mf=${canonicalFilter}`)
      }
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
    args.push(...buildExcludeArgs(options.excluded, "-xr!"))

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
    args.push(...buildExcludeArgs(options.excluded, "-x"))
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
