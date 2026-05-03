import { FilterStats, log } from "builder-util"
import { isBinaryFileSync } from "isbinaryfile"
import * as path from "path"
import { ResolvedFileSet } from "../util/appFileCopier.js"

export function isLibOrExe(file: string): boolean {
  // https://github.com/electron-userland/electron-builder/issues/3038
  return file.endsWith(".dll") || file.endsWith(".exe") || file.endsWith(".dylib") || file.endsWith(".so") || file.endsWith(".node")
}

/** @internal */
export function detectUnpackedDirs(fileSet: ResolvedFileSet, autoUnpackDirs: Set<string>) {
  const metadata = fileSet.metadata

  for (let i = 0, n = fileSet.files.length; i < n; i++) {
    const file = fileSet.files[i]
    const stat: FilterStats = metadata.get(file)!
    if (!stat.moduleRootPath || autoUnpackDirs.has(stat.moduleRootPath)) {
      continue
    }

    if (!stat.isFile()) {
      continue
    }

    // https://github.com/electron-userland/electron-builder/issues/2679
    let shouldUnpack = false
    // ffprobe-static and ffmpeg-static are known packages to always unpack
    const moduleName = stat.moduleName
    const fileBaseName = path.basename(file)
    const hasExtension = path.extname(fileBaseName)
    if (moduleName === "ffprobe-static" || moduleName === "ffmpeg-static" || isLibOrExe(file)) {
      shouldUnpack = true
    } else if (!hasExtension) {
      shouldUnpack = !!isBinaryFileSync(file)
    }

    if (!shouldUnpack) {
      continue
    }

    log.debug({ file: stat.moduleFullFilePath, reason: "contains executable code" }, "not packed into asar archive")
    autoUnpackDirs.add(stat.moduleRootPath)
  }
}
