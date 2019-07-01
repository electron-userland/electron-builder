import { exec, safeStringifyJson } from "builder-util"
import { unlinkIfExists } from "builder-util/out/fs"
import { emptyDir, ensureDir } from "fs-extra"
import { promises as fs } from "fs"
import { homedir } from "os"
import * as path from "path"
import pathSorter from "path-sort"

export class WineManager {
  wineDir: string | null = null
  private winePreparePromise: Promise<any> | null = null

  private env: any

  userDir: string | null = null

  async prepare() {
    if (this.env != null) {
      return
    }

    this.wineDir = path.join(homedir(), "wine-test")

    const env = process.env
    const user = env.SUDO_USER || env.LOGNAME || env.USER || env.LNAME || env.USERNAME || (env.HOME === "/root" ? "root" : null)
    if (user == null) {
      throw new Error(`Cannot determinate user name: ${safeStringifyJson(env)}`)
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
    const env = {
      ...process.env,
      WINEDLLOVERRIDES: "winemenubuilder.exe=d",
      WINEPREFIX: wineDir,
    }

    await exec("wineboot", ["--init"], {env})

    // regedit often doesn't modify correctly
    let systemReg = await fs.readFile(path.join(wineDir, "system.reg"), "utf8")
    systemReg = systemReg.replace('"CSDVersion"="Service Pack 3"', '"CSDVersion"=" "')
    systemReg = systemReg.replace('"CurrentBuildNumber"="2600"', '"CurrentBuildNumber"="10240"')
    systemReg = systemReg.replace('"CurrentVersion"="5.1"', '"CurrentVersion"="10.0"')
    systemReg = systemReg.replace('"ProductName"="Microsoft Windows XP"', '"ProductName"="Microsoft Windows 10"')
    // noinspection SpellCheckingInspection
    systemReg = systemReg.replace('"CSDVersion"=dword:00000300', '"CSDVersion"=dword:00000000')
    await fs.writeFile(path.join(wineDir, "system.reg"), systemReg)

    // remove links to host OS
    const userDir = this.userDir!!
    const desktopDir = path.join(userDir, "Desktop")
    await Promise.all([
      unlinkIfExists(desktopDir),
      unlinkIfExists(path.join(userDir, "My Documents")),
      unlinkIfExists(path.join(userDir, "My Music")),
      unlinkIfExists(path.join(userDir, "My Pictures")),
      unlinkIfExists(path.join(userDir, "My Videos")),
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