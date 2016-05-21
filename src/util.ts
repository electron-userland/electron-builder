import { execFile, spawn as _spawn, ChildProcess, SpawnOptions } from "child_process"
import { Promise as BluebirdPromise } from "bluebird"
import readPackageJsonAsync = require("read-package-json")
import * as os from "os"
import * as path from "path"
import { readJson, stat, Stats } from "fs-extra-p"
import { yellow } from "chalk"
import debugFactory = require("debug")
import { Debugger } from "~debug/node"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export const log = console.log

export const debug: Debugger = debugFactory("electron-builder")
export const debug7z: Debugger = debugFactory("electron-builder:7z")

export function warn(message: string) {
  console.warn(yellow(`Warning: ${message}`))
}

const DEFAULT_APP_DIR_NAMES = ["app", "www"]

export const readPackageJson = BluebirdPromise.promisify(readPackageJsonAsync)

export function installDependencies(appDir: string, electronVersion: string, arch: string = process.arch, command: string = "install"): BluebirdPromise<any> {
  log((command === "install" ? "Installing" : "Rebuilding") + " app dependencies for arch %s to %s", arch, appDir)
  const gypHome = path.join(os.homedir(), ".electron-gyp")
  const env = Object.assign({}, process.env, {
    npm_config_disturl: "https://atom.io/download/atom-shell",
    npm_config_target: electronVersion,
    npm_config_runtime: "electron",
    npm_config_arch: arch,
    HOME: gypHome,
    USERPROFILE: gypHome,
  })

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
    env: env
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

export function exec(file: string, args?: Array<string> | null, options?: ExecOptions): BluebirdPromise<Buffer[]> {
  if (debug.enabled) {
    debug(`Executing ${file} ${args == null ? "" : args.join(" ")}`)
  }

  return new BluebirdPromise<Buffer[]>((resolve, reject) => {
    execFile(file, <any>args, options, function (error, stdout, stderr) {
      if (error == null) {
        resolve(<any>[stdout, stderr])
      }
      else {
        if (stdout.length !== 0) {
          console.log(stdout.toString())
        }
        if (stderr.length === 0) {
          reject(error)
        }
        else {
          reject(new Error(stderr.toString() + "\n" + error.toString()))
        }
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
  try {
    return (await readJson(path.join(path.dirname(packageJsonPath), "node_modules", "electron-prebuilt", "package.json"))).version
  }
  catch (e) {
    if (e.code !== "ENOENT") {
      warn("Cannot read electron version from electron-prebuilt package.json" + e.message)
    }
  }

  const devDependencies = packageData.devDependencies
  let electronPrebuiltDep = devDependencies == null ? null : devDependencies["electron-prebuilt"]
  if (electronPrebuiltDep == null) {
    const dependencies = packageData.dependencies
    electronPrebuiltDep = dependencies == null ? null : dependencies["electron-prebuilt"]
  }

  if (electronPrebuiltDep == null) {
    throw new Error("Cannot find electron-prebuilt dependency to get electron version in the '" + packageJsonPath + "'")
  }

  const firstChar = electronPrebuiltDep[0]
  return firstChar === "^" || firstChar === "~" ? electronPrebuiltDep.substring(1) : electronPrebuiltDep
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
    const absolutePath = path.join(projectDir, userAppDir)
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

export function getTempName(prefix?: string | n): string {
  return `${prefix == null ? "" : prefix + "-"}${process.pid}-${tmpDirCounter++}-${Date.now()}`
}