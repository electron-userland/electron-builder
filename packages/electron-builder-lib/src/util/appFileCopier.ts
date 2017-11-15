import BluebirdPromise from "bluebird-lst"
import { AsyncTaskManager } from "builder-util"
import { CONCURRENCY, FileCopier, Link, MAX_FILE_REQUESTS } from "builder-util/out/fs"
import { ensureDir, readlink, symlink } from "fs-extra-p"
import * as path from "path"
import { copyFileOrData } from "../asar/asarUtil"
import { Packager } from "../packager"
import { ensureEndSlash, NODE_MODULES_PATTERN, ResolvedFileSet } from "./AppFileCopierHelper"

export function getDestinationPath(file: string, fileSet: ResolvedFileSet) {
  if (file === fileSet.src) {
    return fileSet.destination
  }
  else {
    const src = ensureEndSlash(fileSet.src)
    const dest = ensureEndSlash(fileSet.destination)
    if (file.startsWith(src)) {
      return dest + file.substring(src.length)
    }
    else {
      // hoisted node_modules
      const index = file.lastIndexOf(NODE_MODULES_PATTERN)
      if (index < 0) {
        throw new Error(`File "${file}" not under the source directory "${fileSet.src}"`)
      }
      return dest + file.substring(index + 1 /* leading slash */)
    }
  }
}

export async function copyAppFiles(fileSet: ResolvedFileSet, packager: Packager) {
  const metadata = fileSet.metadata
  const transformedFiles = fileSet.transformedFiles
  // search auto unpacked dir
  const taskManager = new AsyncTaskManager(packager.cancellationToken)
  const createdParentDirs = new Set<string>()

  const fileCopier = new FileCopier()
  const links: Array<Link> = []
  for (let i = 0, n = fileSet.files.length; i < n; i++) {
    const sourceFile = fileSet.files[i]
    const stat = metadata.get(sourceFile)
    if (stat == null) {
      // dir
      continue
    }

    const destinationFile = getDestinationPath(sourceFile, fileSet)
    if (stat.isFile()) {
      const fileParent = path.dirname(destinationFile)
      if (!createdParentDirs.has(fileParent)) {
        createdParentDirs.add(fileParent)
        await ensureDir(fileParent)
      }

      taskManager.addTask(copyFileOrData(fileCopier, transformedFiles == null ? null : transformedFiles.get(i), sourceFile, destinationFile, stat))
      if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
        await taskManager.awaitTasks()
      }
    }
    else if (stat.isSymbolicLink()) {
      links.push({file: destinationFile, link: await readlink(sourceFile)})
    }
  }

  if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
    await taskManager.awaitTasks()
  }
  if (links.length > 0) {
    BluebirdPromise.map(links, it => symlink(it.link, it.file), CONCURRENCY)
  }
}