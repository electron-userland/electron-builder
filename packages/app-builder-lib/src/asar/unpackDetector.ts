import BluebirdPromise from "bluebird-lst"
import { log } from "builder-util"
import { CONCURRENCY } from "builder-util/out/fs"
import { ensureDir } from "fs-extra"
import { isBinaryFile } from "isbinaryfile"
import * as path from "path"
import { NODE_MODULES_PATTERN } from "../fileTransformer"
import { getDestinationPath, ResolvedFileSet } from "../util/appFileCopier"

function addValue(map: Map<string, Array<string>>, key: string, value: string) {
  let list = map.get(key)
  if (list == null) {
    list = [value]
    map.set(key, list)
  }
  else {
    list.push(value)
  }
}

export function isLibOrExe(file: string): boolean {
  return file.endsWith(".dll") || file.endsWith(".exe") || file.endsWith(".dylib") || file.endsWith(".so")
}

/** @internal */
export async function detectUnpackedDirs(fileSet: ResolvedFileSet, autoUnpackDirs: Set<string>, unpackedDest: string, rootForAppFilesWithoutAsar: string) {
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
    }
    while (true)

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
    const packageDirPathInArchive = path.relative(rootForAppFilesWithoutAsar, getDestinationPath(packageDir, fileSet))
    const pathInArchive = path.relative(rootForAppFilesWithoutAsar, getDestinationPath(file, fileSet))
    if (autoUnpackDirs.has(packageDirPathInArchive)) {
      // if package dir is unpacked, any file also unpacked
      addParents(pathInArchive, packageDirPathInArchive)
      continue
    }

    // https://github.com/electron-userland/electron-builder/issues/2679
    let shouldUnpack = false
    // ffprobe-static and ffmpeg-static are known packages to always unpack
    const moduleName = path.basename(packageDir)
    if (moduleName ===  "ffprobe-static" || moduleName === "ffmpeg-static" || isLibOrExe(file)) {
      shouldUnpack = true
    }
    else if (!file.includes(".", nextSlashIndex) && path.extname(file) === "") {
      shouldUnpack = await isBinaryFile(file)
    }

    if (!shouldUnpack) {
      continue
    }

    if (log.isDebugEnabled) {
      log.debug({file: pathInArchive, reason: "contains executable code"}, "not packed into asar archive")
    }

    addParents(pathInArchive, packageDirPathInArchive)
  }

  if (dirToCreate.size > 0) {
    await ensureDir(unpackedDest + path.sep + "node_modules")
    // child directories should be not created asynchronously - parent directories should be created first
    await BluebirdPromise.map(dirToCreate.keys(), async parentDir => {
      const base = unpackedDest + path.sep + parentDir
      await ensureDir(base)
      await BluebirdPromise.each(dirToCreate.get(parentDir)!, (it): any => {
        if (dirToCreate.has(parentDir + path.sep + it)) {
          // already created
          return null
        }
        else {
          return ensureDir(base + path.sep + it)
        }
      })
    }, CONCURRENCY)
  }
}