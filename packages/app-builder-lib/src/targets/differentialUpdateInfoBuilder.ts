import { log } from "builder-util"
import { BlockMapDataHolder, PackageFileInfo } from "builder-util-runtime"
import * as path from "path"
import { Target } from "../core"
import { PlatformPackager } from "../platformPackager"
import { executeAppBuilderAsJson } from "../util/appBuilder"
import { ArchiveOptions } from "./archive"

export const BLOCK_MAP_FILE_SUFFIX = ".blockmap"

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
  return {packages}
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

export async function appendBlockmap(file: string): Promise<BlockMapDataHolder> {
  log.info({file: log.filePath(file)}, "building embedded block map")
  return await executeAppBuilderAsJson<BlockMapDataHolder>(["blockmap", "--input", file, "--compression", "deflate"])
}

export async function createBlockmap(file: string, target: Target, packager: PlatformPackager<any>, safeArtifactName: string | null): Promise<BlockMapDataHolder> {
  const blockMapFile = `${file}${BLOCK_MAP_FILE_SUFFIX}`
  log.info({blockMapFile: log.filePath(blockMapFile)}, "building block map")
  const updateInfo = await executeAppBuilderAsJson<BlockMapDataHolder>(["blockmap", "--input", file, "--output", blockMapFile])
  await packager.info.callArtifactBuildCompleted({
    file: blockMapFile,
    safeArtifactName: safeArtifactName == null ? null : `${safeArtifactName}${BLOCK_MAP_FILE_SUFFIX}`,
    target,
    arch: null,
    packager,
    updateInfo,
  })
  return updateInfo
}