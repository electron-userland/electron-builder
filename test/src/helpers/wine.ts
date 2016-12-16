import { exec } from "out/util/util"
import { homedir } from "os"
import { emptyDir, readFile, writeFile, ensureDir } from "fs-extra-p"
import * as path from "path"
import BluebirdPromise from "bluebird-lst-c"
import pathSorter from "path-sort"
import { unlinkIfExists } from "out/util/fs"

export class WineManager {
  wineDir: string
  private winePreparePromise: Promise<any> | null

  private env: any

  userDir: string

  async prepare() {
    if (this.env != null) {
      return
    }

    this.wineDir = path.join(homedir(), "wine-test")

    const env = process.env
    const user = env.SUDO_USER || env.LOGNAME || env.USER || env.LNAME || env.USERNAME || (env.HOME === "/root" ? "root" : null)
    if (user == null) {
      throw new Error(`Cannot determinate user name: ${JSON.stringify(env, null, 2)}`)
    }

    this.userDir = path.join(this.wineDir, "drive_c", "users", user)

    this.winePreparePromise = this.prepareWine(this.wineDir)
    this.env = await this.winePreparePromise
  }

  exec(...args: Array<string>) {
    return exec("wine", args, {env: this.env})
  }

  async prepareWine(wineDir: string) {
    await emptyDir(wineDir)
    //noinspection SpellCheckingInspection
    const env = Object.assign({}, process.env, {
      WINEDLLOVERRIDES: "winemenubuilder.exe=d",
      WINEPREFIX: wineDir
    })

    await exec("wineboot", ["--init"], {env: env})

    // regedit often doesn't modify correctly
    let systemReg = await readFile(path.join(wineDir, "system.reg"), "utf8")
    systemReg = systemReg.replace('"CSDVersion"="Service Pack 3"', '"CSDVersion"=" "')
    systemReg = systemReg.replace('"CurrentBuildNumber"="2600"', '"CurrentBuildNumber"="10240"')
    systemReg = systemReg.replace('"CurrentVersion"="5.1"', '"CurrentVersion"="10.0"')
    systemReg = systemReg.replace('"ProductName"="Microsoft Windows XP"', '"ProductName"="Microsoft Windows 10"')
    systemReg = systemReg.replace('"CSDVersion"=dword:00000300', '"CSDVersion"=dword:00000000')
    await writeFile(path.join(wineDir, "system.reg"), systemReg)

    // remove links to host OS
    const desktopDir = path.join(this.userDir, "Desktop")
    await BluebirdPromise.all([
      unlinkIfExists(desktopDir),
      unlinkIfExists(path.join(this.userDir, "My Documents")),
      unlinkIfExists(path.join(this.userDir, "My Music")),
      unlinkIfExists(path.join(this.userDir, "My Pictures")),
      unlinkIfExists(path.join(this.userDir, "My Videos")),
    ])

    await ensureDir(desktopDir)
    return env
  }
}

enum ChangeType {
  ADDED, REMOVED, NO_CHANGE
}

export function diff(oldList: Array<string>, newList: Array<string>, rootDir: string) {
  const delta: any = {
    added: [],
    deleted: [],
  }
  const deltaMap = new Map<string, ChangeType>()
  // const objHolder = new Set(oldList)
  for (const item of oldList) {
    deltaMap.set(item, ChangeType.REMOVED)
  }

  for (const item of newList) {
    // objHolder.add(item)
    const d = deltaMap.get(item)
    if (d === ChangeType.REMOVED) {
      deltaMap.set(item, ChangeType.NO_CHANGE)
    }
    else {
      deltaMap.set(item, ChangeType.ADDED)
    }
  }

  for (const [item, changeType] of deltaMap.entries()) {
    if (changeType === ChangeType.REMOVED) {
      delta.deleted.push(item.substring(rootDir.length + 1))
    }
    else if (changeType === ChangeType.ADDED) {
      delta.added.push(item.substring(rootDir.length + 1))
    }
  }

  delta.added = pathSorter(delta.added)
  delta.deleted = pathSorter(delta.deleted)
  return delta
}