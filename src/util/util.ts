import { execFile, spawn as _spawn, ChildProcess, SpawnOptions } from "child_process"
import BluebirdPromise from "bluebird-lst-c"
import { homedir } from "os"
import * as path from "path"
import { readJson } from "fs-extra-p"
import { yellow, red } from "chalk"
import _debug from "debug"
import { warn, log } from "./log"
import { createHash } from "crypto"
import "source-map-support/register"
import { statOrNull } from "./fs"
import { DevMetadata } from "../metadata"

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
  return input.replace(/(-P |pass:|\/p|-pass )([^ ]+)/, function (match, p1, p2) {
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

export async function getElectronVersion(packageData: any, packageJsonPath: string): Promise<string> {
  const build = packageData.build
  // build is required, but this check is performed later, so, we should check for null
  if (build != null && build.electronVersion != null) {
    return build.electronVersion
  }

  for (const name of ["electron", "electron-prebuilt", "electron-prebuilt-compile"]) {
    try {
      return (await readJson(path.join(path.dirname(packageJsonPath), "node_modules", name, "package.json"))).version
    }
    catch (e) {
      if (e.code !== "ENOENT") {
        warn(`Cannot read electron version from ${name} package.json: ${e.message}`)
      }
    }
  }

  const electronPrebuiltDep = findFromElectronPrebuilt(packageData)
  if (electronPrebuiltDep == null) {
    throw new Error("Cannot find electron dependency to get electron version in the '" + packageJsonPath + "'")
  }

  const firstChar = electronPrebuiltDep[0]
  return firstChar === "^" || firstChar === "~" ? electronPrebuiltDep.substring(1) : electronPrebuiltDep
}

function findFromElectronPrebuilt(packageData: any): any {
  for (const name of ["electron", "electron-prebuilt", "electron-prebuilt-compile"]) {
    const devDependencies = packageData.devDependencies
    let dep = devDependencies == null ? null : devDependencies[name]
    if (dep == null) {
      const dependencies = packageData.dependencies
      dep = dependencies == null ? null : dependencies[name]
    }
    if (dep != null) {
      return dep
    }
  }
  return null
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

export function getTempName(prefix?: string | n): string {
  return `${prefix == null ? "" : `${prefix}-`}${tempDirPrefix}-${(tmpDirCounter++).toString(16)}`
}

export function isEmptyOrSpaces(s: string | n) {
  return s == null || s.trim().length === 0
}

export function asArray<T>(v: n | T | Array<T>): Array<T> {
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
  else if (process.platform === "win32" && process.env.LOCALAPPDATA != null) {
    return path.join(process.env.LOCALAPPDATA, "electron-builder", "cache")
  }
  else {
    return path.join(homedir(), ".cache", "electron-builder")
  }
}

export function getDirectoriesConfig(m: DevMetadata) {
  return m.build.directories || (<any>m).directories
}