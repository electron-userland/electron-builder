import { PackageFileInfo } from "builder-util-runtime"
import * as path from "path"
import { ArchiveOptions } from "../archive"

export function createWebDifferentialUpdateInfo(packageFiles: { [arch: string]: PackageFileInfo }) {
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