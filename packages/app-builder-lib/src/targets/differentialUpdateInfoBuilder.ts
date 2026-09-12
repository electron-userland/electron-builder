import { Arch, log } from "builder-util"
import { BlockMapDataHolder, PackageFileInfo } from "builder-util-runtime"
import * as path from "path"
import { Target } from "../core.js"
import { PlatformPackager } from "../platformPackager.js"
import { ArchiveOptions } from "./archive.js"
import { BlockMapRegion, buildBlockMap, BuildBlockMapOptions, ChunkerParams } from "./blockmap/blockmap.js"
import { findVerbatimRange } from "./blockmap/verbatimRange.js"

export const BLOCK_MAP_FILE_SUFFIX = ".blockmap"

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
 * Locates each of `memberFiles` (absolute paths of files stored verbatim inside `artifact`) and returns
 * a `STORED_MEMBER_CHUNKER` blockmap region per located file, sorted by offset. A member that cannot be
 * found verbatim is logged at warn and skipped — the blockmap then falls back to the default chunker for
 * those bytes; it never fails the build.
 */
export async function locateStoredMemberRegions(artifact: string, memberFiles: Array<string>): Promise<Array<BlockMapRegion>> {
  const regions: Array<BlockMapRegion> = []
  for (const memberFile of memberFiles) {
    const range = await findVerbatimRange(artifact, memberFile)
    if (range == null) {
      log.warn(
        { artifact: log.filePath(artifact), member: log.filePath(memberFile) },
        "stored member not found verbatim in artifact; its bytes will be chunked with the default block map parameters"
      )
      continue
    }
    log.info({ artifact: log.filePath(artifact), member: log.filePath(memberFile), offset: range.offset, size: range.size }, "located stored member region for block map")
    regions.push({ ...range, chunker: STORED_MEMBER_CHUNKER })
  }
  return regions.sort((a, b) => a.offset - b.offset)
}

/** `BuildBlockMapOptions` for `regions`, or `undefined` when there are none so the default chunker path is taken unchanged. */
export function toBlockMapOptions(regions: Array<BlockMapRegion>): BuildBlockMapOptions | undefined {
  return regions.length === 0 ? undefined : { regions }
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
  options?: BuildBlockMapOptions
): Promise<BlockMapDataHolder> {
  const blockMapFile = `${file}${BLOCK_MAP_FILE_SUFFIX}`
  log.info({ blockMapFile: log.filePath(blockMapFile) }, "building block map")
  const updateInfo = await buildBlockMap(file, "gzip", blockMapFile, options)
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
