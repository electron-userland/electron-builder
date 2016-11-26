import { unlink, access, stat, Stats, lstat, readdir } from "fs-extra-p"
import { Filter } from "./filter"
import BluebirdPromise from "bluebird-lst-c"
import * as path from "path"

export const MAX_FILE_REQUESTS = 8
export const CONCURRENCY = {concurrency: MAX_FILE_REQUESTS}

export function unlinkIfExists(file: string) {
  return unlink(file)
    .catch(() => {
      // ignore
    })
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

export async function walk(initialDirPath: string, consumer?: (file: string, stat: Stats) => void, filter?: Filter): Promise<Array<string>> {
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

          if (consumer != null) {
            consumer(filePath, stat)
          }

          if (stat.isDirectory()) {
            dirs.push(filePath)
          }
          else {
            result.push(filePath)
          }
        })
    }, CONCURRENCY)

    for (let i = dirs.length - 1; i > -1; i--) {
      queue.push(dirs[i])
    }
  }

  return result
}