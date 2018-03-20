import BluebirdPromise from "bluebird-lst"
import { AsyncTaskManager } from "builder-util"
import { CONCURRENCY, FileCopier, Link, MAX_FILE_REQUESTS, FileTransformer } from "builder-util/out/fs"
import { ensureDir, readlink, Stats, symlink, writeFile } from "fs-extra-p"
import * as path from "path"
import { NODE_MODULES_PATTERN } from "../fileTransformer"
import { Packager } from "../packager"
import { ensureEndSlash, ResolvedFileSet } from "./AppFileCopierHelper"

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
      // not lastIndexOf, to ensure that nested module (top-level module depends on) copied to parent node_modules, not to top-level directory
      // project https://github.com/angexis/punchcontrol/commit/cf929aba55c40d0d8901c54df7945e1d001ce022
      const index = file.indexOf(NODE_MODULES_PATTERN)
      if (index < 0) {
        throw new Error(`File "${file}" not under the source directory "${fileSet.src}"`)
      }
      return dest + file.substring(index + 1 /* leading slash */)
    }
  }
}

export async function copyAppFiles(fileSet: ResolvedFileSet, packager: Packager, transformer: FileTransformer) {
  const metadata = fileSet.metadata
  const transformedFiles = fileSet.transformedFiles
  // search auto unpacked dir
  const taskManager = new AsyncTaskManager(packager.cancellationToken)
  const createdParentDirs = new Set<string>()

  function transformContentIfNeed(sourceFile: string, index: number): Promise<any> {
    let transformedContent: string | Buffer | Promise<string | Buffer | null> | null | undefined = transformedFiles == null ? null : transformedFiles.get(index)
    if (transformedContent == null) {
      transformedContent = transformer(sourceFile)
    }

    if (transformedContent != null && typeof transformedContent === "object" && "then" in transformedContent) {
      return transformedContent as Promise<any>
    }
    else {
      return Promise.resolve(transformedContent)
    }
  }

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
    if (stat.isSymbolicLink()) {
      links.push({file: destinationFile, link: await readlink(sourceFile)})
      continue
    }

    const fileParent = path.dirname(destinationFile)
    if (!createdParentDirs.has(fileParent)) {
      createdParentDirs.add(fileParent)
      await ensureDir(fileParent)
    }

    taskManager.addTask(transformContentIfNeed(sourceFile, i).then(it => copyFileOrData(fileCopier, it, sourceFile, destinationFile, stat)))
    if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
      await taskManager.awaitTasks()
    }
  }

  if (taskManager.tasks.length > 0) {
    await taskManager.awaitTasks()
  }
  if (links.length > 0) {
    await BluebirdPromise.map(links, it => symlink(it.link, it.file), CONCURRENCY)
  }
}

export function copyFileOrData(fileCopier: FileCopier, data: string | Buffer | undefined | null, source: string, destination: string, stats: Stats) {
  if (data == null) {
    return fileCopier.copy(source, destination, stats)
  }
  else {
    return writeFile(destination, data)
  }
}