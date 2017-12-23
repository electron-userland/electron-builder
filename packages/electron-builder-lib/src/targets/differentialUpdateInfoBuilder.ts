import { BlockMapDataHolder, PackageFileInfo } from "builder-util-runtime"
import { getBin } from "builder-util/out/binDownload"
import { exec } from "builder-util/out/util"
import * as path from "path"
import { Platform, Target } from "../core"
import { PlatformPackager } from "../platformPackager"
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
    packages[arch] = {
      ...packageFileInfo,
      path: path.basename(packageFileInfo.path)
    }
  }
  return {packages}
}

export function configureDifferentialAwareArchiveOptions(archiveOptions: ArchiveOptions): ArchiveOptions {
  archiveOptions.solid = false
  // our reader doesn't support compressed headers
  archiveOptions.isArchiveHeaderCompressed = false
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

function getTool() {
  const version = "0.0.1"

  const platform = Platform.current()
  const archQualifier = platform === Platform.MAC ? "" : `-${process.arch}`

  let checksum = ""
  if (platform === Platform.MAC) {
    // noinspection SpellCheckingInspection
    checksum = "rqaxCGtn78Skef83bqAHgWJbYND4ibAYmeQyPtDHG39LW7ZnXY/AL+//qS5A4g+Y843JntZn/nOZMocxlBTPhw=="
  }
  else if (platform === Platform.LINUX) {
    // noinspection SpellCheckingInspection
    checksum = process.arch === "ia32" ?
      "Rtar0melV7FKxx4jUJD5J48ZSQz2CvWCukhgNS8m4jntEmeKzSheHnbgm6Z9DujGewB1bC1PdbKzLFH6/yqFGg==" :
      "GfpGnvxp44VmhvzMPIyVRImMYxHtjSgFCEL7TEKav+lO17hK2ZHMEWxaf0xf7IDHg8Z9YoJzlC/cGg6FbZ7cRQ=="
  }
  else if (platform === Platform.WINDOWS) {
    // noinspection SpellCheckingInspection
    checksum = process.arch === "ia32" ?
      "MN7/uC9cLGzEPcojElcMKaovgtcz9/9ngkQOIXZNAID5KhDwOOd4nd9QI/MeMsa2OpTAdgsHcEcu64St4iPq5Q==" :
      "OGtk3XoyvJZbzYQJGsIyUjfQkfIesVQjtnjUaILvuS3ga+OCApTSydQNVSCZEDrVLw6LYCfjmGZi3H3UYjgxrQ=="
  }
  // https://github.com/develar/block-map-builder/releases/download/v0.0.1/block-map-builder-v0.0.1-win-x64.7z
  return getBin("block-map-builder", `block-map-builder-v${version}-${process.arch}`, `https://github.com/develar/block-map-builder/releases/download/v${version}/block-map-builder-v${version}-${platform.buildConfigurationKey}${archQualifier}.7z`, checksum)
    .then(it => path.join(it, "block-map-builder"))
}

export async function createBlockmap(file: string, target: Target, packager: PlatformPackager<any>, safeArtifactName: string | null) {
  const blockMapFile = `${file}${BLOCK_MAP_FILE_SUFFIX}`
  const updateInfo: BlockMapDataHolder = JSON.parse(await exec(await getTool(), ["-in", file, "-out", blockMapFile]))
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