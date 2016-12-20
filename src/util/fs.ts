import { unlink, access, stat, Stats, lstat, readdir, createReadStream, createWriteStream, link, mkdirs, readlink, symlink } from "fs-extra-p"
import BluebirdPromise from "bluebird-lst-c"
import * as path from "path"
import { debug } from "./util"
import isCi from "is-ci"
import Mode from "stat-mode"

export const MAX_FILE_REQUESTS = 8
export const CONCURRENCY = {concurrency: MAX_FILE_REQUESTS}

export type Filter = (file: string, stat: Stats) => boolean

export function unlinkIfExists(file: string) {
  return unlink(file)
    .catch(() => {/* ignore */})
}

export async function statOrNull(file: string): Promise<Stats | null> {
  try {
    return await stat(file)
  }
  catch (e) {
    if (e.code === "ENOENT") {
      return null
    }
    else {
      throw e
    }
  }
}

export async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  }
  catch (e) {
    return false
  }
}

export async function walk(initialDirPath: string, filter?: Filter | null, consumer?: (file: string, stat: Stats, parent: string) => any): Promise<Array<string>> {
  const result: Array<string> = []
  const queue: Array<string> = [initialDirPath]
  let addDirToResult = false
  while (queue.length > 0) {
    const dirPath = queue.pop()!
    if (addDirToResult) {
      result.push(dirPath)
    }
    else {
      addDirToResult = true
    }

    const childNames = await readdir(dirPath)
    childNames.sort()

    const dirs: Array<string> = []
    await BluebirdPromise.map(childNames, name => {
      const filePath = dirPath + path.sep + name
      return lstat(filePath)
        .then(stat => {
          if (filter != null && !filter(filePath, stat)) {
            return
          }

          if (stat.isDirectory()) {
            dirs.push(filePath)
          }
          else {
            result.push(filePath)
          }

          return consumer == null ? null : consumer(filePath, stat, dirPath)
        })
    }, CONCURRENCY)

    for (let i = dirs.length - 1; i > -1; i--) {
      queue.push(dirs[i])
    }
  }

  return result
}

const _isUseHardLink = process.platform != "win32" && process.env.USE_HARD_LINKS !== "false" && (isCi || process.env.USE_HARD_LINKS === "true")

/**
 * Hard links is used if supported and allowed.
 * File permission is fixed — allow execute for all if owner can, allow read for all if owner can.
 */
export function copyFile(src: string, dest: string, stats?: Stats | null, isUseHardLink = _isUseHardLink): Promise<any> {
  if (stats != null) {
    const originalModeNumber = stats.mode
    const mode = new Mode(stats)
    if (mode.owner.execute) {
      mode.group.execute = true
      mode.others.execute = true
    }

    mode.group.read = true
    mode.others.read = true

    if (originalModeNumber !== stats.mode) {
      if (debug.enabled) {
        const oldMode = new Mode(Object.assign({}, stats, {mode: originalModeNumber}))
        debug(`${dest} permissions fixed from ${oldMode.toOctal()} (${oldMode.toString()}) to ${mode.toOctal()} (${mode.toString()})`)
      }

      // https://helgeklein.com/blog/2009/05/hard-links-and-permissions-acls/
      // Permissions on all hard links to the same data on disk are always identical. The same applies to attributes.
      // That means if you change the permissions/owner/attributes on one hard link, you will immediately see the changes on all other hard links.
      if (isUseHardLink) {
        isUseHardLink = false
        debug(`${dest} will be copied, but not linked, because file permissions need to be fixed`)
      }
    }
  }

  if (isUseHardLink) {
    return link(src, dest)
  }

  return new BluebirdPromise(function (resolve, reject) {
    const readStream = createReadStream(src)
    const writeStream = createWriteStream(dest, stats == null ? undefined : {mode: stats.mode})

    readStream.on("error", reject)
    writeStream.on("error", reject)

    writeStream.on("open", function () {
      readStream.pipe(writeStream)
    })

    writeStream.once("finish", resolve)
  })
}

export class FileCopier {
  constructor(private isUseHardLinkFunction?: (file: string) => boolean, private isUseHardLink = _isUseHardLink) {
  }

  async copy(src: string, dest: string, stat: Stats | undefined) {
    try {
      await copyFile(src, dest, stat, (!this.isUseHardLink || this.isUseHardLinkFunction == null) ? this.isUseHardLink : this.isUseHardLinkFunction(dest))
    }
    catch (e) {
      // files are copied concurrently, so, we must not check here currentIsUseHardLink — our code can be executed after that other handler will set currentIsUseHardLink to false
      if (e.code === "EXDEV") {
        // ...but here we want to avoid excess debug log message
        if (this.isUseHardLink) {
          debug(`Cannot copy using hard link: ${e}`)
          this.isUseHardLink = false
        }

        await copyFile(src, dest, stat, false)
      }
      else {
        throw e
      }
    }
  }
}

/**
 * Empty directories is never created.
 * Hard links is used if supported and allowed.
 */
export function copyDir(src: string, destination: string, filter?: Filter, isUseHardLink?: (file: string) => boolean): Promise<any> {
  if (debug.enabled) {
    debug(`Copying ${src} to ${destination}${_isUseHardLink ? " using hard links" : ""}`)
  }

  const createdSourceDirs = new Set<string>()
  const fileCopier = new FileCopier(isUseHardLink)
  const links: Array<Link> = []
  return walk(src, filter, async(file, stat, parent) => {
    if (!stat.isFile() && !stat.isSymbolicLink()) {
      return
    }

    if (!createdSourceDirs.has(parent)) {
      await mkdirs(parent.replace(src, destination))
      createdSourceDirs.add(parent)
    }

    const destFile = file.replace(src, destination)
    if (stat.isFile()) {
      await fileCopier.copy(file, destFile, stat)
    }
    else {
      links.push({"file": destFile, "link": await readlink(file)})
    }
  })
    .then(() => BluebirdPromise.map(links, it => symlink(it.link, it.file), CONCURRENCY))
}

interface Link {
  readonly link: string,
  readonly file: string
}