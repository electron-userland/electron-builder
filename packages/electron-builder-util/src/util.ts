import BluebirdPromise from "bluebird-lst"
import { red, yellow } from "chalk"
import { ChildProcess, execFile, spawn as _spawn, SpawnOptions } from "child_process"
import { createHash } from "crypto"
import _debug from "debug"
import { homedir, tmpdir } from "os"
import * as path from "path"
import "source-map-support/register"
import { statOrNull } from "./fs"
import { log, warn } from "./log"

export const debug = _debug("electron-builder")
export const debug7z = _debug("electron-builder:7z")

const DEFAULT_APP_DIR_NAMES = ["app", "www"]

export interface BaseExecOptions {
  cwd?: string
  env?: any
  stdio?: any
}

export interface ExecOptions extends BaseExecOptions {
  customFds?: any
  encoding?: string
  timeout?: number
  maxBuffer?: number
  killSignal?: string
}

export function removePassword(input: string) {
  return input.replace(/(-P |pass:| \/p|-pass )([^ ]+)/g, function (match, p1, p2) {
    return `${p1}${createHash("sha256").update(p2).digest("hex")} (sha256 hash)`
  })
}

export function execWine(file: string, args: Array<string>, options?: ExecOptions): Promise<string> {
  return exec(process.platform === "win32" ? file : "wine", prepareArgs(args, file), options)
}

export function prepareArgs(args: Array<string>, exePath: string) {
  if (process.platform !== "win32") {
    args.unshift(exePath)
  }
  return args
}

export function exec(file: string, args?: Array<string> | null, options?: ExecOptions): Promise<string> {
  if (debug.enabled) {
    debug(`Executing ${file} ${args == null ? "" : removePassword(args.join(" "))}`)
  }

  return new BluebirdPromise<string>((resolve, reject) => {
    execFile(file, <any>args, options, function (error, stdout, stderr) {
      if (error == null) {
        if (debug.enabled) {
          if (stderr.length !== 0) {
            log(stderr)
          }
          if (stdout.length !== 0) {
            log(stdout)
          }
        }
        resolve(stdout)
      }
      else {
        let message = red(removePassword(`Exit code: ${(<any>error).code}. ${error.message}`))
        if (stdout.length !== 0) {
          message += `\n${yellow(stdout)}`
        }
        if (stderr.length !== 0) {
          message += `\n${red(stderr)}`
        }

        reject(new Error(message))
      }
    })
  })
}

export function doSpawn(command: string, args: Array<string>, options?: SpawnOptions, pipeInput?: Boolean): ChildProcess {
  if (options == null) {
    options = {}
  }
  if (options.stdio == null) {
    options.stdio = [pipeInput ? "pipe" : "ignore", debug.enabled ? "inherit" : "pipe", "pipe"]
  }

  if (debug.enabled) {
    const argsString = args.join(" ")
    debug(`Spawning ${command} ${command === "docker" ? argsString : removePassword(argsString)}`)
  }
  return _spawn(command, args, options)
}

export function spawn(command: string, args?: Array<string> | null, options?: SpawnOptions): Promise<any> {
  return new BluebirdPromise<any>((resolve, reject) => {
    handleProcess("close", doSpawn(command, args || [], options), command, resolve, reject)
  })
}

export function handleProcess(event: string, childProcess: ChildProcess, command: string, resolve: ((value?: any) => void) | null, reject: (reason?: any) => void) {
  childProcess.on("error", reject)

  let out = ""
  if (!debug.enabled && childProcess.stdout != null) {
    childProcess.stdout.on("data", (data: string) => {
      out += data
    })
  }

  let errorOut = ""
  if (childProcess.stderr != null) {
    childProcess.stderr.on("data", (data: string) => {
      errorOut += data
    })
  }

  childProcess.once(event, (code: number) => {
    if (code === 0 && debug.enabled) {
      debug(`${command} (${childProcess.pid}) exited with code ${code}`)
    }

    if (code !== 0) {
      function formatOut(text: string, title: string) {
        if (text.length === 0) {
          return ""
        }
        else {
          return `\n${title}:\n${text}`
        }
      }

      reject(new Error(`${command} exited with code ${code}${formatOut(out, "Output")}${formatOut(errorOut, "Error output")}`))
    }
    else if (resolve != null) {
      resolve()
    }
  })
}

export async function computeDefaultAppDirectory(projectDir: string, userAppDir: string | null | undefined): Promise<string> {
  if (userAppDir != null) {
    const absolutePath = path.resolve(projectDir, userAppDir)
    const stat = await statOrNull(absolutePath)
    if (stat == null) {
      throw new Error(`Application directory ${userAppDir} doesn't exists`)
    }
    else if (!stat.isDirectory()) {
      throw new Error(`Application directory ${userAppDir} is not a directory`)
    }
    else if (projectDir === absolutePath) {
      warn(`Specified application directory "${userAppDir}" equals to project dir — superfluous or wrong configuration`)
    }
    return absolutePath
  }

  for (const dir of DEFAULT_APP_DIR_NAMES) {
    const absolutePath = path.join(projectDir, dir)
    const packageJson = path.join(absolutePath, "package.json")
    const stat = await statOrNull(packageJson)
    if (stat != null && stat.isFile()) {
      return absolutePath
    }
  }
  return projectDir
}

export function use<T, R>(value: T | null, task: (it: T) => R): R | null {
  return value == null ? null : task(value)
}

export function debug7zArgs(command: "a" | "x"): Array<string> {
  const args = [command, "-bd"]
  if (debug7z.enabled) {
    args.push("-bb3")
  }
  else if (!debug.enabled) {
    args.push("-bb0")
  }
  return args
}

export let tmpDirCounter = 0
// add date to avoid use stale temp dir
const tempDirPrefix = `${process.pid.toString(16)}-${Date.now().toString(16)}`

export function getTempName(prefix?: string | null | undefined): string {
  return `${prefix == null ? "" : `${prefix}-`}${tempDirPrefix}-${(tmpDirCounter++).toString(16)}`
}

export function isEmptyOrSpaces(s: string | null | undefined) {
  return s == null || s.trim().length === 0
}

export function asArray<T>(v: null | undefined | T | Array<T>): Array<T> {
  if (v == null) {
    return []
  }
  else if (Array.isArray(v)) {
    return v
  }
  else {
    return [v]
  }
}
export function getCacheDirectory(): string {
  if (process.platform === "darwin") {
    return path.join(homedir(), "Library", "Caches", "electron-builder")
  }

  const localappdata = process.env.LOCALAPPDATA
  if (process.platform === "win32" && localappdata != null) {
    // https://github.com/electron-userland/electron-builder/issues/1164
    if (localappdata.includes("\\Windows\\System32\\") || process.env.USERNAME === "SYSTEM") {
      return path.join(tmpdir(), "electron-builder-cache")
    }
    return path.join(localappdata, "electron-builder", "cache")
  }

  return path.join(homedir(), ".cache", "electron-builder")
}

// fpm bug - rpm build --description is not escaped, well... decided to replace quite to smart quote
// http://leancrew.com/all-this/2010/11/smart-quotes-in-javascript/
export function smarten(s: string): string {
  // opening singles
  s = s.replace(/(^|[-\u2014\s(\["])'/g, "$1\u2018")
  // closing singles & apostrophes
  s = s.replace(/'/g, "\u2019")
  // opening doubles
  s = s.replace(/(^|[-\u2014/\[(\u2018\s])"/g, "$1\u201c")
  // closing doubles
  s = s.replace(/"/g, "\u201d")
  return s
}

export class Lazy<T> {
  private _value: Promise<T>
  private creator: (() => Promise<T>) | null

  get value(): Promise<T> {
    if (this.creator == null) {
      return this._value
    }

    this._value = this.creator()
    this.creator = null
    return this._value
  }

  constructor(creator: () => Promise<T>) {
    this.creator = creator
  }
}

export function addValue<K, T>(map: Map<K, Array<T>>, key: K, value: T) {
  const list = map.get(key)
  if (list == null) {
    map.set(key, [value])
  }
  else if (!list.includes(value)) {
    list.push(value)
  }
}

export function replaceDefault(inList: Array<string> | null | undefined, defaultList: Array<string>): Array<string> {
  if (inList == null) {
    return defaultList
  }

  const index = inList.indexOf("default")
  if (index >= 0) {
    let list = inList.slice(0, index)
    list.push(...defaultList)
    if (index != (inList.length - 1)) {
      list.push(...inList.slice(index + 1))
    }
    inList = list
  }
  return inList
}

export function getPlatformIconFileName(value: string | null | undefined, isMac: boolean) {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }

  if (!value.includes(".")) {
    return `${value}.${isMac ? "icns" : "ico"}`
  }

  return value.replace(isMac ? ".ico" : ".icns", isMac ? ".icns" : ".ico")
}