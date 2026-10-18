import { Arch, exists, InvalidConfigurationError, log } from "builder-util"
import { BlockMapDataHolder, PackageFileInfo } from "builder-util-runtime"
import { open } from "fs/promises"
import * as path from "path"
import { Node, readAsarHeader } from "../asar/asar.js"
import { Target } from "../core.js"
import { PlatformPackager } from "../platformPackager.js"
import { ArchiveOptions } from "./archive.js"
import { BlockMapRegion, buildBlockMap, BuildBlockMapOptions, ChunkerParams } from "./blockmap/blockmap.js"
import { buildBlockMapV3 } from "./blockmap/blockmapV3.js"
import { findPreparedVerbatimRange, prepareVerbatimNeedle, prepareVerbatimNeedleFromBuffer, VerbatimNeedle, VerbatimRange } from "./blockmap/verbatimRange.js"

export const BLOCK_MAP_FILE_SUFFIX = ".blockmap"

/** The `.blockmap` formats electron-builder writes (the `blockmap` option); `"latest"` resolves to {@link LATEST_BLOCK_MAP_FORMAT}. */
export type BlockMapFormat = "v1" | "v2"

/** What `blockmap: "latest"` (the default) writes. */
export const LATEST_BLOCK_MAP_FORMAT: BlockMapFormat = "v2"

/** The format the `blockmap` option selects: `"v1"` (gzipped JSON) or `"v2"` (binary, range-fetchable); unset means `"latest"`. */
export function resolveBlockMapFormat(value: unknown): BlockMapFormat {
  if (value == null || value === "latest") {
    return LATEST_BLOCK_MAP_FORMAT
  }
  if (value === "v1" || value === "v2") {
    return value
  }
  throw new InvalidConfigurationError(`"blockmap" must be "v1", "v2" or "latest", got ${JSON.stringify(value)}`)
}

/**
 * Chunker parameters for a stored (`Copy`) archive member — e.g. `resources/app.asar` when
 * `nsis.differentialPackage` is `"store-asar"` — whose bytes sit verbatim in the artifact. Such a member
 * changes in small, localized ways between releases, so it is chunked finer than the surrounding
 * compressed streams to keep the differential download proportional to the change.
 *
 * Set by benchmark (`test/src/differentialOneLineBenchTest.ts`, 32 MB asar / 3,001 files): 4/8/16 KiB
 * minimizes download bytes + new-blockmap bytes for a one-line edit (−5 % same-length, −17 % length-changing
 * vs. the 8/16/32 default); anything finer is a net loss because the v2 blockmap (~22 B per block, re-downloaded
 * in full on every update) grows faster than the block savings. `avg` must stay a power of two.
 */
export const STORED_MEMBER_CHUNKER: ChunkerParams = { min: 4096, avg: 8192, max: 16384 }

/**
 * `STORED_MEMBER_CHUNKER` counterpart for the `blockmap: "v2"` format (the v3 map of `blockMapV3.ts`). A v3 map costs
 * ~10 B per block in the file but an updater fetches only the super-groups, groups and records that
 * changed, so the v2 trade-off (a finer chunker inflating a map that is re-downloaded in full) no longer
 * applies and the stored member can be chunked at 512 B / 1 KiB / 2 KiB: a one-line change then costs
 * one or two small blocks plus a few KB of map. `max` must fit a v3 record's 16-bit block size.
 */
export const STORED_MEMBER_CHUNKER_V3: ChunkerParams = { min: 512, avg: 1024, max: 2048 }

/**
 * Chunker of the 7z archive header region (`locateArchiveHeaderRegions`). The header of a differential
 * package is stored uncompressed (`configureDifferentialAwareArchiveOptions`) and is a few hundred bytes
 * to a few KB: file names, sizes and CRCs. Between two releases only the CRCs and sizes of the changed
 * members differ, but a compressed header re-encodes entirely and the trailing block of the package
 * (up to 32 KiB with the default chunker) was re-downloaded on every update. Cutting the header into
 * its own small blocks makes that cost the header's few hundred bytes.
 */
export const ARCHIVE_HEADER_CHUNKER: ChunkerParams = { min: 256, avg: 512, max: 1024 }

const SEVEN_ZIP_SIGNATURE = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])
const SEVEN_ZIP_SIGNATURE_HEADER_SIZE = 32
/** First byte of a 7z header stored as is (`kHeader`); a compressed header starts with `kEncodedHeader` (0x17). */
const SEVEN_ZIP_HEADER_ID = 0x01

async function readBytes(file: string, position: number, length: number): Promise<Buffer | null> {
  const handle = await open(file, "r")
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, position)
    return bytesRead === length ? buffer : null
  } finally {
    await handle.close()
  }
}

/**
 * Locates the header of each 7z `archiveFiles` inside `artifact` (the archive itself, or an installer
 * that embeds it verbatim) and returns an `ARCHIVE_HEADER_CHUNKER` region per located header, sorted by
 * offset. The 32-byte 7z signature header names the header's offset and size; the signature header is
 * found verbatim in the artifact (its CRCs make it unique, and byte-identical archives are matched to
 * their own copies). An archive whose header is compressed, or that cannot be found, yields no region
 * and is logged at debug/warn — the block map then falls back to the default chunker for those bytes.
 */
export async function locateArchiveHeaderRegions(artifact: string, archiveFiles: Array<string>): Promise<Array<BlockMapRegion>> {
  const regions: Array<BlockMapRegion> = []
  const claimed: Array<BlockMapRegion> = []
  const resumeOffsetByHash = new Map<string, number>()
  for (const archiveFile of archiveFiles) {
    const signature = (await exists(archiveFile)) ? await readBytes(archiveFile, 0, SEVEN_ZIP_SIGNATURE_HEADER_SIZE) : null
    if (signature == null || !signature.subarray(0, SEVEN_ZIP_SIGNATURE.length).equals(SEVEN_ZIP_SIGNATURE)) {
      log.debug({ artifact: log.filePath(artifact), archive: log.filePath(archiveFile) }, "not a 7z archive; no block map region for its header")
      continue
    }
    const headerOffset = SEVEN_ZIP_SIGNATURE_HEADER_SIZE + Number(signature.readBigUInt64LE(12))
    const headerSize = Number(signature.readBigUInt64LE(20))
    if (headerSize === 0) {
      continue
    }

    let start = 0
    if (path.resolve(artifact) !== path.resolve(archiveFile)) {
      const needle = prepareVerbatimNeedleFromBuffer(signature, `${path.basename(archiveFile)} signature header`)
      const range = await findUnclaimedVerbatimRange(artifact, needle, claimed, resumeOffsetByHash.get(needle.hash) ?? 0)
      if (range == null) {
        log.warn({ artifact: log.filePath(artifact), archive: log.filePath(archiveFile) }, "archive not found verbatim in artifact; no block map region for its header")
        continue
      }
      resumeOffsetByHash.set(needle.hash, range.offset + range.size)
      claimed.push({ ...range, chunker: ARCHIVE_HEADER_CHUNKER })
      start = range.offset
    }

    const first = await readBytes(artifact, start + headerOffset, 1)
    if (first == null || first[0] !== SEVEN_ZIP_HEADER_ID) {
      log.debug({ artifact: log.filePath(artifact), archive: log.filePath(archiveFile) }, "archive header is compressed; no block map region for it")
      continue
    }
    log.info(
      { artifact: log.filePath(artifact), archive: log.filePath(archiveFile), offset: start + headerOffset, size: headerSize },
      "located archive header region for block map"
    )
    regions.push({ offset: start + headerOffset, size: headerSize, chunker: ARCHIVE_HEADER_CHUNKER })
  }
  return regions.sort((a, b) => a.offset - b.offset)
}

/** A stored member located verbatim in an artifact: the member file and its block map region there. */
export interface StoredMember {
  file: string
  region: BlockMapRegion
}

/**
 * Forced v3 block boundaries for the stored members that are asar archives: the start of the content
 * region and of every packed file in it (from the asar header's offsets), as absolute artifact offsets.
 * With these cuts a change inside one file never alters a block that also covers its neighbour, so an
 * in-place edit costs its own blocks only. Members that are not asars contribute nothing.
 */
export async function asarContentBoundaries(members: Array<StoredMember>): Promise<Array<number>> {
  const boundaries = new Set<number>()
  for (const { file, region } of members) {
    let header: string
    let headerSize: number
    try {
      ;({ header, size: headerSize } = await readAsarHeader(file))
    } catch (e: any) {
      log.debug({ member: log.filePath(file), reason: e.message }, "stored member is not an asar; no forced block boundaries for it")
      continue
    }
    const contentStart = region.offset + 8 + headerSize
    const regionEnd = region.offset + region.size
    const collect = (node: Node) => {
      for (const child of Object.values(node.files ?? {})) {
        if (child.files != null) {
          collect(child)
        } else if (child.offset != null && !child.unpacked && child.link == null) {
          const boundary = contentStart + parseInt(child.offset, 10)
          if (boundary > region.offset && boundary < regionEnd) {
            boundaries.add(boundary)
          }
        }
      }
    }
    try {
      collect(JSON.parse(header) as Node)
    } catch (e: any) {
      log.debug({ member: log.filePath(file), reason: e.message }, "stored member has no parsable asar header; no forced block boundaries for it")
      continue
    }
    if (contentStart < regionEnd) {
      boundaries.add(contentStart)
    }
  }
  return [...boundaries].sort((a, b) => a - b)
}

/**
 * Locates each of `memberFiles` (absolute paths of files stored verbatim inside `artifact`) and returns
 * a `STORED_MEMBER_CHUNKER` blockmap region per located file, sorted by offset. The regions never
 * overlap: byte-identical members (a pure-JS app packaged for x64 + arm64 has the same asar twice in
 * the universal installer) are each matched to their own copy, and a copy already claimed by an
 * earlier member is skipped. A member file that does not exist, or that cannot be found verbatim, is
 * logged at warn and skipped — the blockmap then falls back to the default chunker for those bytes;
 * it never fails the build.
 *
 * The returned regions are the v2 regions; `toV3Regions` derives the v3 regions (same byte ranges,
 * `STORED_MEMBER_CHUNKER_V3`) from them, so both maps are built from the same located ranges.
 */
export async function locateStoredMemberRegions(artifact: string, memberFiles: Array<string>): Promise<Array<BlockMapRegion>> {
  return (await locateStoredMembers(artifact, memberFiles)).map(it => it.region)
}

/** `locateStoredMemberRegions` keeping which member each region belongs to (for `asarContentBoundaries`). */
export async function locateStoredMembers(artifact: string, memberFiles: Array<string>): Promise<Array<StoredMember>> {
  const members: Array<StoredMember> = []
  const regions: Array<BlockMapRegion> = []
  // Byte-identical members have identical occurrences, and the copies are claimed in ascending order,
  // so the scan for the next member with the same content resumes where its previous copy ended instead
  // of rescanning (and re-confirming every earlier copy) from the start of the artifact.
  const resumeOffsetByHash = new Map<string, number>()
  for (const memberFile of memberFiles) {
    if (!(await exists(memberFile))) {
      log.warn({ artifact: log.filePath(artifact), member: log.filePath(memberFile) }, "stored member file does not exist; no block map region for it")
      continue
    }
    const needle = await prepareVerbatimNeedle(memberFile)
    const range = await findUnclaimedVerbatimRange(artifact, needle, regions, resumeOffsetByHash.get(needle.hash) ?? 0)
    if (range == null) {
      log.warn(
        { artifact: log.filePath(artifact), member: log.filePath(memberFile) },
        "stored member not found verbatim in artifact; its bytes will be chunked with the default block map parameters"
      )
      continue
    }
    resumeOffsetByHash.set(needle.hash, range.offset + range.size)
    log.info({ artifact: log.filePath(artifact), member: log.filePath(memberFile), offset: range.offset, size: range.size }, "located stored member region for block map")
    const region = { ...range, chunker: STORED_MEMBER_CHUNKER }
    regions.push(region)
    members.push({ file: memberFile, region })
  }
  return members.sort((a, b) => a.region.offset - b.region.offset)
}

/**
 * The first occurrence of `needle` in `artifact` at or after `startOffset` that does not overlap a
 * range in `claimed`. An occurrence that overlaps a claimed range is another member's copy (or part of
 * one), so the scan resumes right after that range — every candidate start before its end would
 * overlap it too.
 */
async function findUnclaimedVerbatimRange(artifact: string, needle: VerbatimNeedle, claimed: Array<BlockMapRegion>, startOffset: number): Promise<VerbatimRange | null> {
  for (;;) {
    const range = await findPreparedVerbatimRange(artifact, needle, startOffset)
    if (range == null) {
      return null
    }
    const rangeEnd = range.offset + range.size
    const clash = claimed.find(it => range.offset < it.offset + it.size && it.offset < rangeEnd)
    if (clash == null) {
      return range
    }
    startOffset = clash.offset + clash.size
  }
}

/** `BuildBlockMapOptions` for the `blockmap: "v1"` format, plus what only the `"v2"` format uses. */
export interface DifferentialBlockMapOptions extends BuildBlockMapOptions {
  /**
   * Forced block boundaries for the `"v2"` format only (`BuildBlockMapV3Options.boundaries`); a `"v1"` map keeps
   * its chunking byte-for-byte, since every updater downloads it in full.
   */
  v3Boundaries?: Array<number> | null
}

/** Options for `appendBlockmap` / `createBlockmap` from located regions (any order) and optional v3 boundaries. */
export function toBlockMapOptions(regions: Array<BlockMapRegion>, v3Boundaries?: Array<number> | null): DifferentialBlockMapOptions | undefined {
  if (regions.length === 0 && (v3Boundaries == null || v3Boundaries.length === 0)) {
    return undefined
  }
  const options: DifferentialBlockMapOptions = { regions: [...regions].sort((a, b) => a.offset - b.offset) }
  if (v3Boundaries != null && v3Boundaries.length > 0) {
    options.v3Boundaries = v3Boundaries
  }
  return options
}

function isSameChunker(a: ChunkerParams, b: ChunkerParams): boolean {
  return a.min === b.min && a.avg === b.avg && a.max === b.max
}

/**
 * The v3 block map regions for the v2 `regions` (as returned by `locateStoredMemberRegions`): the same
 * byte ranges, with `STORED_MEMBER_CHUNKER` swapped for `STORED_MEMBER_CHUNKER_V3`. Regions with any
 * other chunker are kept as they are (a caller that chose its own parameters gets them in both maps).
 */
export function toV3Regions(regions: Array<BlockMapRegion> | null | undefined): Array<BlockMapRegion> {
  return (regions ?? []).map(region => (isSameChunker(region.chunker, STORED_MEMBER_CHUNKER) ? { ...region, chunker: STORED_MEMBER_CHUNKER_V3 } : region))
}

export function createNsisWebDifferentialUpdateInfo(artifactPath: string, packageFiles: { [arch: string]: PackageFileInfo }) {
  if (packageFiles == null) {
    return null
  }

  const keys = Object.keys(packageFiles)
  if (keys.length <= 0) {
    return null
  }

  const packages: { [arch: string]: PackageFileInfo } = {}
  for (const arch of keys) {
    const packageFileInfo = packageFiles[arch]
    const file = path.basename(packageFileInfo.path)
    packages[arch] = {
      ...packageFileInfo,
      path: file,
      // https://github.com/electron-userland/electron-builder/issues/2583
      file,
    } as any
  }
  return { packages }
}

export function configureDifferentialAwareArchiveOptions(archiveOptions: ArchiveOptions): ArchiveOptions {
  /*
   * dict size 64 MB: Full: 33,744.88 KB, To download: 17,630.3 KB (52%)
   * dict size 16 MB: Full: 33,936.84 KB, To download: 16,175.9 KB (48%)
   * dict size  8 MB: Full: 34,187.59 KB, To download:  8,229.9 KB (24%)
   * dict size  4 MB: Full: 34,628.73 KB, To download: 3,782.97 KB (11%)

   as we can see, if file changed in one place, all block is invalidated (and update size approximately equals to dict size)

   1 MB is used:

   1MB:

   2018/01/11 11:54:41:0045 File has 59 changed blocks
   2018/01/11 11:54:41:0050 Full: 71,588.59 KB, To download: 1,243.39 KB (2%)

   4MB:

   2018/01/11 11:31:43:0440 Full: 70,303.55 KB, To download: 4,843.27 KB (7%)
   2018/01/11 11:31:43:0435 File has 234 changed blocks

   */
  archiveOptions.dictSize = 1
  // solid compression leads to a lot of changed blocks
  archiveOptions.solid = false
  // do not allow to change compression level to avoid different packages
  archiveOptions.compression = "normal"
  // store the archive header as is: a compressed header re-encodes entirely when a single CRC changes,
  // so every update re-downloaded the trailing block of the package; stored, only the changed CRCs and
  // sizes differ and `locateArchiveHeaderRegions` chunks the header finely (ARCHIVE_HEADER_CHUNKER)
  archiveOptions.isArchiveHeaderCompressed = false
  return archiveOptions
}

export async function appendBlockmap(file: string, options?: BuildBlockMapOptions): Promise<BlockMapDataHolder> {
  log.info({ file: log.filePath(file) }, "building embedded block map")
  return buildBlockMap(file, "deflate", undefined, options)
}

export async function createBlockmap(
  file: string,
  target: Target,
  packager: PlatformPackager<any>,
  safeArtifactName: string | null,
  arch: Arch | null = null,
  options?: DifferentialBlockMapOptions
): Promise<BlockMapDataHolder> {
  const format = resolveBlockMapFormat(packager.config.blockmap)
  const blockMapFile = `${file}${BLOCK_MAP_FILE_SUFFIX}`
  log.info({ blockMapFile: log.filePath(blockMapFile), format }, "building block map")
  let updateInfo: BlockMapDataHolder
  if (format === "v1") {
    updateInfo = await buildBlockMap(file, "gzip", blockMapFile, options == null ? undefined : { regions: options.regions })
  } else {
    // the stored members get the finer v2 chunker, and a stored asar a block boundary at every packed file
    const built = await buildBlockMapV3(file, blockMapFile, { regions: toV3Regions(options?.regions), boundaries: options?.v3Boundaries })
    log.debug({ blockMapFile: log.filePath(blockMapFile), blocks: built.blockCount, groups: built.groupCount }, "built block map")
    updateInfo = { size: built.size, sha512: built.sha512 }
  }
  await packager.emitArtifactBuildCompleted({
    file: blockMapFile,
    safeArtifactName: safeArtifactName == null ? null : `${safeArtifactName}${BLOCK_MAP_FILE_SUFFIX}`,
    target,
    arch,
    packager,
    updateInfo,
  })
  return updateInfo
}
