import BluebirdPromise from "bluebird-lst"
import fcopy from "fcopy-pre-bundled"
import { access, ensureDir, link, lstat, readdir, readlink, stat, Stats, symlink, unlink, writeFile } from "fs-extra-p"
import isCi from "is-ci"
import * as path from "path"
import Mode from "stat-mode"
import { orNullIfFileNotExist } from "./promise"
import { debug } from "./util"

export const MAX_FILE_REQUESTS = 8
export const CONCURRENCY = {concurrency: MAX_FILE_REQUESTS}

export type FileTransformer = (path: string) => Promise<null | string | Buffer> | null | string | Buffer
export type Filter = (file: string, stat: Stats) => boolean

export function unlinkIfExists(file: string) {
  return unlink(file)
    .catch(() => {/* ignore */})
}

export async function statOrNull(file: string): Promise<Stats | null> {
  return orNullIfFileNotExist(stat(file))
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

export interface FileConsumer {
  consume(file: string, fileStat: Stats, parent: string, siblingNames: Array<string>): any

  /**
   * @default false
   */
  isIncludeDir?: boolean
}

export async function walk(initialDirPath: string, filter?: Filter | null, consumer?: FileConsumer): Promise<Array<string>> {
  let result: Array<string> = []
  const queue: Array<string> = [initialDirPath]
  let addDirToResult = false
  const isIncludeDir = consumer == null ? false : consumer.isIncludeDir === true
  while (queue.length > 0) {
    const dirPath = queue.pop()!
    if (isIncludeDir) {
      if (addDirToResult) {
        result.push(dirPath)
      }
      else {
        addDirToResult = true
      }
    }

    const childNames = await readdir(dirPath)
    childNames.sort()

    let nodeModuleContent: Array<string> | null = null

    const dirs: Array<string> = []
    // our handler is async, but we should add sorted files, so, we add file to result not in the mapper, but after map
    const sortedFilePaths = await BluebirdPromise.map(childNames, name => {
      if (name === ".DS_Store") {
        return null
      }

      const filePath = dirPath + path.sep + name
      return lstat(filePath)
        .then(stat => {
          if (filter != null && !filter(filePath, stat)) {
            return null
          }

          const consumerResult = consumer == null ? null : consumer.consume(filePath, stat, dirPath, childNames)
          if (consumerResult == null || !("then" in consumerResult)) {
            if (stat.isDirectory()) {
              dirs.push(name)
              return null
            }
            else {
              return filePath
            }
          }
          else {
            return (consumerResult as Promise<any>)
              .then((it): any => {
                if (it != null && Array.isArray(it)) {
                  nodeModuleContent = it
                  return null
                }

                // asarUtil can return modified stat (symlink handling)
                if ((it != null && "isDirectory" in it ? (it as Stats) : stat).isDirectory()) {
                  dirs.push(name)
                  return null
                }
                else {
                  return filePath
                }
              })
          }
        })
    }, CONCURRENCY)

    for (const child of sortedFilePaths) {
      if (child != null) {
        result.push(child)
      }
    }

    dirs.sort()
    for (const child of dirs) {
      queue.push(dirPath + path.sep + child)
    }

    if (nodeModuleContent != null) {
      result = result.concat(nodeModuleContent)
    }
  }

  return result
}

const _isUseHardLink = process.platform !== "win32" && process.env.USE_HARD_LINKS !== "false" && (isCi || process.env.USE_HARD_LINKS === "true")

export function copyFile(src: string, dest: string, isEnsureDir = true) {
  return (isEnsureDir ? ensureDir(path.dirname(dest)) : BluebirdPromise.resolve()).then(() => copyOrLinkFile(src, dest, null, false))
}

/**
 * Hard links is used if supported and allowed.
 * File permission is fixed — allow execute for all if owner can, allow read for all if owner can.
 *
 * ensureDir is not called, dest parent dir must exists
 */
export function copyOrLinkFile(src: string, dest: string, stats?: Stats | null, isUseHardLink = _isUseHardLink): Promise<any> {
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
        const oldMode = new Mode({...stats, mode: originalModeNumber})
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

  return new BluebirdPromise((resolve, reject) => {
    fcopy(src, dest, stats == null ? undefined : {mode: stats.mode}, error => error == null ? resolve() : reject(error))
  })
}

export class FileCopier {
  isUseHardLink: boolean

  constructor(private readonly isUseHardLinkFunction?: (file: string) => boolean, private readonly transformer?: FileTransformer | null) {
    this.isUseHardLink = _isUseHardLink && isUseHardLinkFunction !== DO_NOT_USE_HARD_LINKS
  }

  async copy(src: string, dest: string, stat: Stats | undefined) {
    try {
      if (this.transformer != null && stat != null && stat.isFile()) {
        let data = this.transformer(src)
        if (data != null) {
          if (typeof (data as any).then === "function") {
            data = await data
          }

          if (data != null) {
            await writeFile(dest, data)
            return
          }
        }
      }
      await copyOrLinkFile(src, dest, stat, (!this.isUseHardLink || this.isUseHardLinkFunction == null) ? this.isUseHardLink : this.isUseHardLinkFunction(dest))
    }
    catch (e) {
      // files are copied concurrently, so, we must not check here currentIsUseHardLink — our code can be executed after that other handler will set currentIsUseHardLink to false
      if (e.code === "EXDEV") {
        // ...but here we want to avoid excess debug log message
        if (this.isUseHardLink) {
          debug(`Cannot copy using hard link: ${e}`)
          this.isUseHardLink = false
        }

        await copyOrLinkFile(src, dest, stat, false)
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
export function copyDir(src: string, destination: string, filter?: Filter | null, transformer?: FileTransformer | null, isUseHardLink?: (file: string) => boolean): Promise<any> {
  const fileCopier = new FileCopier(isUseHardLink, transformer)

  if (debug.enabled) {
    debug(`Copying ${src} to ${destination}${fileCopier.isUseHardLink ? " using hard links" : ""}`)
  }

  const createdSourceDirs = new Set<string>()
  const links: Array<Link> = []
  return walk(src, filter, {
    consume: async (file, stat, parent) => {
      if (!stat.isFile() && !stat.isSymbolicLink()) {
        return
      }

      if (!createdSourceDirs.has(parent)) {
        await ensureDir(parent.replace(src, destination))
        createdSourceDirs.add(parent)
      }

      const destFile = file.replace(src, destination)
      if (stat.isFile()) {
        await fileCopier.copy(file, destFile, stat)
      }
      else {
        links.push({file: destFile, link: await readlink(file)})
      }
    }
  })
    .then(() => BluebirdPromise.map(links, it => symlink(it.link, it.file), CONCURRENCY))
}

export const DO_NOT_USE_HARD_LINKS = (file: string) => false

export interface Link {
  readonly link: string,
  readonly file: string
}