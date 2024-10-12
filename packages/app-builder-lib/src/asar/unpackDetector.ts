import { log } from "builder-util"
import { isBinaryFileSync } from "isbinaryfile"
import * as path from "path"
import { NODE_MODULES_PATTERN } from "../fileTransformer"
import { getDestinationPath, ResolvedFileSet } from "../util/appFileCopier"

function addValue(map: Map<string, Array<string>>, key: string, value: string) {
  let list = map.get(key)
  if (list == null) {
    list = [value]
    map.set(key, list)
  } else {
    list.push(value)
  }
}

export function isLibOrExe(file: string): boolean {
  // https://github.com/electron-userland/electron-builder/issues/3038
  return file.endsWith(".dll") || file.endsWith(".exe") || file.endsWith(".dylib") || file.endsWith(".so") || file.endsWith(".node")
}

/** @internal */
export function detectUnpackedDirs(fileSet: ResolvedFileSet, autoUnpackDirs: Set<string>, defaultDestination: string) {
  const dirToCreate = new Map<string, Array<string>>()
  const metadata = fileSet.metadata

  function addParents(child: string, root: string) {
    child = path.dirname(child)
    if (autoUnpackDirs.has(child)) {
      return
    }

    do {
      autoUnpackDirs.add(child)
      const p = path.dirname(child)
      // create parent dir to be able to copy file later without directory existence check
      addValue(dirToCreate, p, path.basename(child))

      if (child === root || p === root || autoUnpackDirs.has(p)) {
        break
      }
      child = p
    } while (true)

    autoUnpackDirs.add(root)
  }

  for (let i = 0, n = fileSet.files.length; i < n; i++) {
    const file = fileSet.files[i]
    const index = file.lastIndexOf(NODE_MODULES_PATTERN)
    if (index < 0) {
      continue
    }

    let nextSlashIndex = file.indexOf(path.sep, index + NODE_MODULES_PATTERN.length + 1)
    if (nextSlashIndex < 0) {
      continue
    }

    if (file[index + NODE_MODULES_PATTERN.length] === "@") {
      nextSlashIndex = file.indexOf(path.sep, nextSlashIndex + 1)
    }

    if (!metadata.get(file)!.isFile()) {
      continue
    }

    const packageDir = file.substring(0, nextSlashIndex)
    const packageDirPathInArchive = path.relative(defaultDestination, getDestinationPath(packageDir, fileSet))
    const pathInArchive = path.relative(defaultDestination, getDestinationPath(file, fileSet))
    if (autoUnpackDirs.has(packageDirPathInArchive)) {
      // if package dir is unpacked, any file also unpacked
      addParents(pathInArchive, packageDirPathInArchive)
      continue
    }

    // https://github.com/electron-userland/electron-builder/issues/2679
    let shouldUnpack = false
    // ffprobe-static and ffmpeg-static are known packages to always unpack
    const moduleName = path.basename(packageDir)
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

    if (log.isDebugEnabled) {
      log.debug({ file: pathInArchive, reason: "contains executable code" }, "not packed into asar archive")
    }

    addParents(pathInArchive, packageDirPathInArchive)
  }
}
