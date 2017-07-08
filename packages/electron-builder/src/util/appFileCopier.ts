import BluebirdPromise from "bluebird-lst"
import { CONCURRENCY, FileCopier, Link, MAX_FILE_REQUESTS } from "electron-builder-util/out/fs"
import { ensureDir, readlink, symlink } from "fs-extra-p"
import * as path from "path"
import { AppFileCopierHelper, AppFileWalker } from "./AppFileWalker"
import { copyFileOrData } from "./asarUtil"
import { AsyncTaskManager } from "./asyncTaskManager"

export async function copyAppFiles(fileWalker: AppFileWalker, fileCopierHelper: AppFileCopierHelper, unpackedDest: string) {
  const files: Array<string> = await fileCopierHelper.collect(fileWalker)
  const metadata = fileWalker.metadata
  const transformedFiles = fileCopierHelper.transformedFiles
  // search auto unpacked dir
  const unpackedDirs = new Set<string>()
  const taskManager = new AsyncTaskManager(fileWalker.packager.cancellationToken)
  const dirToCreateForUnpackedFiles = new Set<string>(unpackedDirs)

  const fileCopier = new FileCopier()
  const links: Array<Link> = []
  for (let i = 0, n = files.length; i < n; i++) {
    const file = files[i]
    const stat = metadata.get(file)
    if (stat == null) {
      // dir
      continue
    }

    const relativePath = file.replace(fileWalker.src, unpackedDest)
    if (stat.isFile()) {
      const fileParent = path.dirname(file)
      // const dirNode = this.fs.getOrCreateNode(this.getRelativePath(fileParent))

      const newData = transformedFiles == null ? null : <string | Buffer>transformedFiles[i]
      if (newData != null) {
        transformedFiles[i] = null
      }

      if (!dirToCreateForUnpackedFiles.has(fileParent)) {
        dirToCreateForUnpackedFiles.add(fileParent)
        await ensureDir(fileParent.replace(fileWalker.src, unpackedDest))
      }

      taskManager.addTask(copyFileOrData(fileCopier, newData, file, relativePath, stat))
      if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
        await taskManager.awaitTasks()
      }
    }
    else if (stat.isSymbolicLink()) {
      links.push({"file": relativePath, "link": await readlink(file)})
    }
  }

  if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
    await taskManager.awaitTasks()
  }
  if (links.length > 0) {
    BluebirdPromise.map(links, it => symlink(it.link, it.file), CONCURRENCY)
  }
}