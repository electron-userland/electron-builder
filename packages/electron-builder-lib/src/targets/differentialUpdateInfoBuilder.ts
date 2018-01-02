import { exec, log } from "builder-util"
import { BlockMapDataHolder, PackageFileInfo } from "builder-util-runtime"
import * as path from "path"
import { Target } from "../core"
import { PlatformPackager } from "../platformPackager"
import { ArchiveOptions } from "./archive"
import { getTool } from "./tools"

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
    packages[arch] = {
      ...packageFileInfo,
      path: path.basename(packageFileInfo.path)
    }
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
   */
  archiveOptions.dictSize = 4
  // do not allow to change compression level to avoid different packages
  archiveOptions.compression = "normal"
  return archiveOptions
}

function getBlockMapTool() {
  // noinspection SpellCheckingInspection
  return getTool({
    repository: "develar/block-map-builder",
    name: "block-map-builder",
    version: "0.2.0",
    mac: "J+aspHER9Hba70oDJAg9ZUyr5KC8beTjIedMQRgrdsWd5Qlc+0COy+zXMw7Pcq+hqDvsEFoM2N4Yx6wQAaXDXA==",
    "linux-ia32": "2zkhj4GVvLg8JDsGIDc4CUeZ+eHxwPchNuub+FTjO98YJyCIKDItJorfTStoZe4qlYqCE1tAX7Q/NXmBvpwj6A==",
    "linux-x64": "2iErpiWfSMWMMFALd2sIcfU7cd4mFc96EzA/6j9/XCAx0Z6y6vSJinwjMlcemN2SUUsyVkUnHkinCLK7M34GXQ==",
    "win-ia32": "QH/b+cmbsPtyaGzKriNGQtvKQ0KEUictieprGgcP7s4flHDXcsO+WtkecZpuJn5m3VLR0dGeSOw/oDxGxszBZA==",
    "win-x64": "GMT7M9IibT8v5OY45N7Ar97rHpBcc9HexUGGePnzkv++4Dh7DjIlEeo/Q50MRRkp6pdgIrkG1OawEbJIt2DkLw==",
  })
}

export async function appendBlockmap(file: string): Promise<BlockMapDataHolder> {
  log.info({file: log.filePath(file)}, "building embedded block map")
  return JSON.parse(await exec(await getBlockMapTool(), ["-in", file, "-compression", "deflate"]))
}

export async function createBlockmap(file: string, target: Target, packager: PlatformPackager<any>, safeArtifactName: string | null): Promise<BlockMapDataHolder> {
  const blockMapFile = `${file}${BLOCK_MAP_FILE_SUFFIX}`
  log.info({blockMapFile: log.filePath(blockMapFile)}, "building block map")
  const updateInfo: BlockMapDataHolder = JSON.parse(await exec(await getBlockMapTool(), ["-in", file, "-out", blockMapFile]))
  packager.info.dispatchArtifactCreated({
    file: blockMapFile,
    safeArtifactName: `${safeArtifactName}${BLOCK_MAP_FILE_SUFFIX}`,
    target,
    arch: null,
    packager,
    updateInfo,
  })
  return updateInfo
}