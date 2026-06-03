import { debug7z, exec, exists, getPath7za, log, statOrNull, unlinkIfExists } from "builder-util"
import * as fs from "fs"
import { move } from "fs-extra"
import * as path from "path"
import { create } from "tar"
import { TarOptionsWithAliasesAsync } from "tar/dist/commonjs/options"
import { TmpDir } from "temp-file"
import { CompressionLevel } from "../core"
import { getLinuxToolsMacToolset } from "../toolsets/linux"

const ALLOWED_7Z_FILTERS = new Set(["BCJ", "BCJ2", "ARM", "ARMT", "IA64", "PPC", "SPARC", "DELTA"])

function validateCompressionLevel(level: string): void {
  if (!/^[0-9]$/.test(level)) {
    throw new Error(`ELECTRON_BUILDER_COMPRESSION_LEVEL must be a single digit 0-9, got: "${level}"`)
  }
}

function resolveCompressionLevel(compression: CompressionLevel | any): number {
  const envLevel = process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL
  if (envLevel != null) {
    validateCompressionLevel(envLevel)
    return parseInt(envLevel, 10)
  }
  return compression === "store" ? 0 : 9
}

type TarConfig = {
  compression: CompressionLevel | any
  format: string
  outFile: string
  dirToArchive: string
  isMacApp: boolean
  tempDirManager: TmpDir
}

/** @internal */
export async function tar({ compression, format, outFile, dirToArchive, isMacApp, tempDirManager }: TarConfig): Promise<void> {
  const level = resolveCompressionLevel(compression)
  const prefix = path.basename(outFile, `.${format}`)
  const cwd = isMacApp ? path.dirname(dirToArchive) : dirToArchive
  const tarDirectory = isMacApp ? path.basename(dirToArchive) : "."
  const baseOpts: TarOptionsWithAliasesAsync = isMacApp ? { portable: true, cwd } : { portable: true, cwd, prefix }

  if (format === "tar.gz") {
    await unlinkIfExists(outFile)
    await create({ ...baseOpts, file: outFile, gzip: { level } }, [tarDirectory])
    return
  }

  const tarFile = await tempDirManager.getTempFile({ suffix: ".tar" })
  await Promise.all([create({ ...baseOpts, file: tarFile }, [tarDirectory]), unlinkIfExists(outFile)])

  if (format === "tar.lz") {
    const lzipPath = process.platform === "darwin" ? (await getLinuxToolsMacToolset()).lzip : "lzip"
    await exec(lzipPath, [compression === "store" ? "-1" : "-9", "--keep", tarFile])
    await move(`${tarFile}.lz`, outFile)
    return
  }

  if (format === "tar.xz") {
    await exec("xz", [`-${level}`, "--keep", tarFile])
    await move(`${tarFile}.xz`, outFile)
    return
  }

  if (format === "tar.bz2") {
    // bzip2 has no store mode; clamp level to minimum of 1
    await exec("bzip2", [`-${Math.max(1, level)}`, "--keep", tarFile])
    await move(`${tarFile}.bz2`, outFile)
    return
  }

  throw new Error(`Unsupported tar format: ${format}`)
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
  const compressionLevel = process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL
  if (compressionLevel != null) {
    validateCompressionLevel(compressionLevel)
    storeOnly = false
    args.push(`-mx=${compressionLevel}`)
    isLevelSet = true
  }

  if (!storeOnly && !isLevelSet) {
    args.push("-mx=9")
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
  } else if (storeOnly) {
    args.push("-mm=Copy")
  }

  return args
}

/** @internal */
export async function archive(format: string, outFile: string, dirToArchive: string, options: ArchiveOptions = {}): Promise<string> {
  const outFileStat = await statOrNull(outFile)
  const dirStat = await statOrNull(dirToArchive)
  if (outFileStat && dirStat && outFileStat.mtime > dirStat.mtime) {
    log.info({ reason: "Archive file is up to date", outFile }, `skipped archiving`)
    return outFile
  }

  if (format === "zip") {
    await createZipArchive(outFile, dirToArchive, options)
    return outFile
  }

  const args = compute7zCompressArgs(format, options)
  await unlinkIfExists(outFile)
  args.push(outFile, options.withoutDir ? "." : path.basename(dirToArchive))
  if (options.excluded != null) {
    for (const mask of options.excluded) {
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

  return outFile
}

async function createZipArchive(outFile: string, dirToArchive: string, options: ArchiveOptions): Promise<void> {
  if (!(await exists(dirToArchive))) {
    throw new Error(`Cannot create archive: "${dirToArchive}" doesn't exist`)
  }

  const level = resolveCompressionLevel(options.compression ?? null)
  await unlinkIfExists(outFile)

  // Normalise excluded patterns to recursive globs (e.g. "*.mp4" → "**/*.mp4")
  const ignore = (options.excluded ?? []).map(mask => (mask.startsWith("**/") ? mask : `**/${mask}`))
  // When withoutDir is false the directory name becomes the archive root via prefix
  const prefix = options.withoutDir ? undefined : path.basename(dirToArchive)

  // archiver v8 is ESM-only; dynamic import works from CJS in Node ≥ 22
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ZipArchive } = (await import("archiver")) as any

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outFile)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const zip: any = new ZipArchive({ zlib: { level } })

    output.on("close", resolve)
    output.on("error", reject)
    zip.on("error", reject)
    zip.pipe(output)

    // date: epoch gives reproducible archives regardless of source file timestamps
    zip.glob("**/*", { cwd: dirToArchive, dot: true, follow: false, ignore }, { prefix, date: new Date(0) })

    zip.finalize().catch(reject)
  })
}

function debug7zArgs(command: "a" | "x"): Array<string> {
  const args = [command, "-bd"]
  if (debug7z.enabled) {
    args.push("-bb")
  }
  return args
}
