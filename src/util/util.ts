import { execFile, spawn as _spawn, ChildProcess, SpawnOptions } from "child_process"
import { Promise as BluebirdPromise } from "bluebird"
import readPackageJsonAsync = require("read-package-json")
import * as os from "os"
import * as path from "path"
import { readJson, stat, Stats, unlink } from "fs-extra-p"
import { yellow, red } from "chalk"
import debugFactory = require("debug")
import IDebugger = debug.IDebugger
import { warn, task } from "./log"
import { createHash } from "crypto"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export const debug: IDebugger = debugFactory("electron-builder")
export const debug7z: IDebugger = debugFactory("electron-builder:7z")

const DEFAULT_APP_DIR_NAMES = ["app", "www"]

export const readPackageJson = BluebirdPromise.promisify(readPackageJsonAsync)

export function installDependencies(appDir: string, electronVersion: string, arch: string = process.arch, command: string = "install"): BluebirdPromise<any> {
  const gypHome = path.join(os.homedir(), ".electron-gyp")
  return task(`${(command === "install" ? "Installing" : "Rebuilding")} app dependencies for arch ${arch} to ${appDir}`, spawnNpmProduction(command, appDir, Object.assign({}, process.env, {
      npm_config_disturl: "https://atom.io/download/atom-shell",
      npm_config_target: electronVersion,
      npm_config_runtime: "electron",
      npm_config_arch: arch,
      HOME: gypHome,
      USERPROFILE: gypHome,
    })
  ))
}

export function spawnNpmProduction(command: string, appDir: string, env?: any): BluebirdPromise<any> {
  let npmExecPath = process.env.npm_execpath || process.env.NPM_CLI_JS
  const npmExecArgs = [command, "--production"]
  if (npmExecPath == null) {
    npmExecPath = process.platform === "win32" ? "npm.cmd" : "npm"
  }
  else {
    npmExecArgs.unshift(npmExecPath)
    npmExecPath = process.env.npm_node_execpath || process.env.NODE_EXE || "node"
  }

  return spawn(npmExecPath, npmExecArgs, {
    cwd: appDir,
    stdio: "inherit",
    env: env || process.env
  })
}

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

export function removePassword(input: string): string {
  return input.replace(/(-P |pass:)([^ ]+)/, function (match, p1, p2) {
    return `${p1}${createHash('sha256').update(p2).digest('hex')} (sha256 hash)`
  })
}

export function exec(file: string, args?: Array<string> | null, options?: ExecOptions): BluebirdPromise<string> {
  if (debug.enabled) {
    debug(removePassword(`Executing ${file} ${args == null ? "" : args.join(" ")}`))
  }

  return new BluebirdPromise<string>((resolve, reject) => {
    execFile(file, <any>args, options, function (error, stdout, stderr) {
      if (error == null) {
        resolve(stdout)
      }
      else {
        let message = red(removePassword(error.message))
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

export function doSpawn(command: string, args: Array<string>, options?: SpawnOptions): ChildProcess {
  if (debug.enabled) {
    debug(`Spawning ${command} ${args.join(" ")}`)
  }
  return _spawn(command, args, options)
}

export function spawn(command: string, args?: Array<string> | null, options?: SpawnOptions): BluebirdPromise<any> {
  return new BluebirdPromise<any>((resolve, reject) => {
    const notNullArgs = args || []
    const childProcess = doSpawn(command, notNullArgs, options)
    handleProcess("close", childProcess, command, resolve, reject)
  })
}

export function handleProcess(event: string, childProcess: ChildProcess, command: string, resolve: ((value?: any) => void) | null, reject: (reason?: any) => void) {
  childProcess.on("error", reject)
  childProcess.on(event, (code: number) => {
    if (debug.enabled) {
      debug(`${command} (${childProcess.pid}) exited with code ${code}`)
    }

    if (code !== 0) {
      reject(new Error(`${command} exited with code ${code}`))
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
  try {
    return (await readJson(path.join(path.dirname(packageJsonPath), "node_modules", "electron-prebuilt", "package.json"))).version
  }
  catch (e) {
    if (e.code !== "ENOENT") {
      warn(`Cannot read electron version from electron-prebuilt package.json: ${e.message}`)
    }
  }

  const electronPrebuiltDep = findFromElectronPrebuilt(packageData)
  if (electronPrebuiltDep == null) {
    throw new Error("Cannot find electron-prebuilt dependency to get electron version in the '" + packageJsonPath + "'")
  }

  const firstChar = electronPrebuiltDep[0]
  return firstChar === "^" || firstChar === "~" ? electronPrebuiltDep.substring(1) : electronPrebuiltDep
}

function findFromElectronPrebuilt(packageData: any): any {
  for (let name of ["electron-prebuilt", "electron-prebuilt-compile"]) {
    const devDependencies = packageData.devDependencies
    let electronPrebuiltDep = devDependencies == null ? null : devDependencies[name]
    if (electronPrebuiltDep == null) {
      const dependencies = packageData.dependencies
      electronPrebuiltDep = dependencies == null ? null : dependencies[name]
    }
    if (electronPrebuiltDep != null) {
      return electronPrebuiltDep
    }
  }
  return null
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
    return absolutePath
  }

  for (let dir of DEFAULT_APP_DIR_NAMES) {
    const absolutePath = path.join(projectDir, dir)
    const stat = await statOrNull(absolutePath)
    if (stat != null && stat.isDirectory()) {
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

let tmpDirCounter = 0
// add date to avoid use stale temp dir
const tempDirPrefix = `${process.pid.toString(36)}-${Date.now().toString(36)}`

export function getTempName(prefix?: string | n): string {
  return `${prefix == null ? "" : prefix + "-"}${tempDirPrefix}-${(tmpDirCounter++).toString(36)}`
}

export function isEmptyOrSpaces(s: string | n) {
  return s == null || s.trim().length === 0
}

export function unlinkIfExists(file: string) {
  return unlink(file)
    .catch(() => {})
}