#! /usr/bin/env node

import { readdir, lstat, Stats, remove, readFile } from "fs-extra-p"
import BluebirdPromise from "bluebird-lst-c"
import * as path from "path"
import { getCacheDirectory } from "./util/util"

async function main() {
  const dir = path.join(getCacheDirectory(), "fpm")
  let items: string[] | null = null
  try {
    items = await readdir(dir)
  }
  catch (e) {
    if (e.code !== "ENOENT") {
      throw e
    }
    return
  }

  await BluebirdPromise.map(items, <(item: string) => BluebirdPromise<any>> (async (it) => {
    let stat: Stats | null = null
    const itemPath = path.join(dir, it)
    try {
      stat = await lstat(itemPath)
    }
    catch (e) {
      if (e.code !== "ENOENT") {
        throw e
      }
      return
    }

    if (!stat!.isDirectory() || !(await isRecentlyUsed(itemPath))) {
      console.log(`remove unused ${itemPath}`)
      await remove(itemPath)
    }
  }))

  await BluebirdPromise.map(items, remove)
}

async function isRecentlyUsed(dir: string) {
  try {
    const lastUsed = parseInt(await readFile(path.join(dir, ".lastUsed"), "utf8"), 10)
    if (!isNaN(lastUsed) && (Date.now() - lastUsed) < (3600000 * 2)) {
      return true
    }
  }
  catch (e) {
    if (e.code !== "ENOENT") {
      throw e
    }
  }

  return false
}

main()